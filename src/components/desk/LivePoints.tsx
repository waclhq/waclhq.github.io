import type { CSSProperties } from 'react'
import { Panel } from '../ui'
import { managerName, useLeagueData } from '../../lib/data'
import { useMe } from '../../lib/me'
import { pointsLive, useLivePoints } from '../../lib/points'
import type { LivePoints as Board, LivePointsPlayer, LivePointsTeam } from '../../lib/types'

/**
 * The whole league's points this week, live, on the Ledger: every team's
 * starters scored from ESPN's box scores, ranked, with a feed of touchdowns
 * that touch anyone's roster. Your team opens itself; tap any other to see
 * who is carrying it and what is rotting on its bench. Nothing renders until
 * the live-points job has published this week.
 */

const pts = (n: number) => n.toFixed(1)

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function kickoff(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-US', { weekday: 'short' })
  return `${day} ${clock(iso)}`
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'} ago`
}

function when(player: LivePointsPlayer): string {
  if (player.state === 'live') return player.clock || 'Live'
  if (player.state === 'final') return 'Final'
  if (player.state === 'bye') return 'Bye'
  return player.kickoff ? kickoff(player.kickoff) : 'Later'
}

function subtitle(board: Board): string {
  const live = board.games.filter((g) => g.state === 'in').length
  const final = board.games.filter((g) => g.state === 'post').length
  const method = `Scored from ESPN box scores with the league's Yahoo rules; Yahoo's numbers are the official ones.`
  if (live) return `${live} game${live === 1 ? '' : 's'} on, ${final} final. As of ${clock(board.updatedAt)} (${ago(board.updatedAt)}), a few minutes behind the TV. ${method}`
  if (final === board.games.length) return `Every game this week is final. ${method}`
  if (final) return `${final} game${final === 1 ? '' : 's'} final, the rest still to come. As of ${clock(board.updatedAt)}. ${method}`
  const next = board.games.filter((g) => g.state === 'pre').map((g) => g.kickoff).sort()[0]
  return `Nothing has kicked off yet${next ? `; first game ${kickoff(next)}` : ''}. Lineups as of ${board.lineupsAsOf ?? 'this week'}. ${method}`
}

function PlayerRow({ player, bench }: { player: LivePointsPlayer; bench?: boolean }) {
  return (
    <div className={`lp-player is-${player.state} ${bench ? 'is-bench' : ''}`}>
      <span className="lp-slot label">{player.slot === 'W/R/T' ? 'FLEX' : player.slot}</span>
      <span className="lp-who">
        <span className="lp-name">
          {player.name}
          {player.status && <span className="lp-status">{player.status}</span>}
        </span>
        <span className="lp-meta">
          {player.nfl}
          {player.opp ? ` ${player.opp}` : ''} · {when(player)}
          {player.line ? <span className="lp-line"> · {player.line}</span> : null}
        </span>
      </span>
      <span className="lp-pts tnum">{player.state === 'pre' || player.state === 'bye' ? '–' : pts(player.pts)}</span>
    </div>
  )
}

function TeamCard({
  team,
  rank,
  mine,
  managers,
}: {
  team: LivePointsTeam
  rank: number
  mine: boolean
  managers: ReturnType<typeof useLeagueData>['managers']
}) {
  const bits = [
    team.live ? `${team.live} playing` : null,
    team.toPlay ? `${team.toPlay} to play` : null,
    team.done && !team.live && !team.toPlay ? 'done' : null,
  ].filter(Boolean)
  return (
    <li className={`lp-team ${mine ? 'is-mine' : ''}`} style={{ '--i': rank } as CSSProperties}>
      <details open={mine}>
        <summary className="lp-summary">
          <span className="lp-rank tnum">{rank}</span>
          <span className="lp-teamname">
            <span className="lp-title">
              {team.team}
              {mine && <span className="arcade lp-you">you</span>}
            </span>
            <span className="lp-sub">
              {team.manager ? managerName(managers, team.manager) : '—'}
              {bits.length ? ` · ${bits.join(' · ')}` : ''}
            </span>
          </span>
          <span className="lp-total tnum">
            {team.live > 0 && <span className="desk-mu-dot" aria-label="playing now" />}
            {pts(team.total)}
          </span>
        </summary>
        <div className="lp-roster">
          {team.starters.map((player) => (
            <PlayerRow key={`${player.slot}-${player.name}`} player={player} />
          ))}
          <div className="lp-benchhead label">
            Bench <span className="tnum">{pts(team.benchTotal)}</span>
          </div>
          {team.bench.map((player) => (
            <PlayerRow key={`${player.slot}-${player.name}`} player={player} bench />
          ))}
        </div>
      </details>
    </li>
  )
}

export default function LivePoints() {
  const board = useLivePoints()
  const { managers } = useLeagueData()
  const me = useMe()
  if (!board) return null

  const live = pointsLive(board)
  const feed = board.events.slice(0, 6)

  return (
    <Panel
      title={`Live points · week ${board.week ?? '—'}`}
      subtitle={subtitle(board)}
      delay={40}
      flush
      action={live ? <span className="label lp-livetag"><span className="desk-mu-dot" aria-hidden /> Live</span> : undefined}
    >
      {feed.length > 0 && (
        <ol className="lp-feed" aria-label="Latest scores involving league rosters">
          {feed.map((event) => {
            const touchesMe = event.who.some((w) => w.manager && w.manager === me)
            return (
              <li key={event.id} className={`lp-event ${touchesMe ? 'is-mine' : ''}`}>
                <span className="lp-eventwhen label">
                  {event.game} · {event.when}
                </span>
                <span className="lp-eventtext">{event.text}</span>
                <span className="lp-eventwho">
                  {event.who.map((w) => (
                    <span key={`${w.team}-${w.player}`} className={`lp-chip ${w.starter ? '' : 'is-bench'}`}>
                      {w.team}
                      {w.starter ? '' : ' · bench'}
                    </span>
                  ))}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <ol className="lp-board">
        {board.teams.map((team, index) => (
          <TeamCard
            key={team.team}
            team={team}
            rank={index + 1}
            mine={me !== null && team.manager === me}
            managers={managers}
          />
        ))}
      </ol>
    </Panel>
  )
}
