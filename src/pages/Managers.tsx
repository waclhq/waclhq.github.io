import { useMemo, useRef } from 'react'
import ManagerTag from '../components/ManagerTag'
import { SortHeader, leadWash, rankTone, type SortDir } from '../components/tables/bits'
import { useFlipRows } from '../components/tables/flip'
import { Chip, Panel, PageHeader, SegmentedControl, Sparkline } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { num, ordinal, pct, record } from '../lib/format'
import { managerColor } from '../lib/identity'
import { useMe } from '../lib/me'
import { animationsDisabled } from '../lib/motion'
import { bookCareerTable, eraOptions, inEra, managerSeasons, type CareerLine } from '../lib/stats'
import { useUrlParam } from '../lib/tables-url'

type SortKey =
  | 'name'
  | 'seasons'
  | 'wins'
  | 'winPct'
  | 'titles'
  | 'topThree'
  | 'berths'
  | 'rate'
  | 'pf'
  | 'pa'

interface SortSpec {
  label: string
  value: (line: CareerLine) => number
  /** Tie-breakers, always best-first regardless of direction. */
  then: SortKey[]
  natural: SortDir
}

const SORTS: Record<SortKey, SortSpec> = {
  name: { label: 'Manager', value: () => 0, then: [], natural: 'asc' },
  seasons: { label: 'Sea', value: (line) => line.seasonsPlayed, then: ['winPct'], natural: 'desc' },
  wins: { label: 'Record', value: (line) => line.wins, then: ['winPct'], natural: 'desc' },
  winPct: { label: 'Win %', value: (line) => line.winPct, then: ['wins'], natural: 'desc' },
  titles: { label: 'Titles', value: (line) => line.titles, then: ['winPct', 'wins'], natural: 'desc' },
  topThree: { label: 'Top 3', value: (line) => line.topThree, then: ['titles', 'winPct'], natural: 'desc' },
  berths: {
    label: 'Berths',
    value: (line) => line.playoffAppearances,
    then: ['rate', 'winPct'],
    natural: 'desc',
  },
  rate: { label: 'Rate', value: (line) => line.playoffRate, then: ['berths', 'winPct'], natural: 'desc' },
  pf: {
    label: 'PF/gm',
    value: (line) => line.avgPointsFor ?? Number.NEGATIVE_INFINITY,
    then: ['winPct'],
    natural: 'desc',
  },
  pa: {
    label: 'PA/gm',
    value: (line) => line.avgPointsAgainst ?? Number.NEGATIVE_INFINITY,
    then: ['winPct'],
    natural: 'desc',
  },
}

const DEFAULT_SORT: SortKey = 'titles'

function isSortKey(value: string | null): value is SortKey {
  return value !== null && value in SORTS
}

function isDir(value: string | null): value is SortDir {
  return value === 'asc' || value === 'desc'
}

