import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Chip, Empty, Panel, PageHeader, SectionNav, SegmentedControl } from '../components/ui'
import TradeForm from '../components/TradeForm'
import ConfirmButton from '../components/receipts/ConfirmButton'
import { useMedia } from '../components/receipts/useMedia'
import { PlayMoment, type MomentKind } from '../components/effects'
import { animationsDisabled } from '../lib/motion'
import { play } from '../lib/sfx'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { useTrades } from '../lib/derive'
import { countdown, money, shortDate } from '../lib/format'
import { friendlySaveError } from '../lib/github'
import { useMe } from '../lib/me'
import { antiDumpingCheck, marketCheckDeadline, tradeImpact } from '../lib/rules'
import { applyTradeRoster } from '../lib/roster'
import type { LeagueData, Trade, TradeQueueFile, TradeStatus } from '../lib/types'

type Tab = 'queue' | 'ledger' | 'archive'

const TABS: Tab[] = ['queue', 'ledger', 'archive']

/**
 * Approvals are two commits — the ruling, then the roster move. When the
 * second one fails the trade is approved and the players have not moved, so
 * the half that is owed is kept here, on this device, with a button to
 * finish it. Cleared the moment the roster commit lands.
 */
const PENDING_KEY = 'wacl.pendingRosterMoves'

function readPendingMoves(): Record<string, Trade> {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, Trade>) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writePendingMoves(moves: Record<string, Trade>): void {
  try {
    if (Object.keys(moves).length) localStorage.setItem(PENDING_KEY, JSON.stringify(moves))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    /* private browsing — the chip still shows for this page view */
  }
}

