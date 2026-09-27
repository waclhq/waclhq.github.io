import { Flap } from '../desk/Flap'
import { managerName, useLeagueData } from '../../lib/data'
import { orderedMatchups } from '../../lib/live-view'
import type { LivePoints, ManagerId } from '../../lib/types'

/**
 * The tote board: every matchup on split-flap cards, the way the Ledger's
 * departures board spells the kickoff. Scores clack over when they change;
 * under reduced motion they simply change.
 */
const NAME = 6
const SCORE = 5

function cells(text: string, width: number, align: 'left' | 'right') {
  const clipped = text.toUpperCase().slice(0, width)
  return align === 'left' ? clipped.padEnd(width, ' ') : clipped.padStart(width, ' ')
}

export default function ToteBoard({ board, me }: { board: LivePoints; me: ManagerId | null }) {
  const { managers } = useLeagueData()
  const rows = orderedMatchups(board, me)
  if (!rows.length) return null
  // Each row staggers on its own clock, offset a little per row, so the
  // whole board settles in about a second instead of reading row by row.
  let index = 0
  const word = (text: string) => (
    <span className="flap-word">
      {Array.from(text).map((glyph, g) => (
        <Flap key={g} char={glyph} index={index++ % 11} size="sm" />
      ))}
    </span>
  )
  return (
    <div className="lv-tote" role="table" aria-label="Every matchup's score">
      {rows.map((m) => {
        const [a, b] = m.teams
        const nameA = a.manager ? managerName(managers, a.manager) : a.team
        const nameB = b.manager ? managerName(managers, b.manager) : b.team
        const mine = [a, b].some((t) => t.manager && t.manager === me)
        const aUp = a.total > b.total
        const bUp = b.total > a.total
        return (
          <div key={`${a.team}|${b.team}`} role="row" className={`lv-tote-row ${mine ? 'is-mine' : ''}`} aria-label={`${nameA} ${a.total.toFixed(1)}, ${nameB} ${b.total.toFixed(1)}`}>
            <span className={`lv-tote-cell ${aUp ? 'is-up' : ''}`}>{word(cells(nameA, NAME, 'left'))}</span>
            <span className={`lv-tote-cell ${aUp ? 'is-up' : ''}`}>{word(cells(a.total.toFixed(1), SCORE, 'right'))}</span>
            <span className={`lv-tote-cell ${bUp ? 'is-up' : ''}`}>{word(cells(b.total.toFixed(1), SCORE, 'right'))}</span>
            <span className={`lv-tote-cell ${bUp ? 'is-up' : ''}`}>{word(cells(nameB, NAME, 'right'))}</span>
          </div>
        )
      })}
    </div>
  )
}
