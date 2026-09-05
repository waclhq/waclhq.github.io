import { useMemo, useState } from 'react'
import { useLeague, useLeagueData } from '../lib/data'
import { useLedger } from '../lib/derive'
import { money } from '../lib/format'
import { faabKeeperCost, keeperEligibility } from '../lib/rules'
import type { KeeperBlock, KeeperPick, LeagueData } from '../lib/types'

/**
 * Commissioner editing for one team's keeper list. The commissioner chooses
 * WHO is kept; every dollar and contract year is computed by the rules and
 * shown read-only — roster players carry their draft value (waiver-derived
 * costs are already baked into roster costs by the sheet), typed-in pickups
 * price off the FAAB sliding scale, and an undrafted free agent is the $5
 * floor. Saving replaces the block's keepers and recomputes keeperSalary;
 * draft budgets everywhere follow automatically.
 */
export default function KeeperEditor({
  year,
  block,
  onDone,
}: {
  year: number
  block: KeeperBlock
  onDone: () => void
}) {
  const { league, waivers, faab } = useLeagueData()
  const { save } = useLeague()
  const ledger = useLedger()
  const [picks, setPicks] = useState<KeeperPick[]>(block.keepers.map((pick) => ({ ...pick })))
  const [freeName, setFreeName] = useState('')
  const [busy, setBusy] = useState(false)

  // Saving an identical list still writes a commit, so the audit trail fills
  // with rulings that ruled nothing. Nothing to save until something moved.
  const dirty =
    picks.length !== block.keepers.length ||
    picks.some((pick, index) => {
      const was = block.keepers[index]
      return (
        !was ||
        pick.player !== was.player ||
        pick.salary !== was.salary ||
        pick.contractYear !== was.contractYear
      )
    })

  const eligible = useMemo(() => keeperEligibility(block), [block])
  const taken = new Set(picks.map((pick) => pick.player.trim().toLowerCase()))
  const addable = eligible.filter(
    (spot) => spot.eligible && !taken.has(spot.player.trim().toLowerCase()),
  )

  const totalSalary = picks.reduce((sum, pick) => sum + (pick.salary ?? 0), 0)
  const overSlots = picks.length > league.keeperSlots
  const cashNet = block.manager ? (ledger[String(year)]?.[block.manager]?.net ?? 0) : 0
  const budget = league.baseDraftBudget - totalSalary + cashNet

  function addFromRoster(player: string) {
    const spot = addable.find((candidate) => candidate.player === player)
    if (!spot) return
    setPicks((current) => [
      ...current,
      { player: spot.player, salary: spot.cost ?? 5, contractYear: spot.nextYear },
    ])
  }

  /** Waiver pickups price off the FAAB scale; anyone else is the $5 FA floor. */
  function addFreeAgent() {
    const name = freeName.trim()
    if (!name || taken.has(name.toLowerCase())) return
    const needle = name.toLowerCase()
    const claimed = [
      ...waivers.filter(
        (claim) => claim.season === year - 1 && claim.player.trim().toLowerCase() === needle,
      ),
      ...faab.entries.filter(
        (entry) => entry.season === year - 1 && entry.player.trim().toLowerCase() === needle,
      ),
    ]
    const bid = claimed.length > 0 ? Math.max(...claimed.map((claim) => claim.bid)) : null
    const salary = bid !== null ? faabKeeperCost(bid, league) : 5
    setPicks((current) => [...current, { player: name, salary, contractYear: 'A' }])
    setFreeName('')
  }

  async function commit() {
    setBusy(true)
    try {
      await save<LeagueData['keepers']>(
        'keepers.json',
        (current) => ({
          ...current,
          [String(year)]: (current[String(year)] ?? []).map((candidate) =>
            candidate.team === block.team
              ? {
                  ...candidate,
                  keepers: picks,
                  keeperSalary: picks.reduce((sum, pick) => sum + (pick.salary ?? 0), 0),
                }
              : candidate,
          ),
        }),
        `Keepers updated: ${block.team} (${year})`,
      )
      onDone()
    } catch {
      // The editor stays open with the picks intact; the save strip above
      // the thumb says what went wrong and offers the Retry.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-arc-line bg-arc-bg-deep p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="label">Editing keepers — {year}</span>
        <span
          className={`tnum text-[12.5px] ${overSlots ? 'font-semibold text-arc-red' : 'text-arc-ink-soft'}`}
          role="status"
        >
          {picks.length}/{league.keeperSlots} slots{overSlots ? ' — over the limit' : ''} ·{' '}
          {money(totalSalary)}
        </span>
      </div>

      {picks.length === 0 && (
        <p className="text-[13px] text-arc-ink-faint italic">
          No keepers — add from the roster below.
        </p>
      )}
      {picks.map((pick, index) => (
        <div
          key={`${pick.player}-${index}`}
          className="flex min-h-[40px] items-center gap-2 rounded-lg border border-arc-line/60 bg-arc-panel py-1 pr-1 pl-3 sm:gap-3"
        >
          <span className="min-w-0 flex-1 truncate text-[14px]">{pick.player}</span>
          <span className="tnum w-12 shrink-0 text-right text-[13.5px] text-arc-ink-soft">
            {money(pick.salary)}
          </span>
          <span className="w-5 shrink-0 text-right text-[12px] text-arc-ink-faint">
            {pick.contractYear ?? '—'}
          </span>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[20px] leading-none text-arc-ink-faint transition-colors hover:bg-arc-raised hover:text-arc-red"
            onClick={() => setPicks((current) => current.filter((_, i) => i !== index))}
            aria-label={`Remove ${pick.player}`}
          >
            ×
          </button>
        </div>
      ))}

      <select
        className="field min-h-[40px] w-full"
        value=""
        onChange={(event) => addFromRoster(event.target.value)}
        aria-label="Add keeper from ending roster"
      >
        <option value="">+ Add from {year - 1} roster…</option>
        {addable.map((spot) => (
          <option key={spot.player} value={spot.player}>
            {spot.player} — {money(spot.cost ?? 5)} · year {spot.nextYear}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <input
          className="field min-h-[40px] min-w-0 flex-1"
          placeholder="Player missing from the roster list…"
          value={freeName}
          onChange={(event) => setFreeName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addFreeAgent()
          }}
          aria-label="Player not on the roster list"
        />
        <button
          type="button"
          className="btn min-h-[40px]"
          disabled={!freeName.trim()}
          onClick={addFreeAgent}
        >
          Add
        </button>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-arc-ink-soft">
        <span className="label text-[11px]">Draft budget after save</span>
        <span
          className="tnum text-[16px] font-bold"
          style={{ color: budget < 0 ? 'var(--color-arc-red)' : 'var(--color-arc-green)' }}
        >
          {money(budget)}
        </span>
        <span className="text-[11px] text-arc-ink-faint">
          {money(league.baseDraftBudget)} − {money(totalSalary)}
          {cashNet !== 0 ? ` ${cashNet > 0 ? '+' : '−'} ${money(Math.abs(cashNet))} traded` : ''}
        </span>
      </p>

      {overSlots && (
        <p className="border-l-2 border-arc-orange pl-3 text-[12.5px] leading-snug text-arc-orange">
          {picks.length} keepers exceeds the {league.keeperSlots}-slot limit — saving anyway is a
          commissioner override.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-arc-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !dirty}
          onClick={() => void commit()}
        >
          {busy ? 'Saving…' : 'Save keepers'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onDone}>
          Cancel
        </button>
        <span className="text-[11px] leading-snug text-arc-ink-faint">
          {dirty
            ? "Salaries and contract years follow the league rules and can't be typed over — remove and re-add a player to recompute."
            : 'Nothing to save yet — add or remove a keeper first.'}
        </span>
      </div>
    </div>
  )
}
