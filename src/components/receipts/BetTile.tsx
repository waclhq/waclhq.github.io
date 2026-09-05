import PixelMugshot from '../PixelMugshot'
import { stakeLabel, type Bet, type HeadToHead } from '../../lib/bets'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'
import type { NameOf } from './provenance'
import { tiltHandlers } from './tilt'

/**
 * A matchup slab: square card split on the diagonal, each manager holding
 * their triangle in their own colour with their portrait in the corner, the
 * stake on a ribbon along the bottom. Tap to unfold the full slip.
 *
 * The seat picked on this device gets a thin ring in its colour and a YOU
 * pip, so a member finds their own action on a board of twelve at a glance.
 */
export default function BetTile({
  bet,
  nameOf,
  open,
  onToggle,
  feud,
  coals = false,
  me,
}: {
  bet: Bet
  nameOf: NameOf
  open: boolean
  onToggle: () => void
  /** Three or more settled bets between this pair: the VS pill runs hot. */
  feud: HeadToHead | null
  coals?: boolean
  me: ManagerId | null
}) {
  const [a, b] = [bet.proposer, bet.opponent]
  const [colorA, colorB] = [managerColor(a), managerColor(b)]
  const mine = me !== null && (a === me || b === me)
  const meColor = mine ? managerColor(me) : undefined

  return (
    <button
      type="button"
      className={`bet-tile scroll-mt-[124px] lg:scroll-mt-[72px] ${mine ? 'is-me' : ''}`}
      data-bet={bet.id}
      style={{
        ...(open
          ? { borderColor: colorA, boxShadow: `0 12px 30px rgba(0,0,0,.5), 0 0 16px ${colorB}44` }
          : undefined),
        ...(meColor ? { ['--me-ring' as string]: meColor } : undefined),
      }}
      aria-expanded={open}
      aria-label={`${nameOf(a)} versus ${nameOf(b)}, ${stakeLabel(bet)}${mine ? ' — your bet' : ''} — details`}
      onClick={onToggle}
      {...tiltHandlers}
    >
      <span className="flex h-[3px]">
        <span className="flex-1" style={{ background: colorA }} />
        <span className="flex-1" style={{ background: colorB }} />
      </span>
      <span className="tile-face">
        <span className="tile-half tile-half-a" style={{ ['--half' as string]: `${colorA}2e` }} />
        <span className="tile-half tile-half-b" style={{ ['--half' as string]: `${colorB}2e` }} />
        <span className="tile-seam" aria-hidden />
        <span className="absolute top-[7%] left-[5%] flex w-[38%] flex-col items-start gap-1">
          <span className="tile-mug w-full overflow-hidden rounded-md border border-arc-line">
            <PixelMugshot seed={a} scale={3} />
          </span>
          <span className="arcade max-w-full truncate text-[11px] uppercase" style={{ color: colorA }}>
            {nameOf(a)}
          </span>
        </span>
        <span className="absolute right-[5%] bottom-[6%] flex w-[38%] flex-col items-end gap-1">
          <span className="arcade max-w-full truncate text-[11px] uppercase" style={{ color: colorB }}>
            {nameOf(b)}
          </span>
          <span className="tile-mug w-full overflow-hidden rounded-md border border-arc-line">
            <PixelMugshot seed={b} scale={3} />
          </span>
        </span>
        {mine && (
          <span className="tile-you arcade" style={{ color: meColor, borderColor: meColor }} aria-hidden>
            You
          </span>
        )}
        <span
          className={`tile-vs arcade ${feud ? 'tile-vs-feud' : ''}`}
          title={
            feud
              ? `Blood feud: ${nameOf(feud.a)} ${feud.aWins}–${feud.bWins} ${nameOf(feud.b)}`
              : undefined
          }
          aria-hidden
        >
          VS
        </span>
        {coals && <span className="tile-coals" aria-hidden />}
        <span className="tile-shine" aria-hidden />
      </span>
      <span className="tile-bar">
        {bet.stakeKind === 'cash' ? (
          <span className="tnum min-w-0 flex-1 truncate text-[15px] leading-tight font-semibold text-arc-green">
            {stakeLabel(bet)}
          </span>
        ) : (
          // A dare reads as DARE on the ribbon; the sentence itself lives on
          // the slip, the tape and the label, and on tiles wide enough for it.
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-tight">
            <span className="arcade shrink-0 text-[15px] text-[var(--color-arc-orange)]">Dare</span>
            <span className="hidden min-w-0 truncate text-[11px] text-arc-ink-soft xl:inline">
              {bet.forfeit || 'Forfeit'}
            </span>
          </span>
        )}
        {bet.status === 'live' ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] tracking-[0.14em] whitespace-nowrap text-arc-green uppercase">
            <span className="live-dot" aria-hidden />
            Live
          </span>
        ) : (
          <span className="text-[11px] tracking-[0.14em] text-[var(--color-arc-orange)] uppercase">
            Open
          </span>
        )}
      </span>
    </button>
  )
}
