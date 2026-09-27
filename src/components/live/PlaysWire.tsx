import { useState, type CSSProperties } from 'react'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { filterPlays, KIND_LABEL, signed, swingFor, touches, type PlayFilter } from '../../lib/live-view'
import type { LivePointsPlay, ManagerId } from '../../lib/types'

/**
 * The wire: every touchdown, 20-yard play, turnover and sack that moved
 * someone's score, newest first, each tagged with the fantasy swing it
 * caused every owner. Plays that arrived since the last refresh flash once.
 */

const FILTERS: { id: PlayFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'mine', label: 'Mine' },
  { id: 'td', label: 'Touchdowns' },
  { id: 'boom', label: 'Big plays' },
  { id: 'turnover', label: 'Defense' },
]

/** Gamebook text, minus formation noise and the tackler in brackets. */
function clean(text: string): string {
  return text
    .replace(/^\((?:No Huddle,?\s*)?(?:Shotgun|No Huddle)\)\s*/i, '')
    .replace(/\s*\([A-Z]\.[A-Za-z'-]+(?:;\s*[A-Z]\.[A-Za-z'-]+)*\)\.?$/, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

function Icon({ kind }: { kind: LivePointsPlay['kind'] }) {
  if (kind === 'td') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path d="M5 21V4h2v6h10V4h2v17h-2v-9H7v9z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'boom') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'turnover') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path d="M4 7h11l-3-3 1.4-1.4L19 8l-5.6 5.4L12 12l3-3H4zm16 10H9l3 3-1.4 1.4L5 16l5.6-5.4L12 12l-3 3h11z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6z" fill="currentColor" />
    </svg>
  )
}

export default function PlaysWire({
  plays,
  me,
  fresh,
}: {
  plays: LivePointsPlay[]
  me: ManagerId | null
  /** Play ids that arrived since the previous refresh. */
  fresh: Set<string>
}) {
  const { managers } = useLeagueData()
  const [filter, setFilter] = useState<PlayFilter>('all')
  const [shown, setShown] = useState(12)
  const list = filterPlays(plays, filter, me)
  return (
    <div className="lv-wire">
      <div className="lv-chips" role="group" aria-label="Filter plays">
        {FILTERS.filter((f) => f.id !== 'mine' || me).map((f) => (
          <button
            key={f.id}
            type="button"
            className="lv-chip"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id)
              setShown(12)
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className="lv-empty">
          {plays.length === 0
            ? 'Nothing yet. The first touchdown, long gain or pick that touches a roster lands here.'
            : filter === 'mine'
              ? 'Nothing of yours yet. Your players are either not on the field or not doing anything worth writing down.'
              : 'Nothing in this column yet.'}
        </p>
      )}
      <ol className="lv-plays">
        {list.slice(0, shown).map((play) => {
          const mine = touches(play, me)
          const swing = swingFor(play, me)
          return (
            <li key={play.id} className={`lv-play is-${play.kind} ${mine ? 'is-mine' : ''} ${fresh.has(play.id) ? 'is-fresh' : ''}`}>
              <span className="lv-play-icon">
                <Icon kind={play.kind} />
              </span>
              <div className="lv-play-body">
                <div className="lv-play-top">
                  <span className="lv-play-kind">
                    {KIND_LABEL[play.kind]}
                    {play.kind === 'boom' || (play.kind === 'td' && play.yards >= 20) ? ` · ${play.yards} yds` : ''}
                  </span>
                  <span className="label">
                    {play.game} · {play.when}
                  </span>
                </div>
                <p className="lv-play-text">{clean(play.text)}</p>
                <div className="lv-play-hits">
                  {play.hits.map((hit) => (
                    <span
                      key={`${hit.team}-${hit.player}`}
                      className={`lv-hit ${hit.pts >= 0 ? 'is-plus' : 'is-minus'} ${hit.starter ? '' : 'is-bench'}`}
                      style={{ '--c': managerColor(hit.manager) } as CSSProperties}
                    >
                      <b className="tnum">{signed(hit.pts)}</b> {hit.player} · {managerName(managers, hit.manager)}
                      {hit.starter ? '' : ' (bench)'}
                    </span>
                  ))}
                </div>
              </div>
              {mine && swing !== 0 && <span className={`lv-play-swing tnum ${swing > 0 ? 'is-plus' : 'is-minus'}`}>{signed(swing)}</span>}
            </li>
          )
        })}
      </ol>
      {list.length > shown && (
        <button type="button" className="lv-more" onClick={() => setShown((n) => n + 20)}>
          Show {Math.min(20, list.length - shown)} more
        </button>
      )}
    </div>
  )
}
