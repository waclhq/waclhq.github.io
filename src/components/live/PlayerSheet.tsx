import { createContext, useCallback, useContext, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { useDialog } from '../../lib/dialog'
import { playerSlug } from '../../lib/search'
import { fmt, gameClock, heat, inRedZone, KIND_LABEL, onField, redZoneTeams, sidesOnField, signed } from '../../lib/live-view'
import Football from './Football'
import type { LivePoints, LivePointsPlayer, LivePointsTeam } from '../../lib/types'

/**
 * Tap any player in the Live room (or the Ledger's live panel) and his card
 * slides up: the box-score line, how his fantasy points were built under the
 * league's rules, his projection, any bonus he's chasing, and the week's big
 * plays he was part of. One provider per page holds which player is open.
 */

type Open = (player: string, team: string) => void
const PickContext = createContext<Open>(() => undefined)

/** The opener; a no-op outside a provider, so components stay usable anywhere. */
export function usePlayerPick(): Open {
  return useContext(PickContext)
}

export function PlayerSheetProvider({ board, children }: { board: LivePoints | null; children: ReactNode }) {
  const [open, setOpen] = useState<{ player: string; team: string } | null>(null)
  const pick = useCallback<Open>((player, team) => setOpen({ player, team }), [])
  const found = useMemo(() => {
    if (!board || !open) return null
    const team = board.teams.find((t) => t.team === open.team)
    if (!team) return null
    const player = [...team.starters, ...team.bench].find((p) => p.name === open.player)
    return player ? { team, player } : null
  }, [board, open])
  return (
    <PickContext.Provider value={pick}>
      {children}
      {board && found && <PlayerSheet board={board} team={found.team} player={found.player} onClose={() => setOpen(null)} />}
    </PickContext.Provider>
  )
}

/** Box-score columns worth showing for what this player actually did. */
function statBlocks(player: LivePointsPlayer) {
  const s = player.stats ?? {}
  const n = (key: string) => s[key] ?? 0
  const blocks: { title: string; cells: [string, string][] }[] = []
  if (player.pos === 'DEF') {
    blocks.push({
      title: 'Defense',
      cells: [
        ['PA', String(n('allowed'))],
        ['SACK', String(n('sacks'))],
        ['INT', String(n('int'))],
        ['FR', String(n('fumRec'))],
        ['TD', String(n('td'))],
        ['SAF', String(n('safety'))],
      ],
    })
    return blocks
  }
  if (n('att') || n('passYds') || player.pos === 'QB') {
    blocks.push({
      title: 'Passing',
      cells: [
        ['C/ATT', `${n('comp')}/${n('att')}`],
        ['YDS', String(n('passYds'))],
        ['TD', String(n('passTD'))],
        ['INT', String(n('int'))],
        ['SCK', String(n('sacked'))],
      ],
    })
  }
  if (n('car') || n('rushYds') || player.pos === 'RB' || player.pos === 'QB') {
    blocks.push({
      title: 'Rushing',
      cells: [
        ['CAR', String(n('car'))],
        ['YDS', String(n('rushYds'))],
        ['AVG', n('car') ? (n('rushYds') / n('car')).toFixed(1) : '–'],
        ['TD', String(n('rushTD'))],
        ['LONG', String(n('longRush'))],
      ],
    })
  }
  if (n('rec') || n('tgt') || n('recYds') || player.pos === 'WR' || player.pos === 'TE' || player.pos === 'RB') {
    blocks.push({
      title: 'Receiving',
      cells: [
        ['REC', n('tgt') ? `${n('rec')}/${n('tgt')}` : String(n('rec'))],
        ['YDS', String(n('recYds'))],
        ['AVG', n('rec') ? (n('recYds') / n('rec')).toFixed(1) : '–'],
        ['TD', String(n('recTD'))],
        ['LONG', String(n('longRec'))],
      ],
    })
  }
  const other: [string, string][] = []
  if (n('retTD')) other.push(['RET TD', String(n('retTD'))])
  if (n('fumLost')) other.push(['FUM LOST', String(n('fumLost'))])
  if (n('twoPt') + n('passTwoPt')) other.push(['2-PT', String(n('twoPt') + n('passTwoPt'))])
  if (other.length) blocks.push({ title: 'Other', cells: other })
  return blocks
}

function PlayerSheet({
  board,
  team,
  player,
  onClose,
}: {
  board: LivePoints
  team: LivePointsTeam
  player: LivePointsPlayer
  onClose: () => void
}) {
  const { managers } = useLeagueData()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useDialog(panel, onClose, { initialFocus: closeRef })

  const starter = player.slot !== 'BN' && player.slot !== 'IR'
  const flame = heat(player)
  const hot = inRedZone(player, redZoneTeams(board))
  const ball = onField(player, sidesOnField(board))
  const played = player.state === 'live' || player.state === 'final'
  const plays = (board.plays ?? []).filter((play) => play.hits.some((h) => h.player === player.name && h.team === team.team))
  const chase = (board.chases ?? []).find((c) => c.player === player.name && c.team === team.team)
  const banked = (board.milestones ?? []).filter((m) => m.player === player.name && m.team === team.team)
  const color = managerColor(team.manager)
  const blocks = played ? statBlocks(player) : []

  return (
    <div className="lv-sheet-wrap" onClick={onClose}>
      <div
        ref={panel}
        className="lv-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name}: ${fmt(player.pts)} points`}
        onClick={(event) => event.stopPropagation()}
        style={{ '--c': color } as CSSProperties}
      >
        <div className="lv-sheet-grab" aria-hidden />
        <div className="lv-sheet-head">
          <div className="min-w-0">
            <div className="label lv-sheet-eyebrow">
              {player.pos} · {player.nfl} {player.opp ?? ''} · {gameClock(player)}
              {player.status && <span className="lv-sheet-status">{player.status}</span>}
              {hot ? (
                <span className="lv-rz-chip">Red zone</span>
              ) : ball ? (
                <span className="lv-field-chip">
                  <Football /> {player.pos === 'DEF' ? 'Defending' : 'On the field'}
                </span>
              ) : null}
            </div>
            <h2 className="lv-sheet-name">{player.name}</h2>
            <div className="lv-sheet-owner">
              <i style={{ background: color }} aria-hidden />
              {managerName(managers, team.manager)} · {team.team} ·{' '}
              {starter ? `starting at ${player.slot === 'W/R/T' ? 'FLEX' : player.slot}` : player.slot === 'IR' ? 'on IR' : 'on the bench'}
            </div>
          </div>
          <button ref={closeRef} type="button" className="lv-sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="lv-sheet-score">
          <div className={`lv-sheet-pts tnum ${flame || hot ? 'is-fire' : ''}`}>{played ? fmt(player.pts) : '–'}</div>
          <div className="lv-sheet-proj">
            <span>
              projected <b className="tnum">{fmt(player.proj ?? player.pts)}</b>
            </span>
            <span>
              {player.state === 'pre'
                ? `kicks off ${gameClock(player)}`
                : player.state === 'bye'
                  ? 'no game this week'
                  : player.state === 'live'
                    ? `${Math.round((1 - (player.left ?? 0)) * 100)}% of the game played`
                    : 'game over'}
            </span>
            {!starter && played && player.pts > 0 && <span className="lv-sheet-bench">None of it counts: benched.</span>}
          </div>
        </div>

        {blocks.map((block) => (
          <div key={block.title} className="lv-sheet-block">
            <div className="label">{block.title}</div>
            <div className="lv-sheet-cells" style={{ '--n': block.cells.length } as CSSProperties}>
              {block.cells.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b className="tnum">{v}</b>
                </div>
              ))}
            </div>
          </div>
        ))}

        {played && (player.breakdown?.length ?? 0) > 0 && (
          <div className="lv-sheet-block">
            <div className="label">How the points add up</div>
            <ul className="lv-sheet-sum">
              {player.breakdown!.map(([label, pts]) => (
                <li key={label}>
                  <span>{label}</span>
                  <b className={`tnum ${pts < 0 ? 'is-minus' : ''}`}>{signed(pts)}</b>
                </li>
              ))}
              <li className="is-total">
                <span>Total</span>
                <b className="tnum">{fmt(player.pts)}</b>
              </li>
            </ul>
          </div>
        )}

        {played && !player.breakdown?.length && player.pos !== 'DEF' && (
          <p className="lv-empty">{player.state === 'final' ? 'No stats: not a single recorded play.' : 'Nothing on the stat sheet yet.'}</p>
        )}

        {(chase || banked.length > 0) && (
          <div className="lv-sheet-block">
            <div className="label">Bonus</div>
            {banked.map((m) => (
              <p key={m.stat} className="lv-sheet-bonus">
                Banked the {m.label} bonus: <b>+{m.pts}</b>
              </p>
            ))}
            {chase && (
              <div className="lv-sheet-chase" style={{ '--got': Math.min(1, chase.have / (chase.at ?? 100)) } as CSSProperties}>
                <span>
                  {chase.have}/{chase.at} toward the {chase.label} bonus (+{chase.pts})
                </span>
                <i aria-hidden>
                  <b />
                </i>
              </div>
            )}
          </div>
        )}

        {plays.length > 0 && (
          <div className="lv-sheet-block">
            <div className="label">Big plays this week</div>
            <ul className="lv-sheet-plays">
              {plays.slice(0, 6).map((play) => {
                const hit = play.hits.find((h) => h.player === player.name && h.team === team.team)!
                return (
                  <li key={play.id}>
                    <span className={`lv-sheet-kind is-${play.kind}`}>{KIND_LABEL[play.kind]}</span>
                    <span className="lv-sheet-playtext">
                      {play.when} · {play.text.replace(/^\((?:No Huddle,?\s*)?(?:Shotgun|No Huddle)\)\s*/i, '')}
                    </span>
                    <b className={`tnum ${hit.pts < 0 ? 'is-minus' : ''}`}>{signed(hit.pts)}</b>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {player.pos !== 'DEF' && (
          <Link to={`/players/${playerSlug(player.name)}`} className="lv-sheet-link no-underline" onClick={onClose}>
            His WACL history: every team, every contract →
          </Link>
        )}
      </div>
    </div>
  )
}
