import { useMemo, useRef } from 'react'
import ManagerTag from '../components/ManagerTag'
import SeasonScrubber from '../components/tables/SeasonScrubber'
import { Pennant, leadWash, rankTone } from '../components/tables/bits'
import { useFlipRows } from '../components/tables/flip'
import { Panel, PageHeader } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { num, pct, record } from '../lib/format'
import { managerColor } from '../lib/identity'
import { useMe } from '../lib/me'
import { useUrlParam } from '../lib/tables-url'
import type { ManagerId, TeamSeason } from '../lib/types'

interface Row {
  manager: ManagerId
  team: TeamSeason | null
}

export default function Standings() {
  const { seasons, managers } = useLeagueData()
  const me = useMe()
  const latest = seasons[0]?.year ?? 0
  const [param, setParam] = useUrlParam('season')
  const season = seasons.find((candidate) => candidate.year === Number(param)) ?? seasons[0]
  const year = season.year
  const setYear = (next: number) => setParam(next === latest ? null : String(next))

  // Everyone who ever sat at the table, so one tbody survives every season:
  // changing the year re-sorts the same rows instead of remounting them, and
  // a manager who was not in the league that year fades rather than vanishes.
  const everyone = useMemo(() => {
    const ids = new Set<ManagerId>()
    for (const row of seasons) for (const team of row.teams) ids.add(team.manager)
    return [...ids].sort((a, b) => managerName(managers, a).localeCompare(managerName(managers, b)))
  }, [seasons, managers])

  const rows = useMemo<Row[]>(() => {
    const played = [...season.teams]
      .sort((a, b) => a.rank - b.rank)
      .map((team) => ({ manager: team.manager, team }))
    const seated = new Set(played.map((row) => row.manager))
    const out = everyone.filter((id) => !seated.has(id)).map((manager) => ({ manager, team: null }))
    return [...played, ...out]
  }, [season, everyone])

  const body = useRef<HTMLTableSectionElement>(null)
  useFlipRows(body)

  const preAdjust = year <= 2006
  const subtitle = `${season.teamCount} teams · ${season.keeperEra ? 'Keeper era' : 'Pre-keeper era'}. PF/gm is regular-season points per game; Playoffs is the postseason record (PO on a phone).${
    preAdjust ? ' Points as scored that year — the record book re-scores 2004–06 for career averages.' : ''
  }`

  return (
    <>
      <PageHeader
        path="~/standings"
        eyebrow={`${seasons.at(-1)?.year}–${latest} · ${seasons.length} seasons`}
        title="Standings"
        lede="Final tables as recorded by the commissioner. Rank is the finish after the postseason. Drag the timeline or tap a year and watch the league reshuffle."
      />

      <div className="grid min-w-0 gap-6">
        <SeasonScrubber seasons={seasons} managers={managers} year={year} onChange={setYear} me={me} />

        <Panel title={`${year} final table`} subtitle={subtitle} delay={80}>
          <table className="out final">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Manager</th>
                <th className="hidden sm:table-cell">Team</th>
                <th className="n" title="Regular-season points per game">
                  PF/gm
                </th>
                <th className="n">Record</th>
                <th className="n hidden sm:table-cell" title="Playoff record">
                  Playoffs
                </th>
                <th className="n hidden md:table-cell">Win %</th>
                <th className="n hidden md:table-cell">PF</th>
                <th className="n hidden lg:table-cell">PA</th>
              </tr>
            </thead>
            <tbody ref={body}>
              {rows.map(({ manager, team }, i) => {
                const champion = team?.rank === 1
                const firstOut = !team && i > 0 && rows[i - 1].team !== null
                const bracket =
                  team && team.playoffWins + team.playoffLosses > 0
                    ? record(team.playoffWins, team.playoffLosses)
                    : null
                const classes = [
                  team ? '' : 'sit-out',
                  firstOut ? 'sit-first' : '',
                  champion ? 'lead' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr
                    key={manager}
                    data-flip={manager}
                    className={classes || undefined}
                    style={champion ? leadWash(manager) : undefined}
                  >
                    <td className={`n tnum ${team ? rankTone(team.rank) : 'text-arc-ink-faint'}`}>
                      {team ? (
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {champion && <Pennant color={managerColor(manager)} />}
                          {team.rank}
                        </span>
                      ) : (
                        '·'
                      )}
                    </td>
                    <td>
                      <div className="min-w-0">
                        <ManagerTag id={manager} />
                        {/* w-0 + min-w-full: the team line fills whatever the
                            column gets without ever widening it. */}
                        <div className="mt-0.5 w-0 min-w-full truncate text-[11px] leading-tight text-arc-ink-soft sm:hidden">
                          {team ? team.team : 'did not play'}
                        </div>
                      </div>
                    </td>
                    <td className="hidden max-w-[260px] truncate sm:table-cell">
                      {team ? (
                        team.team
                      ) : (
                        <span className="text-arc-ink-faint italic">did not play</span>
                      )}
                    </td>
                    <td className={`n ${team ? 'font-semibold text-arc-green' : ''}`}>
                      {team ? num(team.avgPointsFor) : '—'}
                    </td>
                    <td className="n">
                      {team ? (
                        <>
                          {record(team.wins, team.losses)}
                          <div
                            className="w-0 min-w-full truncate text-[11px] leading-tight text-arc-ink-faint sm:hidden"
                            title={bracket ? 'Playoff record' : undefined}
                          >
                            {bracket ? `PO ${bracket}` : '\u00a0'}
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="n hidden text-arc-ink-soft sm:table-cell">{bracket ?? '—'}</td>
                    <td className="n hidden text-arc-ink-soft md:table-cell">
                      {team ? pct(team.wins / Math.max(team.wins + team.losses, 1), 0) : '—'}
                    </td>
                    <td className="n hidden text-arc-ink-soft md:table-cell">
                      {team ? num(team.pointsFor, 0) : '—'}
                    </td>
                    <td className="n hidden text-arc-ink-faint lg:table-cell">
                      {team ? num(team.pointsAgainst, 0) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  )
}
