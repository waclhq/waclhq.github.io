import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DuesBoard from '../components/DuesBoard'
import ManagerTag from '../components/ManagerTag'
import { Chip, Empty, Panel, PageHeader, SegmentedControl, Stat } from '../components/ui'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { newId, useCash, useLedger } from '../lib/derive'
import { money, shortDate } from '../lib/format'
import { plainSaveError } from '../lib/ops-save'
import type { CashEntry, CashFile, CashType } from '../lib/types'

type Tab = 'auction' | 'dues' | 'cash'
const TABS: Tab[] = ['auction', 'dues', 'cash']

const CASH_TYPES: { id: CashType; label: string }[] = [
  { id: 'dues', label: 'Dues' },
  { id: 'payout', label: 'Payout' },
  { id: 'bet', label: 'Side bet' },
  { id: 'fee', label: 'Fee' },
  { id: 'adjustment', label: 'Adjustment' },
]

export default function Finances() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'auction'
  const setTab = (next: Tab) =>
    setParams(
      (current) => {
        if (next === 'auction') current.delete('tab')
        else current.set('tab', next)
        return current
      },
      { replace: true },
    )
  const { league } = useLeagueData()

  return (
    <>
      <PageHeader
        path="~/finances"
        eyebrow="Balances"
        title="Finances"
        lede="Two books: auction dollars traded between managers, and real cash owed around the league. Waivers live in Yahoo."
      />
      <div className="line-in mb-6">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { id: 'auction', label: 'Auction $' },
            { id: 'dues', label: 'Dues' },
            { id: 'cash', label: 'Cash' },
          ]}
        />
      </div>
      {tab === 'auction' && <AuctionBook />}
      {tab === 'dues' && <DuesBoard season={league.currentSeason} />}
      {tab === 'cash' && <CashBook season={league.currentSeason} />}
    </>
  )
}

/* ------------------------------------------------------------------ */

