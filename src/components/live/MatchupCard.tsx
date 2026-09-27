import { useEffect, useRef, useState, type CSSProperties } from 'react'
import PixelMugshot from '../PixelMugshot'
import FireFrame from '../FireFrame'
import ScoreTape from './ScoreTape'
import ShareCardButton from './ShareCardButton'
import StateTag from './StateTag'
import Football from './Football'
import { usePlayerPick } from './PlayerSheet'
import { matchupCard } from '../../lib/live-cards'
import { Plot, roundedScale } from '../charts'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import {
  fmt,
  gameClock,
  headToHead,
  heat,
  inRedZone,
  matchupLine,
  onField,
  momentum,
  mood,
  pairingKey,
  redZoneTeams,
  sideStatus,
  sidesOnField,
  signed,
  swingSeries,
} from '../../lib/live-view'
import type { LiveMatchupSide, LivePoints, LivePointsMatchup, LivePointsPlay, LivePointsPlayer, LivePointsTeam, ManagerId } from '../../lib/types'

/**
 * One matchup as a face-off: portraits, leaning scores, Yahoo-calibrated
 * projections, a tug-of-war bar for the win odds, a pip for every starter
 * (lit while playing, hollow until kickoff), and which way the last twenty
 * minutes went. Open it for the slot-by-slot head-to-head and the day's
 * swing chart.
 */

function Pips({ team }: { team: LivePointsTeam | undefined }) {
  if (!team) return null
  return (
    <span className="lv-pips" aria-label={sideStatus(team)}>
      {team.starters.map((player) => (
        <i key={`${player.slot}-${player.name}`} className={`is-${player.state}`} title={`${player.name}: ${gameClock(player)}`} />
      ))}
    </span>
  )
}

function Side({
  side,
  team,
  board,
  mine,
  align,
  freshPlays,
}: {
  side: LiveMatchupSide
  team: LivePointsTeam | undefined
  board: LivePoints
  mine: boolean
  align: 'left' | 'right'
  freshPlays: LivePointsPlay[]
}) {
  const { managers } = useLeagueData()
  const move = momentum(board, side.team)
  return (
    <div className={`lv-side is-${align} ${mine ? 'is-mine' : ''}`} style={{ '--c': managerColor(side.manager) } as CSSProperties}>
      <div className={`lv-face ${mood(side, freshPlays)}`}>
        {side.manager ? <PixelMugshot seed={side.manager} scale={2} /> : <span className="lv-face-blank" />}
      </div>
      <div className="lv-side-text">
        <span className="lv-side-team">
          {side.team}
          {mine && <span className="arcade lv-you">you</span>}
        </span>
        <span className="lv-side-mgr">
          {side.manager ? managerName(managers, side.manager) : '—'}
          {side.record ? ` · ${side.record}` : ''}
        </span>
        <span className="lv-side-score tnum">{fmt(side.total)}</span>
        <span className="lv-side-proj tnum">
          proj {fmt(side.proj)}
          {move !== null && Math.abs(move) >= 0.1 && (
            <span className={`lv-move ${move > 0 ? 'is-up' : 'is-down'}`}>
              {move > 0 ? '▲' : '▼'} {signed(move)}
            </span>
          )}
        </span>
        <Pips team={team} />
      </div>
    </div>
  )
}

