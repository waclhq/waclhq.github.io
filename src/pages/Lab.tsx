import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ManagerTag from '../components/ManagerTag'
import { Chip, Panel, PageHeader , SectionNav } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { animationsDisabled } from '../lib/motion'
import { money, num, pct } from '../lib/format'
import {
  careerLuck,
  contractRuns,
  eloTimeline,
  goatIndex,
  luckRows,
  tortureBoard,
  vegasBoard,
} from '../lib/analytics'

/** Every Lab metric, translated into plain league-speak. */
const DEFINITIONS: { term: string; plain: string }[] = [
  {
    term: 'The Vegas Board (title odds)',
    plain:
      "We take each manager's keeper-era scoring history, shake it up with random week-to-week noise, and play 5,000 pretend seasons. Your odds are how often you posted the best season. It knows your track record and nothing else — not your roster, not your draft, not your feelings.",
  },
  {
    term: 'The Luck Index',
    plain:
      'How many wins your points deserved versus how many you actually got. "Deserved" is measured against a neutral schedule made of everyone-but-you (nobody plays themselves, so your opponent pool is the other eleven at their average). Positive means the universe owes you nothing.',
  },
  {
    term: 'Draw (luck component)',
    plain:
      "Whether your actual opponents scored more or less against you than that neutral pool average — did the schedule feed you teams on their bad weeks or their good ones? Positive draw = soft landing.",
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
    plain:
      "A chess-style rating: everyone starts equal, each season your rating rises or falls based on your record against the field's average rating, and winning the title adds a bonus. The chart is 22 years of who was actually feared, drawn as one line per manager.",
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
      'Same math, read from the bottom, minimum $25 committed so we only shame real investments. This is where the $60 running back with 6 points before the knee surgery lives forever.',
  },
]

