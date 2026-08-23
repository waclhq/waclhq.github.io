import { useState } from 'react'
import ManagerTag from '../components/ManagerTag'
import { Chip, Panel, PageHeader } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { num, pct, record } from '../lib/format'

export default function Standings() {
  const { seasons, managers } = useLeagueData()
  const [year, setYear] = useState(seasons[0]?.year ?? 0)
  const season = seasons.find((candidate) => candidate.year === year) ?? seasons[0]

  return (
    <>
      <PageHeader
        path="~/standings"
        eyebrow={`${seasons.at(-1)?.year}–${seasons[0]?.year} · ${seasons.length} seasons`}
        title="Standings"
        lede="Final tables as recorded by the commissioner, including playoff results. Rank is the finishing position after the postseason."
        action={
          <select
            className="field w-auto"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Season"
          >
            {seasons.map((option) => (
              <option key={option.year} value={option.year}>
                {option.year}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title={`${season.year} final table`}
          subtitle={`${season.teamCount} teams · ${season.keeperEra ? 'Keeper era' : 'Pre-keeper era'}`}
        >
          <div>
            <table className="out">
              <thead>
                <tr>
                  <th className="n">#</th>
                  <th>Team</th>
                  <th>Manager</th>
                  <th className="n">Record</th>
                  <th className="n hidden sm:table-cell">Win %</th>
                  <th className="n hidden sm:table-cell">PF</th>
                  <th className="n hidden md:table-cell">PA</th>
                  <th className="n">Avg</th>
                  <th className="n hidden sm:table-cell">Playoffs</th>
                </tr>
              </thead>
              <tbody>
                {season.teams.map((team) => (
                  <tr key={team.manager}>
                    <td className="n">
                      <span
                        className={
                          team.rank === 1
                            ? 'text-arc-green'
                            : team.rank <= 3
                              ? 'text-arc-ink'
                              : 'text-arc-ink-faint'
                        }
                      >
                        {team.rank}
                      </span>
                    </td>
                    <td className="max-w-[128px] truncate whitespace-nowrap sm:max-w-none">
                      {team.rank === 1 && <span className="mr-1.5 text-arc-green">★</span>}
                      {team.team}
                    </td>
                    <td>
                      <ManagerTag id={team.manager} />
                    </td>
                    <td className="n">{record(team.wins, team.losses)}</td>
                    <td className="n hidden text-arc-ink-soft sm:table-cell">
                      {pct(team.wins / Math.max(team.wins + team.losses, 1), 0)}
                    </td>
                    <td className="n hidden text-arc-ink-soft sm:table-cell">{num(team.pointsFor, 0)}</td>
                    <td className="n hidden text-arc-ink-faint md:table-cell">{num(team.pointsAgainst, 0)}</td>
                    <td className="n text-arc-green">{num(team.avgPointsFor)}</td>
                    <td className="n hidden text-arc-ink-faint sm:table-cell">
                      {team.playoffWins + team.playoffLosses > 0
                        ? record(team.playoffWins, team.playoffLosses)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Roll of champions" subtitle="Every title since the 2004 charter season.">
          <div className="max-h-[720px] overflow-y-auto">
            <table className="out">
              <tbody>
                {seasons.map((row) => (
                  <tr
                    key={row.year}
                    className={row.year === year ? 'bg-arc-yellow' : undefined}
                    onClick={() => setYear(row.year)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="tnum w-14 text-arc-ink-faint">{row.year}</td>
                    <td>
                      <span className="text-arc-green">{managerName(managers, row.champion)}</span>
                      <span className="ml-2 text-[11px] text-arc-ink-faint">
                        d. {managerName(managers, row.runnerUp)}
                      </span>
                    </td>
                    <td className="text-right">
                      {row.keeperEra && <Chip tone="neutral">Keeper</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