function PlayerCell({
  player,
  team,
  align,
  hot = false,
  ball = false,
}: {
  player?: LivePointsPlayer
  team: string
  align: 'left' | 'right'
  hot?: boolean
  /** His side of the ball is on the field. */
  ball?: boolean
}) {
  const pick = usePlayerPick()
  if (!player) return <div className={`lv-h2h-cell is-${align}`} />
  const shown = player.state === 'pre' || player.state === 'bye'
  const cell = (
    <button
      type="button"
      className={`lv-h2h-cell lv-pick is-${align} is-${player.state} ${heat(player) ? `is-${heat(player)}` : ''} ${hot ? 'is-redzone' : ''}`}
      onClick={() => pick(player.name, team)}
      aria-label={`${player.name}, ${player.state === 'pre' || player.state === 'bye' ? 'not played yet' : `${player.pts.toFixed(1)} points`}${hot ? ', in the red zone' : ball ? ', on the field' : ''}. Show stats.`}
    >
      <span className="lv-h2h-name">
        {ball && <Football />}
        {player.name}
        {player.status && <em>{player.status}</em>}
      </span>
      <span className="lv-h2h-meta">
        {hot && <span className="lv-rz-chip">Red zone</span>}
        {player.nfl} {player.opp ?? ''}
        {player.state === 'final' ? '' : ` · ${gameClock(player)}`}
      </span>
      {player.line && <span className="lv-h2h-line">{player.line}</span>}
      <span className="lv-h2h-pts tnum">
        <StateTag player={player} />
        {shown ? <span className="lv-h2h-proj">proj {fmt(player.proj ?? 0)}</span> : fmt(player.pts)}
      </span>
    </button>
  )
  // In the red zone the card burns: the Book's fire, licking up its edges.
  return hot ? <FireFrame>{cell}</FireFrame> : cell
}

