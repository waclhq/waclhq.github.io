import { useMemo, useState } from 'react'
import { Chip, Empty, Panel, PageHeader, SegmentedControl } from '../components/ui'
import TradeForm from '../components/TradeForm'
import { PlayMoment, type MomentKind } from '../components/effects'
import { animationsDisabled } from '../lib/motion'
import { play } from '../lib/sfx'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { useTrades } from '../lib/derive'
import { countdown, money, shortDate } from '../lib/format'
import { antiDumpingCheck, marketCheckDeadline, tradeImpact } from '../lib/rules'
import { applyTradeRoster } from '../lib/roster'
import type { LeagueData, Trade, TradeQueueFile, TradeStatus } from '../lib/types'

type Tab = 'queue' | 'ledger' | 'archive'

export default function Trades() {
  const data = useLeagueData()
  const { managers, legacyTrades, league } = data
  const { commissioner, save } = useLeague()
  const trades = useTrades()

  const [tab, setTab] = useState<Tab>('queue')
  const [composing, setComposing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [moment, setMoment] = useState<MomentKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [seasonFilter, setSeasonFilter] = useState<'all' | number>('all')

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

  /** Every ruling is a commit; the queue file is the single source of truth. */
  async function rule(trade: Trade, status: TradeStatus, extra: Partial<Trade> = {}) {
    setBusyId(trade.id)
    setError(null)
    setNotice(null)
    try {
      const updated: Trade = {
        ...trade,
        ...extra,
        status,
        decidedAt: status === 'market-check' ? undefined : new Date().toISOString(),
      }
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

      // Approval moves the named players between the season's keeper blocks,
      // so the buyer's roster (and the war room) reflect the deal immediately.
      if (status === 'approved') {
        const preview = applyTradeRoster(data.keepers, updated)
        if (preview.moved.length > 0) {
          await save<LeagueData['keepers']>(
            'keepers.json',
            (current) => applyTradeRoster(current, updated).keepers,
            `Trade ${trade.id}: roster moves (${preview.moved
              .map((move) => `${move.player} → ${managerName(managers, move.to)}`)
              .join(', ')})`,
          )
        }
        const movedLine = preview.moved
          .map((move) => `${move.player} → ${managerName(managers, move.to)}'s roster`)
          .join(' · ')
        const unmatchedLine =
          preview.unmatched.length > 0
            ? `Couldn't find ${preview.unmatched.join(', ')} on either roster — fix via Keepers → Edit keepers if a move is owed.`
            : ''
        setNotice([movedLine, unmatchedLine].filter(Boolean).join('  ') || null)
      }

      play(status === 'approved' ? 'roar' : status === 'rejected' ? 'trombone' : 'whistle')
      if (!animationsDisabled()) {
        setMoment(status === 'approved' ? 'td' : status === 'rejected' ? 'flag' : 'review')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the ruling.')
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

      {error && (
        <p className="mb-5 border-l-2 border-[var(--color-arc-red)] pl-3 text-[12px] text-[var(--color-arc-red)]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-5 border-l-2 border-[var(--color-arc-green)] pl-3 text-[12px] text-arc-ink-soft">
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

              return (
                <Panel key={trade.id} delay={index * 60}>
                  <div className="px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[26px] leading-tight text-arc-ink">
                          {managerName(managers, trade.seller)}
                          <span className="mx-2.5 text-arc-green">→</span>
                          {managerName(managers, trade.buyer)}
                        </div>
                        <div className="mt-1.5 text-[13px] text-arc-ink-soft">{trade.players}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Chip tone={onMarketCheck ? 'flag' : 'gold'}>
                            {onMarketCheck ? 'Market check' : 'Pending'}
                          </Chip>
                          {verdict.triggered && !onMarketCheck && (
                            <Chip tone="flag">Anti-dumping trigger</Chip>
                          )}
                          {onMarketCheck && trade.marketCheckUntil && (
                            <span className="tnum text-[11px] text-arc-ink-faint">
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
                            <td className="text-arc-ink-soft">
                              {managerName(managers, trade.seller)}
                            </td>
                            {impact.map((row) => (
                              <td key={row.year} className="n text-[var(--color-arc-green)]">
                                {money(row.seller, { sign: true })}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="text-arc-ink-soft">
                              {managerName(managers, trade.buyer)}
                            </td>
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
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === trade.id}
                          onClick={() => void rule(trade, 'approved')}
                        >
                          Approve
                        </button>
                        {verdict.triggered && !onMarketCheck && (
                          <button
                            type="button"
                            className="btn"
                            disabled={busyId === trade.id}
                            onClick={() =>
                              void rule(trade, 'market-check', {
                                marketCheckUntil: marketCheckDeadline(),
                              })
                            }
                          >
                            Hold 24h for market check
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busyId === trade.id}
                          onClick={() => void rule(trade, 'rejected')}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <p className="mt-5 text-[12px] text-arc-ink-faint">
                        Awaiting a ruling from {league.commissioner}.
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
          subtitle={`${visible.length} of ${decided.length} trades. Amounts are auction dollars owed by the buyer in each listed season.`}
        >
          <div>
            <table className="out">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Seller</th>
                  <th>Buyer</th>
                  <th>Players</th>
                  <th>Terms</th>
                  <th className="n">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((trade) => (
                  <tr key={trade.id}>
                    <td className="tnum whitespace-nowrap text-arc-ink-faint">{trade.batch}</td>
                    <td className="whitespace-nowrap">{managerName(managers, trade.seller)}</td>
                    <td className="whitespace-nowrap">{managerName(managers, trade.buyer)}</td>
                    <td className="max-w-[280px] text-arc-ink-soft">{trade.players}</td>
                    <td className="max-w-[220px] text-[12px] text-arc-ink-faint">
                      {trade.terms}
                    </td>
                    <td className="n text-arc-green">{money(trade.totalDollars)}</td>
                    <td>
                      <Chip tone={trade.status === 'approved' ? 'up' : 'down'}>{trade.status}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {moment && <PlayMoment kind={moment} onDone={() => setMoment(null)} />}

      {tab === 'archive' && (
        <div className="space-y-6">
          <p className="text-[13px] text-arc-ink-soft">
            The written trade log kept before the structured ledger began, preserved verbatim.
          </p>
          {legacyTrades.map((group, index) => (
            <Panel key={group.heading} title={group.heading} delay={index * 40}>
              <ul className="divide-y divide-arc-ink">
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
