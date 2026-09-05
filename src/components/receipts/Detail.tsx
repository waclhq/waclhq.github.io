import { useEffect, useState, type ReactNode } from 'react'
import FireFrame from '../FireFrame'
import { isNewBet, type Bet } from '../../lib/bets'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'

/**
 * The opened window. The grid row grows downward (0fr to 1fr) while the slip
 * unfolds from its top hinge in perspective; once the growth settles,
 * overflow opens so the border effects can breathe past the edges. Fresh
 * bets burn; standing bets get breathing coals inside a rim of the two
 * managers' colours orbiting the card.
 */
export default function Detail({ bet, children }: { bet: Bet; children: ReactNode }) {
  const still = animationsDisabled()
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>(still ? 'open' : 'closed')
  useEffect(() => {
    if (still) return
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('opening')))
    return () => cancelAnimationFrame(frame)
  }, [still])

  const burning = bet.status === 'live' && isNewBet(bet) && !still

  return (
    <div
      className={`col-span-full slip-reveal ${phase !== 'closed' ? 'is-open' : ''} ${
        phase === 'open' ? 'is-settled' : ''
      }`}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'grid-template-rows') setPhase('open')
      }}
    >
      <div className="slip-reveal-inner">
        <div className={`slip-unfold ${burning ? 'pt-10 pb-5' : ''}`}>
          {burning ? (
            <FireFrame>{children}</FireFrame>
          ) : (
            <span
              className="energy-rim"
              style={{
                ['--ca' as string]: managerColor(bet.proposer),
                ['--cb' as string]: managerColor(bet.opponent),
              }}
            >
              {children}
              {bet.status === 'live' && <span className="tile-coals" aria-hidden />}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
