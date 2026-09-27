import type { CSSProperties } from 'react'
import type { LivePoints, LivePointsGame } from '../../lib/types'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'

/**
 * Every NFL game this week as a strip of tiles: score, clock, a bar for how
 * much has been played, who has the ball, and a red-zone flag. Each tile
 * counts the league's starters in that game, so you can see where the
 * points are coming from before you look at the plays.
 */

function when(game: LivePointsGame): string {
  if (game.state === 'post') return 'Final'
  if (game.state === 'in') return game.detail || 'Live'
  const date = new Date(game.kickoff)
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export function startersIn(board: LivePoints, game: LivePointsGame): number {
  let count = 0
  for (const team of board.teams) {
    for (const player of team.starters) if (player.nfl === game.home || player.nfl === game.away) count += 1
  }
  return count
}

export default function GameStrip({ board }: { board: LivePoints }) {
  const order = { in: 0, pre: 1, post: 2 } as const
  const games = [...board.games].sort(
    (a, b) => order[a.state] - order[b.state] || a.kickoff.localeCompare(b.kickoff),
  )
  return (
    <div className="lv-strip" role="list" aria-label="NFL games this week">
      {games.map((game) => {
        const starters = startersIn(board, game)
        const homeUp = game.homeScore > game.awayScore
        const awayUp = game.awayScore > game.homeScore
        return (
          <div
            key={game.id}
            role="listitem"
            className={`lv-game is-${game.state} ${game.redZone ? 'is-redzone' : ''}`}
            data-teams={`${game.away} ${game.home}`}
            aria-label={`${game.away} ${game.awayScore}, ${game.home} ${game.homeScore}, ${when(game)}`}
          >
            <div className="lv-game-row">
              <span className={`lv-game-team ${awayUp && game.state !== 'pre' ? 'is-up' : ''}`}>
                {game.possession === game.away && <i className="lv-ball" aria-label="has the ball" />}
                {game.away}
              </span>
              <span className="lv-game-score tnum">{game.state === 'pre' ? '' : game.awayScore}</span>
            </div>
            <div className="lv-game-row">
              <span className={`lv-game-team ${homeUp && game.state !== 'pre' ? 'is-up' : ''}`}>
                {game.possession === game.home && <i className="lv-ball" aria-label="has the ball" />}
                {game.home}
              </span>
              <span className="lv-game-score tnum">{game.state === 'pre' ? '' : game.homeScore}</span>
            </div>
            <div className="lv-game-bar" aria-hidden>
              <i style={{ '--played': game.elapsed ?? (game.state === 'post' ? 1 : 0) } as CSSProperties} />
            </div>
            <div className="lv-game-foot">
              <span className={game.state === 'in' ? 'text-arc-green' : ''}>{when(game)}</span>
              {game.redZone ? <span className="lv-rz">RED ZONE</span> : starters > 0 ? <span>{starters} starting</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A banner for every game where the ball is inside the 20, naming whose points are at stake. */
export function RedZoneAlerts({ board }: { board: LivePoints }) {
  const { managers } = useLeagueData()
  const hot = board.games.filter((game) => game.redZone && game.possession)
  if (!hot.length) return null
  return (
    <div className="lv-rzlist" role="status" aria-live="polite">
      {hot.map((game) => {
        const threatened = board.teams.flatMap((team) =>
          [...team.starters, ...team.bench]
            .filter((player) => player.nfl === game.possession && player.pos !== 'DEF')
            .map((player) => ({ player, team, starter: team.starters.includes(player) })),
        )
        const defenders = board.teams.flatMap((team) =>
          team.starters
            .filter((player) => player.pos === 'DEF' && player.nfl === (game.possession === game.home ? game.away : game.home))
            .map((player) => ({ player, team })),
        )
        return (
          <div key={game.id} className="lv-rzcard">
            <div className="lv-rzhead">
              <span className="lv-rz">RED ZONE</span>
              <span className="label">
                {game.possession} · {game.down ?? 'inside the 20'} · {game.detail}
              </span>
            </div>
            <div className="lv-rzwho">
              {threatened.filter((row) => row.starter).length === 0 && (
                <span className="text-arc-ink-faint">No starters on this offense. Bench only.</span>
              )}
              {threatened.map(({ player, team, starter }) => (
                <span
                  key={`${team.team}-${player.name}`}
                  className={`lv-tag ${starter ? '' : 'is-bench'}`}
                  style={{ '--c': managerColor(team.manager) } as CSSProperties}
                >
                  {player.name} <b>{managerName(managers, team.manager)}</b>
                  {starter ? '' : ' · bench'}
                </span>
              ))}
              {defenders.map(({ player, team }) => (
                <span key={`d-${team.team}`} className="lv-tag is-def" style={{ '--c': managerColor(team.manager) } as CSSProperties}>
                  {player.name} D sweating <b>{managerName(managers, team.manager)}</b>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
