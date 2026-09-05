import { Fragment, type ReactNode } from 'react'
import FireFrame from '../FireFrame'
import { isNewBet, type Bet, type HeadToHead } from '../../lib/bets'
import type { ManagerId } from '../../lib/types'
import BetTile from './BetTile'
import Detail from './Detail'
import type { NameOf } from './provenance'
import { useStill } from './useStill'

/** True when the seat picked on this device is on either side of the bet. */
export function isMine(bet: Bet, me: ManagerId | null): boolean {
  return me !== null && (bet.proposer === me || bet.opponent === me)
}

/**
 * The checkerboard. Tiles flow in a dense grid; the open one unfolds the full
 * slip across the next row, app-store style. Your own bets are dealt first,
 * then fresh live bets (which burn), so the fire sits high where it has
 * headroom and your action is never below the fold.
 */
export default function BetBoard({
  bets,
  open,
  onOpen,
  renderSlip,
  nameOf,
  me,
  h2h,
}: {
  bets: Bet[]
  open: string | null
  onOpen: (id: string | null) => void
  /** The full slip for an opened tile, actions included. */
  renderSlip: (bet: Bet) => ReactNode
  nameOf: NameOf
  me: ManagerId | null
  h2h: HeadToHead[]
}) {
  const still = useStill()
  // One fire, always the newest money. Five tiles alight at once is five
  // simulations competing for the same frame — and five things asking for
  // the eye, which is none. The other fresh bets smoulder like the rest.
  const freshest = bets
    .filter((bet) => bet.status === 'live' && isNewBet(bet))
    .sort((x, y) => (y.acceptedAt ?? y.proposedAt).localeCompare(x.acceptedAt ?? x.proposedAt))[0]
  const burning = (bet: Bet) => !still && Boolean(freshest) && bet.id === freshest.id
  const dealt = [...bets].sort(
    (x, y) =>
      Number(isMine(y, me)) - Number(isMine(x, me)) || Number(burning(y)) - Number(burning(x)),
  )
  const feudOf = (bet: Bet) => {
    const pair = h2h.find(
      (row) =>
        (row.a === bet.proposer && row.b === bet.opponent) ||
        (row.a === bet.opponent && row.b === bet.proposer),
    )
    return pair && pair.aWins + pair.bWins >= 3 ? pair : null
  }

  return (
    <div
      className={`grid grid-cols-2 px-5 sm:grid-cols-3 xl:grid-cols-4 ${
        // Room above the top row is the flame's own margin, so the tips taper
        // inside the panel instead of ending on the header's edge; the
        // column gap stays put so the checkerboard keeps one tile size.
        dealt.some(burning) ? 'gap-x-3 gap-y-8 pt-14 pb-8' : 'gap-3 py-5'
      }`}
    >
      {dealt.map((bet) => {
        const tile = (
          <BetTile
            bet={bet}
            nameOf={nameOf}
            open={open === bet.id}
            onToggle={() => onOpen(open === bet.id ? null : bet.id)}
            feud={feudOf(bet)}
            coals={!burning(bet) && bet.status === 'live'}
            me={me}
          />
        )
        return (
          <Fragment key={bet.id}>
            {burning(bet) ? <FireFrame>{tile}</FireFrame> : tile}
            {open === bet.id && (
              <Detail bet={bet} burning={burning(bet)}>
                {renderSlip(bet)}
              </Detail>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
