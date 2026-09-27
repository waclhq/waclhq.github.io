import { useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { managerColor } from '../../lib/identity'
import { pairingKey, winSeries } from '../../lib/live-view'
import type { LivePoints, ManagerId } from '../../lib/types'

/**
 * Win-odds mountains: every matchup's day as a ridge in a 3D range. Sea level
 * is a coin flip. Where the first team was favoured the ridge rises above the
 * water as a peak in its colour; where the second team was, it sinks into a
 * trench in theirs. Drag to turn the range and tilt the camera, tap a ridge to
 * bring it forward. Drawn in plain SVG with an oblique projection: no library,
 * nothing running at rest, and the rise-in is skipped under reduced motion.
 */

const RIDGE_W = 520
const LEFT = 150
const SHIFT = 0.4
const MAX_SKEW = 70

export default function Mountains({
  board,
  me,
  compact = false,
}: {
  board: LivePoints
  me: ManagerId | null
  /** A fixed camera and no labels on the right, for the recap. */
  compact?: boolean
}) {
  const [skew, setSkew] = useState(34)
  const [lift, setLift] = useState(120)
  const [focus, setFocus] = useState<string | null>(null)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const drag = useRef<{ x: number; y: number; skew: number; lift: number } | null>(null)

  // Your matchup at the front, where the eye lands.
  const rows = useMemo(() => {
    const all = board.matchups ?? []
    const mine = (key: string) => all.find((m) => pairingKey(m) === key)?.teams.some((t) => t.manager && t.manager === me)
    return [...all]
      .map((m) => ({ m, key: pairingKey(m), series: winSeries(board, m) }))
      .sort((a, b) => Number(mine(a.key)) - Number(mine(b.key)))
  }, [board, me])

  if (!rows.length) return null

  // Before the odds have moved there is no range to draw, only sea level.
  const moved = rows.some(({ series }) => {
    const ws = series.map((s) => s.w)
    return Math.max(...ws) - Math.min(...ws) >= 0.01
  })

  const gap = compact ? 34 : 40
  const top = lift * 0.62 + 34
  const height = top + gap * (rows.length - 1) + lift * 0.62 + 36
  const seaY = (r: number) => top + r * gap
  // Depth runs up and to the side; the shift never pushes the left labels off.
  const depth = rows.length - 1
  const x0 = (r: number) => LEFT + ((depth - r) * skew - Math.min(0, skew) * depth) * SHIFT
  const VIEW_W = LEFT + RIDGE_W + MAX_SKEW * depth * SHIFT + 160
  const point = (r: number, i: number, n: number, w: number) => ({
    x: x0(r) + (n <= 1 ? 0 : (i / (n - 1)) * RIDGE_W),
    y: seaY(r) - (w - 0.5) * 2 * lift * 0.62,
  })

  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (compact) return
    drag.current = { x: event.clientX, y: event.clientY, skew, lift }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    setSkew(Math.max(-MAX_SKEW, Math.min(MAX_SKEW, start.skew + (event.clientX - start.x) * 0.25)))
    setLift(Math.max(60, Math.min(190, start.lift - (event.clientY - start.y) * 0.5)))
  }
  const onUp = () => {
    drag.current = null
  }

  const first = rows[0].series[0]?.t
  const last = board.updatedAt
  const clock = (iso?: string) =>
    iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  return (
    <div className={`lv-mtn ${compact ? 'is-compact' : ''}`}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        role="img"
        aria-label="Win odds through the day for every matchup, as a mountain range"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          setSkew(34)
          setLift(120)
        }}
      >
        <defs>
          {rows.map(({ key }, r) => (
            <g key={key}>
              <clipPath id={`${uid}-up-${r}`}>
                <rect x="0" y="0" width={VIEW_W} height={seaY(r)} />
              </clipPath>
              <clipPath id={`${uid}-dn-${r}`}>
                <rect x="0" y={seaY(r)} width={VIEW_W} height={height} />
              </clipPath>
            </g>
          ))}
          <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-arc-cyan)" stopOpacity="0.1" />
            <stop offset="1" stopColor="var(--color-arc-cyan)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {rows.map(({ m, key, series }, r) => {
          const [a, b] = m.teams
          const ca = managerColor(a.manager)
          const cb = managerColor(b.manager)
          const n = series.length
          const pts = series.map((s, i) => point(r, i, n, s.w))
          const ridge = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
          const area = `${ridge}L${pts[n - 1].x.toFixed(1)},${seaY(r)}L${pts[0].x.toFixed(1)},${seaY(r)}Z`
          const nextSea = r < rows.length - 1 ? seaY(r + 1) : seaY(r) + gap
          const nextX = r < rows.length - 1 ? x0(r + 1) : x0(r) + skew
          const water = `M${x0(r)},${seaY(r)}L${x0(r) + RIDGE_W},${seaY(r)}L${nextX + RIDGE_W},${nextSea}L${nextX},${nextSea}Z`
          const now = m.teams[0].winProb
          const lead = now >= 0.5 ? a : b
          const dim = focus !== null && focus !== key
          const mine = [a, b].some((t) => t.manager && t.manager === me)
          const end = pts[n - 1]
          return (
            <g
              key={key}
              className={`lv-mtn-row ${mine ? 'is-mine' : ''}`}
              style={{ '--r': r, opacity: dim ? 0.28 : 1, transformOrigin: `0 ${seaY(r)}px` } as CSSProperties}
              onClick={() => setFocus((f) => (f === key ? null : key))}
            >
              {/* trench (second team favoured), then the water over it, then the peak */}
              <path d={area} fill={cb} fillOpacity="0.55" clipPath={`url(#${uid}-dn-${r})`} />
              <path d={ridge} fill="none" stroke={cb} strokeWidth="2" clipPath={`url(#${uid}-dn-${r})`} />
              <path d={water} fill={`url(#${uid}-water)`} stroke="var(--color-arc-cyan)" strokeOpacity="0.18" strokeWidth="1" />
              <path d={area} fill={ca} fillOpacity="0.62" clipPath={`url(#${uid}-up-${r})`} />
              <path d={ridge} fill="none" stroke={ca} strokeWidth="2.2" clipPath={`url(#${uid}-up-${r})`} />
              <line x1={x0(r)} x2={x0(r) + RIDGE_W} y1={seaY(r)} y2={seaY(r)} stroke="var(--color-arc-cyan)" strokeOpacity="0.35" strokeDasharray="3 4" />
              <circle cx={end.x} cy={end.y} r="4" fill={now >= 0.5 ? ca : cb} className="lv-mtn-now" />
              <text x={x0(r) - 10} y={seaY(r) + 4} textAnchor="end" className="lv-mtn-label" fill={ca}>
                {a.team}
              </text>
              {!compact && (
                <text x={x0(r) + RIDGE_W + 12} y={seaY(r) + 4} className="lv-mtn-label" fill={cb}>
                  {b.team}
                </text>
              )}
              <text x={end.x} y={end.y + (now >= 0.5 ? -9 : 17)} textAnchor="middle" className="lv-mtn-odds" fill={lead === a ? ca : cb}>
                {Math.round(Math.max(now, 1 - now) * 100)}%
              </text>
            </g>
          )
        })}
        <text x={x0(rows.length - 1)} y={height - 8} className="lv-mtn-axis">
          {clock(first)}
        </text>
        <text x={x0(rows.length - 1) + RIDGE_W} y={height - 8} textAnchor="end" className="lv-mtn-axis">
          now {clock(last)}
        </text>
      </svg>
      {!moved && (
        <p className="lv-mtn-flat">
          Calm water: nobody's odds have moved yet today. The range builds itself from the first snap of the next game,
          one ridge per matchup.
        </p>
      )}
      {!compact && (
        <p className="lv-mtn-hint">
          Sea level is a coin flip. Peaks: the team on the left is favoured. Trenches: the team on the right. Drag to turn the
          range, double-tap to reset, tap a ridge to single it out.
        </p>
      )}
    </div>
  )
}
