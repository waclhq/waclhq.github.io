import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import ManagerTag from '../components/ManagerTag'
import { Board } from '../components/boards/Board'
import EloChart from '../components/boards/EloChart'
import OddsBoard from '../components/boards/OddsBoard'
import RoastBooth from '../components/boards/RoastBooth'
import Shrine from '../components/boards/Shrine'
import { useSectionParam } from '../components/boards/useBoardUrl'
import { Chip, Panel, PageHeader, SectionNav } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { money, num } from '../lib/format'
import { useMe } from '../lib/me'
import { playerSlug } from '../lib/search'
import {
  careerLuck,
  contractRuns,
  eloTimeline,
  goatIndex,
  luckRows,
  tortureBoard,
  type CareerLuck,
  type ContractRun,
  type GoatRow,
  type LuckRow,
  type TortureRow,
} from '../lib/analytics'
import {
  latestSeason,
  longestTitleGap,
  longestTitleRun,
  reigningChampion,
  spell,
} from '../lib/boards-facts'

/** Every Lab metric, translated into plain league-speak. */
function definitions(seasonCount: number): { term: string; plain: string }[] {
  return [
    {
      term: 'The Vegas Board (title odds)',
      plain:
        "We take each manager's keeper-era scoring history, shake it up with random week-to-week noise, and play 5,000 pretend seasons. Your odds are how often you posted the best season. It knows your track record and nothing else — not your roster, not your draft, not your feelings. The dice are seeded by the season, so everyone sees the same posted line.",
    },
    {
      term: 'The Luck Index',
      plain:
        'How many wins your points deserved versus how many you actually got. "Deserved" is measured against a neutral schedule made of everyone-but-you (nobody plays themselves, so your opponent pool is the other eleven at their average). Positive means the universe owes you nothing.',
    },
    {
      term: 'Draw (luck component)',
      plain:
        'Whether your actual opponents scored more or less against you than that neutral pool average — did the schedule feed you teams on their bad weeks or their good ones? Positive draw = soft landing.',
    },
    {
      term: 'Pairing (luck component)',
      plain:
        'Given the points that really landed on both sides all season, did the wins and losses fall your way? This is the coin-flip part — winning the close ones, losing the blowouts by a hair.',
    },
    {
      term: 'The GOAT Index',
      plain:
        "For every season, we measure how far above or below that year's average scoring you were, in that year's terms — so 2007 monsters and 2024 monsters compare fairly. Career GOAT points are all those seasons added up. Dominance and longevity both count; one hot year doesn't.",
    },
    {
      term: 'Empires rise & fall (Elo)',
      plain: `A chess-style rating: everyone starts equal, each season your rating rises or falls based on your record against the field's average rating, and winning the title adds a bonus. The chart is ${seasonCount} years of who was actually feared, drawn as one line per manager — tap a name to follow one line.`,
    },
    {
      term: 'The Torture Board',
      plain:
        'A ranking of suffering: seasons played without a ring, years since the last one, runner-up finishes (so close), and playoff trips that went nowhere. The top of this board has earned your respect and possibly a hug.',
    },
    {
      term: 'Best contracts ever',
      plain:
        "Fantasy points a kept player actually scored during the keeper run, minus the auction dollars paid for him. Big positive number = highway robbery. Quarterbacks are banned from this board because cheap productive QBs grow on trees and everyone's picked one.",
    },
    {
      term: 'Worst contracts ever',
      plain:
        'Same math, read from the bottom, minimum $25 committed so we only shame real investments. Red means the deal lost points against its price outright; the rest merely disappointed.',
    },
    {
      term: 'The Roast Booth',
      plain:
        'Sentences assembled from the numbers above — best and worst season, luckiest year, playoff record, title drought, Elo peak. "Again" walks through the pool, so the same three facts never come back in a row.',
    },
  ]
}

const SECTIONS = [
  { id: 'odds', label: 'Title odds' },
  { id: 'elo', label: 'Empires' },
  { id: 'roast', label: 'Roast' },
  { id: 'luck', label: 'Luck' },
  { id: 'blessed', label: 'Blessed' },
  { id: 'goatindex', label: 'GOAT index' },
  { id: 'torture', label: 'Torture' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'glossary', label: 'Glossary' },
]

