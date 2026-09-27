import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { useMinuteClock } from '../desk/hooks'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { pairingKey, winSeries } from '../../lib/live-view'
import type { LivePoints, LivePointsMatchup, ManagerId } from '../../lib/types'

/**
 * The radar clock: game day as a dial. Kickoff is at twelve o'clock and the
 * day runs clockwise to the last game's final whistle; a glowing hand points
 * at now and the hours still to come stay dark. Every matchup is a ring. A
 * ring swells outward in the first team's colour while they're favoured and
 * dips inward in the second team's colour when the odds flip, so a blowout is
 * a fat smooth ring, a see-saw is jagged, and a comeback is a dip that bursts
 * out. Your matchup is the outer ring. The dial sits tilted like a turntable
 * and turns itself so now faces you, where the tilt makes it biggest; drag to
 * spin and tilt it, tap a ring (or its row) to single it out.
 *
 * Plain SVG, no library. Nothing loops: when a new score lands the beacons
 * ping once and the hand flashes, and only with motion allowed.
 */

const SIZE = 600
const C = SIZE / 2
const OUTER = 262
const INNER = 96
const TAU = Math.PI * 2

function polar(r: number, a: number) {
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

/** The day's window: first kickoff near the update to the last kickoff plus a game's length. */
function dayWindow(board: LivePoints): [number, number] {
  const updated = new Date(board.updatedAt).getTime()
  const kicks = board.games.map((g) => new Date(g.kickoff).getTime()).sort((a, b) => a - b)
  const today = kicks.filter((k) => k >= updated - 14 * 3600_000)
  const start = today[0] ?? kicks[kicks.length - 1] ?? updated
  const inDay = kicks.filter((k) => k >= start && k <= start + 16 * 3600_000)
  const end = (inDay[inDay.length - 1] ?? start) + 3.5 * 3600_000
  return [start, Math.max(end, start + 3 * 3600_000)]
}

export default function RadarClock({ board, me, compact = false }: { board: LivePoints; me: ManagerId | null; compact?: boolean }) {
  const { managers } = useLeagueData()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clock = useMinuteClock()
  // Spin is an offset from the automatic turn that keeps "now" at the front.
  const [spin, setSpin] = useState(0)
  const [tilt, setTilt] = useState(compact ? 30 : 38)
  const [focus, setFocus] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; spin: number; tilt: number; moved: boolean } | null>(null)

  // Outer ring is yours; then the closest matchups, lopsided ones inside.
  const rings = useMemo(() => {
    const all = board.matchups ?? []
    const mine = (m: LivePointsMatchup) => m.teams.some((t) => t.manager && t.manager === me)
    return [...all]
      .sort((a, b) => {
        if (mine(a) !== mine(b)) return mine(a) ? -1 : 1
        return Math.abs(a.teams[0].winProb - 0.5) - Math.abs(b.teams[0].winProb - 0.5)
      })
      .map((m) => ({ m, key: pairingKey(m), series: winSeries(board, m) }))
  }, [board, me])

  // One ping per new score, keyed on the update time.
  const [ping, setPing] = useState(0)
  const last = useRef(board.updatedAt)
  useEffect(() => {
    if (last.current !== board.updatedAt && !animationsDisabled()) setPing((n) => n + 1)
    last.current = board.updatedAt
  }, [board.updatedAt])

  if (!rings.length) return null

  const [start, end] = dayWindow(board)
  const span = end - start
  const angleAt = (ms: number) => -Math.PI / 2 + Math.min(1, Math.max(0, (ms - start) / span)) * TAU
  const nowMs = Math.min(end, Math.max(start, clock.getTime()))
  const dataMs = Math.min(nowMs, new Date(board.updatedAt).getTime())
  const handA = angleAt(nowMs)
  const band = (OUTER - INNER) / rings.length
  const amp = band * 0.5
  const baseR = (i: number) => OUTER - band * (i + 0.5)
  // Square-root easing so a 65-35 edge visibly swells instead of hugging the line.
  const bulge = (w: number) => Math.sign(w - 0.5) * Math.sqrt(Math.min(1, Math.abs(w - 0.5) * 2)) * amp
  const started = clock.getTime() >= start
  const autoTurn = 90 - (handA * 180) / Math.PI
  // Text turns back against the dial so it always reads upright.
  const upright = (x: number, y: number) => `rotate(${-(autoTurn + spin)} ${x} ${y})`

  // Hour ticks in local time around the rim.
  const ticks: { a: number; label: string }[] = []
  const first = new Date(start)
  first.setMinutes(0, 0, 0)
  for (let t = first.getTime() + 3600_000; t < end; t += 3600_000) {
    const d = new Date(t)
    ticks.push({ a: angleAt(t), label: d.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(/\s?[AP]M/, '') })
  }

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (compact) return
    drag.current = { x: event.clientX, y: event.clientY, spin, tilt, moved: false }
  }
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    if (!d.moved) event.currentTarget.setPointerCapture(event.pointerId)
    d.moved = true
    setSpin(d.spin + dx * 0.5)
    setTilt(Math.max(0, Math.min(62, d.tilt + dy * 0.25)))
  }
  const onUp = () => {
    drag.current = null
  }

  const mineRing = rings.find(({ m }) => m.teams.some((t) => t.manager && t.manager === me))
  const hubRing = (focus && rings.find((r) => r.key === focus)) || mineRing || rings[0]
  const hubSide = hubRing.m.teams.find((t) => t.manager && t.manager === me) ?? (hubRing.m.teams[0].winProb >= 0.5 ? hubRing.m.teams[0] : hubRing.m.teams[1])
  const hubOdds = Math.round(hubSide.winProb * 100)

  return (
    <div className={`lv-radar ${compact ? 'is-compact' : ''}`}>
      <div
        className="lv-radar-stage"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          setSpin(0)
          setTilt(compact ? 30 : 38)
        }}
      >
        <div className="lv-radar-disc" style={{ transform: `rotateX(${tilt}deg) rotateZ(${autoTurn + spin}deg)` }}>
          <svg viewBox={`-44 -44 ${SIZE + 88} ${SIZE + 88}`} role="img" aria-label={`Win odds through the day. ${rings.map(({ m }) => `${m.teams[0].team} ${Math.round(m.teams[0].winProb * 100)}% against ${m.teams[1].team}`).join('; ')}.`}>
            <defs>
              <radialGradient id={`${uid}-face`} cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--color-arc-raised)" />
                <stop offset="0.75" stopColor="var(--color-arc-panel)" />
                <stop offset="1" stopColor="var(--color-arc-bg-deep)" />
              </radialGradient>
              <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {rings.map(({ key }, i) => (
                <g key={key}>
                  <clipPath id={`${uid}-out-${i}`}>
                    <path d={`M0,0H${SIZE}V${SIZE}H0Z M${C + baseR(i)},${C} A${baseR(i)},${baseR(i)} 0 1,0 ${C - baseR(i)},${C} A${baseR(i)},${baseR(i)} 0 1,0 ${C + baseR(i)},${C}Z`} clipRule="evenodd" />
                  </clipPath>
                  <clipPath id={`${uid}-in-${i}`}>
                    <circle cx={C} cy={C} r={baseR(i)} />
                  </clipPath>
                </g>
              ))}
              {/* The part of the day still to come, dimmed. */}
              <mask id={`${uid}-past`}>
                <rect width={SIZE} height={SIZE} fill="white" fillOpacity="0.22" />
                <path d={sector(-Math.PI / 2, handA)} fill="white" />
              </mask>
            </defs>

            {/* Face, rim and hour ticks */}
            <circle cx={C} cy={C} r={OUTER + 22} fill={`url(#${uid}-face)`} stroke="var(--color-arc-line)" strokeWidth="2" />
            <circle cx={C} cy={C} r={OUTER + 22} fill="none" stroke="var(--color-arc-green)" strokeOpacity="0.25" strokeWidth="1" />
            {ticks.map((t) => {
              const a = polar(OUTER + 6, t.a)
              const b = polar(OUTER + 14, t.a)
              const l = polar(OUTER + 36, t.a)
              return (
                <g key={t.a}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-arc-ink-faint)" strokeWidth="2" />
                  {!compact && (
                    <text x={l.x} y={l.y + 5} textAnchor="middle" className="lv-radar-hour" transform={upright(l.x, l.y)}>
                      {t.label}
                    </text>
                  )}
                </g>
              )
            })}
            {!compact && (
              <text x={C} y={C - OUTER - 30} textAnchor="middle" className="lv-radar-kick" transform={upright(C, C - OUTER - 36)}>
                KICKOFF
              </text>
            )}

            {/* Each ring all the way round, faint, split in its two colours, so the dial reads as rings from the start. */}
            {rings.map(({ m, key }, i) => {
              const dim = focus !== null && focus !== key
              return (
                <g key={`track-${key}`} style={{ opacity: dim ? 0.12 : 1 }} className="lv-radar-track">
                  <circle cx={C} cy={C} r={baseR(i) + amp * 0.35} fill="none" stroke={managerColor(m.teams[0].manager)} strokeOpacity="0.28" strokeWidth="2.5" />
                  <circle cx={C} cy={C} r={baseR(i) - amp * 0.35} fill="none" stroke={managerColor(m.teams[1].manager)} strokeOpacity="0.28" strokeWidth="2.5" />
                </g>
              )
            })}

            {/* Rings: the day so far at full strength, the rest of the day dim. */}
            <g mask={`url(#${uid}-past)`}>
              {rings.map(({ m, key, series }, i) => {
                const [a, b] = m.teams
                const ca = managerColor(a.manager)
                const cb = managerColor(b.manager)
                const r0 = baseR(i)
                const pts = series.map((s) => {
                  const t = Math.min(dataMs, new Date(s.t).getTime())
                  return polar(r0 + bulge(s.w), angleAt(t))
                })
                if (pts.length === 1) pts.push(pts[0])
                const a0 = angleAt(Math.min(dataMs, new Date(series[0].t).getTime()))
                const a1 = angleAt(dataMs)
                const curve = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
                const back = polar(r0, a1)
                const home = polar(r0, a0)
                const large = a1 - a0 > Math.PI ? 1 : 0
                const fill = `${curve}L${back.x.toFixed(1)},${back.y.toFixed(1)}A${r0},${r0} 0 ${large},0 ${home.x.toFixed(1)},${home.y.toFixed(1)}Z`
                const dim = focus !== null && focus !== key
                return (
                  <g key={key} className="lv-radar-ring" style={{ opacity: dim ? 0.18 : 1 }} onClick={() => setFocus((f) => (f === key ? null : key))}>
                    <circle cx={C} cy={C} r={r0} fill="none" stroke="var(--color-arc-line)" strokeDasharray="2 5" />
                    <path d={fill} fill={ca} fillOpacity="0.62" clipPath={`url(#${uid}-out-${i})`} />
                    <path d={fill} fill={cb} fillOpacity="0.62" clipPath={`url(#${uid}-in-${i})`} />
                    <path d={curve} fill="none" stroke={ca} strokeWidth={i === 0 ? 4.5 : 3.2} clipPath={`url(#${uid}-out-${i})`} filter={`url(#${uid}-glow)`} />
                    <path d={curve} fill="none" stroke={cb} strokeWidth={i === 0 ? 4.5 : 3.2} clipPath={`url(#${uid}-in-${i})`} filter={`url(#${uid}-glow)`} />
                    {/* A fat invisible ring to make tapping easy. */}
                    <circle cx={C} cy={C} r={r0} fill="none" stroke="transparent" strokeWidth={band} />
                  </g>
                )
              })}
            </g>

            {/* Beacons where each ring is now */}
            {rings.map(({ m, key }, i) => {
              const w = m.teams[0].winProb
              const p = polar(baseR(i) + bulge(w), angleAt(dataMs))
              const color = managerColor(w >= 0.5 ? m.teams[0].manager : m.teams[1].manager)
              const dim = focus !== null && focus !== key
              return (
                <g key={`b-${key}-${ping}`} style={{ opacity: dim ? 0.2 : 1 }}>
                  {ping > 0 && <circle cx={p.x} cy={p.y} r="6" fill="none" stroke={color} strokeWidth="2" className="lv-radar-ping" />}
                  <circle cx={p.x} cy={p.y} r="5.5" fill={color} stroke="var(--color-arc-bg-deep)" strokeWidth="2" />
                </g>
              )
            })}

            {/* The hand */}
            {started && (
              <g className={ping > 0 ? 'lv-radar-flash' : ''} key={`hand-${ping}`}>
                <line
                  x1={C}
                  y1={C}
                  x2={polar(OUTER + 16, handA).x}
                  y2={polar(OUTER + 16, handA).y}
                  stroke="var(--color-arc-green)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  filter={`url(#${uid}-glow)`}
                />
                <circle cx={polar(OUTER + 16, handA).x} cy={polar(OUTER + 16, handA).y} r="5" fill="var(--color-arc-green)" />
              </g>
            )}

            {/* Hub */}
            <circle cx={C} cy={C} r={INNER - 14} fill="var(--color-arc-bg-deep)" stroke="var(--color-arc-line)" strokeWidth="2" />
            <g transform={upright(C, C)}>
            <text x={C} y={C + 4} textAnchor="middle" className="lv-radar-odds" fill={managerColor(hubSide.manager)}>
              {hubOdds}%
            </text>
            <text x={C} y={C + 34} textAnchor="middle" className="lv-radar-hubsub">
              {hubSide.manager === me && me ? 'your odds' : hubSide.team.length > 16 ? `${hubSide.team.slice(0, 15)}…` : hubSide.team}
            </text>
            </g>
          </svg>
        </div>
      </div>

      {!started && !compact && (
        <p className="lv-radar-note">
          The dial starts at kickoff, {new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. The rings draw themselves as the odds move.
        </p>
      )}

      <ol className="lv-radar-key">
        {rings.map(({ m, key }, i) => {
          const [a, b] = m.teams
          const pa = Math.round(a.winProb * 100)
          const mine = [a, b].some((t) => t.manager && t.manager === me)
          return (
            <li key={key}>
              <button
                type="button"
                className={`${focus === key ? 'is-focus' : ''} ${mine ? 'is-mine' : ''}`}
                aria-pressed={focus === key}
                onClick={() => setFocus((f) => (f === key ? null : key))}
                style={{ '--ca': managerColor(a.manager), '--cb': managerColor(b.manager), '--pa': a.winProb } as CSSProperties}
              >
                <span className="lv-radar-key-ring tnum">{i === 0 ? 'outer' : i === rings.length - 1 ? 'inner' : `ring ${i + 1}`}</span>
                <span className="lv-radar-key-a">{a.manager ? managerName(managers, a.manager) : a.team}</span>
                <span className="lv-radar-key-bar" aria-hidden>
                  <i />
                </span>
                <span className="lv-radar-key-b">{b.manager ? managerName(managers, b.manager) : b.team}</span>
                <span className="lv-radar-key-pct tnum">
                  {pa >= 50 ? pa : 100 - pa}%
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {!compact && (
        <p className="lv-radar-hint">
          Outward bulges: the left name is favoured. Inward: the right name. Drag to spin and tilt, double-tap to reset, tap a ring or a row
          to single it out.
        </p>
      )}
    </div>
  )
}

/** A pie slice from angle a0 to a1 (radians), out past the rim. */
function sector(a0: number, a1: number): string {
  if (a1 - a0 >= TAU - 0.001) return `M0,0H${SIZE}V${SIZE}H0Z`
  const r = SIZE
  const p0 = { x: C + r * Math.cos(a0), y: C + r * Math.sin(a0) }
  const p1 = { x: C + r * Math.cos(a1), y: C + r * Math.sin(a1) }
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${C},${C}L${p0.x},${p0.y}A${r},${r} 0 ${large},1 ${p1.x},${p1.y}Z`
}
