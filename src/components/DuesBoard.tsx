import { useState } from 'react'
import PixelMugshot from './PixelMugshot'
import { Fold, Panel } from './ui'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { duesRows, venmoPayUrl, type DuesRow } from '../lib/dues'
import { money } from '../lib/format'
import type { CashFile } from '../lib/types'

/**
 * The dues board: good people down one side, delinquents down the other.
 * Rows are derived from the cash ledger the commissioner already keeps, so a
 * manager crosses from right to left the moment their entry is settled.
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
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = duesRows(cash.entries, league, season)
  const unpaid = rows.filter((row) => !row.settled).sort((a, b) => b.owed - a.owed)
  const paid = rows.filter((row) => row.settled)
  const total = unpaid.reduce((sum, row) => sum + row.owed, 0)

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <Panel title={`${season} dues`}>
        <p className="px-5 py-6 text-[13.5px] text-arc-ink-faint italic">
          No dues recorded for {season}. Add them from the Cash tab and they'll appear here.
        </p>
      </Panel>
    )
  }

  const portrait = (row: DuesRow) => (
    <span className="shrink-0 overflow-hidden rounded-md border border-arc-line">
      <PixelMugshot seed={row.manager} scale={1.6} />
    </span>
  )

  /**
   * The commissioner's whole job on this page: tap a box. Checked means paid.
   * The visible box is 24px but the tap target is a full 44px so it works on
   * a phone, and unchecking is how a bounced payment gets reopened.
   */
  const checkbox = (row: DuesRow, checked: boolean) => {
    if (!commissioner) return null
    const saving = busy === row.manager
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Mark ${managerName(managers, row.manager)} as ${checked ? 'unpaid' : 'paid'}`}
        title={checked ? 'Paid — tap to reopen' : 'Tap to check off as paid'}
        disabled={saving}
        onClick={() => void settle(row, !checked)}
        className="group -ml-1.5 grid h-11 w-11 shrink-0 place-items-center"
      >
        <span
          className={`grid h-6 w-6 place-items-center rounded border-2 text-[15px] leading-none transition-colors ${
            checked
              ? 'border-arc-green bg-arc-green text-[#06210a]'
              : 'border-arc-line text-transparent group-hover:border-arc-green group-hover:text-arc-green/40'
          } ${saving ? 'opacity-40' : ''}`}
        >
          ✓
        </span>
      </button>
    )
  }

  const board = (
    <>
      <div className="grid md:grid-cols-2">
        {/* Good people */}
        <div className="border-b border-arc-line md:border-r md:border-b-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-arc-line px-4 py-2.5">
            <span className="arcade text-[15px] text-arc-green">GOOD PEOPLE</span>
            <span className="tnum text-[12px] text-arc-ink-faint">{paid.length}</span>
          </div>
          {paid.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-arc-ink-faint italic">
              Nobody yet. Somebody has to go first.
            </p>
          ) : (
            <ul>
              {paid.map((row) => (
                <li
                  key={row.manager}
                  className="flex items-center gap-3 border-b border-arc-line/40 px-4 py-2.5 last:border-b-0"
                >
                  {checkbox(row, true)}
                  {portrait(row)}
                  <span
                    className="min-w-0 flex-1 truncate text-[15px]"
                    style={{ color: managerColor(row.manager) }}
                  >
                    {managerName(managers, row.manager)}
                  </span>
                  <span className="arcade text-[12px] text-arc-green">PAID</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Delinquents */}
        <div>
          <div className="flex items-baseline justify-between gap-3 border-b border-arc-line px-4 py-2.5">
            <span className="arcade text-[15px] text-[var(--color-arc-red)]">DELINQUENTS</span>
            <span className="tnum text-[12px] text-arc-ink-faint">{unpaid.length}</span>
          </div>
          {unpaid.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-arc-green">
              Nobody owes the league a dime.
            </p>
          ) : (
            <ul>
              {unpaid.map((row) => {
                const href = venmoPayUrl(league, row.owed, season)
                return (
                  <li
                    key={row.manager}
                    className="flex items-center gap-3 border-b border-arc-line/40 px-4 py-2.5 last:border-b-0"
                    style={{
                      boxShadow:
                        row.tier === 'delinquent'
                          ? 'inset 3px 0 0 var(--color-arc-red)'
                          : undefined,
                    }}
                  >
                    {checkbox(row, false)}
                    {portrait(row)}
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[15px]"
                        style={{ color: managerColor(row.manager) }}
                      >
                        {managerName(managers, row.manager)}
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
                    <span className="tnum shrink-0 text-[15px] text-[var(--color-arc-red)]">
                      {money(row.owed)}
                    </span>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="arcade shrink-0 rounded-md px-2.5 py-1 text-[12px]"
                        style={{ background: 'var(--color-arc-green)', color: '#06210a' }}
                      >
                        PAY
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      {error && <p className="px-4 py-3 text-[12px] text-[var(--color-arc-red)]">{error}</p>}
    </>
  )

  // A solved board is a receipt, not a wall: when everyone has paid, the
  // whole thing folds to its conclusion and opens on demand (unticking a
  // bounced payment still lives one tap away).
  if (rows.length > 0 && unpaid.length === 0) {
    return (
      <Fold
        summary={
          <>
            <span className="label">{season} dues</span>
            <span className="arcade text-[13px] text-arc-green">
              ALL {paid.length} PAID
            </span>
            <span aria-hidden className="text-arc-green">
              ✓
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
        (commissioner ? ' Tick a box when someone pays — untick to undo.' : '')
      }
    >
      {board}
    </Panel>
  )
}
