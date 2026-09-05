import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLeagueData } from '../lib/data'
import { useLedger } from '../lib/derive'
import { money } from '../lib/format'
import { useMe } from '../lib/me'
import { blockLabel, orderBlocks } from '../lib/ops-keepers'
import {
  AUCTION_ROSTER_SPOTS,
  auctionMath,
  readWarRoom,
  sheetFingerprint,
  writeWarRoom,
  type WarRoomState,
} from '../lib/ops-warroom'
import { keeperEligibility } from '../lib/rules'
import ManagerTag from './ManagerTag'
import { Chip } from './ui'

/**
 * Keeper War Room: toggle any combination of a roster's eligible players and
 * watch the draft budget recompute live, traded cash included. Scratchpad
 * only — nothing here writes to the sheet — but the scratchpad survives the
 * night: ticks persist on this device per season and per team, and a seat
 * picked in the menu opens the room on that manager.
 */
export default function WarRoom({ year }: { year: number }) {
  const { league, keepers, managers } = useLeagueData()
  const ledger = useLedger()
  const me = useMe()
  const [params, setParams] = useSearchParams()

  const blocks = useMemo(
    () =>
      orderBlocks(
        (keepers[String(year)] ?? []).filter((block) => block.manager),
        managers,
        me,
      ),
    [keepers, year, managers, me],
  )

  // Memory for this season, hydrated once and re-read when the season moves.
  const [store, setStore] = useState(() => ({ season: year, state: readWarRoom(year) }))
  const state: WarRoomState = store.season === year ? store.state : readWarRoom(year)
  useEffect(() => {
    if (store.season !== year) setStore({ season: year, state: readWarRoom(year) })
  }, [year, store.season])

  const commit = (next: WarRoomState) => {
    setStore({ season: year, state: next })
    writeWarRoom(year, next)
  }

  // Which team is open: the URL wins, then the picked seat, then the last
  // team opened on this device, then the first on the list.
  const has = (id: string | null | undefined) => blocks.some((block) => block.manager === id)
  const teamParam = params.get('team')
  const teamId = has(teamParam)
    ? teamParam!
    : has(me)
      ? me!
      : has(state.team)
        ? state.team!
        : (blocks[0]?.manager ?? null)
  const block = blocks.find((candidate) => candidate.manager === teamId)

  // The sheet is the truth about who is kept; the ending roster is the truth
  // about who is eligible. A player can be on the first and not the second
  // (kept from a trade, or a roster the workbook trimmed), and dropping them
  // made the war room's total contradict the team card on the same page.
  const eligibility = useMemo(() => {
    if (!block) return []
    const rows = keeperEligibility(block)
    const known = new Set(rows.map((row) => row.player.trim().toLowerCase()))
    const offSheet = block.keepers
      .filter((pick) => !known.has(pick.player.trim().toLowerCase()))
      .map((pick) => ({
        player: pick.player,
        cost: pick.salary,
        contractYear: pick.contractYear,
        eligible: true,
        reason: 'On the keeper sheet, not on the ending roster',
        nextYear: pick.contractYear,
      }))
    return [...rows, ...offSheet]
  }, [block])

  if (!block) return null
  const manager = block.manager!
  const sheet = sheetFingerprint(block)
  const slot = state.slots[manager]
  const remembered = slot && slot.sheet === sheet
  const selected = new Set(
    remembered ? slot.ticks : block.keepers.map((pick) => pick.player.toLowerCase()),
  )
  const dirty =
    remembered &&
    (slot.ticks.length !== block.keepers.length ||
      block.keepers.some((pick) => !selected.has(pick.player.toLowerCase())))

  const chooseTeam = (id: string) => {
    setParams(
      (current) => {
        current.set('team', id)
        return current
      },
      { replace: true },
    )
    commit({ ...state, team: id })
  }

  const toggle = (player: string) => {
    const next = new Set(selected)
    const key = player.toLowerCase()
    if (next.has(key)) next.delete(key)
    else next.add(key)
    commit({
      ...state,
      team: manager,
      slots: { ...state.slots, [manager]: { ticks: [...next], sheet } },
    })
  }

  const reset = () => {
    const slots = { ...state.slots }
    delete slots[manager]
    commit({ ...state, slots })
  }

  const chosen = eligibility.filter((spot) => selected.has(spot.player.toLowerCase()))
  const salary = chosen.reduce((total, spot) => total + (spot.cost ?? 5), 0)
  const cashNet = ledger[String(year)]?.[manager]?.net ?? 0
  const budget = league.baseDraftBudget - salary + cashNet
  const overSlots = chosen.length > league.keeperSlots
  const math = auctionMath(budget, chosen.length)
  // A key that changes with every tick, so the readouts re-arrive.
  const tickKey = [...selected].sort().join('|')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-[3px] border-arc-line px-3 py-3 sm:px-4">
        <select
          className="field w-auto max-w-full"
          value={manager}
          onChange={(event) => chooseTeam(event.target.value)}
          aria-label="Team"
        >
          {blocks.map((candidate) => (
            <option key={candidate.team} value={candidate.manager ?? ''}>
              {blockLabel(candidate, managers)}
              {candidate.manager === me ? ' · you' : ''}
            </option>
          ))}
        </select>
        <ManagerTag id={manager} showName={false} />
        {dirty ? (
          <button
            type="button"
            className="btn min-h-[40px] px-3 py-1 text-[12.5px]"
            onClick={reset}
          >
            Reset to sheet
          </button>
        ) : (
          <span className="text-[11.5px] text-arc-ink-faint">As on the sheet</span>
        )}
        <span className="ml-auto text-[11px] text-arc-ink-faint">Ticks are kept on this device</span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_272px]">
        {/* Phone: the four numbers that matter at the table ride under the
            top bar while the thumb works down the list. */}
        <div className="ops-strip lg:hidden" role="status" aria-live="polite">
          <StripCell label="Budget" value={money(budget)} tone={budget < 0 ? 'red' : 'green'} k={tickKey} />
          <StripCell label="Spots left" value={String(math.spots)} k={tickKey} />
          <StripCell label="Avg/slot" value={money(math.avg)} k={tickKey} />
          <StripCell label="Max bid" value={money(math.maxBid)} k={tickKey} />
        </div>

        <div className="lg:max-h-[440px] lg:overflow-y-auto">
          <div className="flex items-center gap-3 border-b border-arc-line px-4 py-1.5">
            <span className="w-4 shrink-0" aria-hidden />
            <span className="label min-w-0 flex-1 text-[11px]">Player</span>
            <span className="label text-[11px]">Cost</span>
            <span className="label w-14 text-right text-[11px]">{year} yr</span>
          </div>
          {eligibility.map((spot) => {
            const key = spot.player.toLowerCase()
            const isOn = selected.has(key)
            return (
              <label
                key={spot.player}
                className={`flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-arc-line/60 px-4 py-2 transition-colors ${
                  isOn ? 'bg-arc-raised' : 'hover:bg-arc-raised/40'
                } ${spot.eligible ? '' : 'cursor-not-allowed'}`}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!spot.eligible}
                  onChange={() => toggle(spot.player)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-arc-green)]"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[14px] ${
                    spot.eligible ? (isOn ? 'text-arc-ink' : 'text-arc-ink-soft') : 'text-arc-ink-faint'
                  }`}
                >
                  {spot.player}
                </span>
                <span
                  className={`tnum text-[13px] ${spot.eligible ? 'text-arc-ink-soft' : 'text-arc-ink-faint'}`}
                >
                  {money(spot.cost ?? 5)}
                </span>
                {spot.eligible ? (
                  <span className="tnum w-14 text-right text-[12px] text-arc-ink-faint">
                    {spot.nextYear}
                  </span>
                ) : (
                  <span className="w-14 text-right">
                    <Chip tone="down">Expired</Chip>
                  </span>
                )}
              </label>
            )
          })}
        </div>

        <aside className="hidden border-l-[3px] border-arc-line p-4 lg:block">
          <div className="label">Draft budget</div>
          <div
            key={`b-${tickKey}`}
            className="ops-tick tnum mt-1 font-display text-[34px] leading-none font-bold italic"
            style={{ color: budget < 0 ? 'var(--color-arc-red)' : 'var(--color-arc-green)' }}
          >
            {money(budget)}
          </div>
          <div className="mt-1.5 text-[11px] leading-relaxed text-arc-ink-faint">
            {money(league.baseDraftBudget)} base − keeper salary ± traded cash.
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-arc-line pt-4">
            <Readout
              label="Keepers picked"
              value={`${chosen.length}/${league.keeperSlots}`}
              tone={overSlots ? 'red' : undefined}
              k={tickKey}
            />
            <Readout label="Keeper salary" value={money(-salary)} k={tickKey} />
            <Readout
              label={`Traded cash (${year})`}
              value={cashNet === 0 ? '$0' : money(cashNet, { sign: true })}
              tone={cashNet > 0 ? 'green' : cashNet < 0 ? 'red' : undefined}
              k={tickKey}
            />
            <Readout label="Spots left" value={String(math.spots)} k={tickKey} />
            <Readout label="Avg / slot" value={money(math.avg)} k={tickKey} />
            <Readout label="Max bid" value={money(math.maxBid)} k={tickKey} />
          </dl>
          {overSlots && (
            <p className="mt-3 text-[12px] text-arc-red" role="alert">
              Over the limit — drop {chosen.length - league.keeperSlots}.
            </p>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-arc-ink-faint">
            Spots left, average and max bid assume a {AUCTION_ROSTER_SPOTS}-man roster with a
            dollar on every open spot. Scratchpad only — the sheet doesn't change.
          </p>
        </aside>
      </div>

      {overSlots && (
        <p className="border-t border-arc-line px-4 py-2 text-[12px] text-arc-red lg:hidden" role="alert">
          {chosen.length}/{league.keeperSlots} keepers — over the limit, drop{' '}
          {chosen.length - league.keeperSlots}.
        </p>
      )}
      <p className="border-t border-arc-line px-4 py-2 text-[11px] leading-relaxed text-arc-ink-faint lg:hidden">
        Spots left, average and max bid assume a {AUCTION_ROSTER_SPOTS}-man roster with a
        dollar on every open spot. Scratchpad only — the sheet doesn't change.
      </p>
    </div>
  )
}

function StripCell({
  label,
  value,
  tone,
  k,
}: {
  label: string
  value: string
  tone?: 'green' | 'red'
  k: string
}) {
  return (
    <div className="min-w-0 px-1 py-2 text-center">
      <div className="label truncate text-[11px] tracking-[0.06em]">{label}</div>
      <div
        key={k}
        className="ops-tick tnum mt-0.5 font-display text-[21px] leading-none font-bold italic"
        style={{
          color:
            tone === 'green'
              ? 'var(--color-arc-green)'
              : tone === 'red'
                ? 'var(--color-arc-red)'
                : 'var(--color-arc-ink)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Readout({
  label,
  value,
  tone,
  k,
}: {
  label: string
  value: string
  tone?: 'green' | 'red'
  k: string
}) {
  return (
    <div className="min-w-0">
      <dt className="label text-[11px]">{label}</dt>
      <dd
        key={k}
        className="ops-tick tnum mt-1 text-[19px] leading-none font-bold"
        style={{
          color:
            tone === 'green'
              ? 'var(--color-arc-green)'
              : tone === 'red'
                ? 'var(--color-arc-red)'
                : 'var(--color-arc-ink)',
        }}
      >
        {value}
      </dd>
    </div>
  )
}
