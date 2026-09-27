import { useMemo, useRef, type CSSProperties } from 'react'
import { PageHeader, Panel } from '../components/ui'
import GameStrip, { RedZoneAlerts } from '../components/live/GameStrip'
import MatchupCard from '../components/live/MatchupCard'
import PlaysWire from '../components/live/PlaysWire'
import BonusWatch from '../components/live/BonusWatch'
import Leaders from '../components/live/Leaders'
import ScoreAlert from '../components/live/ScoreAlert'
import { useClock } from '../components/desk/hooks'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { useMe } from '../lib/me'
import { pointsLive, useLivePoints } from '../lib/points'
import { fmt, orderedMatchups, teamByName } from '../lib/live-view'
import type { LivePoints } from '../lib/types'

/**
 * LIVE — game day in one room. Every matchup as a face-off with live win
 * odds, every NFL game as a tile, the red zone as it happens, a wire of the
 * plays that moved anyone's score, bonus chases, and the week's heroes and
 * ghosts. Scored from ESPN's box scores with the league's Yahoo rules by the
 * live-points job; Yahoo remains the official record.
 */

function ago(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'} ago`
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`
}

function StatusBar({ board }: { board: LivePoints }) {
  const now = useClock(1000)
  const live = board.games.filter((g) => g.state === 'in').length
  const final = board.games.filter((g) => g.state === 'post').length
  const next = board.games
    .filter((g) => g.state === 'pre')
    .map((g) => new Date(g.kickoff).getTime())
    .filter((t) => t > now.getTime() - 5 * 60_000)
    .sort((a, b) => a - b)[0]
  return (
    <div className="lv-status">
      <span className={`lv-onair ${live ? 'is-on' : ''}`}>
        <i aria-hidden /> {live ? 'On air' : final === board.games.length ? 'All final' : 'Off air'}
      </span>
      <span className="lv-stat">
        <b className="tnum">{live}</b> live
      </span>
      <span className="lv-stat">
        <b className="tnum">{final}</b> final
      </span>
      <span className="lv-stat">
        <b className="tnum">{board.games.length - live - final}</b> to come
      </span>
      {next && (
        <span className="lv-stat is-next">
          next kickoff <b className="tnum">{next <= now.getTime() ? 'now' : countdown(next - now.getTime())}</b>
        </span>
      )}
      <span className="lv-stat is-fresh">updated {ago(board.updatedAt, now)}</span>
    </div>
  )
}

/** Every team on one axis: points so far, with the projection as a ghost bar behind. */
function TheField({ board }: { board: LivePoints }) {
  const { managers } = useLeagueData()
  const me = useMe()
  const rows = [...board.teams].sort((a, b) => (b.proj ?? b.total) - (a.proj ?? a.total))
  const top = Math.max(1, ...rows.map((t) => Math.max(t.total, t.proj ?? 0)))
  return (
    <ol className="lv-field">
      {rows.map((team, i) => {
        const beats = board.teams.filter((other) => other !== team && (team.proj ?? team.total) > (other.proj ?? other.total)).length
        return (
          <li
            key={team.team}
            className={team.manager === me && me ? 'is-mine' : ''}
            style={{ '--c': managerColor(team.manager), '--now': team.total / top, '--proj': (team.proj ?? team.total) / top, '--i': i } as CSSProperties}
          >
            <span className="lv-field-name">
              {team.team}
              <em>{managerName(managers, team.manager)} · beats {beats} of 11 on projection</em>
            </span>
            <span className="lv-field-bar" aria-hidden>
              <i className="is-proj" />
              <i className="is-now" />
            </span>
            <span className="lv-field-num tnum">
              {fmt(team.total)}
              <em>{fmt(team.proj ?? team.total)}</em>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default function Live() {
  const board = useLivePoints()
  const me = useMe()

  // Plays that were not on the page at the previous refresh flash once.
  const previous = useRef<Set<string> | null>(null)
  const fresh = useMemo(() => {
    const ids = new Set((board?.plays ?? []).map((p) => p.id))
    const before = previous.current
    previous.current = ids
    if (!before) return new Set<string>()
    return new Set([...ids].filter((id) => !before.has(id)))
  }, [board])

  if (!board) {
    return (
      <div className="lv-room">
        <PageHeader
          eyebrow="Game day"
          title="Live"
          lede="Every matchup, every big play, as it happens. Nothing has been published for this week yet; the live job wakes up on game days."
        />
      </div>
    )
  }

  const teams = teamByName(board)
  const matchups = orderedMatchups(board, me)
  const live = pointsLive(board)
  const liveCount = board.games.filter((g) => g.state === 'in').length

  return (
    <div className="lv-room">
      <ScoreAlert plays={board.plays ?? []} me={me} />
      <PageHeader
        eyebrow={`${board.season ?? ''} · week ${board.week ?? '—'}${live ? ` · ${liveCount} game${liveCount === 1 ? '' : 's'} live` : ''}`}
        title="Live"
        lede="Every matchup, every big play, scored with the league's Yahoo rules from ESPN's box scores. A few minutes behind the TV; Yahoo stays official."
      />

      <StatusBar board={board} />

      <div className="-mx-4 mb-6 sm:mx-0">
        <GameStrip board={board} />
      </div>

      <RedZoneAlerts board={board} />

      {matchups.length > 0 && (
        <section className="mb-8" aria-label="Matchups">
          <div className="lv-sectionhead">
            <h2 className="lv-h2">Matchups</h2>
            <span className="label">win odds from Yahoo's projections, moved by the real points</span>
          </div>
          <div className="lv-matches">
            {matchups.map((matchup, index) => (
              <MatchupCard
                key={matchup.teams.map((t) => t.team).join('|')}
                matchup={matchup}
                board={board}
                teams={teams}
                me={me}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

      <div className="lv-split">
        <Panel
          title="The wire"
          subtitle="Touchdowns, 20-yard plays, turnovers and sacks that moved someone's score, with what each one was worth to whom."
          flush
        >
          <PlaysWire plays={board.plays ?? []} me={me} fresh={fresh} />
        </Panel>
        <div className="lv-side-col">
          <Panel title="Bonus watch" subtitle="Yardage bonuses in reach: 2 at 300 passing, 3 at 100 rushing, 2 at 100 receiving." flush>
            <BonusWatch chases={board.chases ?? []} milestones={board.milestones ?? []} me={me} />
          </Panel>
          <Panel
            title="The field"
            subtitle="All twelve on one axis: points so far, projection behind. Beats counts who you'd beat on projection this week."
            flush
          >
            <TheField board={board} />
          </Panel>
        </div>
      </div>

      <Leaders board={board} me={me} />
    </div>
  )
}
