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
 * at now. Every matchup is a ring, drawn bright for the day so far and carried
 * round the rest of the dial, dimmer, at today's odds if nothing changes. A
 * ring swells outward in the first team's colour while they're favoured and
 * dips inward in the second team's colour when the odds flip, so a blowout is
 * a fat smooth ring, a see-saw is jagged, and a comeback is a dip that bursts
 * out. Your matchup is the outer ring. The dial sits tilted like a turntable
 * and turns itself so now faces you, where the tilt makes it biggest; drag to
 * spin and tilt it, tap a ring (or its row) to single it out.
 *
 * It is a solid thing: the face sits on a machined edge and the hub stands
 * proud of it, built from a few flat CSS 3D layers (no WebGL). Plain SVG, no
 * library. Nothing loops: it spins in once when it first comes into view,
 * and when a new score lands it kicks a few degrees, the beacons ping and
 * the hand flashes, all only with motion allowed.
 */

const SIZE = 600
const C = SIZE / 2
const OUTER = 262
const INNER = 96
const TAU = Math.PI * 2
const PAD = 30
const TILT = 32
const TILT_COMPACT = 26
/** The machined edge: layers under the face, px apart in depth. */
const EDGE_LAYERS = 10
const EDGE_STEP = 2.8
/** The hub's height above the face, in the same layers. */
const HUB_LAYERS = 5
const HUB_STEP = 3.2
/** Where the spin-in starts, in degrees back from where it settles. */
const INTRO = -110

