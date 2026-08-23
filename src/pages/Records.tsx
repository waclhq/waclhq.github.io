import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ChampionsWall from '../components/ChampionsWall'
import TradeFlow from '../components/TradeFlow'
import { ScoringChart } from '../components/charts'
import { Panel, PageHeader, SectionNav, SegmentedControl, useFlipList, useRevealed } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { useTrades } from '../lib/derive'
import { num, pct, record } from '../lib/format'
import {
  careerTable,
  eraOptions,
  inEra,
  leagueScoringByYear,
  seasonExtremes,
  type CareerLine,
  type SeasonExtreme,
} from '../lib/stats'
import type { GameRecordEntry, Manager } from '../lib/types'

export default function Records() {
  const { seasons, managers, gameRecords, careerAverages } = useLeagueData()
  const eras = eraOptions(seasons)
  const [eraId, setEraId] = useState('keeper')
  const era = eras.find((option) => option.id === eraId) ?? eras[0]

  // For the two book eras, career scoring averages come straight from the
  // workbook (its early seasons feed the career math through adjusted
  // totals no season-level computation can reproduce).
  const bookAverages =
    eraId === 'all'
      ? careerAverages?.allTime
      : eraId === 'keeper'
        ? careerAverages?.keeperEra
        : undefined

  // The workbook keeps two single-game record books; All-Time shows one,
  // every other era view shows the keeper-era book.
  const gameEra = eraId === 'all' ? gameRecords?.allTime : gameRecords?.keeperEra
  const gameEraLabel = eraId === 'all' ? 'All-time' : 'Keeper-era'

  const trades = useTrades()
  const table = careerTable(seasons, era).map((line) => {
    const book = bookAverages?.[line.manager]
    return book
      ? { ...line, avgPointsFor: book.pointsFor, avgPointsAgainst: book.pointsAgainst }
      : line
  })
  const scoring = useMemo(() => leagueScoringByYear(seasons), [seasons])
  // Season extremes come from the book's adjusted matrix when it's present
  // (the 2004–2006 raw tab averages are pre-adjustment and would wrongly
  // dominate the bottom of the table); raw season data is the fallback.
  const pointsFor = useMemo(() => {
    if (!careerAverages?.seasons) return seasonExtremes(seasons, era, 'avgPointsFor')
    const rows: SeasonExtreme[] = []
    for (const [manager, years] of Object.entries(careerAverages.seasons)) {
      for (const [year, values] of Object.entries(years)) {
        if (values.pointsFor !== undefined && inEra(Number(year), era)) {
          rows.push({ manager, year: Number(year), value: values.pointsFor })
        }
      }
    }
    const sorted = [...rows].sort((a, b) => b.value - a.value)
    return { best: sorted.slice(0, 10), worst: [...sorted].reverse().slice(0, 10) }
  }, [careerAverages, seasons, era])

  return (
    <>
      <PageHeader
        path="~/records"
        eyebrow="Rolling Statistics"
        title="Records"
        lede="Leaderboards recompute against whichever era you select, so a keeper-era record and an all-time record never get confused."
        action={
          <SegmentedControl
            value={eraId}
            onChange={setEraId}
            options={eras.map((option) => ({ id: option.id, label: option.label }))}
          />
        }
      />

      <SectionNav
        sections={[
          { id: 'scoring', label: 'Scoring' },
          { id: 'titles', label: 'Titles' },
          { id: 'winpct', label: 'Win %' },
          { id: 'playoffs', label: 'Playoffs' },
          { id: 'points', label: 'Points' },
          { id: 'tradeflow', label: 'Trades' },
          { id: 'champions', label: 'Champs' },
          { id: 'seasons', label: 'Seasons' },
          { id: 'games', label: 'Games' },
        ]}
      />

      <Panel
        id="scoring"
        title="League scoring by season"
        subtitle="Average points per team per game. Kickers were removed in 2020, which moves the whole baseline — compare seasons against this line, not against each other."
        delay={60}
      >
        <div className="glow-blue px-4 py-5">
          <ScoringChart data={scoring} height={230} />
        </div>
      </Panel>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Board
          id="titles"
          title="Titles"
          delay={100}
          rows={[...table].sort((a, b) => b.titles - a.titles || b.topThree - a.topThree)}
          managers={managers}
          columns={[
            {
              header: 'Titles',
              render: (line) => line.titles,
              highlight: true,
              value: (line) => line.titles,
            },
            { header: '2nd', render: (line) => line.runnerUps },
            { header: '3rd', render: (line) => line.thirds },
            { header: 'Top 3', render: (line) => line.topThree },
          ]}
        />

        <Board
          id="winpct"
          title="Regular season win %"
          delay={140}
          rows={[...table].sort((a, b) => b.winPct - a.winPct)}
          managers={managers}
          columns={[
            { header: 'Record', render: (line) => record(line.wins, line.losses) },
            { header: 'Win %', render: (line) => pct(line.winPct), highlight: true, value: (line) => line.winPct },
          ]}
        />

        <Board
          id="playoffs"
          title="Playoff appearances"
          delay={180}
          rows={[...table].sort((a, b) => b.playoffRate - a.playoffRate)}
          managers={managers}
          columns={[
            { header: 'Apps', render: (line) => line.playoffAppearances },
            { header: 'Seasons', render: (line) => line.seasonsPlayed },
            { header: 'Rate', render: (line) => pct(line.playoffRate, 0), highlight: true, value: (line) => line.playoffRate },
          ]}
        />

        <Board
          title="Playoff wins"
          delay={220}
          rows={[...table].sort((a, b) => b.playoffWins - a.playoffWins)}
          managers={managers}
          columns={[
            { header: 'W', render: (line) => line.playoffWins, highlight: true, value: (line) => line.playoffWins },
            { header: 'L', render: (line) => line.playoffLosses },
          ]}
        />

        <Board
          id="points"
          title="Points per game"
          delay={260}
          rows={[...table]
            .filter((line) => line.avgPointsFor !== null)
            .sort((a, b) => (b.avgPointsFor ?? 0) - (a.avgPointsFor ?? 0))
            }
          managers={managers}
          columns={[
            { header: 'For', render: (line) => num(line.avgPointsFor, 2), highlight: true, value: (line) => line.avgPointsFor ?? 0 },
            { header: 'Against', render: (line) => num(line.avgPointsAgainst, 2) },
          ]}
        />

        <Board
          title="Points against per game"
          delay={300}
          rows={[...table]
            .filter((line) => line.avgPointsAgainst !== null)
            .sort((a, b) => (a.avgPointsAgainst ?? 0) - (b.avgPointsAgainst ?? 0))
            }
          managers={managers}
          columns={[
            { header: 'Against', render: (line) => num(line.avgPointsAgainst, 2), highlight: true },
            { header: 'Seasons', render: (line) => line.seasonsPlayed },
          ]}
        />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel
          id="tradeflow"
          title="trade flow"
          subtitle="Auction dollars exchanged between every pair of managers since the structured ledger began."
          delay={320}
        >
          <div className="px-3 py-5">
            <TradeFlow trades={trades} />
          </div>
        </Panel>

        <Panel
          id="champions"
          title="champions"
          subtitle="Twenty-two seasons. Repeat winners grow with each title."
          delay={340}
        >
          <div className="max-h-[560px] overflow-y-auto">
            <ChampionsWall />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          id="seasons"
          title="Highest scoring seasons"
          subtitle="Points per game across a full regular season."
          delay={340}
        >
          <table className="out">
            <tbody>
              {pointsFor.best.map((row, index) => (
                <tr key={`${row.manager}-${row.year}`} className={index === 0 ? 'lead' : undefined}>
                  <RankCell index={index} />
                  <td>
                    <Link
                      to={`/managers/${row.manager}`}
                      className="transition-colors hover:text-arc-green"
                    >
                      {managerName(managers, row.manager)}
                    </Link>
                  </td>
                  <td className="n text-arc-ink-faint">{row.year}</td>
                  <td className="n text-arc-green">{num(row.value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Lowest scoring seasons" subtitle="The other end of the book." delay={380}>
          <table className="out">
            <tbody>
              {pointsFor.worst.map((row, index) => (
                <tr key={`${row.manager}-${row.year}`} className={index === 0 ? 'lead' : undefined}>
                  <RankCell index={index} />
                  <td>
                    <Link
                      to={`/managers/${row.manager}`}
                      className="transition-colors hover:text-arc-green"
                    >
                      {managerName(managers, row.manager)}
                    </Link>
                  </td>
                  <td className="n text-arc-ink-faint">{row.year}</td>
                  <td className="n text-[var(--color-arc-red)]">{num(row.value, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {gameEra && (
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
          <GameBoard
            id="games"
            title="Highest single-game scores"
            subtitle={`${gameEraLabel} record book. * marks a playoff game.`}
            delay={400}
            rows={gameEra.highest}
            managers={managers}
            tone="up"
          />
          <GameBoard
            title="Lowest single-game scores"
            subtitle={`${gameEraLabel} record book. * marks a playoff game.`}
            delay={440}
            rows={gameEra.lowest}
            managers={managers}
            tone="down"
          />
        </div>
      )}
    </>
  )
}

/** Medal colours for the top three ranks; the field stays quiet. */
function RankCell({ index }: { index: number }) {
  const podium = ['pod-1', 'pod-2', 'pod-3'][index]
  return <td className={`n tnum w-8 ${podium ?? 'text-arc-ink-faint'}`}>{index + 1}</td>
}

/**
 * Ten seconds of scanning should say who is king: top five rows by default
 * with the full field behind one tap, medals on the podium, and the panel's
 * headline number drawn as a bar behind the cell so magnitude is seen, not
 * computed.
 */
function useTopFive<T>(rows: T[]): { shown: T[]; toggle: React.ReactNode } {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, 5)
  const toggle =
    rows.length > 5 ? (
      <button
        type="button"
        className="block w-full border-t border-arc-line px-4 py-2.5 text-left text-[12px] tracking-[0.08em] text-arc-ink-faint uppercase transition-colors hover:text-arc-green"
        onClick={() => setAll((current) => !current)}
      >
        {all ? '× Top 5 only' : `+ Full table (${rows.length})`}
      </button>
    ) : null
  return { shown, toggle }
}

/**
 * Bar drawn behind a cell's number: right-aligned figures, bar from the
 * right. Width rides background-size, which is animatable — pass ratio 0
 * until the panel is seen and the bar grows in.
 */
function cellBar(ratio: number, color = 'rgba(83, 211, 55, 0.16)'): React.CSSProperties {
  const width = Math.max(0, Math.min(1, ratio)) * 100
  return {
    backgroundImage: `linear-gradient(${color}, ${color})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right center',
    backgroundSize: `${width}% 100%`,
  }
}

/** The leader's row is lit by their own colour, not a generic highlight. */
function leadWash(manager: string): React.CSSProperties {
  const color = managerColor(manager)
  return {
    backgroundImage: `linear-gradient(90deg, ${color}17, transparent 60%)`,
    boxShadow: `inset 2px 0 0 ${color}`,
  }
}

function GameBoard({
  id,
  title,
  subtitle,
  rows,
  managers,
  delay,
  tone,
}: {
  id?: string
  title: string
  subtitle: string
  rows: GameRecordEntry[]
  managers: Manager[]
  delay: number
  tone: 'up' | 'down'
}) {
  const { shown, toggle } = useTopFive(rows)
  const most = Math.max(...rows.map((row) => row.points))
  const body = useRef<HTMLTableSectionElement>(null)
  const revealed = useRevealed(body)
  useFlipList(body)
  return (
    <Panel id={id} title={title} subtitle={subtitle} delay={delay}>
      <table className="out">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Manager</th>
            <th className="n">Points</th>
            <th className="n">Year</th>
          </tr>
        </thead>
        <tbody ref={body}>
          {shown.map((row, index) => (
            <tr
              key={`${row.manager}-${row.points}`}
              data-flip={`${row.manager}-${row.points}`}
              className={index === 0 ? 'lead' : undefined}
              style={index === 0 ? leadWash(row.manager) : undefined}
            >
              <RankCell index={index} />
              <td>
                <Link
                  to={`/managers/${row.manager}`}
                  className="transition-colors hover:text-arc-green"
                >
                  {managerName(managers, row.manager)}
                </Link>
              </td>
              <td
                className={`n barcell ${tone === 'up' ? 'text-arc-green' : 'text-[var(--color-arc-red)]'}`}
                style={cellBar(
                  revealed ? (tone === 'up' ? row.points / most : 1 - row.points / most) : 0,
                  tone === 'up' ? undefined : 'rgba(255, 82, 82, 0.14)',
                )}
              >
                {num(row.points, 2)}
              </td>
              <td className="n text-arc-ink-faint">
                {row.year}
                {row.playoff ? '*' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle}
    </Panel>
  )
}

function Board({
  id,
  title,
  rows,
  columns,
  managers,
  delay,
}: {
  id?: string
  title: string
  rows: CareerLine[]
  columns: {
    header: string
    render: (line: CareerLine) => React.ReactNode
    highlight?: boolean
    /** Numeric accessor for the bar behind the highlight column. */
    value?: (line: CareerLine) => number
  }[]
  managers: Manager[]
  delay: number
}) {
  const { shown, toggle } = useTopFive(rows)
  const barColumn = columns.find((column) => column.highlight && column.value)
  const most = barColumn ? Math.max(...rows.map((line) => barColumn.value!(line)), 0) : 0
  const body = useRef<HTMLTableSectionElement>(null)
  const revealed = useRevealed(body)
  useFlipList(body)
  return (
    <Panel id={id} title={title} delay={delay}>
      <table className="out">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Manager</th>
            {columns.map((column) => (
              <th key={column.header} className="n">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {shown.map((line, index) => (
            <tr
              key={line.manager}
              data-flip={line.manager}
              className={index === 0 ? 'lead' : undefined}
              style={index === 0 ? leadWash(line.manager) : undefined}
            >
              <RankCell index={index} />
              <td>
                <Link
                  to={`/managers/${line.manager}`}
                  className="transition-colors hover:text-arc-green"
                >
                  {managerName(managers, line.manager)}
                </Link>
              </td>
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={`n ${column.highlight ? 'text-arc-green' : 'text-arc-ink-soft'} ${
                    column === barColumn ? 'barcell' : ''
                  }`}
                  style={
                    column === barColumn && most > 0
                      ? cellBar(revealed ? column.value!(line) / most : 0)
                      : undefined
                  }
                >
                  {column.render(line)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {toggle}
    </Panel>
  )
}