export default function Trades() {
  const data = useLeagueData()
  const { managers, legacyTrades, league } = data
  const { commissioner, save } = useLeague()
  const trades = useTrades()
  const me = useMe()
  // Terms shows from md, Status from sm; the batch row spans what is there.
  const wide = useMedia('(min-width: 768px)')
  const mid = useMedia('(min-width: 640px)')
  const columns = wide ? 5 : mid ? 4 : 3

  // Which tab and which season live in the address, the way Finances keeps
  // its own, so a reload or a pasted link comes back to the same view.
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab') as Tab | null
  const tab: Tab = requestedTab && TABS.includes(requestedTab) ? requestedTab : 'queue'
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        if (next === 'queue') current.delete('tab')
        else current.set('tab', next)
        if (next !== 'ledger') current.delete('season')
        return current
      },
      { replace: true },
    )
  const requestedSeason = Number(params.get('season'))
  const seasonFilter: 'all' | number = Number.isFinite(requestedSeason) && requestedSeason > 0 ? requestedSeason : 'all'
  const setSeasonFilter = (next: 'all' | number) =>
    setParams(
      (current) => {
        if (next === 'all') current.delete('season')
        else current.set('season', String(next))
        return current
      },
      { replace: true },
    )

  const [composing, setComposing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [moment, setMoment] = useState<MomentKind | null>(null)
  // A failure is pinned to the trade it happened on; 'page' for anything else.
  const [fault, setFault] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingMoves, setPendingMoves] = useState<Record<string, Trade>>(readPendingMoves)

  const pending = trades.filter(
    (trade) => trade.status === 'pending' || trade.status === 'market-check',
  )
  const decided = trades.filter(
    (trade) => trade.status === 'approved' || trade.status === 'rejected',
  )
  const seasons = useMemo(
    () => [...new Set(trades.map((trade) => trade.season))].sort((a, b) => b - a),
    [trades],
  )
  const visible =
    seasonFilter === 'all' ? decided : decided.filter((trade) => trade.season === seasonFilter)

  // The market-check countdown ticks by the minute while one is running, so
  // an open tab sees the window close instead of a frozen "Closes in 7h".
  const hasCheck = pending.some((trade) => trade.status === 'market-check')
  const [, tick] = useState(0)
  useEffect(() => {
    if (!hasCheck) return
    const id = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [hasCheck])

  const faultFor = (id: string) => (fault?.id === id ? fault.message : null)

  const setPending = (next: Record<string, Trade>) => {
    setPendingMoves(next)
    writePendingMoves(next)
  }

  /**
   * The roster half of an approval, on its own so it can be retried alone —
   * and safe to run twice: applyTradeRoster reports players already on the
   * buyer as settled rather than carrying them back.
   */
  async function moveRosters(trade: Trade) {
    const preview = applyTradeRoster(data.keepers, trade)
    if (preview.moved.length > 0) {
      await save<LeagueData['keepers']>(
        'keepers.json',
        (current) => applyTradeRoster(current, trade).keepers,
        `Trade ${trade.id}: roster moves (${preview.moved
          .map((move) => `${move.player} → ${managerName(managers, move.to)}`)
          .join(', ')})`,
      )
    }
    const movedLine = preview.moved
      .map((move) => `${move.player} → ${managerName(managers, move.to)}'s roster`)
      .join(' · ')
    const settledLine = preview.settled.length
      ? `${preview.settled.join(', ')} ${preview.settled.length === 1 ? 'was' : 'were'} already moved — nothing to do.`
      : ''
    const unmatchedLine =
      preview.unmatched.length > 0
        ? `Couldn't find ${preview.unmatched.join(', ')} on either roster — fix via Keepers → Edit keepers if a move is owed.`
        : ''
    return [movedLine, settledLine, unmatchedLine].filter(Boolean).join('  ') || null
  }

  /** Every ruling is a commit; the queue file is the single source of truth. */
  async function rule(trade: Trade, status: TradeStatus, extra: Partial<Trade> = {}) {
    setBusyId(trade.id)
    setFault(null)
    setNotice(null)
    const updated: Trade = {
      ...trade,
      ...extra,
      status,
      decidedAt: status === 'market-check' ? undefined : new Date().toISOString(),
    }
    try {
      await save<TradeQueueFile>(
        'trade-queue.json',
        (current) => {
          const proposals = current.proposals.some((row) => row.id === trade.id)
            ? current.proposals.map((row) => (row.id === trade.id ? updated : row))
            : [...current.proposals, updated]
          return { ...current, proposals }
        },
        `Trade ${trade.id}: ${status} (${managerName(managers, trade.seller)} → ${managerName(managers, trade.buyer)})`,
      )
    } catch (cause) {
      // One failure, one sentence: the same words the Shell's save strip
      // prints, so the two surfaces never disagree about what happened.
      setFault({ id: trade.id, message: friendlySaveError(cause) })
      setBusyId(null)
      return
    }

    // Approval moves the named players between the season's keeper blocks,
    // so the buyer's roster (and the war room) reflect the deal immediately.
    if (status === 'approved') {
      try {
        setNotice(await moveRosters(updated))
      } catch (cause) {
        setPending({ ...pendingMoves, [trade.id]: updated })
        setFault({
          id: trade.id,
          message: `Approved — but the roster move didn't save. ${friendlySaveError(cause)} Retry it from the Recorded tab.`,
        })
      }
    }

    play(status === 'approved' ? 'roar' : status === 'rejected' ? 'trombone' : 'whistle')
    if (!animationsDisabled()) {
      setMoment(status === 'approved' ? 'td' : status === 'rejected' ? 'flag' : 'review')
    }
    setBusyId(null)
  }

  async function retryRoster(trade: Trade) {
    setBusyId(trade.id)
    setFault(null)
    try {
      setNotice(await moveRosters(trade))
      const next = { ...pendingMoves }
      delete next[trade.id]
      setPending(next)
    } catch (cause) {
      setFault({ id: trade.id, message: `The roster move still didn't save. ${friendlySaveError(cause)}` })
    } finally {
      setBusyId(null)
    }
  }

  async function addProposal(trade: Trade) {
    await save<TradeQueueFile>(
      'trade-queue.json',
      (current) => ({ ...current, proposals: [...current.proposals, trade] }),
      `Trade proposed: ${managerName(managers, trade.seller)} → ${managerName(managers, trade.buyer)} (${trade.players})`,
    )
    setComposing(false)
    setTab('queue')
  }

  // Archive: one chip per year, pointing at that year's first group.
  const archiveYears = useMemo(() => {
    const seen = new Map<string, string>()
    legacyTrades.forEach((group, index) => {
      const year = group.heading.match(/\d{4}/)?.[0] ?? String(index)
      if (!seen.has(year)) seen.set(year, `archive-${year}`)
    })
    return [...seen.entries()].map(([year, id]) => ({ id, label: year }))
  }, [legacyTrades])
  const archiveIdFor = (heading: string, index: number) => {
    const year = heading.match(/\d{4}/)?.[0] ?? String(index)
    const first = legacyTrades.findIndex((group) => (group.heading.match(/\d{4}/)?.[0] ?? '') === year)
    return first === index ? `archive-${year}` : undefined
  }

  const involvesMe = (trade: Trade) => me !== null && (trade.seller === me || trade.buyer === me)

  return (
    <>
      <PageHeader
        path="~/trades"
        eyebrow="Approvals & History"
        title="Trades"
        lede="Auction dollars move forward in time. Every proposal is checked against the anti-dumping rule before it reaches the books."
        action={
          commissioner ? (
            <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
              New trade
            </button>
          ) : undefined
        }
      />

      <div className="line-in mb-6 flex flex-wrap items-center gap-4">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'queue', label: `Queue${pending.length ? ` (${pending.length})` : ''}` },
            { id: 'ledger', label: 'Recorded' },
            { id: 'archive', label: 'Archive' },
          ]}
        />
        {tab === 'ledger' && (
          <select
            className="field w-auto"
            value={String(seasonFilter)}
            onChange={(event) =>
              setSeasonFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            aria-label="Season"
          >
            <option value="all">All seasons</option>
            {seasons.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
        )}
      </div>

      {faultFor('page') && (
        <p role="alert" className="mb-5 border-l-2 border-[var(--color-arc-red)] pl-3 text-[12.5px] text-[var(--color-arc-red)]">
          {faultFor('page')}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-5 border-l-2 border-[var(--color-arc-green)] pl-3 text-[12.5px] text-arc-ink-soft">
          {notice}
        </p>
      )}

      {composing && commissioner && (
        <div className="mb-6">
          <Panel title="Record a trade" subtitle="The seller gives up the player; the buyer pays.">
            <TradeForm
              canSave={commissioner}
              onCancel={() => setComposing(false)}
              onSubmit={addProposal}
            />
          </Panel>
        </div>
      )}

      {tab === 'queue' && (
        <div className="space-y-5">
          {pending.length === 0 ? (
            <Panel title="Queue">
              <Empty>Nothing awaiting a ruling. The books are current.</Empty>
            </Panel>
          ) : (
            pending.map((trade, index) => {
              const verdict = antiDumpingCheck(trade)
              const impact = tradeImpact(trade)
              const onMarketCheck = trade.status === 'market-check'
              const checkOver =
                onMarketCheck && trade.marketCheckUntil
                  ? new Date(trade.marketCheckUntil).getTime() <= Date.now()
                  : false
              const busy = busyId === trade.id

              return (
                <Panel key={trade.id} delay={index * 60} className={involvesMe(trade) ? 'queue-mine' : ''}>
                  <div className="px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[26px] leading-tight text-arc-ink">
                          {managerName(managers, trade.seller)}
                          <span className="mx-2.5 text-arc-green">→</span>
                          {managerName(managers, trade.buyer)}
                          {involvesMe(trade) && (
                            <span className="arcade ml-2 align-middle text-[12px] whitespace-nowrap text-arc-ink-soft">
                              you
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 text-[13px] text-arc-ink-soft">{trade.players}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Chip tone={onMarketCheck ? 'flag' : 'gold'}>
                            {onMarketCheck ? 'Market check' : 'Pending'}
                          </Chip>
                          {verdict.triggered && !onMarketCheck && (
                            <Chip tone="flag">Anti-dumping trigger</Chip>
                          )}
                          {(verdict.triggered || onMarketCheck) && (
                            <Link
                              to="/rules#anti-dumping"
                              className="-my-2 inline-flex min-h-[40px] items-center px-1 text-[12px] text-arc-ink-faint underline underline-offset-2 hover:text-arc-ink"
                            >
                              the rule
                            </Link>
                          )}
                          {onMarketCheck && trade.marketCheckUntil && (
                            <span className="tnum text-[11px] text-arc-ink-faint" role="status">
                              {checkOver
                                ? 'Window closed — ROFR to the original buyer'
                                : `Closes in ${countdown(trade.marketCheckUntil)}`}
                            </span>
                          )}
                          {trade.proposedAt && (
                            <span className="text-[11px] text-arc-ink-faint">
                              Proposed {shortDate(trade.proposedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="label">Total</div>
                        <div className="tnum text-[26px] leading-none text-arc-green">
                          {money(trade.totalDollars)}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 border-l-2 border-arc-line pl-3 text-[12px] text-arc-ink-soft">
                      {verdict.summary}
                    </p>
                    {trade.commissionerNote && (
                      <p className="mt-2 pl-3 text-[12px] text-arc-ink-faint italic">
                        {trade.commissionerNote}
                      </p>
                    )}

                    <div className="mt-5 overflow-x-auto">
                      <table className="out">
                        <thead>
                          <tr>
                            <th>Budget impact</th>
                            {impact.map((row) => (
                              <th key={row.year} className="n">
                                {row.year}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="text-arc-ink-soft">{managerName(managers, trade.seller)}</td>
                            {impact.map((row) => (
                              <td key={row.year} className="n text-[var(--color-arc-green)]">
                                {money(row.seller, { sign: true })}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="text-arc-ink-soft">{managerName(managers, trade.buyer)}</td>
                            {impact.map((row) => (
                              <td key={row.year} className="n text-[var(--color-arc-red)]">
                                {money(row.buyer, { sign: true })}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {commissioner ? (
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <ConfirmButton
                          className="btn btn-primary"
                          confirm="Approve this trade?"
                          disabled={busy}
                          onConfirm={() => void rule(trade, 'approved')}
                        >
                          {busy ? 'Working…' : 'Approve'}
                        </ConfirmButton>
                        {verdict.triggered && !onMarketCheck && (
                          <ConfirmButton
                            className="btn"
                            confirm="Start the 24h clock?"
                            disabled={busy}
                            onConfirm={() =>
                              void rule(trade, 'market-check', {
                                marketCheckUntil: marketCheckDeadline(),
                              })
                            }
                          >
                            Hold 24h for market check
                          </ConfirmButton>
                        )}
                        <ConfirmButton
                          className="btn btn-danger"
                          confirm="Reject this trade?"
                          disabled={busy}
                          onConfirm={() => void rule(trade, 'rejected')}
                        >
                          Reject
                        </ConfirmButton>
                      </div>
                    ) : (
                      <p className="mt-5 text-[12px] text-arc-ink-faint">
                        Awaiting a ruling from {league.commissioner}.
                      </p>
                    )}
                    {faultFor(trade.id) && (
                      <p role="alert" className="mt-3 border-l-2 border-[var(--color-arc-red)] pl-3 text-[12.5px] leading-snug text-[var(--color-arc-red)]">
                        {faultFor(trade.id)}
                      </p>
                    )}
                  </div>
                </Panel>
              )
            })
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <Panel
          title="Recorded trades"
          subtitle={`${visible.length} of ${decided.length} trades, grouped by the batch they were filed under. Amounts are auction dollars owed by the buyer in each listed season.`}
        >
          <table className="out desk-fixed">
            <colgroup>
              <col className="desk-col-deal" />
              <col className="desk-col-players" />
              <col className="desk-col-terms hidden md:table-column" />
              <col className="desk-col-total" />
              <col className="hidden sm:table-column" />
            </colgroup>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Players</th>
                <th className="hidden md:table-cell">Terms</th>
                <th className="n">Total</th>
                <th className="hidden sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((trade, index) => {
                const previous = visible[index - 1]
                const newBatch = !previous || previous.batch !== trade.batch
                const owed = pendingMoves[trade.id]
                const mine = involvesMe(trade)
                return (
                  <Fragment key={trade.id}>
                    {newBatch && (
                      <tr className="desk-group">
                        {/* Exactly the columns on screen. A short span left
                            Status as an unstyled gap between sm and md; a
                            long one makes the fixed layout reserve width for
                            columns nobody can see. */}
                        <td colSpan={columns}>{trade.batch}</td>
                      </tr>
                    )}
                    <tr
                      className={owed ? 'desk-flag' : undefined}
                      style={
                        mine
                          ? {
                              background: 'color-mix(in srgb, var(--me-color, transparent) 9%, transparent)',
                              boxShadow: 'inset 3px 0 0 var(--me-color, transparent)',
                            }
                          : undefined
                      }
                    >
                      <td className="sm:whitespace-nowrap">
                        {managerName(managers, trade.seller)}
                        <span className="mx-1.5 text-arc-green">→</span>
                        <span className="whitespace-nowrap">{managerName(managers, trade.buyer)}</span>
                        {mine && (
                          <span className="arcade ml-1.5 text-[12px] whitespace-nowrap text-arc-ink-soft">
                            you
                          </span>
                        )}
                      </td>
                      <td className="desk-wrap max-w-[170px] text-arc-ink-soft md:max-w-[280px]">
                        {trade.players}
                        {/* Terms restate the obligations the total sums; below
                            md they fold under the players. */}
                        {trade.terms && <span className="desk-terms md:hidden">{trade.terms}</span>}
                        {owed && (
                          <span className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Chip tone="flag">Roster move pending</Chip>
                            {commissioner && (
                              <button
                                type="button"
                                className="btn min-h-[40px] px-3 py-1 text-[12px]"
                                disabled={busyId === trade.id}
                                onClick={() => void retryRoster(owed)}
                              >
                                {busyId === trade.id ? 'Working…' : 'Retry roster move'}
                              </button>
                            )}
                          </span>
                        )}
                        {faultFor(trade.id) && (
                          <span role="alert" className="mt-1 block text-[12px] text-[var(--color-arc-red)]">
                            {faultFor(trade.id)}
                          </span>
                        )}
                      </td>
                      <td className="hidden max-w-[220px] text-[12px] text-arc-ink-faint md:table-cell">
                        {trade.terms}
                      </td>
                      <td className="n text-arc-green">
                        {money(trade.totalDollars)}
                        <span
                          className={`block text-[11px] leading-snug sm:hidden ${
                            trade.status === 'approved' ? 'text-arc-lime' : 'text-[var(--color-arc-red)]'
                          }`}
                        >
                          {trade.status}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <Chip tone={trade.status === 'approved' ? 'up' : 'down'}>{trade.status}</Chip>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {moment && <PlayMoment kind={moment} onDone={() => setMoment(null)} />}

      {tab === 'archive' && (
        <div className="space-y-6">
          <p className="text-[13px] text-arc-ink-soft">
            The written trade log kept before the structured ledger began, preserved verbatim.
          </p>
          <SectionNav sections={archiveYears} />
          {legacyTrades.map((group, index) => (
            <Panel
              key={group.heading}
              id={archiveIdFor(group.heading, index)}
              title={group.heading}
              subtitle={`${group.entries.length} trade${group.entries.length === 1 ? '' : 's'}`}
              delay={Math.min(index, 6) * 40}
            >
              <ul className="divide-y divide-arc-line">
                {group.entries.map((entry, entryIndex) => (
                  <li key={entryIndex} className="px-5 py-2.5 text-[13px] text-arc-ink-soft">
                    {entry}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}