function polar(r: number, a: number) {
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

/** SVG arc commands along radius r from angle a0 to a1, split so no piece passes half a turn. */
function arcTo(r: number, a0: number, a1: number): string {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI * 0.9)))
  let d = ''
  for (let k = 1; k <= steps; k++) {
    const p = polar(r, a0 + ((a1 - a0) * k) / steps)
    d += `A${r.toFixed(1)},${r.toFixed(1)} 0 0,${a1 > a0 ? 1 : 0} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }
  return d
}

const at = (r: number, a: number) => {
  const p = polar(r, a)
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
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
  // Motion allowed: start a quarter turn back and spin in once the dial is seen.
  const [spin, setSpin] = useState(() => (animationsDisabled() ? 0 : INTRO))
  const [intro, setIntro] = useState(false)
  const [kick, setKick] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState(compact ? TILT_COMPACT : TILT)
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

  // A new score kicks the dial a few degrees, and it settles back.
  useEffect(() => {
    if (!ping) return
    setKick(7)
    const timer = window.setTimeout(() => setKick(0), 320)
    return () => window.clearTimeout(timer)
  }, [ping])

  // The spin-in, once, the first time the dial is on screen.
  const introDone = useRef(false)
  useEffect(() => {
    const node = stage.current
    if (!node || introDone.current) return
    if (animationsDisabled()) {
      introDone.current = true
      setSpin((value) => (value === INTRO ? 0 : value))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        introDone.current = true
        setIntro(true)
        // Next frame, so the start angle has painted before the transition runs.
        requestAnimationFrame(() => requestAnimationFrame(() => setSpin(0)))
        window.setTimeout(() => setIntro(false), 2000)
      },
      { threshold: 0.35 },
    )
    io.observe(node)
    return () => io.disconnect()
    // The stage exists once there are rings to draw.
  }, [rings.length > 0])

  if (!rings.length) return null

  const [start, end] = dayWindow(board)
  const span = end - start
  const angleAt = (ms: number) => -Math.PI / 2 + Math.min(1, Math.max(0, (ms - start) / span)) * TAU
  const nowMs = Math.min(end, Math.max(start, clock.getTime()))
  const dataMs = Math.min(nowMs, new Date(board.updatedAt).getTime())
  const handA = angleAt(nowMs)
  const aNow = angleAt(dataMs)
  const aEnd = -Math.PI / 2 + TAU
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
  // The disc's box stays square while the tilt flattens it; pull the page in to meet it.
  const squash = ((1 - Math.cos(((compact ? TILT_COMPACT : TILT) * Math.PI) / 180)) / 2) * 0.9

  return (
    <div className={`lv-radar ${compact ? 'is-compact' : ''}`}>
      <div
        className="lv-radar-stage"
        ref={stage}
        style={{ '--squash': squash } as CSSProperties}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => {
          introDone.current = true
          setSpin(0)
          setTilt(compact ? TILT_COMPACT : TILT)
        }}
      >
        <div
          className={`lv-radar-disc ${intro ? 'is-intro' : ''} ${kick ? 'is-kick' : ''}`}
          style={{ transform: `rotateX(${tilt}deg) rotateZ(${autoTurn + spin + kick}deg)` }}
        >
          {/* The machined edge under the face, deepest first. */}
          {Array.from({ length: EDGE_LAYERS }, (_, k) => EDGE_LAYERS - k).map((n) => (
            <i
              key={`edge-${n}`}
              className={`lv-radar-edge ${n === EDGE_LAYERS ? 'is-base' : ''}`}
              aria-hidden
              style={{
                transform: `translateZ(${-n * EDGE_STEP}px)`,
                // The band just under the face is lit green like the rim; below it, graphite darkening to the base.
                background:
                  n <= 2
                    ? `color-mix(in srgb, var(--color-arc-green) ${n === 1 ? 70 : 40}%, var(--color-arc-raised))`
                    : `color-mix(in srgb, var(--color-arc-line) ${Math.round(100 - (n / EDGE_LAYERS) * 75)}%, var(--color-arc-bg-deep))`,
              }}
            />
          ))}
          <svg viewBox={`${-PAD} ${-PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`} role="img" aria-label={`Win odds through the day. ${rings.map(({ m }) => `${m.teams[0].team} ${Math.round(m.teams[0].winProb * 100)}% against ${m.teams[1].team}`).join('; ')}.`}>
            <defs>
              <radialGradient id={`${uid}-face`} cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--color-arc-panel)" />
                <stop offset="0.7" stopColor="var(--color-arc-raised)" />
                <stop offset="1" stopColor="var(--color-arc-panel)" />
              </radialGradient>
              <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
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
            </defs>

            {/* Face, rim and hour ticks */}
            <circle cx={C} cy={C} r={OUTER + 22} fill={`url(#${uid}-face)`} />
            {/* Alternate lanes shaded so each ring has its own road. */}
            {rings.map(({ key }, i) =>
              i % 2 ? null : (
                <circle key={`lane-${key}`} cx={C} cy={C} r={baseR(i)} fill="none" stroke="var(--color-arc-ink)" strokeOpacity="0.045" strokeWidth={band} />
              ),
            )}
            <circle cx={C} cy={C} r={OUTER + 22} fill="none" stroke="var(--color-arc-green)" strokeOpacity="0.7" strokeWidth="3" />
            <circle cx={C} cy={C} r={OUTER + 4} fill="none" stroke="var(--color-arc-line)" strokeWidth="1.5" />
            {ticks.map((t) => {
              const a = polar(OUTER + 8, t.a)
              const b = polar(OUTER + 20, t.a)
              const l = polar(OUTER + 44, t.a)
              return (
                <g key={t.a}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-arc-ink-soft)" strokeWidth="3" strokeLinecap="round" />
                  {!compact && (
                    <text x={l.x} y={l.y + 7} textAnchor="middle" className="lv-radar-hour" transform={upright(l.x, l.y)}>
                      {t.label}
                    </text>
                  )}
                </g>
              )
            })}
            {/* Kickoff: a green tick and "KO" where the first hour would sit. */}
            <line x1={C} y1={C - OUTER - 4} x2={C} y2={C - OUTER - 24} stroke="var(--color-arc-green)" strokeWidth="5" strokeLinecap="round" />
            {!compact && (
              <text x={C} y={C - OUTER - 44 + 8} textAnchor="middle" className="lv-radar-kick" transform={upright(C, C - OUTER - 44)}>
                KO
              </text>
            )}

            {/* Rings: the day so far bright, the rest of the day carried round at today's odds, dimmer. */}
            {rings.map(({ m, key, series }, i) => {
              const [a, b] = m.teams
              const ca = managerColor(a.manager)
              const cb = managerColor(b.manager)
              const r0 = baseR(i)
              const rNow = r0 + bulge(a.winProb)
              const hist = series.map((s) => at(r0 + bulge(s.w), angleAt(Math.min(dataMs, new Date(s.t).getTime()))))
              hist.push(at(rNow, aNow))
              const a0 = angleAt(Math.min(dataMs, new Date(series[0].t).getTime()))
              const curve = `M${hist.join('L')}`
              const past = aNow - a0 > 0.001 ? `${curve}L${at(r0, aNow)}${arcTo(r0, aNow, a0)}Z` : null
              const ahead = aEnd - aNow > 0.001
              const line = `M${at(rNow, aNow)}${arcTo(rNow, aNow, aEnd)}`
              const future = `${line}L${at(r0, aEnd)}${arcTo(r0, aEnd, aNow)}Z`
              const dim = focus !== null && focus !== key
              const width = i === 0 ? 6 : 4.5
              return (
                <g key={key} className="lv-radar-ring" style={{ opacity: dim ? 0.15 : 1 }} onClick={() => setFocus((f) => (f === key ? null : key))}>
                  <circle cx={C} cy={C} r={r0} fill="none" stroke="var(--color-arc-ink-faint)" strokeOpacity="0.35" strokeDasharray="2 6" />
                  {ahead && (
                    <g>
                      <path d={future} fill={ca} fillOpacity="0.3" clipPath={`url(#${uid}-out-${i})`} />
                      <path d={future} fill={cb} fillOpacity="0.3" clipPath={`url(#${uid}-in-${i})`} />
                      <path d={line} fill="none" stroke={ca} strokeOpacity="0.75" strokeWidth={width - 1} clipPath={`url(#${uid}-out-${i})`} />
                      <path d={line} fill="none" stroke={cb} strokeOpacity="0.75" strokeWidth={width - 1} clipPath={`url(#${uid}-in-${i})`} />
                    </g>
                  )}
                  {past && (
                    <g>
                      <path d={past} fill={ca} fillOpacity="0.75" clipPath={`url(#${uid}-out-${i})`} />
                      <path d={past} fill={cb} fillOpacity="0.75" clipPath={`url(#${uid}-in-${i})`} />
                      <path d={curve} fill="none" stroke={ca} strokeWidth={width} strokeLinejoin="round" clipPath={`url(#${uid}-out-${i})`} filter={`url(#${uid}-glow)`} />
                      <path d={curve} fill="none" stroke={cb} strokeWidth={width} strokeLinejoin="round" clipPath={`url(#${uid}-in-${i})`} filter={`url(#${uid}-glow)`} />
                    </g>
                  )}
                  {/* A fat invisible ring to make tapping easy. */}
                  <circle cx={C} cy={C} r={r0} fill="none" stroke="transparent" strokeWidth={band} />
                </g>
              )
            })}

            {/* Beacons where each ring is now */}
            {rings.map(({ m, key }, i) => {
              const w = m.teams[0].winProb
              const p = polar(baseR(i) + bulge(w), aNow)
              const color = managerColor(w >= 0.5 ? m.teams[0].manager : m.teams[1].manager)
              const dim = focus !== null && focus !== key
              return (
                <g key={`b-${key}-${ping}`} style={{ opacity: dim ? 0.2 : 1 }}>
                  {ping > 0 && <circle cx={p.x} cy={p.y} r="8" fill="none" stroke={color} strokeWidth="2.5" className="lv-radar-ping" />}
                  <circle cx={p.x} cy={p.y} r="8" fill={color} stroke="var(--color-arc-ink)" strokeWidth="2.5" />
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
                  strokeWidth="4"
                  strokeLinecap="round"
                  filter={`url(#${uid}-glow)`}
                />
                <circle cx={polar(OUTER + 16, handA).x} cy={polar(OUTER + 16, handA).y} r="7" fill="var(--color-arc-green)" />
              </g>
            )}

            {/* The hub's socket; the hub itself stands above the face. */}
            <circle cx={C} cy={C} r={INNER - 10} fill="var(--color-arc-bg-deep)" />
          </svg>
          {Array.from({ length: HUB_LAYERS }, (_, k) => k + 1).map((n) => (
            <i
              key={`post-${n}`}
              className="lv-radar-post"
              aria-hidden
              style={{
                transform: `translateZ(${n * HUB_STEP}px)`,
                background: `color-mix(in srgb, ${managerColor(hubSide.manager)} ${20 + n * 6}%, var(--color-arc-bg-deep))`,
              }}
            />
          ))}
          <svg
            className="lv-radar-hubtop"
            viewBox={`${-PAD} ${-PAD} ${SIZE + PAD * 2} ${SIZE + PAD * 2}`}
            aria-hidden
            style={{ transform: `translateZ(${(HUB_LAYERS + 1) * HUB_STEP}px)` }}
          >
            <circle cx={C} cy={C} r={INNER - 10} fill="var(--color-arc-bg-deep)" stroke={managerColor(hubSide.manager)} strokeOpacity="0.9" strokeWidth="3" />
            <g transform={upright(C, C)}>
              <text x={C} y={C + 10} textAnchor="middle" className="lv-radar-odds" fill={managerColor(hubSide.manager)}>
                {hubOdds}%
              </text>
              <text x={C} y={C + 44} textAnchor="middle" className="lv-radar-hubsub">
                {hubSide.manager === me && me ? 'your odds' : hubSide.team.length > 16 ? `${hubSide.team.slice(0, 15)}…` : hubSide.team}
              </text>
            </g>
          </svg>
        </div>
      </div>

      {!started && !compact && (
        <p className="lv-radar-note">
          The dial starts at kickoff, {new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Until then each ring shows today's odds all the way round; from kickoff the day so far lights up and the odds bend it.
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
          Bright is the day so far, dim is the rest of the day at today's odds. Outward bulges: the left name is favoured. Inward: the right name. Drag to spin and tilt, double-tap to reset, tap a ring or a row
          to single it out.
        </p>
      )}
    </div>
  )
}
