import { Link } from 'react-router-dom'
import { betRecords, sideOf, stakeLabel, type Bet } from '../../lib/bets'
import { money } from '../../lib/format'
import type { Manager, ManagerId } from '../../lib/types'
import { Empty, Panel } from '../ui'
import { ManagerLink } from './ManagerLink'

const ORDER: Record<Bet['status'], number> = { live: 0, proposed: 1, settled: 2, void: 3 }

/**
 * This manager's page of the Book: what is riding, what is open, and how the
 * settled ones went. The full board, and the buttons to add to it, live on
 * /bets; this is the receipt.
 */
export function BookPanel({
  id,
  bets,
  managers,
  delay = 0,
}: {
  id: ManagerId
  /** null while the bets repo is still loading. */
  bets: Bet[] | null
  managers: Manager[]
  delay?: number
}) {
  const name = managers.find((m) => m.id === id)?.displayName ?? id
  const mine = (bets ?? [])
    .filter((bet) => bet.status !== 'void' && sideOf(bet, id))
    .sort(
      (x, y) =>
        ORDER[x.status] - ORDER[y.status] ||
        (y.settledAt ?? y.acceptedAt ?? y.proposedAt).localeCompare(x.settledAt ?? x.acceptedAt ?? x.proposedAt),
    )
  const line = bets ? betRecords(bets).find((row) => row.manager === id) : undefined
  const shown = mine.slice(0, 8)

  const summary = line
    ? `${line.won}–${line.lost} settled · ${money(line.net, { sign: true })} net${
        line.live ? ` · ${line.live} live${line.exposure ? ` for ${money(line.exposure)}` : ''}` : ''
      }`
    : bets
      ? 'No action yet.'
      : 'Reading the Book…'

  return (
    <Panel title="The Book" subtitle={summary} delay={delay} className="lg:self-start">
      {bets && mine.length === 0 ? (
        <Empty kicker="clean sheet">
          No side action on {name}.{' '}
          <Link to="/bets" className="pf-foot-link text-arc-green">
            Propose one →
          </Link>
        </Empty>
      ) : (
        <ul className="pf-book">
          {shown.map((bet) => {
            const other = bet.proposer === id ? bet.opponent : bet.proposer
            const won = bet.status === 'settled' && bet.winner === id
            const lost = bet.status === 'settled' && bet.winner !== null && bet.winner !== id
            return (
              <li key={bet.id} className={`pf-book-row ${bet.status === 'live' ? 'is-live' : ''}`}>
                <div className="pf-book-who">
                  <ManagerLink id={other} face />
                  <span className="pf-book-when">{bet.resolves}</span>
                </div>
                <p className="pf-book-terms">{bet.terms}</p>
                <div className="pf-book-line">
                  {bet.stakeKind === 'cash' ? (
                    <span className="tnum text-[14px] font-semibold text-arc-green">{stakeLabel(bet)}</span>
                  ) : (
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="arcade text-[11px] text-[var(--color-arc-orange)]">Dare</span>
                      <span className="truncate text-[12px] text-arc-ink-soft">{bet.forfeit || 'Forfeit'}</span>
                    </span>
                  )}
                  {bet.status === 'live' && (
                    <span className="pf-book-status is-live">
                      <span className="live-dot" aria-hidden />
                      Live
                    </span>
                  )}
                  {bet.status === 'proposed' && <span className="pf-book-status is-open">Open</span>}
                  {won && <span className="pf-book-status is-won">Won{bet.paidAt ? ' · paid' : ''}</span>}
                  {lost && <span className="pf-book-status is-lost">Lost{bet.paidAt ? ' · paid' : ''}</span>}
                </div>
              </li>
            )
          })}
          {!bets &&
            [0, 1].map((i) => (
              <li key={i} className="pf-book-row is-ghost" aria-hidden>
                <div className="pf-ghost w-24" />
                <div className="pf-ghost mt-2 w-full" />
              </li>
            ))}
        </ul>
      )}
      <div className="border-t border-arc-line px-4 py-3">
        <Link to="/bets" className="label pf-foot-link hover:text-arc-green">
          The Book →{mine.length > shown.length ? ` ${mine.length - shown.length} more` : ''}
        </Link>
      </div>
    </Panel>
  )
}