function AuctionBook() {
  const { managers } = useLeagueData()
  const ledger = useLedger()
  const years = useMemo(
    () =>
      Object.keys(ledger)
        .map(Number)
        .sort((a, b) => a - b),
    [ledger],
  )
  const active = managers.filter((manager) => manager.active)

  return (
    <Panel
      title="Auction dollars traded"
      subtitle="Sellers receive draft dollars in the listed season; buyers pay them. Every column nets to zero."
    >
      <div>
        <table className="out">
          <thead>
            <tr>
              <th className="ops-sticky-col">Manager</th>
              {years.map((year) => (
                <th key={year} className="n">
                  {year}
                </th>
              ))}
              <th className="n">Career net</th>
            </tr>
          </thead>
          <tbody>
            {active.map((manager) => {
              const career = years.reduce(
                (total, year) => total + (ledger[String(year)]?.[manager.id]?.net ?? 0),
                0,
              )
              return (
                <tr key={manager.id}>
                  <td className="ops-sticky-col whitespace-nowrap">
                    <ManagerTag id={manager.id} size={20} />
                  </td>
                  {years.map((year) => {
                    const entry = ledger[String(year)]?.[manager.id]
                    const net = entry?.net ?? 0
                    return (
                      <td
                        key={year}
                        className={`n ${
                          net > 0 ? 'text-arc-green' : net < 0 ? 'text-arc-red' : 'text-arc-ink-faint'
                        }`}
                        title={
                          entry
                            ? `Received ${money(entry.received)} · Sent ${money(entry.sent)}`
                            : undefined
                        }
                      >
                        {net === 0 ? '·' : money(net, { sign: true })}
                      </td>
                    )
                  })}
                  <td
                    className={`n ${
                      career > 0
                        ? 'text-arc-green'
                        : career < 0
                          ? 'text-arc-red'
                          : 'text-arc-ink-faint'
                    }`}
                  >
                    {money(career, { sign: true })}
                  </td>
                </tr>
              )
            })}
            <tr>
              <td className="ops-sticky-col text-arc-ink-faint">League total</td>
              {years.map((year) => {
                const total = Object.values(ledger[String(year)] ?? {}).reduce(
                  (sum, entry) => sum + entry.net,
                  0,
                )
                return (
                  <td key={year} className="n text-arc-ink-faint">
                    {Math.abs(total) < 0.01 ? '0' : money(total)}
                  </td>
                )
              })}
              <td className="n text-arc-ink-faint">0</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */

function CashBook({ season }: { season: number }) {
  const { managers, cash } = useLeagueData()
  const { commissioner, save } = useLeague()
  const [scope, setScope] = useState<'season' | 'all'>('season')
  const positions = useCash(scope === 'all' ? 'all' : season)
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null)

  const entries = cash.entries
    .filter((entry) => scope === 'all' || entry.season === season)
    .sort((a, b) => b.date.localeCompare(a.date))
  const owedToLeague = positions
    .filter((row) => row.outstanding < 0)
    .reduce((total, row) => total + row.outstanding, 0)
  const owedByLeague = positions
    .filter((row) => row.outstanding > 0)
    .reduce((total, row) => total + row.outstanding, 0)

  /** True when the commit landed. Errors come back in plain words. */
  async function mutate(
    update: (current: CashFile) => CashFile,
    message: string,
  ): Promise<string | null> {
    try {
      await save<CashFile>('cash.json', update, message)
      return null
    } catch (cause) {
      return plainSaveError(cause)
    }
  }

  async function record(entry: CashEntry): Promise<boolean> {
    setFormError(null)
    const failure = await mutate(
      (current) => ({ ...current, entries: [...current.entries, entry] }),
      `Cash: ${entry.description} (${managerName(managers, entry.manager)})`,
    )
    if (failure) {
      setFormError(failure)
      return false
    }
    setNotice({
      id: entry.id,
      text: `Recorded · ${managerName(managers, entry.manager)} ${money(entry.amount, { sign: true })}`,
    })
    return true
  }

  async function flip(entry: CashEntry) {
    if (saving) return
    setSaving(entry.id)
    setRowError(null)
    const next = !entry.settled
    const failure = await mutate(
      (current) => ({
        ...current,
        entries: current.entries.map((row) => (row.id === entry.id ? { ...row, settled: next } : row)),
      }),
      `Cash: mark ${entry.description} ${next ? 'settled' : 'unsettled'}`,
    )
    setSaving(null)
    if (failure) setRowError({ id: entry.id, message: failure })
    else
      setNotice({
        id: entry.id,
        text: `${next ? 'Settled' : 'Reopened'} · ${managerName(managers, entry.manager)} ${money(entry.amount, { sign: true })}`,
      })
  }

  const dateFor = (entry: CashEntry) =>
    scope === 'season'
      ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : shortDate(entry.date)

  return (
    <div className="space-y-6">
      <div className="line-in grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <Stat
          label="Owed to the league"
          value={money(Math.abs(owedToLeague))}
          tone={owedToLeague < 0 ? 'down' : 'default'}
          hint={owedToLeague < 0 ? 'Still to collect' : 'All collected'}
        />
        <Stat
          label="Owed by the league"
          value={money(owedByLeague)}
          tone={owedByLeague > 0 ? 'up' : 'default'}
          hint={owedByLeague > 0 ? 'Still to pay out' : 'Nothing owed'}
        />
        <Stat label="Entries" value={entries.length} />
        <Stat
          label="Net position"
          value={money(owedByLeague + owedToLeague, { sign: true })}
          hint="Should settle to zero once the season closes"
        />
      </div>

      <Panel
        title="Standing balances"
        subtitle="Positive means the league owes the manager. Negative means they owe the league."
        action={
          <div className="flex gap-2">
            <SegmentedControl<'season' | 'all'>
              value={scope}
              onChange={setScope}
              options={[
                { id: 'season', label: String(season) },
                { id: 'all', label: 'All' },
              ]}
            />
            {commissioner && (
              <button
                type="button"
                className="btn"
                aria-expanded={adding}
                onClick={() => {
                  setAdding((open) => !open)
                  setFormError(null)
                }}
              >
                {adding ? 'Cancel' : 'Add'}
              </button>
            )}
          </div>
        }
      >
        {adding && (
          <CashForm
            season={season}
            error={formError}
            onSubmit={async (entry) => {
              const ok = await record(entry)
              if (ok) setAdding(false)
              return ok
            }}
          />
        )}
        {notice && (
          <p
            role="status"
            className="flex items-center gap-2 border-b border-arc-line px-4 py-2 text-[12.5px] text-arc-green sm:px-5"
          >
            <span aria-hidden>✓</span>
            <span className="tnum">{notice.text}</span>
          </p>
        )}
        <table className="out">
          <thead>
            <tr>
              <th>Manager</th>
              <th className="n hidden sm:table-cell">Entries</th>
              <th className="n hidden sm:table-cell">Total</th>
              <th className="n">Settled</th>
              <th className="n">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr key={row.manager}>
                <td>
                  <ManagerTag id={row.manager} size={20} />
                </td>
                <td className="n hidden text-arc-ink-faint sm:table-cell">{row.entries || '·'}</td>
                <td className="n hidden text-arc-ink-soft sm:table-cell">
                  {money(row.owed, { sign: true })}
                </td>
                <td className="n text-arc-ink-faint">{money(row.settled, { sign: true })}</td>
                <td
                  className={`n font-semibold ${
                    row.outstanding > 0
                      ? 'text-arc-green'
                      : row.outstanding < 0
                        ? 'text-arc-red'
                        : 'text-arc-ink-faint'
                  }`}
                >
                  {row.outstanding === 0 ? '·' : money(row.outstanding, { sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel
        title="Ledger entries"
        subtitle={
          commissioner
            ? 'Tick the box when an entry is squared away — untick to reopen it.'
            : 'Every dollar logged, newest first.'
        }
      >
        {entries.length === 0 ? (
          <Empty kicker="clean book">
            Nothing recorded yet. Dues, payouts, and side bets you log here roll into the balances
            above.
          </Empty>
        ) : (
          <table className="out">
            <thead>
              <tr>
                {commissioner && (
                  <th className="w-12 !px-1">
                    <span className="sr-only">Settled</span>
                  </th>
                )}
                <th className="hidden sm:table-cell">Date</th>
                <th>Manager</th>
                <th className="n">Amount</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Description</th>
                <th className="hidden md:table-cell">Type</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const busy = saving === entry.id
                const label = CASH_TYPES.find((type) => type.id === entry.type)?.label ?? entry.type
                return [
                  <tr key={entry.id} className={notice?.id === entry.id ? 'ops-row-new' : ''}>
                    {commissioner && (
                      <td className="!px-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={entry.settled}
                          aria-busy={busy || undefined}
                          aria-label={`Mark ${entry.description} for ${managerName(managers, entry.manager)} as ${entry.settled ? 'open' : 'settled'}`}
                          title={entry.settled ? 'Settled — tap to reopen' : 'Tap to mark settled'}
                          disabled={busy}
                          onClick={() => void flip(entry)}
                          className="group grid h-11 w-10 place-items-center disabled:cursor-progress sm:w-11"
                        >
                          <span
                            className={`grid h-6 w-6 place-items-center rounded border-2 text-[15px] leading-none transition-colors ${
                              entry.settled
                                ? 'border-arc-green bg-arc-green text-arc-bg'
                                : 'border-arc-ink-faint text-transparent group-hover:border-arc-green group-hover:text-arc-green/40'
                            } ${busy ? 'opacity-40' : ''}`}
                          >
                            ✓
                          </span>
                        </button>
                      </td>
                    )}
                    <td className="tnum hidden whitespace-nowrap text-arc-ink-faint sm:table-cell">
                      {dateFor(entry)}
                    </td>
                    <td>
                      {managerName(managers, entry.manager)}
                      <span className="tnum block max-w-[132px] truncate text-[11px] leading-snug text-arc-ink-faint sm:hidden">
                        {dateFor(entry)} · {label} · {entry.description}
                      </span>
                    </td>
                    <td className={`n font-semibold ${entry.amount > 0 ? 'text-arc-green' : 'text-arc-red'}`}>
                      {money(entry.amount, { sign: true })}
                    </td>
                    <td>
                      <Chip tone={entry.settled ? 'neutral' : 'flag'}>
                        {entry.settled ? 'Settled' : 'Open'}
                      </Chip>
                    </td>
                    <td className="hidden text-arc-ink-soft sm:table-cell">{entry.description}</td>
                    <td className="hidden text-[12px] text-arc-ink-soft md:table-cell">{label}</td>
                  </tr>,
                  rowError?.id === entry.id && (
                    <tr key={`${entry.id}-error`}>
                      <td colSpan={commissioner ? 7 : 6} className="!whitespace-normal text-[12.5px] text-arc-red" role="alert">
                        {rowError.message}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}

type Direction = 'owes' | 'owed'

function CashForm({
  season,
  error,
  onSubmit,
}: {
  season: number
  error: string | null
  onSubmit: (entry: CashEntry) => Promise<boolean>
}) {
  const { managers } = useLeagueData()
  const active = managers.filter((manager) => manager.active)
  const [manager, setManager] = useState('')
  const [type, setType] = useState<CashType>('dues')
  const [direction, setDirection] = useState<Direction>('owes')
  // The raw string stays in state: a half-typed field must not be coerced to
  // a zero the commissioner then cannot delete.
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const magnitude = Number(amountText.replace(/[^0-9.]/g, ''))
  const valid = Number.isFinite(magnitude) && magnitude > 0
  const amount = direction === 'owes' ? -magnitude : magnitude
  const who = manager ? managerName(managers, manager) : 'The manager'

  return (
    <div className="grid gap-3 border-b border-arc-line px-4 py-5 sm:grid-cols-2 sm:px-5 lg:grid-cols-6">
      <label className="lg:col-span-2">
        <span className="label">Manager</span>
        <select
          className="field mt-1.5"
          value={manager}
          onChange={(event) => setManager(event.target.value)}
        >
          <option value="">Select…</option>
          {active.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Type</span>
        <select
          className="field mt-1.5"
          value={type}
          onChange={(event) => setType(event.target.value as CashType)}
        >
          {CASH_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2 lg:col-span-3">
        <span className="label">Direction</span>
        <div className="mt-1.5">
          <SegmentedControl<Direction>
            value={direction}
            onChange={setDirection}
            options={[
              { id: 'owes', label: 'Manager owes league' },
              { id: 'owed', label: 'League owes manager' },
            ]}
          />
        </div>
      </div>
      <label>
        <span className="label">Amount</span>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
          className="field tnum mt-1.5"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          placeholder="150"
          aria-describedby="cash-amount-hint"
        />
      </label>
      <label className="sm:col-span-2 lg:col-span-3">
        <span className="label">Description</span>
        <input
          className="field mt-1.5"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={`${season} entry fee`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-6">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!manager || !valid || !description.trim() || busy}
          onClick={() => {
            if (!valid) return
            setBusy(true)
            void onSubmit({
              id: newId('cash'),
              season,
              date: new Date().toISOString(),
              manager,
              type,
              amount,
              description: description.trim(),
              settled: false,
            }).finally(() => setBusy(false))
          }}
        >
          {busy ? 'Saving…' : 'Record entry'}
        </button>
        {error ? (
          <p role="alert" className="text-[12.5px] leading-snug text-arc-red">
            {error}
          </p>
        ) : (
          <p id="cash-amount-hint" className="tnum text-[12px] text-arc-ink-soft">
            {valid ? (
              <>
                Books as{' '}
                <span className={amount < 0 ? 'text-arc-red' : 'text-arc-green'}>
                  {money(amount, { sign: true })}
                </span>{' '}
                — {who} {direction === 'owes' ? 'owes the league' : 'is owed by the league'}.
              </>
            ) : (
              'Enter the amount as a positive number; the direction sets the sign.'
            )}
          </p>
        )}
      </div>
    </div>
  )
}
