import { useEffect, useMemo, useRef, useState } from 'react'
import { managerName, useLeagueData } from '../lib/data'
import { animationsDisabled } from '../lib/motion'
import { money } from '../lib/format'
import type { ManagerId, Trade } from '../lib/types'

interface Link {
  from: ManagerId
  to: ManagerId
  dollars: number
}

/**
 * Who deals with whom. Managers sit on a circle; each arc carries the auction
 * dollars that moved between a pair, thickness scaled to the amount. Hovering
 * a manager isolates their trades.
 */
export default function TradeFlow({ trades }: { trades: Trade[] }) {
  const { managers } = useLeagueData()
  const [focus, setFocus] = useState<ManagerId | null>(null)
  // SMIL animation ignores the CSS reduced-motion rules, so gate it here.
  const reduceMotion = typeof window !== 'undefined' && animationsDisabled()
  const svg = useRef<SVGSVGElement>(null)

  // The balls only run while the diagram is on screen and the tab is visible.
  useEffect(() => {
    const node = svg.current
    if (!node || reduceMotion) return
    let seen = true
    const apply = () => {
      if (seen && !document.hidden) node.unpauseAnimations()
      else node.pauseAnimations()
    }
    const watch = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting
      apply()
    })
    watch.observe(node)
    document.addEventListener('visibilitychange', apply)
    return () => {
      watch.disconnect()
      document.removeEventListener('visibilitychange', apply)
    }
  }, [reduceMotion])

  const { nodes, links, max } = useMemo(() => {
    const totals = new Map<string, Link>()
    const involved = new Set<ManagerId>()

    for (const trade of trades) {
      if (trade.status !== 'approved' || trade.totalDollars <= 0) continue
      involved.add(trade.seller)
      involved.add(trade.buyer)
      // Undirected pair key so A→B and B→A stack into one arc.
      const key = [trade.seller, trade.buyer].sort().join('|')
      const existing = totals.get(key)
      if (existing) existing.dollars += trade.totalDollars
      else
        totals.set(key, {
          from: trade.seller,
          to: trade.buyer,
          dollars: trade.totalDollars,
        })
    }

    const order = managers
      .filter((manager) => involved.has(manager.id))
      .map((manager) => manager.id)
    const linkList = [...totals.values()]
    return {
      nodes: order,
      links: linkList,
      max: Math.max(...linkList.map((link) => link.dollars), 1),
    }
  }, [trades, managers])

  const size = 460
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 74

  const positions = new Map<ManagerId, { x: number; y: number; angle: number }>()
  nodes.forEach((id, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2
    positions.set(id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      angle,
    })
  })

  if (nodes.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[12.5px] text-arc-ink-faint">
        No trades recorded yet.
      </div>
    )
  }

  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block h-auto w-full max-w-[460px]"
        role="img"
        aria-label="Trade relationships between managers, arc thickness scaled to auction dollars exchanged"
      >
        <g>
          {links.map((link) => {
            const a = positions.get(link.from)
            const b = positions.get(link.to)
            if (!a || !b) return null
            const dimmed = focus !== null && focus !== link.from && focus !== link.to
            const width = 0.8 + (link.dollars / max) * 7
            // Pull the curve toward the centre so heavy pairs read as chords.
            const mx = cx + (a.x + b.x - 2 * cx) * 0.12
            const my = cy + (a.y + b.y - 2 * cy) * 0.12
            const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
            return (
              <path
                key={`${link.from}-${link.to}`}
                d={d}
                fill="none"
                stroke={dimmed ? 'var(--color-arc-ink)' : 'var(--color-arc-green)'}
                strokeWidth={width}
                strokeLinecap="round"
                opacity={dimmed ? 0.18 : focus ? 0.85 : 0.34}
                style={{ transition: 'opacity 160ms ease, stroke 160ms ease' }}
              >
                <title>
                  {managerName(managers, link.from)} ↔ {managerName(managers, link.to)}:{' '}
                  {money(link.dollars)}
                </title>
              </path>
            )
          })}
        </g>

        {/* A ball runs each of the focused manager's arcs, seller to buyer, so
            the direction of the deal is visible rather than implied. */}
        {!reduceMotion && (
          <g>
            {(focus
              ? links.filter((link) => link.from === focus || link.to === focus)
              : // Untouched, run the heaviest arcs so the diagram is alive on a
                // phone, where there is no hover to trigger anything.
                [...links].sort((a, b) => b.dollars - a.dollars).slice(0, 8)
            ).map((link, ballIndex) => {
                const a = positions.get(link.from)
                const b = positions.get(link.to)
                if (!a || !b) return null
                const mx = cx + (a.x + b.x - 2 * cx) * 0.12
                const my = cy + (a.y + b.y - 2 * cy) * 0.12
                const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
                const lit = !focus || link.from === focus || link.to === focus
                return (
                  <g key={`ball-${link.from}-${link.to}`}>
                    <ellipse
                      rx="5.4"
                      ry="3.4"
                      fill="var(--color-arc-brown)"
                      stroke="var(--color-arc-bg-deep)"
                      strokeWidth="1.2"
                      opacity={lit ? 1 : 0.25}
                    >
                      <animateMotion
                        dur="2.6s"
                        begin={`${(ballIndex * 0.32).toFixed(2)}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                        path={d}
                      />
                    </ellipse>
                  </g>
                )
              })}
          </g>
        )}

        <g>
          {nodes.map((id) => {
            const point = positions.get(id)
            if (!point) return null
            const dimmed = focus !== null && focus !== id
            const flipped = Math.cos(point.angle) < -0.01
            const labelX = cx + Math.cos(point.angle) * (radius + 14)
            const labelY = cy + Math.sin(point.angle) * (radius + 14)
            return (
              <g
                key={id}
                onMouseEnter={() => setFocus(id)}
                onMouseLeave={() => setFocus(null)}
                onClick={() => setFocus((current) => (current === id ? null : id))}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={focus === id ? 5 : 3.5}
                  fill={dimmed ? 'var(--color-arc-ink-faint)' : 'var(--color-arc-green)'}
                  style={{ transition: 'r 160ms ease, fill 160ms ease' }}
                />
                <text
                  x={labelX}
                  y={labelY}
                  fill={dimmed ? 'var(--color-arc-ink-faint)' : 'var(--color-arc-ink)'}
                  fontSize="11"
                  fontFamily="IBM Plex Mono, monospace"
                  dominantBaseline="middle"
                  textAnchor={flipped ? 'end' : 'start'}
                  style={{ transition: 'fill 160ms ease' }}
                >
                  {managerName(managers, id)}
                </text>
                {/* generous invisible hit area for touch */}
                <circle cx={point.x} cy={point.y} r={16} fill="transparent" />
              </g>
            )
          })}
        </g>
      </svg>

      <p className="mt-2 text-center text-[11px] text-arc-ink-faint">
        {focus ? (
          <>
            <span className="text-arc-ink">{managerName(managers, focus)}</span> —{' '}
            {links.filter((link) => link.from === focus || link.to === focus).length} trading
            {links.filter((link) => link.from === focus || link.to === focus).length === 1
              ? ' partner, '
              : ' partners, '}
            {money(
              links
                .filter((link) => link.from === focus || link.to === focus)
                .reduce((total, link) => total + link.dollars, 0),
            )}{' '}
            exchanged
          </>
        ) : (
          'Tap or hover a manager to follow the ball through their trades'
        )}
      </p>
    </div>
  )
}
