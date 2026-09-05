import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ManagerTag from '../components/ManagerTag'
import Ticker from '../components/Ticker'
import Crest from '../components/Crest'
import { Confetti, FieldGoalStrip, FieldStripes } from '../components/effects'
import { managerColor } from '../lib/identity'
import { animationsDisabled } from '../lib/motion'
import { Bar, Chip, Panel, useRevealed } from '../components/ui'
import KickoffClock from '../components/desk/KickoffClock'
import { DeskHero } from '../components/desk/Odometer'
import { ScoreTile } from '../components/desk/ScoreTile'
import Tape from '../components/desk/Tape'
import WhenVisible from '../components/desk/WhenVisible'
import YourDesk from '../components/desk/YourDesk'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { useBudgets, useCash, useObligationHorizon, usePendingTrades, useTrades } from '../lib/derive'
import { countdown, money, num, record, shortDate } from '../lib/format'
import { antiDumpingCheck } from '../lib/rules'
import { duesRows } from '../lib/dues'
import DuesBoard from '../components/DuesBoard'

/**
 * Championship tapes on file, by the season they celebrate. The champion's
 * name comes from seasons.json; the tape is a media asset that has to be cut
 * and dropped into public/media first, so a season without one simply has no
 * film room and the hero takes the row.
 */
const TAPES: Record<number, { src: string; poster: string }> = {
  2025: { src: 'media/stu-2025.mp4', poster: 'media/desk/stu-2025-poster.jpg' },
}

/** How long the champion's confetti falls after the tile is first seen. */
const CONFETTI_MS = 4200

/** Confetti that rains once when the tile comes into view, then stops. */
function ChampionRain() {
  const frame = useRef<HTMLSpanElement>(null)
  const revealed = useRevealed(frame)
  const [raining, setRaining] = useState(false)
  useEffect(() => {
    if (!revealed || animationsDisabled()) return
    setRaining(true)
    const timer = setTimeout(() => setRaining(false), CONFETTI_MS)
    return () => clearTimeout(timer)
  }, [revealed])
  return (
    <span ref={frame} className="pointer-events-none absolute inset-0" aria-hidden>
      {raining && <Confetti count={10} />}
    </span>
  )
}

