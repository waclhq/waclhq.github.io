import { useMemo, useRef, useState } from 'react'
import { betEditOf, type Bet, type BetEdit, type StakeKind } from '../../lib/bets'
import { useDialog } from '../../lib/dialog'
import type { ManagerId } from '../../lib/types'

/**
 * The commissioner's correction desk for one bet.
 *
 * A bet's two halves live in two repos: the terms and the stake in the
 * league-writable bets repo, the winner in the commissioner-only results
 * file. So a commissioner who hasn't entered the league password on this
 * device can still overturn a call — they just can't rewrite the terms or
 * delete the bet until they do, and the panel says so rather than failing at
 * the save.
 */
export default function BetEditor({
  bet,
  sides,
  unlocked,
  busy,
  error,
  onCancel,
  onSave,
  onDelete,
}: {
  bet: Bet
  sides: { id: ManagerId; name: string }[]
  unlocked: boolean
  busy: boolean
  /** Only ever the failure of an action taken inside this editor. */
  error: string | null
  onCancel: () => void
  onSave: (edit: BetEdit, winner: ManagerId | null) => void
  onDelete: () => void
}) {
  const initial = useMemo(() => betEditOf(bet), [bet])
  const [edit, setEdit] = useState<BetEdit>(initial)
  const [stakeText, setStakeText] = useState(String(initial.stake))
  const [winner, setWinner] = useState<ManagerId | null>(bet.winner)
  const [confirming, setConfirming] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  useDialog(frame, onCancel)

  const set = (patch: Partial<BetEdit>) => setEdit((current) => ({ ...current, ...patch }))
  const cash = edit.stakeKind === 'cash'
  const dirty = JSON.stringify(edit) !== JSON.stringify(initial) || winner !== bet.winner
  const ready = Boolean(edit.terms.trim()) && (cash ? edit.stake > 0 : Boolean(edit.forfeit.trim()))

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-arc-bg-deep/85 px-3 py-[6vh] backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={frame}
        className="win rise-in w-full max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit bet — ${sides.map((s) => s.name).join(' v ')}`}
      >
        <div className="win-head">
          <span className="label">Editing a bet — {sides.map((s) => s.name).join(' v ')}</span>
          <button
            type="button"
            className="book-hit text-[18px] leading-none text-arc-ink-faint hover:text-arc-ink"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">The bet</span>
            <input
              className="field mt-1.5"
              value={edit.terms}
              disabled={!unlocked}
              onChange={(event) => set({ terms: event.target.value })}
            />
          </label>

          <label>
            <span className="label">Stake</span>
            <select
              className="field mt-1.5"
              value={edit.stakeKind}
              disabled={!unlocked}
              onChange={(event) => set({ stakeKind: event.target.value as StakeKind })}
            >
              <option value="cash">Cash</option>
              <option value="forfeit">Forfeit / dare</option>
            </select>
          </label>
          {cash ? (
            <label>
              <span className="label">Amount each</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="field tnum mt-1.5"
                value={stakeText}
                disabled={!unlocked}
                onChange={(event) => {
                  setStakeText(event.target.value)
                  const next = Math.round(Number(event.target.value))
                  set({ stake: Number.isFinite(next) ? next : 0 })
                }}
              />
            </label>
          ) : (
            <label>
              <span className="label">Loser must…</span>
              <input
                className="field mt-1.5"
                value={edit.forfeit}
                disabled={!unlocked}
                onChange={(event) => set({ forfeit: event.target.value })}
              />
            </label>
          )}

          <label className="sm:col-span-2">
            <span className="label">Resolves</span>
            <input
              className="field mt-1.5"
              value={edit.resolves}
              disabled={!unlocked}
              onChange={(event) => set({ resolves: event.target.value })}
            />
          </label>

          <div className="sm:col-span-2">
            <span className="label">Winner</span>
            <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Winner">
              {sides.map((side) => (
                <button
                  key={side.id}
                  type="button"
                  className="btn min-h-[40px] px-3 py-1"
                  aria-pressed={winner === side.id}
                  style={
                    winner === side.id
                      ? {
                          borderColor: 'var(--color-arc-green)',
                          background: 'var(--color-arc-green)',
                          color: 'var(--color-arc-bg-deep)',
                        }
                      : undefined
                  }
                  onClick={() => setWinner(side.id)}
                >
                  {side.name}
                </button>
              ))}
              <button
                type="button"
                className="btn min-h-[40px] px-3 py-1"
                aria-pressed={winner === null}
                style={winner === null ? { borderColor: 'var(--color-arc-orange)' } : undefined}
                onClick={() => {
                  setWinner(null)
                  // A live bet has no loser, so it cannot have been paid.
                  set({ paid: false })
                }}
              >
                Nobody yet
              </button>
            </div>
            <p className="mt-2 text-[12px] text-arc-ink-faint">
              {winner === null
                ? 'Clearing the winner puts the bet back on the live board.'
                : 'The result file is the only place a winner can come from, so this is the call of record.'}
            </p>
          </div>

          {/* Nobody has paid up on a bet with no loser yet. */}
          {cash && winner !== null && (
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={edit.paid}
                disabled={!unlocked}
                onChange={(event) => set({ paid: event.target.checked })}
              />
              <span className="text-[13.5px]">
                Loser has paid up
                <span className="block text-[12px] text-arc-ink-faint">
                  Takes it off the tab. Unticking it puts the money back.
                </span>
              </span>
            </label>
          )}
        </div>

        {!unlocked && (
          <p className="border-t border-arc-line px-5 py-3 text-[12.5px] text-[var(--color-arc-orange)]">
            Enter the league password on this device to change the terms, the stake, or to delete
            the bet. The winner can be corrected without it.
          </p>
        )}
        {error && (
          <p role="alert" className="border-t border-arc-line px-5 py-3 text-[12.5px] text-[var(--color-arc-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-arc-line px-5 py-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || !ready || busy}
            onClick={() => onSave(edit, winner)}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {unlocked && (
            <span className="ml-auto flex items-center gap-2">
              {confirming && <span className="text-[12px] text-arc-ink-faint">Wipes it from the record.</span>}
              <button
                type="button"
                className={`btn min-h-[40px] px-3 py-1 ${confirming ? 'btn-danger' : ''}`}
                style={
                  confirming ? undefined : { borderColor: 'var(--color-arc-red)', color: 'var(--color-arc-red)' }
                }
                disabled={busy}
                onClick={() => (confirming ? onDelete() : setConfirming(true))}
              >
                {busy ? 'Working…' : confirming ? 'Delete for good' : 'Delete bet'}
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
