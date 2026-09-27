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
 * Points a starter banked before the log began (it starts fresh each week,
 * and began mid-afternoon on its first day) fill in below as "earlier" rows
 * with his stat line, so the list always accounts for the score. Tap a row
 * for the player's card.
 */

const SHOW = 4

interface Row {
  key: string
  t: string | null
  team: string
  manager: string | null
  player: string
  delta: number
  what: string
}

function ago(iso: string | null, now: Date): string {
  if (!iso) return 'earlier'
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
  const logged = (board.scores ?? []).filter((s) => s.starter && names.includes(s.team))
  const rows: Row[] = logged.slice(0, SHOW).map((s) => ({ key: `${s.t}-${s.team}-${s.player}`, ...s }))
  if (rows.length < SHOW) {
    // What each starter scored before the log began: his total less what the log saw.
    const seen = new Map<string, number>()
    for (const s of logged) seen.set(`${s.team}|${s.player}`, (seen.get(`${s.team}|${s.player}`) ?? 0) + s.delta)
    const earlier: Row[] = []
    for (const team of board.teams.filter((t) => names.includes(t.team))) {
      for (const p of team.starters) {
        if (p.state !== 'live' && p.state !== 'final') continue
        const rest = Math.round((p.pts - (seen.get(`${team.team}|${p.name}`) ?? 0)) * 100) / 100
        if (Math.abs(rest) < 0.05) continue
        earlier.push({ key: `earlier-${team.team}-${p.name}`, t: null, team: team.team, manager: team.manager, player: p.name, delta: rest, what: p.line || '' })
      }
    }
    earlier.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    rows.push(...earlier.slice(0, SHOW - rows.length))
  }

  if (!rows.length) {
    return <div className="lv-latest is-empty">Nobody in this matchup has scored yet. Their points land here as they come.</div>
  }

  return (
    <ol className="lv-latest" aria-label="Latest scores in this matchup">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            className={`lv-latest-row lv-pick ${row.delta < 0 ? 'is-down' : ''} ${row.t === board.updatedAt ? 'is-fresh' : ''} ${row.t ? '' : 'is-earlier'}`}
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
