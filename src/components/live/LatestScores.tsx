import type { CSSProperties } from 'react'
import { useMinuteClock } from '../desk/hooks'
import { managerColor } from '../../lib/identity'
import { fmt } from '../../lib/live-view'
import { usePlayerPick } from './PlayerSheet'
import type { LivePoints, LivePointsMatchup } from '../../lib/types'

/**
 * The matchup's latest scores: the last few changes to either side's
 * starters, newest first, standing still so they can be read. Every change
 * counts, a 12-yard catch as much as a touchdown, each with what moved in
 * the box score and how long ago. The bar and the points are in the colour
 * of the team that got them; anything from the latest update lights once.
 * Tap a row for the player's card.
 */

const SHOW = 4

function ago(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

/** "Tetairoa McMillan" → "T. McMillan"; team defenses keep their name. */
function short(name: string): string {
  const parts = name.split(' ')
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

export default function LatestScores({ board, matchup }: { board: LivePoints; matchup: LivePointsMatchup }) {
  const now = useMinuteClock()
  const pick = usePlayerPick()
  const names = matchup.teams.map((t) => t.team)
  const rows = (board.scores ?? []).filter((s) => s.starter && names.includes(s.team)).slice(0, SHOW)

  if (!rows.length) {
    return (
      <div className="lv-latest is-empty">
        {board.scores ? 'No points on the board in this matchup yet. The latest scores land here.' : 'The latest scores land here from the next update.'}
      </div>
    )
  }

  return (
    <ol className="lv-latest" aria-label="Latest scores in this matchup">
      {rows.map((row) => (
        <li key={`${row.t}-${row.team}-${row.player}`}>
          <button
            type="button"
            className={`lv-latest-row lv-pick ${row.delta < 0 ? 'is-down' : ''} ${row.t === board.updatedAt ? 'is-fresh' : ''}`}
            style={{ '--c': managerColor(row.manager) } as CSSProperties}
            onClick={() => pick(row.player, row.team)}
          >
            <b className="lv-latest-pts tnum">{row.delta > 0 ? `+${fmt(row.delta)}` : `−${fmt(-row.delta)}`}</b>
            <span className="lv-latest-who">
              <span className="lv-latest-name">{short(row.player)}</span>
              <span className="lv-latest-what">{row.what}</span>
            </span>
            <span className="lv-latest-ago tnum">{ago(row.t, now)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