const signed = (value: number, digits = 1) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value), digits)}`

export default function Lab() {
  const data = useLeagueData()
  const { seasons, managers, keepers, league } = data
  const me = useMe()
  const rail = useSectionParam()
  const activeIds = useMemo(
    () => managers.filter((manager) => manager.active).map((manager) => manager.id),
    [managers],
  )

  const luck = useMemo(() => luckRows(seasons), [seasons])
  const career = useMemo(() => careerLuck(luck), [luck])
  const activeLuck = useMemo(
    () => career.filter((row) => activeIds.includes(row.manager)),
    [career, activeIds],
  )
  const goat = useMemo(() => goatIndex(seasons), [seasons])
  const elo = useMemo(() => eloTimeline(seasons), [seasons])
  const torture = useMemo(
    () =>
      tortureBoard(seasons, league.currentSeason).filter((row) => activeIds.includes(row.manager)),
    [seasons, league.currentSeason, activeIds],
  )
  const contracts = useMemo(
    () => contractRuns(keepers, data.playerPoints, data.playerPositions),
    [keepers, data.playerPoints, data.playerPositions],
  )

  const eloRows = useMemo(
    () => elo.map((point) => ({ year: point.year, ...point.ratings })),
    [elo],
  )
  const reigning = useMemo(() => reigningChampion(seasons), [seasons])
  const eloFocus = useMemo(() => {
    const out: string[] = []
    if (me && activeIds.includes(me)) out.push(me)
    if (reigning && activeIds.includes(reigning) && !out.includes(reigning)) out.push(reigning)
    return out
  }, [me, reigning, activeIds])

  const singleSeasonLuck = useMemo(() => {
    const sorted = [...luck].sort((a, b) => b.luck - a.luck)
    return [...sorted.slice(0, 8), ...sorted.slice(-8).reverse()]
  }, [luck])

  const first = seasons.length ? Math.min(...seasons.map((season) => season.year)) : 0
  const latest = latestSeason(seasons)?.year ?? 0
  const run = useMemo(() => longestTitleRun(seasons), [seasons])
  const gap = useMemo(() => longestTitleGap(seasons), [seasons])
  const eloSubtitle = `Season-granularity Elo, ${first}–${latest}.${
    run ? ` Watch ${managerName(managers, run.manager)}'s ${spell(run.length)}-peat crest (${run.from}–${run.to})` : ''
  }${
    gap
      ? `${run ? ' and' : ' Watch'} ${managerName(managers, gap.manager)}'s ${spell(gap.years)}-year gap between rings (${gap.from}–${gap.to}).`
      : run
        ? '.'
        : ''
  } Tap a name to follow one line.`

  const glossary = useMemo(() => definitions(seasons.length), [seasons.length])

  return (
    <>
      <PageHeader
        eyebrow="The numbers nobody asked for"
        title="The Lab"
        lede={`${spell(seasons.length)[0].toUpperCase()}${spell(seasons.length).slice(1)} seasons put under the microscope: who was lucky, who was robbed, who was actually great, and who Vegas would take in ${league.currentSeason}.`}
      />

      {/* display:contents — the wrapper only catches chip clicks; giving it
          a box of its own would trap the sticky rail inside 53 pixels. */}
      <div className="contents" onClickCapture={rail.onClickCapture}>
        <SectionNav sections={SECTIONS} />
      </div>

      <OddsBoard id="odds" seasons={seasons} entrants={activeIds} season={league.currentSeason} />

      <div className="mt-6">
        <Panel id="elo" title="empires rise and fall" subtitle={eloSubtitle}>
          <EloChart rows={eloRows} ids={activeIds} defaultFocus={eloFocus} />
        </Panel>
      </div>

      <div className="mt-6">
        <RoastBooth id="roast" subjects={activeIds} reigning={reigning} />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <Board<CareerLuck>
          id="luck"
          title="the luck index"
          subtitle="Wins earned vs a neutral schedule that excludes each manager from their own opponent pool — a top scorer's opponents really are weaker for lacking them, and that's priced in, not called luck. Draw = opponents ran cold/hot against you; Pairing = how the chips fell."
          rows={activeLuck}
          keyOf={(row) => row.manager}
          managerOf={(row) => row.manager}
          fold={0}
          columns={[
            {
              key: 'luck',
              header: 'Career luck',
              render: (row) => `${signed(row.totalLuck)} W`,
              highlight: true,
              value: (row) => row.totalLuck,
              bar: 'signed',
              tone: 'signed',
            },
            { key: 'seasons', header: 'Seasons', render: (row) => row.seasons },
            {
              key: 'draw',
              header: 'Draw',
              render: (row) => signed(row.totalSchedule),
              className: 'hidden sm:table-cell',
            },
            {
              key: 'pairing',
              header: 'Pairing',
              render: (row) => signed(row.totalPairing),
              className: 'hidden sm:table-cell',
            },
            {
              key: 'peak',
              header: 'Peak fortune',
              render: (row) => `${row.luckiestYear.year} (${signed(row.luckiestYear.luck)})`,
              className: 'hidden lg:table-cell',
            },
          ]}
        />

        <Board<LuckRow>
          id="blessed"
          title="most blessed & most cursed seasons"
          subtitle="Single-season gaps between record and points, all-time: eight each way."
          rows={singleSeasonLuck}
          keyOf={(row) => `${row.manager}-${row.year}`}
          managerOf={(row) => row.manager}
          groupOf={(row) => (row.luck > 0 ? 'Blessed' : 'Cursed')}
          fold={0}
          columns={[
            { key: 'year', header: 'Year', render: (row) => row.year },
            { key: 'record', header: 'Record', render: (row) => `${row.wins}–${row.losses}` },
            {
              key: 'deserved',
              header: 'Deserved',
              render: (row) => `${num(row.expectedWins, 1)}W`,
              className: 'hidden sm:table-cell',
            },
            {
              key: 'luck',
              header: 'Luck',
              render: (row) => signed(row.luck),
              highlight: true,
              value: (row) => row.luck,
              bar: 'signed',
              tone: 'signed',
            },
          ]}
        />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <Board<GoatRow>
          id="goatindex"
          title="the goat index"
          subtitle="Scoring measured against each season's own field (z-scores), so eras compare honestly. Sum rewards dominance and longevity together; departed managers stay on the board."
          rows={goat}
          keyOf={(row) => row.manager}
          managerOf={(row) => row.manager}
          columns={[
            {
              key: 'pts',
              header: 'GOAT pts',
              render: (row) => signed(row.sumZ),
              highlight: true,
              value: (row) => row.sumZ,
              bar: 'signed',
              tone: 'signed',
            },
            { key: 'rings', header: 'Rings', render: (row) => row.titles || '·' },
            {
              key: 'seasons',
              header: 'Seasons',
              render: (row) => row.seasons,
              className: 'hidden sm:table-cell',
            },
            {
              key: 'per',
              header: 'Per season',
              render: (row) => num(row.avgZ, 2),
              className: 'hidden sm:table-cell',
            },
          ]}
        />

        <Board<TortureRow>
          id="torture"
          title="the torture board"
          subtitle="Championship droughts among the current twelve, measured to the coming season. Runner-ups shown because they hurt more."
          rows={torture}
          keyOf={(row) => row.manager}
          managerOf={(row) => row.manager}
          primary={(row) => (
            <>
              <ManagerTag id={row.manager} size={22} />
              {row.neverWon && (
                <span className="ml-1">
                  <Chip tone="down">never</Chip>
                </span>
              )}
            </>
          )}
          columns={[
            {
              key: 'drought',
              header: 'Drought',
              render: (row) => `${row.drought} ${row.drought === 1 ? 'yr' : 'yrs'}`,
              highlight: true,
              value: (row) => row.drought,
              tone: 'bad',
            },
            { key: 'last', header: 'Last ring', render: (row) => row.lastTitleYear ?? '—' },
            {
              key: 'second',
              header: '2nd places',
              render: (row) => row.runnerUps || '·',
              className: 'hidden sm:table-cell',
            },
            {
              key: 'playoffs',
              header: 'Playoffs',
              render: (row) => `${row.playoffAppearances}/${row.seasonsPlayed}`,
              className: 'hidden sm:table-cell',
            },
          ]}
        />
      </div>

      <div className="mt-6">
        <Shrine goat={goat} seasons={seasons} torture={torture} luck={career} />
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <ContractBoard
          id="contracts"
          title="best contracts ever"
          subtitle="Points scored minus dollars spent across the keeper run. Quarterbacks excluded — everyone finds a cheap QB."
          rows={contracts.steals}
        />
        <ContractBoard
          title="worst contracts ever"
          subtitle="Same metric from the bottom. Minimum $25 committed; QBs eligible here. Red means the deal lost money outright."
          rows={contracts.overpays}
          worst
        />
      </div>

      <div className="mt-6">
        <Panel
          id="glossary"
          title="explain it like i'm alex"
          subtitle="Every Lab stat in one sentence a fourth-rounder could follow. Tap one."
        >
          <div className="space-y-1 px-5 py-4">
            {glossary.map((item) => (
              <details key={item.term} className="group border-b border-arc-line/50 pb-2">
                <summary className="arcade min-h-[40px] cursor-pointer list-none py-2 text-[13.5px] text-arc-ink transition-colors hover:text-arc-green">
                  <span className="mr-2 inline-block text-arc-ink-faint transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  {item.term}
                </summary>
                <p className="pb-2 pl-6 text-[13.5px] leading-relaxed text-arc-ink-soft">
                  {item.plain}
                </p>
              </details>
            ))}
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-arc-ink-faint">
        Methods: luck is wins minus Pythagorean expected wins (exponent 2.37) against a neutral
        schedule — each manager's points versus the per-game average of the other teams that
        season, self excluded, since nobody plays themselves. The Draw component is realized
        opponents vs that neutral pool; Pairing is wins vs expectation at the realized points.
        GOAT is the sum of within-season scoring z-scores. Elo updates once per season on win%
        against the field's average rating (K=6/game, +14 for a title). Odds resample keeper-era
        scoring with noise from a generator seeded by the season; they know nothing about{' '}
        {league.currentSeason} rosters. Contract value is standard-scoring fantasy points
        (nflverse) minus auction dollars spent across the kept years; QBs sit out the steals
        board.
      </p>
    </>
  )
}

function ContractBoard({
  id,
  title,
  subtitle,
  rows,
  worst = false,
}: {
  id?: string
  title: string
  subtitle: string
  rows: ContractRun[]
  worst?: boolean
}) {
  return (
    <Board<ContractRun>
      id={id}
      title={title}
      subtitle={subtitle}
      rows={rows}
      keyOf={(row) => `${row.manager}-${row.player}`}
      primaryHeader="Player"
      hrefOf={(row) => `/players/${playerSlug(row.player)}`}
      empty="Run scripts/player_points.py to load historical player scoring."
      primary={(row) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="sm:hidden">
            <ManagerTag id={row.manager} size={18} showName={false} link={false} />
          </span>
          <Link
            to={`/players/${playerSlug(row.player)}`}
            className="truncate text-arc-ink transition-colors hover:text-arc-green"
          >
            {row.player}
          </Link>
          {row.position && (
            <span className="shrink-0 text-[11px] text-arc-ink-faint">{row.position}</span>
          )}
        </span>
      )}
      columns={[
        {
          key: 'net',
          header: 'Net',
          render: (row) => signed(row.netPoints, 0),
          highlight: true,
          value: (row) => row.netPoints,
          bar: worst ? 'down' : 'up',
          tone: 'signed',
        },
        { key: 'spend', header: 'Spend', render: (row) => money(row.totalPaid) },
        {
          key: 'manager',
          header: 'Manager',
          render: (row) => <ManagerTag id={row.manager} size={22} />,
          className: 'hidden sm:table-cell',
          align: 'left',
        },
        {
          key: 'years',
          header: 'Years',
          render: (row) =>
            `${row.years[0]}${
              row.years.length > 1 ? `–${String(row.years[row.years.length - 1]).slice(2)}` : ''
            }`,
          className: 'hidden sm:table-cell',
        },
        {
          key: 'pts',
          header: 'Pts',
          render: (row) => num(row.totalPoints, 0),
          className: 'hidden sm:table-cell',
        },
      ]}
    />
  )
}
