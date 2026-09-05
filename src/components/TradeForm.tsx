import { useMemo, useState } from 'react'
import { useLeagueData } from '../lib/data'
import { newId, useBudgets } from '../lib/derive'
import { money } from '../lib/format'
import { friendlySaveError } from '../lib/github'
import { antiDumpingCheck, validateTrade, type TradeIssue } from '../lib/rules'
import { seasonClock } from '../lib/season'
import type { Trade, TradeObligation } from '../lib/types'
import { Chip } from './ui'

interface Props {
  onSubmit: (trade: Trade) => Promise<void>
  onCancel: () => void
  canSave: boolean
}

type Field = 'seller' | 'buyer' | 'players' | 'years' | 'amounts'

/** A typed-as-typed obligation row; numbers are derived, never written back. */
interface ObligationText {
  year: string
  amount: string
}

/** Which fields an issue is about, so it stays quiet until they are touched. */
function concerns(issue: TradeIssue): Field[] {
  if (/seller|buyer/i.test(issue.message)) return ['seller', 'buyer']
  if (/players/i.test(issue.message)) return ['players']
  if (/year may appear/i.test(issue.message)) return ['years']
  if (/negative amount/i.test(issue.message)) return ['amounts']
  return []
}

/**
 * Records a trade the way the league writes them: a seller gives up a player,
 * the buyer pays auction dollars spread across future seasons. The batch it
 * files under comes from league time — a deal in October is a Week 7 deal,
 * not a preseason one — with a box to say otherwise.
 */
