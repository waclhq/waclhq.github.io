import type { LivePointsPlayer } from '../../lib/types'

/**
 * The small box above a player's points: LIVE while his game is on, FINAL
 * once it's over, nothing before kickoff. Static on purpose: a page can have
 * thirty players live at once, and thirty pulsing dots is exactly what the
 * phone audit took out.
 */
export default function StateTag({ player }: { player: LivePointsPlayer }) {
  if (player.state === 'live') {
    return (
      <span className="lv-state is-live">
        <i aria-hidden /> Live
      </span>
    )
  }
  if (player.state === 'final') return <span className="lv-state is-final">Final ✓</span>
  return null
}
