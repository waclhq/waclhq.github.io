import type { CSSProperties } from 'react'
import { managerColor } from '../../lib/identity'
import { winSeries } from '../../lib/live-view'
import type { LivePoints, LivePointsMatchup } from '../../lib/types'

/**
 * The matchup's pulse: a heart-monitor trace of its win odds through the
 * day. Every move in the odds is a beat, as tall as the swing, up for the
 * team on the left and down for the team on the right. A decided matchup
 * flatlines for the side that lost. The dot at the end beats only while a
 * game is live and motion is allowed.
 */
const W = 300
const H = 44
const MID = H / 2

export default function Heartbeat({ board, matchup, live }: { board: LivePoints; matchup: LivePointsMatchup; live: boolean }) {
  const series = winSeries(board, matchup)
  const [a, b] = matchup.teams
  const moves = series.slice(1).map((s, i) => s.w - series[i].w)
  const beats = moves.length
  const step = W / (beats + 2)
  let d = `M0,${MID}`
  let x = 0
  for (const move of moves) {
    x += step
    const amp = Math.min(MID - 3, Math.max(Math.abs(move) > 0.004 ? 5 : 1.5, Math.abs(move) * 90))
    const dir = move >= 0 ? -1 : 1
    const w = Math.min(step * 0.7, 14)
    d += `L${(x - w * 0.6).toFixed(1)},${MID}L${(x - w * 0.3).toFixed(1)},${(MID + dir * amp).toFixed(1)}L${x.toFixed(1)},${(MID - dir * amp * 0.45).toFixed(1)}L${(x + w * 0.25).toFixed(1)},${MID}`
  }
  d += `L${W - 6},${MID}`
  const now = a.winProb
  const decided = now >= 0.99 || now <= 0.01
  const loser = now >= 0.5 ? b : a
  const color = managerColor(now >= 0.5 ? a.manager : b.manager)
  return (
    <div className={`lv-beat ${decided ? 'is-flat' : ''}`} style={{ '--c': color } as CSSProperties}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <line x1="0" x2={W} y1={MID} y2={MID} className="lv-beat-base" />
        <path d={d} className="lv-beat-trace" />
        <circle cx={W - 6} cy={MID} r="3.5" className={`lv-beat-dot ${live && !decided ? 'is-live' : ''}`} />
      </svg>
      <span className="lv-beat-label">
        {decided ? `${loser.team}: flatline` : beats ? `${beats} swing${beats === 1 ? '' : 's'} today` : 'resting heart rate'}
      </span>
    </div>
  )
}