export default function Managers() {
  const { seasons, managers, careerAverages } = useLeagueData()
  const me = useMe()
  const eras = eraOptions(seasons)

  const [eraParam, setEraParam] = useUrlParam('era', (value) =>
    eras.some((option) => option.id === value),
  )
  const [sortParam, setSortParam] = useUrlParam('sort', isSortKey)
  const [dirParam, setDirParam] = useUrlParam('dir', isDir)

  const era = eras.find((option) => option.id === eraParam) ?? eras[0]
  const sortKey: SortKey = isSortKey(sortParam) ? sortParam : DEFAULT_SORT
  const natural = SORTS[sortKey].natural
  const dir: SortDir = isDir(dirParam) ? dirParam : natural

  const table = useMemo(
    () => bookCareerTable(seasons, era, careerAverages),
    [seasons, era, careerAverages],
  )
  const names = useMemo(() => new Map(managers.map((m) => [m.id, m.displayName])), [managers])

  const sorted = useMemo(() => {
    const nameOf = (line: CareerLine) => names.get(line.manager) ?? line.manager
    const spec = SORTS[sortKey]
    return [...table].sort((a, b) => {
      let primary =
        sortKey === 'name' ? nameOf(a).localeCompare(nameOf(b)) : spec.value(a) - spec.value(b)
      if (primary) return dir === 'asc' ? primary : -primary
      for (const key of spec.then) {
        primary = SORTS[key].value(b) - SORTS[key].value(a)
        if (primary) return primary
      }
      return nameOf(a).localeCompare(nameOf(b))
    })
  }, [table, sortKey, dir, names])

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      const next: SortDir = dir === 'desc' ? 'asc' : 'desc'
      setDirParam(next === natural ? null : next)
      return
    }
    setSortParam(key === DEFAULT_SORT ? null : key)
    setDirParam(null)
  }

  const body = useRef<HTMLTableSectionElement>(null)
  useFlipRows(body)

  const medals = dir === natural && sortKey !== 'name'
  const bookEra = era.id === 'all' || era.id === 'keeper'
  const mineIndex = me ? sorted.findIndex((line) => line.manager === me) : -1
  const mine = mineIndex >= 0 ? sorted[mineIndex] : null

  const jumpToMe = () => {
    const row = body.current?.querySelector<HTMLElement>(`[data-flip="${me}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: animationsDisabled() ? 'auto' : 'smooth', block: 'center' })
    row.classList.remove('row-ping')
    void row.offsetWidth
    row.classList.add('row-ping')
    window.setTimeout(() => row.classList.remove('row-ping'), 1000)
    row.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
  }

  const lede = `${sorted.length} managers ${
    era.id === 'all' ? 'have played in this league' : `played in the ${era.label} window`
  }. Win percentage is regular season; titles count finishing first after the playoffs. Tap a column to rank by it.`

  const subtitle = `${sorted.length} managers · ranked by ${SORTS[sortKey].label.toLowerCase()}${
    dir !== natural ? (dir === 'asc' ? ', low to high' : ', high to low') : ''
  }. ${
    bookEra
      ? 'PF/gm and PA/gm are the record book’s career averages, with 2004–06 re-scored for era inflation.'
      : 'PF/gm and PA/gm are the mean of season averages inside the window.'
  }`

  return (
    <>
      <PageHeader
        path="~/managers"
        eyebrow="Career Records"
        title="Managers"
        lede={lede}
        action={
          <SegmentedControl
            value={era.id}
            onChange={(id) => setEraParam(id === 'all' ? null : id)}
            options={eras.map((option) => ({ id: option.id, label: option.label }))}
          />
        }
      />

      {me && mine && (
        <button
          type="button"
          className="you-pin pop-in"
          onClick={jumpToMe}
          style={{ ['--c' as string]: managerColor(me) }}
          aria-label={`You are ${ordinal(mineIndex + 1)} of ${sorted.length} by ${SORTS[sortKey].label}. Jump to your row.`}
        >
          <ManagerTag id={me} link={false} showName={false} size={24} />
          <span className="min-w-0">
            <span className="label">You</span>
            <span className="you-pin-line">
              <b>{ordinal(mineIndex + 1)}</b> of {sorted.length} · {record(mine.wins, mine.losses)} ·{' '}
              {pct(mine.winPct)} · {mine.titles} title{mine.titles === 1 ? '' : 's'}
            </span>
          </span>
          <span className="you-pin-go" aria-hidden>
            ↓<span className="hidden sm:inline"> your row</span>
          </span>
        </button>
      )}

      <Panel title={`${era.label} career table`} subtitle={subtitle}>
        <table className="out lb">
          <thead>
            <tr>
              <th className="n" scope="col">
                #
              </th>
              <SortHeader
                label="Manager"
                numeric={false}
                active={sortKey === 'name'}
                dir={sortKey === 'name' ? dir : 'asc'}
                onClick={() => onSort('name')}
              />
              <SortHeader
                label="Sea"
                className="hidden sm:table-cell"
                hint="Seasons played"
                active={sortKey === 'seasons'}
                dir={sortKey === 'seasons' ? dir : 'desc'}
                onClick={() => onSort('seasons')}
              />
              <SortHeader
                label="Record"
                className="hidden sm:table-cell"
                hint="Regular-season wins and losses"
                active={sortKey === 'wins'}
                dir={sortKey === 'wins' ? dir : 'desc'}
                onClick={() => onSort('wins')}
              />
              <SortHeader
                label="Win %"
                active={sortKey === 'winPct'}
                dir={sortKey === 'winPct' ? dir : 'desc'}
                onClick={() => onSort('winPct')}
              />
              <SortHeader
                label="Titles"
                active={sortKey === 'titles'}
                dir={sortKey === 'titles' ? dir : 'desc'}
                onClick={() => onSort('titles')}
              />
              <SortHeader
                label="Top 3"
                className="hidden md:table-cell"
                hint="Finishes in the top three"
                active={sortKey === 'topThree'}
                dir={sortKey === 'topThree' ? dir : 'desc'}
                onClick={() => onSort('topThree')}
              />
              <SortHeader
                label="Berths"
                className="hidden sm:table-cell"
                hint="Playoff berths / seasons played"
                active={sortKey === 'berths'}
                dir={sortKey === 'berths' ? dir : 'desc'}
                onClick={() => onSort('berths')}
              />
              <SortHeader
                label="Rate"
                className="hidden md:table-cell"
                hint="Playoff berths as a share of seasons"
                active={sortKey === 'rate'}
                dir={sortKey === 'rate' ? dir : 'desc'}
                onClick={() => onSort('rate')}
              />
              <SortHeader
                label="PF/gm"
                className="hidden xl:table-cell"
                hint="Career points for per game"
                active={sortKey === 'pf'}
                dir={sortKey === 'pf' ? dir : 'desc'}
                onClick={() => onSort('pf')}
              />
              <SortHeader
                label="PA/gm"
                className="hidden xl:table-cell"
                hint="Career points against per game"
                active={sortKey === 'pa'}
                dir={sortKey === 'pa' ? dir : 'desc'}
                onClick={() => onSort('pa')}
              />
              <th className="hidden xl:table-cell" scope="col">
                Form
              </th>
            </tr>
          </thead>
          <tbody ref={body}>
            {sorted.map((line, i) => {
              const manager = managers.find((candidate) => candidate.id === line.manager)
              const former = Boolean(manager && !manager.active)
              const color = managerColor(line.manager)
              return (
                <tr
                  key={line.manager}
                  data-flip={line.manager}
                  className={i === 0 ? 'lead' : undefined}
                  style={i === 0 ? leadWash(line.manager) : undefined}
                >
                  <td className={`n tnum w-8 ${rankTone(i + 1, medals)}`}>{i + 1}</td>
                  <td className="whitespace-nowrap">
                    <span
                      className={`inline-flex min-w-0 items-center gap-2 ${former ? 'max-sm:text-arc-ink-soft' : ''}`}
                      title={former ? 'Former manager' : undefined}
                    >
                      <ManagerTag id={line.manager} />
                      {former && (
                        <>
                          <span className="hidden sm:inline-flex">
                            <Chip>Former</Chip>
                          </span>
                          <span className="sr-only">former manager</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="n hidden text-arc-ink-faint sm:table-cell">{line.seasonsPlayed}</td>
                  <td className="n hidden sm:table-cell">{record(line.wins, line.losses)}</td>
                  <td className="n text-arc-green">
                    {pct(line.winPct)}
                    <div className="text-[11px] leading-tight text-arc-ink-faint sm:hidden">
                      {record(line.wins, line.losses)}
                    </div>
                  </td>
                  <td className="n">
                    {line.titles > 0 ? (
                      <span
                        className="glint titles"
                        aria-hidden
                        style={{ color, ['--glint-delay' as string]: `${(i % 7) * 1.3}s` }}
                      >
                        {'★'.repeat(Math.min(line.titles, 4))}
                        {line.titles > 4 ? ` ${line.titles}` : ''}
                      </span>
                    ) : (
                      <span className="text-arc-ink-faint" aria-hidden>
                        ·
                      </span>
                    )}
                    <span className="sr-only">
                      {line.titles} title{line.titles === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="n hidden text-arc-ink-soft md:table-cell">{line.topThree || '·'}</td>
                  <td className="n hidden text-arc-ink-soft sm:table-cell">
                    {line.playoffAppearances}/{line.seasonsPlayed}
                  </td>
                  <td className="n hidden text-arc-ink-faint md:table-cell">{pct(line.playoffRate, 0)}</td>
                  <td className="n hidden text-arc-ink-soft xl:table-cell">{num(line.avgPointsFor)}</td>
                  <td className="n hidden text-arc-ink-faint xl:table-cell">{num(line.avgPointsAgainst)}</td>
                  <td
                    className="hidden xl:table-cell"
                    title={`Win % by season inside ${era.label}, oldest to newest`}
                  >
                    <Sparkline
                      values={managerSeasons(seasons, line.manager)
                        .filter((row) => inEra(row.season.year, era))
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
      </Panel>
      <p className="sr-only" role="status">
        Ranked by {SORTS[sortKey].label}, {dir === 'asc' ? 'ascending' : 'descending'}.{' '}
        {sorted[0] ? `${managerName(managers, sorted[0].manager)} leads.` : ''}
      </p>
    </>
  )
}
