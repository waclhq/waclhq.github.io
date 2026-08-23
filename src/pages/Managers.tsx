import { useState } from 'react'
import ManagerTag from '../components/ManagerTag'
import { Chip, Panel, PageHeader, SegmentedControl, Scroller, Sparkline } from '../components/ui'
import { useLeagueData } from '../lib/data'
import { num, pct, record } from '../lib/format'
import { careerTable, eraOptions, managerSeasons } from '../lib/stats'

export default function Managers() {
  const { seasons, managers } = useLeagueData()
  const eras = eraOptions(seasons)
  const [eraId, setEraId] = useState(eras[0].id)
  const era = eras.find((option) => option.id === eraId) ?? eras[0]
  const table = careerTable(seasons, era)

  return (
    <>
      <PageHeader
        path="~/managers"
        eyebrow="Career Records"
        title="Managers"
        lede="Sixteen managers have played in this league. Win percentage is regular season; titles count finishing first after the playoffs."
        action={
          <SegmentedControl
            value={eraId}
            onChange={setEraId}
            options={eras.map((option) => ({ id: option.id, label: option.label }))}
          />
        }
      />

      <Panel title={`${era.label} career table`} subtitle={`${table.length} managers`}>
        <Scroller>
          <table className="out">
            <thead>
              <tr>
                <th>Manager</th>
                <th className="n hidden sm:table-cell">Sea</th>
                <th className="n">Record</th>
                <th className="n">Win %</th>
                <th className="n">Titles</th>
                <th className="n hidden md:table-cell">Top 3</th>
                <th className="n hidden sm:table-cell">Playoffs</th>
                <th className="n hidden md:table-cell">Rate</th>
                <th className="n hidden lg:table-cell">Avg PF</th>
                <th className="n hidden lg:table-cell">Avg PA</th>
                <th className="hidden sm:table-cell">Form</th>
              </tr>
            </thead>
            <tbody>
              {table.map((line) => {
                const manager = managers.find((candidate) => candidate.id === line.manager)
                return (
                  <tr key={line.manager}>
                    <td className="whitespace-nowrap">
                      <ManagerTag id={line.manager} />
                      {manager && !manager.active && (
                        <span className="ml-2">
                          <Chip>Former</Chip>
                        </span>
                      )}
                    </td>
                    <td className="n hidden text-arc-ink-faint sm:table-cell">{line.seasonsPlayed}</td>
                    <td className="n">{record(line.wins, line.losses)}</td>
                    <td className="n text-arc-green">{pct(line.winPct)}</td>
                    <td className="n">
                      {line.titles > 0 ? (
                        <span className="text-arc-green">
                          {'★'.repeat(Math.min(line.titles, 4))}
                          {line.titles > 4 ? ` ${line.titles}` : ''}
                        </span>
                      ) : (
                        <span className="text-arc-ink-faint">·</span>
                      )}
                    </td>
                    <td className="n hidden text-arc-ink-soft md:table-cell">{line.topThree || '·'}</td>
                    <td className="n hidden text-arc-ink-soft sm:table-cell">
                      {line.playoffAppearances}/{line.seasonsPlayed}
                    </td>
                    <td className="n hidden text-arc-ink-faint md:table-cell">{pct(line.playoffRate, 0)}</td>
                    <td className="n hidden text-arc-ink-soft lg:table-cell">{num(line.avgPointsFor)}</td>
                    <td className="n hidden text-arc-ink-faint lg:table-cell">{num(line.avgPointsAgainst)}</td>
                    <td className="hidden sm:table-cell" title="Win % by season, oldest to newest">
                      <Sparkline
                        values={managerSeasons(seasons, line.manager)
                          .slice(0, 10)
                          .reverse()
                          .map((row) =>
                            row.team.wins + row.team.losses
                              ? row.team.wins / (row.team.wins + row.team.losses)
                              : null,
                          )}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Scroller>
      </Panel>
    </>
  )
}