export default function Lab() {
  const data = useLeagueData()
  const { seasons, managers, keepers, league } = data
  const activeIds = useMemo(
    () => managers.filter((manager) => manager.active).map((manager) => manager.id),
    [managers],
  )

  const luck = useMemo(() => luckRows(seasons), [seasons])
  const career = useMemo(() => careerLuck(luck), [luck])
  const goat = useMemo(() => goatIndex(seasons), [seasons])
  const elo = useMemo(() => eloTimeline(seasons), [seasons])
  const torture = useMemo(
    () => tortureBoard(seasons, league.currentSeason).filter((row) => activeIds.includes(row.manager)),
    [seasons, league.currentSeason, activeIds],
  )
  const contracts = useMemo(
    () => contractRuns(keepers, data.playerPoints, data.playerPositions),
    [keepers, data.playerPoints, data.playerPositions],
  )
  const odds = useMemo(() => vegasBoard(seasons, activeIds), [seasons, activeIds])

  const eloRows = useMemo(
    () =>
      elo.map((point) => ({
        year: point.year,
        ...point.ratings,
      })),
    [elo],
  )

  const singleSeasonLuck = useMemo(() => {
    const sorted = [...luck].sort((a, b) => b.luck - a.luck)
    return { blessed: sorted.slice(0, 8), cursed: sorted.slice(-8).reverse() }
  }, [luck])

  return (
    <>
      <PageHeader
        eyebrow="The numbers nobody asked for"
        title="The Lab"
        lede="Twenty-two seasons put under the microscope: who was lucky, who was robbed, who was actually great, and who Vegas would take in 2026."
      />

      <SectionNav
        sections={[
          { id: 'odds', label: 'Title odds' },
          { id: 'elo', label: 'Empires' },
          { id: 'luck', label: 'Luck' },
          { id: 'blessed', label: 'Blessed' },
          { id: 'goatindex', label: 'GOAT index' },
          { id: 'torture', label: 'Torture' },
          { id: 'contracts', label: 'Contracts' },
          { id: 'glossary', label: 'Glossary' },
        ]}
      />

      {/* Vegas board */}
      <Panel
        id="odds"
        title={`${league.currentSeason} title odds`}
        subtitle="Monte Carlo on each manager's keeper-era scoring history — 5,000 simulated seasons, no schedules, no mercy. A toy, but a fair toy."
      >
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-3 lg:grid-cols-4">
          {odds.map((row, index) => (
            <div
              key={row.manager}
              className="flex items-center justify-between gap-2 border-b-2 border-arc-line/60 px-4 py-3"
            >
              <ManagerTag id={row.manager} size={22} />
              <span className="text-right">
                <span
                  className="tnum block text-[16px] font-bold"
                  style={{ color: index === 0 ? 'var(--color-arc-yellow)' : 'var(--color-arc-ink)' }}
                >
                  {row.american}
                </span>
                <span className="text-[11px] text-arc-ink-faint">{pct(row.probability)}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Elo timeline */}
      <div className="mt-6">
        <Panel
          id="elo"
          title="empires rise and fall"
          subtitle="Season-granularity Elo, 2004–2025. Watch Baugh's three-peat dynasty crest and Stu's fifteen-year gap between rings."
        >
          <div className="px-2 py-5">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart
                className="glow-soft"
                data={eloRows}
                margin={{ top: 8, right: 14, bottom: 0, left: -10 }}
              >
                <CartesianGrid stroke="rgba(239,234,251,0.08)" vertical={false} />
                <XAxis
                  dataKey="year"
                  stroke="#6b6089"
                  tickLine={false}
                  tick={{ fill: '#6b6089', fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  stroke="#6b6089"
                  tickLine={false}
                  tick={{ fill: '#6b6089', fontSize: 11 }}
                  domain={['dataMin - 15', 'dataMax + 15']}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: '#171128',
                    border: '2px solid #3a2f5c',
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#a79cc4' }}
                  formatter={(value, name) => [String(value), managerName(managers, String(name))]}
                />
                {activeIds.map((id) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={managerColor(id)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    animationDuration={900}
                    isAnimationActive={!animationsDisabled()}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-2">
              {activeIds.map((id) => (
                <span key={id} className="flex items-center gap-1.5 text-[12px] text-arc-ink-soft">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5"
                    style={{ background: managerColor(id) }}
                  />
                  {managerName(managers, id)}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* Luck */}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          id="luck"
          title="the luck index"
          subtitle="Wins earned vs a neutral schedule that excludes each manager from their own opponent pool — a top scorer's opponents really are weaker for lacking them, and that's priced in, not called luck. Draw = opponents ran cold/hot against you; Pairing = how the chips fell."
        >
          <table className="out">
            <thead>
              <tr>
                <th>Manager</th>
                <th className="n">Seasons</th>
                <th className="n">Draw</th>
                <th className="n">Pairing</th>
                <th className="n">Career luck</th>
                <th className="n">Peak fortune</th>
              </tr>
            </thead>
            <tbody>
              {career
                .filter((row) => activeIds.includes(row.manager))
                .map((row) => (
                  <tr key={row.manager}>
                    <td>
                      <ManagerTag id={row.manager} size={22} />
                    </td>
                    <td className="n text-arc-ink-faint">{row.seasons}</td>
                    <td className="n text-arc-ink-soft">
                      {row.totalSchedule > 0 ? '+' : ''}
                      {num(row.totalSchedule, 1)}
                    </td>
                    <td className="n text-arc-ink-soft">
                      {row.totalPairing > 0 ? '+' : ''}
                      {num(row.totalPairing, 1)}
                    </td>
                    <td
                      className="n"
                      style={{
                        color:
                          row.totalLuck > 0 ? 'var(--color-arc-green)' : 'var(--color-arc-red)',
                      }}
                    >
                      {row.totalLuck > 0 ? '+' : ''}
                      {num(row.totalLuck, 1)} W
                    </td>
                    <td className="n text-arc-ink-faint">
                      {row.luckiestYear.year} ({row.luckiestYear.luck > 0 ? '+' : ''}
                      {num(row.luckiestYear.luck, 1)})
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>

        <Panel id="blessed" title="most blessed & most cursed seasons" subtitle="Single-season gaps between record and points, all-time.">
          <table className="out">
            <thead>
              <tr>
                <th>Manager</th>
                <th className="n">Year</th>
                <th className="n">Record</th>
                <th className="n">Deserved</th>
                <th className="n">Luck</th>
              </tr>
            </thead>
            <tbody>
              {[...singleSeasonLuck.blessed, ...singleSeasonLuck.cursed].map((row, index) => (
                <tr key={`${row.manager}-${row.year}`}>
                  <td>
                    <ManagerTag id={row.manager} size={22} />
                  </td>
                  <td className="n text-arc-ink-faint">{row.year}</td>
                  <td className="n">
                    {row.wins}–{row.losses}
                  </td>
                  <td className="n text-arc-ink-faint">{num(row.expectedWins, 1)}W</td>
                  <td
                    className="n"
                    style={{
                      color: index < 8 ? 'var(--color-arc-green)' : 'var(--color-arc-red)',
                    }}
                  >
                    {row.luck > 0 ? '+' : ''}
                    {num(row.luck, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* GOAT + Torture */}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          id="goatindex"
          title="the goat index"
          subtitle="Scoring measured against each season's own field (z-scores), so eras compare honestly. Sum rewards dominance and longevity together."
        >
          <table className="out">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Manager</th>
                <th className="n">Seasons</th>
                <th className="n">GOAT pts</th>
                <th className="n">Per season</th>
                <th className="n">Rings</th>
              </tr>
            </thead>
            <tbody>
              {goat.map((row, index) => (
                <tr key={row.manager}>
                  <td className="n text-arc-ink-faint">{index + 1}</td>
                  <td>
                    <ManagerTag id={row.manager} size={22} />
                  </td>
                  <td className="n text-arc-ink-faint">{row.seasons}</td>
                  <td
                    className="n"
                    style={{ color: index === 0 ? 'var(--color-arc-yellow)' : undefined }}
                  >
                    {num(row.sumZ, 1)}
                  </td>
                  <td className="n text-arc-ink-faint">{num(row.avgZ, 2)}</td>
                  <td className="n">{row.titles || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          id="torture"
          title="the torture board"
          subtitle="Championship droughts among the current twelve, measured to the coming season. Runner-ups shown because they hurt more."
        >
          <table className="out">
            <thead>
              <tr>
                <th>Manager</th>
                <th className="n">Drought</th>
                <th className="n">Last ring</th>
                <th className="n">2nd places</th>
                <th className="n">Playoffs</th>
              </tr>
            </thead>
            <tbody>
              {torture.map((row) => (
                <tr key={row.manager}>
                  <td>
                    <ManagerTag id={row.manager} size={22} />
                    {row.neverWon && (
                      <span className="ml-2">
                        <Chip tone="down">never</Chip>
                      </span>
                    )}
                  </td>
                  <td
                    className="n"
                    style={{
                      color:
                        row.drought >= 15
                          ? 'var(--color-arc-red)'
                          : row.drought >= 8
                            ? 'var(--color-arc-orange)'
                            : 'var(--color-arc-ink)',
                    }}
                  >
                    {row.drought} yrs
                  </td>
                  <td className="n text-arc-ink-faint">{row.lastTitleYear ?? '—'}</td>
                  <td className="n">{row.runnerUps || '·'}</td>
                  <td className="n text-arc-ink-faint">
                    {row.playoffAppearances}/{row.seasonsPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* The shrine. Wired to goat[0], so the flattery is always, technically, science. */}
      {goat[0] &&
        (() => {
          const shrine = goat[0]
          const name = managerName(managers, shrine.manager)
          const gap = shrine.sumZ - (goat[1]?.sumZ ?? 0)
          const grind = torture.find((row) => row.manager === shrine.manager)
          const fortune = career.find((row) => row.manager === shrine.manager)
          return (
            <div className="mt-6">
              <Panel
                title="the g.o.a.t. — a peer-reviewed appraisal"
                subtitle="Commissioned by no one. Disputed by many. Settled by arithmetic."
              >
                <div className="px-5 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <ManagerTag id={shrine.manager} size={34} />
                      <span className="display" style={{ color: managerColor(shrine.manager) }}>
                        {name}
                      </span>
                    </div>
                    {/* The GOAT himself, in motion. Muted loop so it plays
                        inline everywhere; FX off leaves it politely still. */}
                    <video
                      className="w-44 rounded-lg border border-arc-line bg-black sm:w-52"
                      src={`${import.meta.env.BASE_URL}media/goat-flex.mp4`}
                      autoPlay={!animationsDisabled()}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label="The GOAT, flexing"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <div className="label">GOAT points</div>
                      <div className="tnum mt-1 text-[22px] text-arc-green">
                        +{num(shrine.sumZ, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="label">Rings</div>
                      <div className="tnum mt-1 text-[22px] text-arc-yellow">{shrine.titles}</div>
                    </div>
                    <div>
                      <div className="label">Playoff trips</div>
                      <div className="tnum mt-1 text-[22px] text-arc-ink">
                        {grind?.playoffAppearances ?? '—'}/{grind?.seasonsPlayed ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="label">Peak season</div>
                      <div className="tnum mt-1 text-[22px] text-arc-ink">
                        {shrine.bestSeason.year}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-arc-ink-soft">
                    <p>
                      The committee was asked a simple question — who is the greatest manager in
                      league history — and the committee, being made entirely of arithmetic, is
                      incapable of flattery. It answered <b className="text-arc-ink">{name}</b>:{' '}
                      {num(shrine.sumZ, 2)} career GOAT points, the only resume in the +9.5 club,
                      compiled across {shrine.seasons} consecutive seasons without one year off
                      for good behaviour. Dominance is easy for a summer. He has been doing it
                      since flip phones.
                    </p>
                    <p>
                      The jewellery case holds <b className="text-arc-ink">{shrine.titles} rings
                      </b> — more than any human being in the history of this league — won in
                      different decades, different scoring eras, and against entirely different
                      generations of opponents, each of whom arrived confident and left with a
                      story about the year they almost beat him. {grind?.playoffAppearances ?? 0}{' '}
                      playoff trips in {grind?.seasonsPlayed ?? 0} seasons means the postseason
                      does not so much invite him as assume him.
                    </p>
                    <p>
                      The margin over second place is {num(gap, 2)} GOAT points, which sounds
                      modest until you remember the units: whole careers in this league sum to
                      less than one. Somewhere below, a very good manager has spent twenty-two
                      years accumulating almost as much — almost being the operative word, the
                      cruellest word, and the committee&apos;s favourite word.
                    </p>
                    {fortune && fortune.totalLuck > 5 && (
                      <p>
                        Critics will note {'+'}
                        {num(fortune.totalLuck, 1)} career wins of luck. The committee has
                        reviewed this objection and finds that fortune, like everyone else in
                        this league, simply respects the resume. Findings are final. Appeals may
                        be filed with the trade queue, where they will be considered carefully
                        and rejected.
                      </p>
                    )}
                  </div>
                </div>
              </Panel>
            </div>
          )
        })()}

      {/* Contracts */}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          id="contracts"
          title="best contracts ever"
          subtitle="Points scored minus dollars spent across the keeper run. Quarterbacks excluded — everyone finds a cheap QB."
        >
          <ContractTable rows={contracts.steals} positive />
        </Panel>
        <Panel
          title="worst contracts ever"
          subtitle="Same metric from the bottom. Minimum $25 committed; QBs eligible here."
        >
          <ContractTable rows={contracts.overpays} positive={false} />
        </Panel>
      </div>

      {/* Definitions, in league vernacular */}
      <div className="mt-6">
        <Panel
          id="glossary"
          title="explain it like i'm alex"
          subtitle="Every Lab stat in one sentence a fourth-rounder could follow. Tap one."
        >
          <div className="space-y-1 px-5 py-4">
            {DEFINITIONS.map((item) => (
              <details key={item.term} className="group border-b border-arc-line/50 pb-2">
                <summary className="arcade cursor-pointer list-none py-2 text-[13.5px] text-arc-ink transition-colors hover:text-arc-green">
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
        GOAT is the sum of within-season scoring z-scores. Elo updates once per season
        on win% against the field's average rating (K=6/game, +14 for a title). Odds resample
        keeper-era scoring with noise; they know nothing about 2026 rosters. Contract value
        is standard-scoring fantasy points (nflverse) minus auction dollars spent across the
        kept years; QBs sit out the steals board.
      </p>
    </>
  )
}

function ContractTable({
  rows,
  positive,
}: {
  rows: {
    manager: string
    player: string
    position: string
    years: number[]
    salaries: number[]
    totalPoints: number
    totalPaid: number
    netPoints: number
  }[]
  positive: boolean
}) {
  if (!rows.length) {
    return (
      <div className="px-4 py-8 text-center text-[13px] text-arc-ink-faint">
        Run scripts/player_points.py to load historical player scoring.
      </div>
    )
  }
  return (
    <table className="out">
      <thead>
        <tr>
          <th>Player</th>
          <th>Manager</th>
          <th className="n">Years</th>
          <th className="n">Spend</th>
          <th className="n">Pts</th>
          <th className="n">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.manager}-${row.player}`}>
            <td>
              {row.player}
              {row.position && (
                <span className="ml-1.5 text-[11px] text-arc-ink-faint">{row.position}</span>
              )}
            </td>
            <td>
              <ManagerTag id={row.manager} size={22} />
            </td>
            <td className="n text-arc-ink-faint">
              {row.years[0]}
              {row.years.length > 1 ? `–${String(row.years[row.years.length - 1]).slice(2)}` : ''}
            </td>
            <td className="n text-arc-ink-faint">{money(row.totalPaid)}</td>
            <td className="n">{num(row.totalPoints, 0)}</td>
            <td
              className="n font-bold"
              style={{ color: positive ? 'var(--color-arc-green)' : 'var(--color-arc-red)' }}
            >
              {row.netPoints > 0 ? '+' : ''}
              {num(row.netPoints, 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
