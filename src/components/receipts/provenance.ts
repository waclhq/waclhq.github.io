import { stakeLabel, type Bet } from '../../lib/bets'
import type { ManagerId } from '../../lib/types'

/**
 * The paper trail on a slip. Every bet already carries its timestamps; this
 * turns them into the one line that ends an argument — who offered it, when
 * it was taken, when it was called — and the address that points at it.
 */

export type NameOf = (id: ManagerId | null | undefined) => string

/** "Sep 3" this year, "Sep 3, 2025" for anything older. */
export function tinyDate(iso: string | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Offered by Bernstein · Sep 3 · taken Sep 4 · called Jul 17 · paid Aug 1 */
export function provenance(bet: Bet, nameOf: NameOf): string {
  const parts: string[] = []
  const offered = tinyDate(bet.proposedAt)
  parts.push(`Offered by ${nameOf(bet.proposer)}${offered ? ` · ${offered}` : ''}`)
  if (bet.status === 'proposed') {
    parts.push(`waiting on ${nameOf(bet.opponent)}`)
  } else {
    const taken = tinyDate(bet.acceptedAt)
    parts.push(taken ? `taken ${taken}` : `taken by ${nameOf(bet.opponent)}`)
  }
  if (bet.status === 'settled') {
    const called = tinyDate(bet.settledAt)
    parts.push(called ? `called ${called}` : 'called')
    const paid = tinyDate(bet.paidAt)
    if (paid) parts.push(`paid ${paid}`)
  }
  if (bet.lastTouchedBy) parts.push(`via ${bet.lastTouchedBy}`)
  return parts.join(' · ')
}

/** The stub number printed on the ticket: the tail of the id, upper-case. */
export function ticketSerial(bet: Bet): string {
  const tail = bet.id.replace(/[^a-z0-9]/gi, '').slice(-5)
  return (tail || bet.id).toUpperCase()
}

/** Absolute address that opens this slip: /#/bets?bet=<id>. */
export function betLink(id: string): string {
  const url = new URL(window.location.href)
  url.hash = `/bets?bet=${encodeURIComponent(id)}`
  return url.toString()
}

/** What goes in the share sheet next to the link. */
export function shareText(bet: Bet, nameOf: NameOf): string {
  const who = `${nameOf(bet.proposer)} v ${nameOf(bet.opponent)}`
  const stake = bet.stakeKind === 'cash' ? `${stakeLabel(bet)} each` : `loser must ${stakeLabel(bet)}`
  const state =
    bet.status === 'settled' && bet.winner
      ? `${nameOf(bet.winner)} won.`
      : bet.status === 'live'
        ? 'Live.'
        : 'On the table.'
  return `${who} — "${bet.terms}" — ${stake}. ${state}`
}
