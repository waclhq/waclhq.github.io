import type { CSSProperties } from 'react'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { boards, fmt, heat } from '../../lib/live-view'
import { benchCard, ghostCard, starCard } from '../../lib/live-cards'
import ShareCardButton from './ShareCardButton'
import { usePlayerPick } from './PlayerSheet'
import type { LivePoints, ManagerId } from '../../lib/types'

/**
 * Three short boards, in the Lab's voice: the week's best starters, the
 * points that sat on a bench, and the starters who played a full game and
 * gave nothing back.
 */
export default function Leaders({ board, me }: { board: LivePoints; me: ManagerId | null }) {
  const { managers } = useLeagueData()
  const pick = usePlayerPick()
  const { stars, bench, ghosts } = boards(board)
  const column = (
    title: string,
    sub: string,
    rows: ReturnType<typeof boards>['stars'],
    empty: string,
    tone: 'star' | 'bench' | 'ghost',
  ) => (
    <section className={`lv-board is-${tone}`}>
      <div className="lv-board-head">
        <h3 className="lv-board-title">{title}</h3>
        {rows[0] && (
          <ShareCardButton
            label="Share"
            make={() => {
              const nameOf = (id: ManagerId | null) => (id ? managerName(managers, id) : '—')
              const top = { player: rows[0].player, team: rows[0].team }
              return tone === 'star' ? starCard(top, board.week, nameOf) : tone === 'bench' ? benchCard(top, board.week, nameOf) : ghostCard(top, board.week, nameOf)
            }}
            text={`${title}: ${rows[0].player.name}, ${fmt(rows[0].player.pts)}.`}
          />
        )}
      </div>
      <p className="lv-board-sub">{sub}</p>
      {rows.length === 0 ? (
        <p className="lv-empty">{empty}</p>
      ) : (
        <ol>
          {rows.map(({ player, team }, i) => (
            <li
              key={`${team.team}-${player.name}`}
              className={`${team.manager === me && me ? 'is-mine' : ''} ${heat(player) ? `is-${heat(player)}` : ''}`}
              style={{ '--c': managerColor(team.manager) } as CSSProperties}
            >
              <button type="button" className="lv-pick lv-board-row" onClick={() => pick(player.name, team.team)}>
              <span className="lv-board-rank tnum">{i + 1}</span>
              <span className="lv-board-who">
                <span className="lv-board-name">{player.name}</span>
                <span className="lv-board-meta">
                  {managerName(managers, team.manager)} · {player.line || (player.state === 'final' ? 'nothing' : 'just started')}
                </span>
              </span>
              <span className="lv-board-pts tnum">{fmt(player.pts)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
  return (
    <div className="lv-boards">
      {column('Carrying the week', 'Top starters so far.', stars, 'Nobody has scored yet.', 'star')}
      {column('Left on the bench', 'Real points, zero credit.', bench, 'The benches have kept quiet. For now.', 'bench')}
      {column('Ghosts', 'Started, played the whole game, returned three points or fewer.', ghosts, 'No ghosts yet. Give it time.', 'ghost')}
    </div>
  )
}
