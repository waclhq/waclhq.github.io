import { useState } from 'react'
import { Empty, Fold, Panel } from './ui'
import SeatSection, { type Seat } from './ops/SeatSection'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { duesRows, venmoPayUrl, type DuesRow } from '../lib/dues'
import { money } from '../lib/format'
import { plainSaveError } from '../lib/ops-save'
import { useMe } from '../lib/me'
import type { CashFile } from '../lib/types'

/**
 * The dues board as a section of the stands: twelve seats on a curve, each
 * lit in its manager's colour the moment their dues are marked paid. Rows are
 * derived from the cash ledger the commissioner already keeps, so nothing new
 * is maintained — a seat lights when its entry is settled and goes dark again
 * if the payment bounces and the commissioner unticks it.
 */

function overdueNote(row: DuesRow): string {
  if (row.daysOverdue === null) return 'Due before draft night'
  if (row.daysOverdue > 0) return `${row.daysOverdue} day${row.daysOverdue === 1 ? '' : 's'} past due`
  if (row.daysOverdue === 0) return 'Due today'
  const left = Math.abs(row.daysOverdue)
  return `${left} day${left === 1 ? '' : 's'} to pay`
}

export default function DuesBoard({ season }: { season: number }) {
  const { league, managers, cash } = useLeagueData()
  const { commissioner, save } = useLeague()
  const me = useMe()
  const [busy, setBusy] = useState<string | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = duesRows(cash.entries, league, season)
  const byManager = new Map(rows.map((row) => [row.manager, row]))
  const active = managers.filter((manager) => manager.active)
  // Anyone billed who is no longer marked active still gets a seat.
  const extra = rows.filter((row) => !active.some((manager) => manager.id === row.manager))
  const seats: Seat[] = [
    ...active.map((manager) => {
      const row = byManager.get(manager.id)
      return {
        manager: manager.id,
        name: manager.displayName,
        paid: row ? row.settled : null,
        owed: row?.owed ?? 0,
        isMe: manager.id === me,
      }
    }),
    ...extra.map((row) => ({
      manager: row.manager,
      name: managerName(managers, row.manager),
      paid: row.settled,
      owed: row.owed,
      isMe: row.manager === me,
    })),
  ].slice(0, 12)

  const unpaid = rows
    .filter((row) => !row.settled)
    .sort((a, b) => (a.manager === me ? -1 : b.manager === me ? 1 : b.owed - a.owed))
  const paid = rows.filter((row) => row.settled)
  const total = unpaid.reduce((sum, row) => sum + row.owed, 0)
  const caption = `${paid.length} of ${seats.length} paid · ${money(total)} outstanding`

  async function settle(row: DuesRow, settled: boolean) {
    setBusy(row.manager)
    setError(null)
    try {
      await save<CashFile>(
        'cash.json',
        (current) => ({
          ...current,
          entries: current.entries.map((entry) =>
            row.entryIds.includes(entry.id) ? { ...entry, settled } : entry,
          ),
        }),
        `Dues ${settled ? 'settled' : 'reopened'}: ${managerName(managers, row.manager)} (${season})`,
      )
      setLit(settled ? row.manager : null)
    } catch (cause) {
      setError(plainSaveError(cause))
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <Panel title={`${season} dues`}>
        <Empty kicker="no dues yet">
          No dues recorded for {season}. Add them from the Cash tab and the seats light up here.
        </Empty>
      </Panel>
    )
  }

  const board = (
    <>
      <SeatSection
        seats={seats}
        commissioner={commissioner}
        busy={busy}
        lit={lit}
        caption={caption}
        onToggle={(seat) => {
          const row = byManager.get(seat.manager)
          if (row) void settle(row, !row.settled)
        }}
      />

      {unpaid.length > 0 && (
        <ul className="border-t border-arc-line" aria-label="Still owed">
          {unpaid.map((row) => {
            const href = venmoPayUrl(league, row.owed, season)
            const isMe = row.manager === me
            return (
              <li
                key={row.manager}
                className="flex min-h-[52px] items-center gap-3 border-b border-arc-line/40 px-4 py-2 last:border-b-0"
                style={{
                  boxShadow:
                    row.tier === 'delinquent'
                      ? 'inset 3px 0 0 var(--color-arc-red)'
                      : isMe
                        ? `inset 3px 0 0 ${managerColor(row.manager)}`
                        : undefined,
                  background: isMe
                    ? `color-mix(in srgb, ${managerColor(row.manager)} 9%, transparent)`
                    : undefined,
                }}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[14.5px] font-semibold"
                    style={{ color: managerColor(row.manager) }}
                  >
                    {managerName(managers, row.manager)}
                    {isMe && <span className="tag ml-2 text-[9.5px]">you</span>}
                  </span>
                  <span
                    className="block text-[11px] leading-tight"
                    style={{
                      color:
                        row.tier === 'pending'
                          ? 'var(--color-arc-ink-faint)'
                          : 'var(--color-arc-red)',
                    }}
                  >
                    {overdueNote(row)}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px] font-semibold text-arc-red">
                  {money(row.owed)}
                </span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn btn-primary min-h-[40px] shrink-0 px-3.5 py-1 text-[12.5px]"
                    aria-label={`Pay ${money(row.owed)} for ${managerName(managers, row.manager)} on Venmo`}
                  >
                    Pay
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="border-t border-arc-line px-4 py-3 text-[12.5px] text-arc-red">
          {error}
        </p>
      )}
    </>
  )

  // A solved board is a receipt, not a wall: when everyone has paid, the
  // whole thing folds to its conclusion and opens on demand (unticking a
  // bounced payment still lives one tap away).
  if (unpaid.length === 0) {
    return (
      <Fold
        summary={
          <>
            <span className="label">{season} dues</span>
            <span className="arcade text-[13px] text-arc-green">ALL {paid.length} PAID</span>
            <span aria-hidden className="text-arc-green">
              ✓
            </span>
            <span className="hidden text-[12px] text-arc-ink-faint sm:inline">
              The section is lit. Tap to see the seats.
            </span>
          </>
        }
      >
        {board}
      </Fold>
    )
  }

  return (
    <Panel
      title={`${season} dues`}
      subtitle={
        `${money(total)} outstanding across ${unpaid.length} manager${unpaid.length === 1 ? '' : 's'}.` +
        (commissioner
          ? ' Tap a seat when someone pays — tap it again to undo.'
          : ' A seat lights up when its dues are in.')
      }
    >
      {board}
    </Panel>
  )
}
