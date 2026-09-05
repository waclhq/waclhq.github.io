import { useMemo, useState } from 'react'
import ChampionsWall from '../components/ChampionsWall'
import TradeFlow from '../components/TradeFlow'
import { ScoringChart } from '../components/charts'
import { Board } from '../components/boards/Board'
import { useEraParam, useSectionParam } from '../components/boards/useBoardUrl'
import { Panel, PageHeader, SectionNav, SegmentedControl } from '../components/ui'
import { useLeagueData } from '../lib/data'
import { minSeasonsToRank } from '../lib/boards-facts'
import { useTrades } from '../lib/derive'
import { num, pct, record } from '../lib/format'
import {
  bookCareerTable,
  eraOptions,
  inEra,
  leagueScoringByYear,
  seasonExtremes,
  type CareerLine,
  type SeasonExtreme,
} from '../lib/stats'
import type { GameRecordEntry } from '../lib/types'

const SECTIONS = [
  { id: 'titles', label: 'Titles' },
  { id: 'winpct', label: 'Win %' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'points', label: 'Points' },
  { id: 'tradeflow', label: 'Trades' },
  { id: 'champions', label: 'Champs' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'games', label: 'Games' },
]

export default function Records() {
  const { seasons, gameRecords, careerAverages } = useLeagueData()
  const eras = eraOptions(seasons)
  const [eraId, setEraId] = useEraParam(
    eras.map((option) => option.id),
    'keeper',
  )
  const era = eras.find((option) => option.id === eraId) ?? eras[0]
  const rail = useSectionParam()

  // The workbook keeps two single-game record books; All-Time shows one,
  // every other era view shows the keeper-era book.
  const gameEra = eraId === 'all' ? gameRecords?.allTime : gameRecords?.keeperEra
  const gameEraLabel = eraId === 'all' ? 'All-time' : 'Keeper-era'
  const gamesFiltered = eraId === 'all' || eraId === 'keeper'
  const gameSubtitle = gamesFiltered
    ? `${gameEraLabel} record book. * marks a playoff game.`
    : 'Keeper-era record book — the era toggle does not filter single games, so games outside the window print faint. * marks a playoff game.'

  const trades = useTrades()
  const table = useMemo(
    () => bookCareerTable(seasons, era, careerAverages),
    [seasons, era, careerAverages],
  )
  const scoring = useMemo(() => leagueScoringByYear(seasons), [seasons])
  const eraSeasons = useMemo(
    () => seasons.filter((season) => inEra(season.year, era)).length,
    [seasons, era],
  )
  const minSeasons = minSeasonsToRank(eraSeasons)
  const qualifies = (line: CareerLine) => line.seasonsPlayed >= minSeasons
  const shortNote = (line: CareerLine) =>
    `(${line.seasonsPlayed} ${line.seasonsPlayed === 1 ? 'season' : 'seasons'})`
  const rankRule = `Min. ${minSeasons} seasons to rank; shorter careers sit under the line.`

  // The book's career averages: All-Time and Keeper Era print the workbook's
  // figures, and All-Time's include the re-scored 2004–06.
  const bookNote =
    eraId === 'all'
      ? 'Career average of season averages, per the league record book — 2004–06 are shown re-scored to the modern baseline, so they will not equal a plain average of those seasons.'
      : eraId === 'keeper'
        ? 'Career average of season averages, per the league record book.'
        : 'Average of season averages across the window, as scored.'

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
  const seasonNote =
    eraId === 'all'
      ? "Points per game across a full regular season, from the record book's re-scored matrix (2004–06 sit on the modern baseline)."
      : 'Points per game across a full regular season.'

  const [allChamps, setAllChamps] = useState(false)

  const seasonKey = (row: SeasonExtreme) => `${row.manager}-${row.year}`
  const gameKey = (row: GameRecordEntry) => `${row.manager}-${row.points}-${row.year}`

  return (
    <>
      <PageHeader
        path="~/records"
        eyebrow="Rolling Statistics"
        title="Records"
        lede="Career leaderboards recompute against whichever era you select, so a keeper-era record and an all-time record never get confused. Single games and the champions wall are the book as written."
        action={
          <SegmentedControl
            value={eraId}
            onChange={setEraId}
            options={eras.map((option) => ({ id: option.id, label: option.label }))}
          />
        }
      />

      <div onClickCapture={rail.onClickCapture}>
        <SectionNav sections={SECTIONS} />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Board<CareerLine>
          id="titles"
          title="Titles"
          subtitle="Championships, with podium finishes as the tiebreaker."
          delay={60}
          rows={[...table].sort((a, b) => b.titles - a.titles || b.topThree - a.topThree)}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          columns={[
            {
              key: 'titles',
              header: 'Titles',
              render: (line) => line.titles,
              highlight: true,
              value: (line) => line.titles,
            },
            { key: 'second', header: '2nd', render: (line) => line.runnerUps },
            {
              key: 'third',
              header: '3rd',
              render: (line) => line.thirds,
              className: 'hidden sm:table-cell',
            },
            { key: 'top3', header: 'Top 3', render: (line) => line.topThree },
          ]}
        />

        <Board<CareerLine>
          id="winpct"
          title="Regular season win %"
          subtitle={`Regular-season record only; the bracket has its own boards. ${rankRule}`}
          delay={100}
          rows={[...table].sort((a, b) => b.winPct - a.winPct)}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          qualifies={qualifies}
          unqualifiedNote={shortNote}
          columns={[
            { key: 'record', header: 'Record', render: (line) => record(line.wins, line.losses) },
            {
              key: 'pct',
              header: 'Win %',
              render: (line) => pct(line.winPct),
              highlight: true,
              value: (line) => line.winPct,
            },
          ]}
        />

        <Board<CareerLine>
          id="playoffs"
          title="Playoff appearances"
          subtitle={`Share of seasons that reached the bracket. ${rankRule}`}
          delay={140}
          rows={[...table].sort((a, b) => b.playoffRate - a.playoffRate)}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          qualifies={qualifies}
          unqualifiedNote={shortNote}
          columns={[
            { key: 'apps', header: 'Apps', render: (line) => line.playoffAppearances },
            {
              key: 'seasons',
              header: 'Seasons',
              render: (line) => line.seasonsPlayed,
              className: 'hidden sm:table-cell',
            },
            {
              key: 'rate',
              header: 'Rate',
              render: (line) => pct(line.playoffRate, 0),
              highlight: true,
              value: (line) => line.playoffRate,
            },
          ]}
        />

        <Board<CareerLine>
          title="Playoff wins"
          subtitle="Bracket wins, every round; the final counts once, like any other game."
          delay={180}
          rows={[...table].sort(
            (a, b) => b.playoffWins - a.playoffWins || a.playoffLosses - b.playoffLosses,
          )}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          columns={[
            {
              key: 'w',
              header: 'W',
              render: (line) => line.playoffWins,
              highlight: true,
              value: (line) => line.playoffWins,
            },
            { key: 'l', header: 'L', render: (line) => line.playoffLosses },
          ]}
        />

        <Board<CareerLine>
          id="points"
          title="Points per game"
          subtitle={`${bookNote} ${rankRule}`}
          delay={220}
          rows={[...table]
            .filter((line) => line.avgPointsFor !== null)
            .sort((a, b) => (b.avgPointsFor ?? 0) - (a.avgPointsFor ?? 0))}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          qualifies={qualifies}
          unqualifiedNote={shortNote}
          columns={[
            {
              key: 'for',
              header: 'For',
              render: (line) => num(line.avgPointsFor, 2),
              highlight: true,
              value: (line) => line.avgPointsFor ?? 0,
            },
            {
              key: 'against',
              header: 'Against',
              render: (line) => num(line.avgPointsAgainst, 2),
              className: 'hidden sm:table-cell',
            },
          ]}
        />

        <Board<CareerLine>
          title="Points against per game"
          subtitle={`Lowest is best — the half of the scoreboard nobody controls. ${bookNote} ${rankRule}`}
          delay={260}
          rows={[...table]
            .filter((line) => line.avgPointsAgainst !== null)
            .sort((a, b) => (a.avgPointsAgainst ?? 0) - (b.avgPointsAgainst ?? 0))}
          keyOf={(line) => line.manager}
          managerOf={(line) => line.manager}
          qualifies={qualifies}
          unqualifiedNote={shortNote}
          columns={[
            {
              key: 'against',
              header: 'Against',
              render: (line) => num(line.avgPointsAgainst, 2),
              highlight: true,
              value: (line) => line.avgPointsAgainst ?? 0,
              bar: 'down',
              tone: 'good',
            },
            {
              key: 'seasons',
              header: 'Seasons',
              render: (line) => line.seasonsPlayed,
              className: 'hidden sm:table-cell',
            },
          ]}
        />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel
          id="tradeflow"
          title="trade flow"
          subtitle="Auction dollars exchanged between every pair of managers since the structured ledger began."
          delay={300}
        >
          <div className="px-3 py-5">
            <TradeFlow trades={trades} />
          </div>
        </Panel>

        <Panel
          id="champions"
          title="champions"
          subtitle={`${seasons.length} seasons. Repeat winners grow with each title.`}
          delay={320}
        >
          <div className={allChamps ? undefined : 'champs-fold'}>
            <ChampionsWall />
          </div>
          {!allChamps && (
            <button
              type="button"
              className="block min-h-[42px] w-full border-t border-arc-line px-4 text-left text-[12px] tracking-[0.08em] text-arc-ink-faint uppercase transition-colors hover:text-arc-green lg:hidden"
              onClick={() => setAllChamps(true)}
              aria-expanded={false}
            >
              + All {seasons.length} seasons
            </button>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel
          id="scoring"
          title="League scoring by season"
          subtitle="Average points per team per game, plotted as scored — kickers left in 2020, and 2004–06 sit below the re-scored baseline the all-time boards use. Compare a season against this line, not against another season."
          delay={340}
        >
          <div className="chart-frame glow-blue px-4 py-5">
            <ScoringChart data={scoring} height={230} />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Board<SeasonExtreme>
          id="seasons"
          title="Highest scoring seasons"
          subtitle={seasonNote}
          delay={360}
          rows={pointsFor.best}
          keyOf={seasonKey}
          managerOf={(row) => row.manager}
          columns={[
            { key: 'year', header: 'Year', render: (row) => row.year },
            {
              key: 'ppg',
              header: 'PPG',
              render: (row) => num(row.value, 2),
              highlight: true,
              value: (row) => row.value,
            },
          ]}
        />

        <Board<SeasonExtreme>
          title="Lowest scoring seasons"
          subtitle="The other end of the book."
          delay={400}
          rows={pointsFor.worst}
          keyOf={seasonKey}
          managerOf={(row) => row.manager}
          columns={[
            { key: 'year', header: 'Year', render: (row) => row.year },
            {
              key: 'ppg',
              header: 'PPG',
              render: (row) => num(row.value, 2),
              highlight: true,
              value: (row) => row.value,
              bar: 'down',
              tone: 'bad',
            },
          ]}
        />
      </div>

      {gameEra && (
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
          <Board<GameRecordEntry>
            id="games"
            title="Highest single-game scores"
            subtitle={gameSubtitle}
            delay={440}
            rows={gameEra.highest}
            keyOf={gameKey}
            managerOf={(row) => row.manager}
            muted={gamesFiltered ? undefined : (row) => !inEra(row.year, era)}
            columns={[
              {
                key: 'points',
                header: 'Points',
                render: (row) => num(row.points, 2),
                highlight: true,
                value: (row) => row.points,
              },
              {
                key: 'year',
                header: 'Year',
                render: (row) => `${row.year}${row.playoff ? '*' : ''}`,
              },
            ]}
          />
          <Board<GameRecordEntry>
            title="Lowest single-game scores"
            subtitle={gameSubtitle}
            delay={480}
            rows={gameEra.lowest}
            keyOf={gameKey}
            managerOf={(row) => row.manager}
            muted={gamesFiltered ? undefined : (row) => !inEra(row.year, era)}
            columns={[
              {
                key: 'points',
                header: 'Points',
                render: (row) => num(row.points, 2),
                highlight: true,
                value: (row) => row.points,
                bar: 'down',
                tone: 'bad',
              },
              {
                key: 'year',
                header: 'Year',
                render: (row) => `${row.year}${row.playoff ? '*' : ''}`,
              },
            ]}
          />
        </div>
      )}
    </>
  )
}
