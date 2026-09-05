import type { ReactNode } from 'react'
import PixelMugshot from '../PixelMugshot'
import BurnAway from '../BurnAway'
import { stakeLabel, type Bet } from '../../lib/bets'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'
import { provenance, ticketSerial, type NameOf } from './provenance'
import ShareButton from './ShareButton'

/** Whose half of which slip is burning away while a ruling lands. */
export interface Pyre {
  betId: string
  loser: ManagerId
  winner: ManagerId
}

export function Face({ id, size = 2, className = '' }: { id: ManagerId; size?: number; className?: string }) {
  return (
    <span className={`shrink-0 overflow-hidden rounded-md border border-arc-line ${className}`}>
      <PixelMugshot seed={id} scale={size} />
    </span>
  )
}

/**
 * A matchup card in the sportsbook idiom: the two managers as opposing sides
 * under their own colours, the stake as a big tile, action beneath — and
 * along the bottom the receipt: ticket number, the paper trail, and a Share
 * button, so every bet is something you can hand someone.
 */
export default function Slip({
  bet,
  nameOf,
  me,
  pyre,
  error,
  onClose,
  children,
}: {
  bet: Bet
  nameOf: NameOf
  me: ManagerId | null
  pyre: Pyre | null
  /** The failure of the last action on this slip, if any. */
  error?: string | null
  onClose?: () => void
  children?: ReactNode
}) {
  const won = (id: ManagerId) => bet.status === 'settled' && bet.winner === id
  const lost = (id: ManagerId) => bet.status === 'settled' && bet.winner !== null && !won(id)
  const halves = [bet.proposer, bet.opponent] as const
  const flooding = (id: ManagerId) => pyre?.betId === bet.id && pyre.winner === id

  return (
    <div className="overflow-hidden rounded-xl border border-arc-line bg-arc-panel transition-colors hover:border-arc-ink-faint">
      {/* team colours across the top, like a game card */}
      <div className="flex h-1">
        {halves.map((id) => (
          <span key={id} className="flex-1" style={{ background: managerColor(id) }} />
        ))}
      </div>

      <div className="relative flex items-stretch">
        {halves.map((id, i) => (
          <div
            key={id}
            className={`relative flex flex-1 items-center gap-2 p-2.5 sm:gap-2.5 sm:p-3 ${i ? 'flex-row-reverse text-right' : ''} ${
              flooding(id) ? 'win-flood' : ''
            }`}
            style={{
              opacity: lost(id) ? 0.45 : 1,
              ['--flood' as string]: flooding(id) ? `${managerColor(id)}2e` : undefined,
            }}
          >
            {pyre?.betId === bet.id && pyre.loser === id && <BurnAway />}
            <Face id={id} className="slip-face" />
            <span className="min-w-0">
              <span
                className="block truncate text-[14px] leading-tight sm:text-[15px]"
                style={{ color: managerColor(id) }}
              >
                {nameOf(id)}
                {id === me && (
                  <span className="arcade ml-1.5 align-middle text-[11px] text-arc-ink-soft">you</span>
                )}
              </span>
              {won(id) ? (
                <span className="arcade text-[11px] text-arc-green">WON</span>
              ) : i === 0 ? (
                <span className="arcade text-[11px] text-arc-ink-faint">called it</span>
              ) : null}
            </span>
          </div>
        ))}
        <span className="arcade absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-arc-line bg-arc-bg px-2 py-0.5 text-[11px] text-arc-ink-faint">
          VS
        </span>
      </div>

      <p className="px-3 pb-3 text-[14px] leading-snug text-arc-ink">
        {bet.terms}
        {bet.stakeKind === 'forfeit' && (
          <span className="mt-1 block text-[12.5px] leading-snug text-[var(--color-arc-orange)]">
            Loser must {bet.forfeit || 'pay a forfeit'}.
          </span>
        )}
      </p>

      <div className="flex items-stretch border-t border-arc-line">
        <div className="flex min-w-[104px] flex-col justify-center border-r border-arc-line px-3 py-2">
          <span className="text-[11px] tracking-[0.14em] text-arc-ink-faint uppercase">
            {bet.stakeKind === 'cash' ? 'Each' : 'Forfeit'}
          </span>
          <span
            className={`tnum text-[20px] leading-tight ${
              bet.stakeKind === 'cash' ? 'text-arc-green' : 'arcade text-[var(--color-arc-orange)]'
            }`}
          >
            {bet.stakeKind === 'cash' ? stakeLabel(bet) : 'DARE'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-2">
          {bet.resolves && <span className="text-[11px] text-arc-ink-faint">{bet.resolves}</span>}
          {children}
          {onClose && (
            <button
              type="button"
              className="book-hit ml-auto text-[18px] leading-none text-arc-ink-faint hover:text-arc-ink"
              onClick={onClose}
              aria-label="Collapse"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-arc-line px-3 py-2 text-[12.5px] leading-snug text-[var(--color-arc-red)]"
        >
          {error}
        </p>
      )}

      {/* The receipt: the strip that ends the argument. */}
      <div className="receipt-strip">
        <span className="min-w-0 flex-1">
          <span className="receipt-serial">Ticket {ticketSerial(bet)}</span>
          <span className="block text-[11.5px] leading-snug text-arc-ink-faint">{provenance(bet, nameOf)}</span>
        </span>
        <ShareButton bet={bet} nameOf={nameOf} className="shrink-0" />
      </div>
    </div>
  )
}