function Swing({ board, matchup }: { board: LivePoints; matchup: LivePointsMatchup }) {
  const series = swingSeries(board, matchup)
  if (series.length < 2) {
    return <p className="lv-swing-empty">The swing chart draws itself as the scores move.</p>
  }
  const { domain, ticks } = roundedScale([0, ...series.flatMap((s) => [s.margin, s.projMargin])])
  const [a, b] = matchup.teams
  return (
    <div className="lv-swing">
      <div className="label lv-swing-title">
        The swing · above the line {a.team} leads, below {b.team}
      </div>
      <Plot
        xs={series.map((s) => new Date(s.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, ''))}
        height={170}
        yDomain={domain}
        yTicks={ticks}
        yFormat={(v) => (v > 0 ? `+${v}` : String(v))}
        refLines={[{ y: 0, label: 'tied', color: 'var(--color-arc-ink-faint)' }]}
        cursorColor={managerColor(a.manager)}
        series={[
          { key: 'proj', values: series.map((s) => s.projMargin), color: 'var(--color-arc-ink-faint)', width: 1.5, dash: '4 3' },
          { key: 'margin', values: series.map((s) => s.margin), color: managerColor(a.manager), width: 2.5 },
        ]}
        tooltip={(i) => (
          <>
            <div className="label">{new Date(series[i].t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
            <div className="mt-1">
              {series[i].margin === 0 ? 'Tied' : `${series[i].margin > 0 ? a.team : b.team} by ${fmt(Math.abs(series[i].margin))}`}
            </div>
            <div className="text-arc-ink-faint">
              projected {series[i].projMargin >= 0 ? a.team : b.team} by {fmt(Math.abs(series[i].projMargin))}
            </div>
          </>
        )}
      />
    </div>
  )
}

const JUMP = 'wacl:matchup-jump'

/** Bring a matchup's card into view with its head-to-head open (the tote board's cards call this). */
export function jumpToMatchup(key: string) {
  window.dispatchEvent(new CustomEvent(JUMP, { detail: key }))
}

export default function MatchupCard({
  matchup,
  board,
  teams,
  me,
  index,
  freshPlays = [],
  nameOf,
}: {
  matchup: LivePointsMatchup
  board: LivePoints
  teams: Map<string, LivePointsTeam>
  me: ManagerId | null
  index: number
  /** Plays that arrived at the latest refresh, to jolt the portraits. */
  freshPlays?: LivePointsPlay[]
  nameOf: (id: ManagerId | null) => string
}) {
  const [a, b] = matchup.teams
  const mine = [a, b].some((side) => side.manager && side.manager === me)
  const [open, setOpen] = useState(mine)
  const [lit, setLit] = useState(0)
  const ref = useRef<HTMLElement>(null)
  const key = pairingKey(matchup)
  useEffect(() => {
    const onJump = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== key) return
      setOpen(true)
      setLit((n) => n + 1)
      ref.current?.scrollIntoView({ behavior: animationsDisabled() ? 'auto' : 'smooth', block: 'start' })
    }
    window.addEventListener(JUMP, onJump)
    return () => window.removeEventListener(JUMP, onJump)
  }, [key])
  useEffect(() => {
    if (!lit) return
    const timer = window.setTimeout(() => setLit(0), 1600)
    return () => window.clearTimeout(timer)
  }, [lit])
  const ta = teams.get(a.team)
  const tb = teams.get(b.team)
  const pa = Math.round(a.winProb * 100)
  const live = a.live + b.live > 0
  const rz = redZoneTeams(board)
  const sides = sidesOnField(board)
  return (
    <article
      ref={ref}
      className={`lv-match ${mine ? 'is-mine' : ''} ${matchup.settled ? 'is-final' : ''} ${live ? 'is-live' : ''} ${lit ? 'is-lit' : ''}`}
      style={{ '--i': index, '--ca': managerColor(a.manager), '--cb': managerColor(b.manager), '--pa': a.winProb } as CSSProperties}
    >
      <div className="lv-match-top">
        <span className="label">
          {live ? (
            <span className="lv-livebadge">
              <i className="desk-mu-dot" aria-hidden /> Live
            </span>
          ) : matchup.settled ? (
            'Final'
          ) : (
            'Upcoming'
          )}
          {mine ? ' · your matchup' : ''}
        </span>
        <span className="label tnum">{a.rank && b.rank ? `#${a.rank} v #${b.rank}` : ''}</span>
      </div>
      <div className="lv-faceoff">
        <Side side={a} team={ta} board={board} mine={a.manager === me && me !== null} align="left" freshPlays={freshPlays} />
        <span className="lv-vs arcade" aria-hidden>
          vs
        </span>
        <Side side={b} team={tb} board={board} mine={b.manager === me && me !== null} align="right" freshPlays={freshPlays} />
      </div>
      <div className="lv-tug" role="img" aria-label={`Win probability: ${a.team} ${pa}%, ${b.team} ${100 - pa}%`}>
        <span className="lv-tug-a tnum">{pa}%</span>
        <div className="lv-tug-bar">
          <i />
        </div>
        <span className="lv-tug-b tnum">{100 - pa}%</span>
      </div>
      <ScoreTape board={board} matchup={matchup} />
      <p className="lv-line">{matchupLine(matchup)}</p>
      <div className="lv-match-actions">
        <button type="button" className="lv-open" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide head-to-head' : 'Head-to-head'}
          <span aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
        <ShareCardButton
          make={() => matchupCard(matchup, board.week, nameOf)}
          text={`${a.team} ${a.total.toFixed(1)} v ${b.team} ${b.total.toFixed(1)}. ${matchupLine(matchup)}`}
        />
      </div>
      {open && ta && tb && (
        <div className="lv-h2h">
          {headToHead(ta, tb).map((row, i) => (
            <div key={`${row.slot}-${i}`} className="lv-h2h-row">
              <PlayerCell player={row.left} team={ta.team} align="left" hot={!!row.left && inRedZone(row.left, rz)} ball={!!row.left && onField(row.left, sides)} />
              <span className="lv-h2h-slot label">{row.slot === 'W/R/T' ? 'FLEX' : row.slot}</span>
              <PlayerCell player={row.right} team={tb.team} align="right" hot={!!row.right && inRedZone(row.right, rz)} ball={!!row.right && onField(row.right, sides)} />
            </div>
          ))}
          <div className="lv-h2h-bench">
            <span>
              Bench <b className="tnum">{fmt(ta.benchTotal)}</b>
            </span>
            <span className="label">left on the pine</span>
            <span>
              <b className="tnum">{fmt(tb.benchTotal)}</b> Bench
            </span>
          </div>
          <Swing board={board} matchup={matchup} />
        </div>
      )}
    </article>
  )
}
