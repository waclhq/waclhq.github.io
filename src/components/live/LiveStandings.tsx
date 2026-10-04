import { useMemo, useRef, type CSSProperties } from 'react'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { fmt, liveStandings } from '../../lib/live-view'
import { useFlipRows } from '../tables/flip'
import type { LivePoints, ManagerId } from '../../lib/types'

/**
 * The table if the week ended right now: last week's standings with this
 * week's matchups settled the way they stand, points for and against
 * carried in. Rows glide when a score changes the order; arrows say who has
 * climbed or slid since last week, and a dashed line marks the playoff cut
 * (as many teams as made the bracket last season). Each row says how its
 * game stands and the team's chance to win it.
 */
export default function LiveStandings({ board, me }: { board: LivePoints; me: ManagerId | null }) {
  const { managers, seasons } = useLeagueData()
  const rows = useMemo(() => liveStandings(board), [board])
  const body = useRef<HTMLTableSectionElement>(null)
  useFlipRows(body)
  // The cut line: however many teams played in last season's bracket.
  const cut = useMemo(() => {
    const last = seasons[0]
    const n = last ? last.teams.filter((t) => t.playoffWins + t.playoffLosses > 0).length : 0
    return n > 0 && n < rows.length ? n : null
  }, [seasons, rows.length])

  if (!rows.length) return null
  const hasPf = rows.some((r) => r.pf !== null)

  return (
    <table className="out lv-stand">
      <thead>
        <tr>
          <th className="n">#</th>
          <th>Team</th>
          <th className="n">Record</th>
          <th className="hidden sm:table-cell">This week</th>
          {hasPf && <th className="n hidden sm:table-cell">PF</th>}
        </tr>
      </thead>
      <tbody ref={body}>
        {rows.map((r) => {
          const move = r.before !== null ? r.before - r.rank : 0
          const mine = r.manager !== null && r.manager === me
          // Always this team's chance to win the week, whichever way it stands now.
          const odds = Math.round(r.winProb * 100)
          const week = r.now === null ? `Not started · v ${shortTeam(r.opp)}` : `${fmt(r.score)}–${fmt(r.oppScore)} v ${shortTeam(r.opp)}`
          return (
            <tr
              key={r.team}
              data-flip={r.team}
              className={`${mine ? 'is-mine' : ''} ${cut !== null && r.rank === cut ? 'is-cut' : ''}`}
              style={{ '--c': managerColor(r.manager) } as CSSProperties}
            >
              <td className="n tnum">
                <span className="lv-stand-rank">{r.rank}</span>
                <span
                  className={`lv-stand-move ${move > 0 ? 'is-up' : move < 0 ? 'is-down' : ''}`}
                  title={r.before !== null ? `${move === 0 ? 'Same as' : move > 0 ? 'Up from' : 'Down from'} ${r.before}${ordinal(r.before)} last week` : undefined}
                >
                  {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'}
                </span>
              </td>
              <td>
                <span className="lv-stand-team">
                  <i aria-hidden />
                  <span className="min-w-0">
                    <span className="lv-stand-name">{r.manager ? managerName(managers, r.manager) : r.team}</span>
                    <span className="lv-stand-sub sm:hidden">{week}</span>
                  </span>
                </span>
              </td>
              <td className="n tnum">
                <span className="lv-stand-rec">
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ''}
                </span>
                {r.now && (
                  <span className={`lv-stand-now is-${r.now.toLowerCase()} ${r.final ? 'is-final' : ''}`} title={r.final ? 'Final' : `${odds}% to win the week`}>
                    {r.now}
                    {!r.final && r.now !== 'T' && <small>{odds}%</small>}
                  </span>
                )}
              </td>
              <td className="hidden text-arc-ink-soft sm:table-cell">{week}</td>
              {hasPf && <td className="n tnum hidden sm:table-cell">{r.pf !== null ? fmt(r.pf) : '—'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function shortTeam(team: string): string {
  return team.length > 16 ? `${team.slice(0, 15)}…` : team
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