export default function TradeForm({ onSubmit, onCancel, canSave }: Props) {
  const { league, managers } = useLeagueData()
  const active = managers.filter((manager) => manager.active)
  const budgets = useBudgets(league.currentSeason)
  const season = league.currentSeason
  const clock = useMemo(() => seasonClock(season), [season])
  const inPlay = clock.phase === 'in-season' || clock.phase === 'playoffs'

  const [seller, setSeller] = useState('')
  const [buyer, setBuyer] = useState('')
  const [players, setPlayers] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<ObligationText[]>([{ year: String(season), amount: '' }])
  const [preseasonDeal, setPreseasonDeal] = useState(!inPlay)
  const [touched, setTouched] = useState<Set<Field>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const touch = (field: Field) =>
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))

  const obligations = useMemo<TradeObligation[]>(
    () =>
      rows.map((row) => ({
        year: Math.round(Number(row.year)) || 0,
        amount: Number.isFinite(Number(row.amount)) ? Math.round(Number(row.amount)) : 0,
      })),
    [rows],
  )
  const draft = useMemo(
    () => ({ seller, buyer, players, obligations, season }),
    [seller, buyer, players, obligations, season],
  )
  const issues = validateTrade(draft, league, budgets)
  const blocking = issues.filter((issue) => issue.level === 'error')
  // Red lines mean something you did: errors wait for their field or the
  // first attempt to save; warnings (the anti-dumping rule) are live.
  const shown = issues.filter(
    (issue) =>
      issue.level === 'warning' ||
      submitted ||
      concerns(issue).some((field) => touched.has(field)),
  )
  const verdict = antiDumpingCheck(draft)
  const total = obligations.reduce((sum, obligation) => sum + obligation.amount, 0)

  const batch = preseasonDeal
    ? `${season} Preseason`
    : clock.week
      ? `${season} Week ${clock.week}`
      : `${season}`

  const summary = useMemo(() => {
    const sellerName = active.find((m) => m.id === seller)?.displayName ?? '?'
    const buyerName = active.find((m) => m.id === buyer)?.displayName ?? '?'
    const terms = obligations
      .filter((obligation) => obligation.amount > 0)
      .map((obligation) => `$${obligation.amount} in ${obligation.year}`)
      .join('; ')
    return `${sellerName} trades ${players || '…'} to ${buyerName} for ${terms || 'no cash'}`
  }, [active, seller, buyer, players, obligations])

  function updateRow(index: number, patch: Partial<ObligationText>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function save() {
    setSubmitted(true)
    if (blocking.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const cleaned = obligations.filter((obligation) => obligation.amount > 0)
      const trade: Trade = {
        id: newId('t'),
        batch,
        season,
        preseason: preseasonDeal,
        seller,
        buyer,
        players: players.trim(),
        terms:
          cleaned.map((obligation) => `$${obligation.amount} in ${obligation.year}`).join('; ') ||
          '(player-for-player, no cash)',
        totalDollars: cleaned.reduce((sum, obligation) => sum + obligation.amount, 0),
        obligations: cleaned,
        status: 'pending',
        source: 'app',
        proposedAt: new Date().toISOString(),
        commissionerNote: note.trim() || undefined,
      }
      await onSubmit(trade)
    } catch (cause) {
      setError(friendlySaveError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Seller — gives up the player</span>
          <select
            className="field mt-2"
            value={seller}
            onChange={(event) => setSeller(event.target.value)}
            onBlur={() => touch('seller')}
          >
            <option value="">Select…</option>
            {active.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.displayName} · {manager.team}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Buyer — pays auction dollars</span>
          <select
            className="field mt-2"
            value={buyer}
            onChange={(event) => setBuyer(event.target.value)}
            onBlur={() => touch('buyer')}
          >
            <option value="">Select…</option>
            {active.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.displayName} · {manager.team}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Players included</span>
        <input
          className="field mt-2"
          placeholder="Jahmyr Gibbs  ·  or  George Kittle <-> Kendrick Bourne"
          value={players}
          onChange={(event) => setPlayers(event.target.value)}
          onBlur={() => touch('players')}
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">Auction dollars by year</span>
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center rounded-md px-2 text-[11.5px] font-semibold tracking-[0.09em] text-arc-green uppercase hover:text-arc-lime"
            onClick={() =>
              setRows((current) => [
                ...current,
                { year: String((Number(current.at(-1)?.year) || season) + 1), amount: '' },
              ])
            }
          >
            + Add year
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                className="field tnum w-28"
                value={row.year}
                min={season}
                max={season + 6}
                onChange={(event) => updateRow(index, { year: event.target.value })}
                onBlur={() => touch('years')}
                aria-label="Season"
              />
              <div className="relative flex-1">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-arc-ink-faint">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="field tnum pl-6"
                  value={row.amount}
                  placeholder="0"
                  min={0}
                  onChange={(event) => updateRow(index, { amount: event.target.value })}
                  onBlur={() => touch('amounts')}
                  aria-label="Amount"
                />
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  className="book-hit mx-1 text-[18px] leading-none text-arc-ink-faint hover:text-[var(--color-arc-red)]"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${row.year}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[12px]">
          <span className="text-arc-ink-faint">Total consideration</span>
          <span className="tnum text-arc-green">{money(total)}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Commissioner note (optional)</span>
          <input
            className="field mt-2"
            placeholder="Context, ROFR history, deadline proximity…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div>
          <span className="label">Files under</span>
          <div className="mt-2 flex min-h-[42px] flex-wrap items-center gap-x-4 gap-y-1">
            <span className="tnum text-[15px] text-arc-ink">{batch}</span>
            <label className="flex items-center gap-2 text-[12.5px] text-arc-ink-soft">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={preseasonDeal}
                onChange={(event) => setPreseasonDeal(event.target.checked)}
              />
              Preseason deal
            </label>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-arc-ink-faint">
            {inPlay
              ? `League time says ${clock.eyebrow.toLowerCase()}. Tick the box if this was struck before the draft.`
              : 'Before kickoff every deal is a preseason deal; untick for one struck during the season.'}
          </p>
        </div>
      </div>

      {shown.length > 0 && (
        <ul className="space-y-1.5 border-l-2 border-arc-line pl-3 text-[12px]" role={submitted ? 'alert' : undefined}>
          {shown.map((issue, index) => (
            <li
              key={index}
              className={
                issue.level === 'error' ? 'text-[var(--color-arc-red)]' : 'text-[var(--color-arc-orange)]'
              }
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-arc-line pt-4">
        <div className="label">Reads as</div>
        <p className="mt-1.5 text-[13px] text-arc-ink-soft italic">{summary}</p>
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] text-[var(--color-arc-red)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canSave ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Recording…' : 'Add to queue'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => void navigator.clipboard.writeText(summary)}
            >
              Copy for the commissioner
            </button>
            <Chip tone="neutral">Read-only — unlock commissioner mode to record</Chip>
          </>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {verdict.triggered && (
          <span className="text-[11.5px] text-arc-ink-faint">
            Anti-dumping applies — it will offer a 24h market check in the queue.
          </span>
        )}
      </div>
    </div>
  )
}
