import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flap } from '../desk/Flap'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { orderedMatchups, pairingKey } from '../../lib/live-view'
import { jumpToMatchup } from './MatchupCard'
import type { LiveMatchupSide, LivePoints, ManagerId } from '../../lib/types'

/**
 * The tote board: every matchup on split-flap cards, the way the Ledger's
 * departures board spells the kickoff. Each matchup is two lines, one per
 * manager with the score beside it, so the cards can be big enough to read
 * on a phone; the leader's line is lit. The cards sit blank until the board
 * scrolls into view, then the scores roll up through the digits to where they
 * stand, and roll on when they change; under reduced motion they simply
 * change. Tap a card to jump to that matchup.
 */
const NAME = 7
const SCORE = 5
/** A blank card, as opposed to a space, which draws a gap. */
const BLANK = '\u00a0'

function Line({ side, name, up, row, seen }: { side: LiveMatchupSide; name: string; up: boolean; row: number; seen: boolean }) {
  const hold = (glyph: string) => (seen || glyph === ' ' ? glyph : BLANK)
  const text = name.toUpperCase().slice(0, NAME).padEnd(NAME, ' ')
  const score = side.total.toFixed(1).padStart(SCORE, ' ')
  // Each line flips on its own short stagger, offset a little per row, so the
  // board settles in about a second.
  return (
    <div className={`lv-tote-line ${up ? 'is-up' : ''}`} style={{ '--c': managerColor(side.manager) } as CSSProperties}>
      <i className="lv-tote-chip" aria-hidden />
      <span className="flap-word lv-tote-name">
        {Array.from(text).map((glyph, g) => (
          <Flap key={g} char={hold(glyph)} index={row + g} size="sm" />
        ))}
      </span>
      <span className="flap-word lv-tote-score">
        {Array.from(score).map((glyph, g) => (
          <Flap key={g} char={hold(glyph)} index={row + NAME + g} size="sm" drum />
        ))}
      </span>
    </div>
  )
}

export default function ToteBoard({ board, me }: { board: LivePoints; me: ManagerId | null }) {
  const { managers } = useLeagueData()
  const rows = orderedMatchups(board, me)
  // Hold the flaps until the board is on screen, so the roll-up is seen.
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(() => animationsDisabled() || typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = ref.current
    if (seen || !node) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [seen, rows.length])
  if (!rows.length) return null
  // Seven cards a name: the display name when it fits, else the first name.
  const short = (id: ManagerId | null) => {
    if (!id) return null
    const display = managerName(managers, id)
    if (display.length <= NAME) return display
    const first = managers.find((m) => m.id === id)?.firstName
    return first && first.length <= NAME ? first : display
  }
  return (
    <div className="lv-tote" ref={ref} aria-label="Every matchup's score">
      {rows.map((m, i) => {
        const [a, b] = m.teams
        const nameA = short(a.manager) ?? a.team
        const nameB = short(b.manager) ?? b.team
        const mine = [a, b].some((t) => t.manager && t.manager === me)
        return (
          <button
            type="button"
            key={`${a.team}|${b.team}`}
            className={`lv-tote-match ${mine ? 'is-mine' : ''}`}
            aria-label={`${nameA} ${a.total.toFixed(1)}, ${nameB} ${b.total.toFixed(1)}. Go to this matchup.`}
            onClick={() => jumpToMatchup(pairingKey(m))}
          >
            <Line side={a} name={nameA} up={a.total > b.total} row={i} seen={seen} />
            <Line side={b} name={nameB} up={b.total > a.total} row={i + 1} seen={seen} />
          </button>
        )
      })}
    </div>
  )
}
