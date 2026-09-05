import type { ReactNode } from 'react'
import { loserOf, type Bet } from '../../lib/bets'
import { managerColor } from '../../lib/identity'
import { shortDate } from '../../lib/format'
import type { ManagerId } from '../../lib/types'
import { provenance, ticketSerial, type NameOf } from './provenance'
import ShareButton from './ShareButton'

/**
 * A settled bet as the stub you kept: perforated seam between the stake and
 * the story, a sawtooth tear along the bottom, the winner's rubber stamp
 * pressed on askew. Tap it and the receipt tears off underneath — the paper
 * trail and a Share button — so a stub is as linkable as a live slip.
 */
export default function Stub({
  bet,
  index,
  nameOf,
  me,
  open,
  onToggle,
  linked,
  action,
}: {
  bet: Bet
  index: number
  nameOf: NameOf
  me: ManagerId | null
  open: boolean
  onToggle: () => void
  /** Arrived at by link: the stamp flashes once so the eye lands on it. */
  linked: boolean
  /** The commissioner's edit control, rendered beside the story. */
  action?: ReactNode
}) {
  const winner = bet.winner!
  const beaten = loserOf(bet)!
  const winnerColor = managerColor(winner)
  const mine = me !== null && (bet.proposer === me || bet.opponent === me)

  return (
    <div
      className={`stub-wrap scroll-mt-[124px] lg:scroll-mt-[72px] ${linked ? 'is-linked' : ''}`}
      data-bet={bet.id}
      style={{ ['--rot' as string]: `${((index % 3) - 1) * 0.45}deg` }}
    >
      <div className={`stub ${mine ? 'is-me' : ''}`} style={mine ? { ['--me-ring' as string]: managerColor(me) } : undefined}>
        <span className="stub-notch top" aria-hidden />
        <span className="stub-notch bottom" aria-hidden />
        <button
          type="button"
          className="stub-body"
          aria-expanded={open}
          aria-label={`${nameOf(winner)} beat ${nameOf(beaten)}: ${bet.terms} — receipt`}
          onClick={onToggle}
        >
          <span className="stub-stake w-[64px] sm:w-[86px]">
            <span className="text-[11px] tracking-[0.12em] text-arc-ink-faint uppercase">
              {bet.stakeKind === 'cash' ? 'Stake' : 'Forfeit'}
            </span>
            <span
              className={`tnum leading-tight font-bold ${
                bet.stakeKind === 'cash'
                  ? 'text-[19px] text-arc-green'
                  : 'text-[15px] text-[var(--color-arc-orange)]'
              }`}
            >
              {bet.stakeKind === 'cash' ? `$${bet.stake}` : 'DARE'}
            </span>
          </span>
          <span className="stub-story">
            <span className="line-clamp-2 block text-[13.5px] leading-snug text-arc-ink sm:truncate">
              {bet.terms}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-arc-ink-faint sm:truncate">
              <b style={{ color: winnerColor }}>{nameOf(winner)}</b>
              {' beat '}
              {nameOf(beaten)}
              {bet.settledAt ? ` · ${shortDate(bet.settledAt)}` : ''}
              {bet.stakeKind === 'forfeit' && bet.forfeit ? ` · ${bet.forfeit}` : ''}
              {mine && (
                <span className="arcade ml-1.5 text-[12px] whitespace-nowrap text-arc-ink-soft">you</span>
              )}
            </span>
            <span
              className="stamp stamp-in"
              style={{
                color: winnerColor,
                ['--stamp-rot' as string]: `${-11 + (index % 3) * 4}deg`,
                ['--i' as string]: Math.min(index, 8),
              }}
            >
              {nameOf(winner)} ✓
            </span>
          </span>
        </button>
        {action && <span className="mr-2 flex items-center self-center">{action}</span>}
      </div>
      {open && (
        <div className="stub-receipt receipt-in">
          <span className="min-w-0 flex-1">
            <span className="receipt-serial">Ticket {ticketSerial(bet)}</span>
            <span className="block text-[11.5px] leading-snug text-arc-ink-faint">
              {provenance(bet, nameOf)}
            </span>
          </span>
          <ShareButton bet={bet} nameOf={nameOf} className="shrink-0" />
        </div>
      )}
    </div>
  )
}