export default function Dashboard() {
  const data = useLeagueData()
  const { commissioner } = useLeague()
  const { league, managers, seasons } = data
  const season = league.currentSeason
  const budgets = useBudgets(season)
  const pending = usePendingTrades()
  const cash = useCash(season)
  const horizon = useObligationHorizon(season)
  const allTrades = useTrades()
  const location = useLocation()
  const missing = (location.state as { missing?: string } | null)?.missing

  const lastSeason = seasons[0]
  const champion = lastSeason?.champion
  const tape = lastSeason ? TAPES[lastSeason.year] : undefined
  const unpaidDues = duesRows(data.cash.entries, league, season).filter((row) => !row.settled).length
  const underwater = budgets.filter((budget) => budget.overCommitted)
  const cashOutstanding = cash.reduce((total, row) => total + Math.abs(row.outstanding), 0)
  const committed = horizon.reduce((total, row) => total + row.gross, 0)
  const maxBudget = Math.max(...budgets.map((budget) => budget.available), 1)
  const queueFirst = pending.length > 0

  return (
    <>
      {missing && (
        <div
          role="status"
          className="win mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]"
        >
          <span className="label text-arc-yellow">No page at</span>
          <code className="text-arc-ink">{missing}</code>
          <span className="text-arc-ink-soft">
            — press Find (<kbd>⌘K</kbd>) to search.
          </span>
        </div>
      )}

      {/* The crest, for phones only — desktop carries it in the sidebar. */}
      <div className="mb-4 flex justify-center lg:hidden">
        <Crest size={104} />
      </div>

      <header className="pop-in mb-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <KickoffClock season={season} />
            <h1
              className="display cursor neon-soft mt-4 text-arc-ink"
              style={{ viewTransitionName: 'page-title' }}
            >
              The Ledger
            </h1>
            <div aria-hidden className="dotbar mt-3 w-full max-w-md text-arc-purple" />
            <p className="mt-3 text-[14px] leading-relaxed text-arc-ink-soft">
              Every dollar, contract and ruling from {seasons.length} seasons of {league.name},
              in one book.
            </p>
          </div>
        </div>
      </header>

      <div className="-mx-4 mb-8 sm:-mx-6 lg:-mx-9">
        <Ticker trades={allTrades} />
      </div>

      <div className="mb-10 grid min-w-0 items-end gap-8 lg:grid-cols-[1.05fr_1fr]">
        <div className={`desk-hero ${tape ? '' : 'lg:col-span-2'}`}>
          <div className="relative isolate">
            <FieldStripes />
            <DeskHero
              label={`Committed through ${horizon.at(-1)?.year ?? season}`}
              value={money(committed)}
              caption="Auction dollars already promised across future drafts by trades that are on the books. Every dollar here is one a manager cannot spend on draft day."
            />
          </div>
          {/* The canvas under the kick only draws while this slot is on screen. */}
          <WhenVisible className="desk-field h-[132px]">
            <FieldGoalStrip championColor={managerColor(champion)} />
          </WhenVisible>
        </div>

        {tape && lastSeason && (
          <Tape
            src={`${import.meta.env.BASE_URL}${tape.src}`}
            poster={`${import.meta.env.BASE_URL}${tape.poster}`}
            heading="Championship tape"
            credit={`${managerName(managers, champion)} · ${lastSeason.year}`}
            description={`${managerName(managers, champion)} with the ${lastSeason.year} trophy`}
          />
        )}

        {/* The scoreboard: first thing on a phone, a full-width band under
            the hero and the tape on desktop. */}
        <div className="order-first grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:order-none lg:col-span-2">
          <ScoreTile
            label="Awaiting ruling"
            countTo={pending.length}
            value={pending.length}
            hint={
              pending.length
                ? commissioner
                  ? 'Needs your ruling'
                  : 'Awaiting the commissioner'
                : 'Queue clear'
            }
            tone={pending.length ? 'gold' : 'default'}
            to="/trades"
          />
          <ScoreTile
            label="Defending champ"
            value={managerName(managers, champion)}
            hint={lastSeason ? `${lastSeason.year} title` : undefined}
            lamp={managerColor(champion)}
            to={champion ? `/managers/${champion}` : undefined}
            delay={60}
            className="overflow-hidden"
          >
            <ChampionRain />
          </ScoreTile>
          <ScoreTile
            label="Cash open"
            countTo={cashOutstanding}
            format={(value) => money(value)}
            value={money(cashOutstanding)}
            hint={
              unpaidDues > 0
                ? `${unpaidDues} still owe dues`
                : cashOutstanding
                  ? 'Dues, payouts, bets'
                  : 'All square'
            }
            tone={cashOutstanding ? 'down' : 'default'}
            to="/finances"
            delay={120}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Your desk, once a seat is picked. */}
        <div className="order-first lg:order-none lg:col-span-2">
          <YourDesk season={season} />
        </div>
      </div>

      {/* Who has paid, and who is about to hear about it. */}
      <div className="mb-6">
        <DuesBoard season={season} />
      </div>

      {data.live && data.live.teams.length > 0 && (
        <div className="mb-6">
          <Panel
            title={`Live · ${data.live.season} week ${data.live.week ?? '—'}`}
            subtitle={`Pulled from Yahoo ${shortDate(data.live.updatedAt)}.`}
            delay={90}
          >
            <div>
              <table className="out">
                <thead>
                  <tr>
                    <th className="n">#</th>
                    <th>Team</th>
                    <th>Manager</th>
                    <th className="n">Record</th>
                    <th className="n">PF</th>
                    <th className="n">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.live.teams.map((team) => (
                    <tr key={team.teamKey ?? team.teamName}>
                      <td className="n text-arc-ink-faint">{team.rank ?? '—'}</td>
                      <td>{team.teamName}</td>
                      <td className="text-arc-ink-soft">
                        {team.manager ? managerName(managers, team.manager) : '—'}
                      </td>
                      <td className="n">
                        {team.wins}–{team.losses}
                        {team.ties ? `–${team.ties}` : ''}
                      </td>
                      <td className="n text-arc-green">{num(team.pointsFor, 0)}</td>
                      <td className="n text-arc-ink-faint">{num(team.pointsAgainst, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.live.unmapped.length > 0 && (
              <p className="border-t border-arc-line px-5 py-3 text-[12px] text-[var(--color-arc-orange)]">
                Unmapped Yahoo teams: {data.live.unmapped.join(', ')} — add them to{' '}
                <code>public/data/yahoo-map.json</code>.
              </p>
            )}
          </Panel>
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* With a live queue, phones read the rulings before the budget table. */}
        <Panel
          title={`${season} Draft Budgets`}
          subtitle={`$${league.baseDraftBudget} base, less keeper salaries, plus or minus traded auction dollars.`}
          action={
            <Link to="/finances" className="btn">
              Full ledger
            </Link>
          }
          delay={120}
          className={queueFirst ? 'order-2 lg:order-none' : ''}
        >
          <div>
            <table className="out">
              <thead>
                <tr>
                  <th>Manager</th>
                  <th className="hidden md:table-cell">Team</th>
                  <th className="n hidden sm:table-cell">Keepers</th>
                  <th className="n">Salary</th>
                  <th className="n hidden sm:table-cell">Trades</th>
                  <th className="n">Available</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => (
                  <tr key={budget.manager}>
                    <td>
                      <ManagerTag id={budget.manager} />
                    </td>
                    <td className="hidden text-[12px] text-arc-ink-faint md:table-cell">{budget.team}</td>
                    <td className="n hidden text-arc-ink-soft sm:table-cell">{budget.keeperCount}</td>
                    <td className="n text-arc-ink-soft">{money(-budget.keeperSalary)}</td>
                    <td
                      className={`n hidden sm:table-cell ${
                        budget.cashNet > 0
                          ? 'text-[var(--color-arc-green)]'
                          : budget.cashNet < 0
                            ? 'text-[var(--color-arc-red)]'
                            : 'text-arc-ink-faint'
                      }`}
                    >
                      {budget.cashNet === 0 ? '—' : money(budget.cashNet, { sign: true })}
                    </td>
                    <td className="n">
                      <div
                        className={
                          budget.overCommitted ? 'text-[var(--color-arc-red)]' : 'text-arc-green'
                        }
                      >
                        {money(budget.available)}
                        {budget.overCommitted && (
                          <span className="redzone tag ml-2 align-middle">Red zone</span>
                        )}
                      </div>
                      <div className="mt-1.5 ml-auto w-24">
                        <Bar
                          value={Math.max(budget.available, 0)}
                          max={maxBudget}
                          tone={
                            budget.overCommitted
                              ? 'var(--color-arc-red)'
                              : 'var(--color-arc-green)'
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {underwater.length > 0 && (
            <div className="border-t border-arc-line px-5 py-3.5 text-[12px] text-[var(--color-arc-red)]">
              {underwater.map((budget) => managerName(managers, budget.manager)).join(', ')}{' '}
              {underwater.length === 1 ? 'enters' : 'enter'} the auction underwater — keeper
              selections must be trimmed before draft day.
            </div>
          )}
        </Panel>

        <div className={`space-y-6 ${queueFirst ? 'order-1 lg:order-none' : ''}`}>
          <Panel
            title="Trade queue"
            subtitle={pending.length ? 'Awaiting a commissioner ruling.' : undefined}
            action={
              <Link to="/trades" className="btn">
                Open
              </Link>
            }
            delay={180}
          >
            {pending.length === 0 ? (
              <div className="desk-empty">
                <span className="label text-arc-green">Queue clear</span>
                <p>Nothing awaiting a ruling. The books are current.</p>
              </div>
            ) : (
              <ul className="divide-y divide-arc-line">
                {pending.slice(0, 5).map((trade) => {
                  const verdict = antiDumpingCheck(trade)
                  const onMarketCheck = trade.status === 'market-check'
                  const checkOver =
                    onMarketCheck && trade.marketCheckUntil
                      ? new Date(trade.marketCheckUntil).getTime() <= Date.now()
                      : false
                  return (
                    <li key={trade.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] text-arc-ink">
                            <span className="text-arc-ink-soft">
                              {managerName(managers, trade.seller)}
                            </span>
                            <span className="mx-1.5 text-arc-ink-faint">→</span>
                            <span className="text-arc-ink-soft">
                              {managerName(managers, trade.buyer)}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[12px] text-arc-ink-faint">
                            {trade.players}
                          </div>
                        </div>
                        <div className="tnum shrink-0 text-right text-[13px] text-arc-green">
                          {money(trade.totalDollars)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Chip tone={onMarketCheck ? 'flag' : 'gold'}>
                          {onMarketCheck ? 'Market check' : 'Pending'}
                        </Chip>
                        {verdict.triggered && !onMarketCheck && (
                          <Chip tone="flag">Anti-dumping trigger</Chip>
                        )}
                        {onMarketCheck && trade.marketCheckUntil && (
                          <span className="tnum text-[11px] text-arc-ink-soft">
                            {checkOver
                              ? 'Window closed — ROFR to the original buyer'
                              : `Closes in ${countdown(trade.marketCheckUntil)}`}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Obligations on the books" delay={240}>
            <table className="out">
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="n">Gross moved</th>
                  <th className="n">Managers</th>
                </tr>
              </thead>
              <tbody>
                {horizon.map((row) => (
                  <tr key={row.year}>
                    <td className="tnum">{row.year}</td>
                    <td className="n text-arc-green">{money(row.gross)}</td>
                    <td className="n text-arc-ink-soft">{row.managers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={`${lastSeason?.year ?? ''} final table`} delay={300}>
            <table className="out">
              <tbody>
                {lastSeason?.teams.slice(0, 6).map((team) => (
                  <tr key={team.manager}>
                    <td className="tnum w-8 text-arc-ink-faint">{team.rank}</td>
                    <td>
                      <Link
                        to={`/managers/${team.manager}`}
                        className="transition-colors hover:text-arc-green"
                      >
                        {managerName(managers, team.manager)}
                      </Link>
                    </td>
                    <td className="n text-arc-ink-soft">{record(team.wins, team.losses)}</td>
                    <td className="n text-arc-ink-faint">{num(team.avgPointsFor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-arc-line px-5 py-3">
              <Link to="/standings" className="label hover:text-arc-green">
                All {seasons.length} seasons →
              </Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
