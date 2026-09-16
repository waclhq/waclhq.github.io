import type { CSSProperties } from 'react'
import { Panel } from '../ui'
import { managerName, useLeagueData } from '../../lib/data'
import { useMe } from '../../lib/me'
import { isLive, useScoreboard } from '../../lib/scores'
import type { LiveMatchup, LiveMatchupTeam } from '../../lib/types'

/**
 * This week's six matchups on the Ledger while the games are on: points so
 * far, Yahoo's projection, and a win probability that moves between checks.
 * Your matchup comes first. Nothing renders until the scores job has
 * published at least once.
 */

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hr${hours === 1 ? '' : 's'} ago`
}

function statusLabel(matchup: LiveMatchup): { text: string; tone: 'live' | 'final' | 'soon' } {
  if (matchup.status === 'midevent') return { text: 'Live', tone: 'live' }
  if (matchup.status === 'postevent') return { text: 'Final', tone: 'final' }
  return { text: 'Upcoming', tone: 'soon' }
}

function TeamRow({
  team,
  matchup,
  managers,
  mine,
}: {
  team: LiveMatchupTeam
  matchup: LiveMatchup
  managers: ReturnType<typeof useLeagueData>['managers']
  mine: boolean
}) {
  const final = matchup.status === 'postevent'
  const won = final && matchup.winnerTeamKey !== null && matchup.winnerTeamKey === team.teamKey
  const lost = final && matchup.winnerTeamKey !== null && matchup.winnerTeamKey !== team.teamKey
  return (
    <div className={`desk-mu-row ${won ? 'is-won' : ''} ${lost ? 'is-lost' : ''}`}>
      <span className="desk-mu-team">
        <span className="desk-mu-name">
          {team.teamName ?? '—'}
          {mine && <span className="arcade desk-mu-you">you</span>}
        </span>
        <span className="desk-mu-manager">{team.manager ? managerName(managers, team.manager) : '—'}</span>
      </span>
      <span className="desk-mu-pts tnum">{team.points.toFixed(1)}</span>
      <span className="desk-mu-proj tnum">
        {team.projected !== null && !final ? `proj ${Math.round(team.projected)}` : ''}
      </span>
    </div>
  )
}

export default function Scoreboard() {
  const board = useScoreboard()
  const { managers } = useLeagueData()
  const me = useMe()
  if (!board || board.matchups.length === 0) return null

  const involvesMe = (matchup: LiveMatchup) =>
    me !== null && matchup.teams.some((team) => team.manager === me)
  const ordered = [...board.matchups].sort(
    (a, b) => Number(involvesMe(b)) - Number(involvesMe(a)),
  )
  const live = isLive(board)
  const week = board.week ?? '—'
  const finals = board.matchups.filter((m) => m.status === 'postevent').length
  const subtitle = live
    ? `Yahoo's numbers, about a quarter of an hour behind the games. Scores as of ${clock(board.updatedAt)} (${ago(board.updatedAt)}).`
    : finals === board.matchups.length
      ? `All ${finals} games final. Scores as of ${clock(board.updatedAt)}.`
      : `Nothing kicked off yet. Projections as of ${clock(board.updatedAt)}.`

  return (
    <Panel title={`Scoreboard · week ${week}`} subtitle={subtitle} delay={60} flush>
      <div className="desk-mus">
        {ordered.map((matchup, index) => {
          const [home, away] = matchup.teams
          if (!home || !away) return null
          const mine = involvesMe(matchup)
          const status = statusLabel(matchup)
          // The bar reads the top row's chances; the label names whoever leads.
          const p = home.winProbability
          const favourite = p === null ? null : p >= 0.5 ? home : away
          const chance = p === null ? null : Math.round((p >= 0.5 ? p : 1 - p) * 100)
          const key = `${home.teamKey ?? home.teamName}-${away.teamKey ?? away.teamName}`
          return (
            <article
              key={key}
              className={`desk-mu ${mine ? 'is-mine' : ''} is-${status.tone}`}
              style={{ '--i': index } as CSSProperties}
              aria-label={`${home.teamName} ${home.points.toFixed(1)}, ${away.teamName} ${away.points.toFixed(1)}, ${status.text}`}
            >
              <div className="desk-mu-meta">
                <span className={`label desk-mu-status is-${status.tone}`}>
                  {status.tone === 'live' && <span className="desk-mu-dot" aria-hidden />}
                  {mine ? `Your matchup · ${status.text}` : status.text}
                </span>
                {matchup.isPlayoffs && <span className="label">Playoffs</span>}
              </div>
              <TeamRow team={home} matchup={matchup} managers={managers} mine={me !== null && home.manager === me} />
              <TeamRow team={away} matchup={matchup} managers={managers} mine={me !== null && away.manager === me} />
              {p !== null && matchup.status !== 'postevent' && (
                <>
                  <div className="desk-mu-prob" aria-hidden>
                    <i style={{ width: `${Math.round(p * 100)}%` }} />
                  </div>
                  <div className="desk-mu-foot">
                    <span className={chance !== null && chance >= 65 ? 'text-arc-green' : chance !== null && chance <= 55 ? 'text-arc-yellow' : ''}>
                      {favourite?.teamName} {chance}%
                      {chance !== null && chance <= 55 ? ' · coin flip' : ''}
                    </span>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
      {board.unmapped.length > 0 && (
        <p className="border-t border-arc-line px-5 py-3 text-[12px] text-[var(--color-arc-orange)]">
          Unmapped Yahoo teams: {board.unmapped.join(', ')} — add them to <code>public/data/yahoo-map.json</code>.
        </p>
      )}
    </Panel>
  )
}
