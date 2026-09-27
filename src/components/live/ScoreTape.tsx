import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react'
import { managerColor } from '../../lib/identity'
import { fmt } from '../../lib/live-view'
import { useStillness } from '../desk/hooks'
import type { LivePoints, LivePointsMatchup, LivePointsPlay } from '../../lib/types'

/**
 * The matchup's score tape: every play that put points on (or took them off)
 * either side's starters, newest first, running past like a stock ticker.
 * Each chip is in the colour of the team it scored for, so a tape that is
 * all one colour is a beating. Tap to hold it still and read. It only runs
 * while the card is on screen; held still (reduced motion, FX off) it is a
 * strip you scroll.
 */

/** "Tetairoa McMillan" → "T. McMillan"; team defenses keep their name. */
function short(name: string): string {
  const parts = name.split(' ')
  if (parts.length < 2) return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function what(play: LivePointsPlay): string {
  if (play.kind === 'td') return play.yards >= 10 ? `${play.yards}-yd TD` : 'TD'
  if (play.kind === 'boom') return `${play.yards}-yd gain`
  if (play.kind === 'turnover') return /intercept/i.test(play.text) ? 'INT' : /fumble/i.test(play.text) ? 'fumble' : 'turnover'
  if (play.kind === 'sack') return 'sack'
  return 'safety'
}

export default function ScoreTape({ board, matchup }: { board: LivePoints; matchup: LivePointsMatchup }) {
  const still = useStillness()
  const [paused, setPaused] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const teams = matchup.teams.map((t) => t.team)

  const items = useMemo(
    () =>
      (board.plays ?? []).flatMap((play) =>
        play.hits
          .filter((hit) => hit.starter && teams.includes(hit.team) && hit.pts !== 0)
          .map((hit) => ({
            id: `${play.id}-${hit.team}-${hit.player}`,
            color: managerColor(hit.manager),
            pts: hit.pts,
            player: short(hit.player),
            what: what(play),
            when: play.when,
          })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board.plays, teams.join('|')],
  )

  // Run only while the card is on screen.
  useEffect(() => {
    const node = host.current
    if (!node || still) return
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)))
    io.observe(node)
    return () => io.disconnect()
  }, [still, items.length])

  if (!items.length) {
    return <div className="lv-tape is-empty">No scoring plays in this matchup yet. The tape starts with the first one.</div>
  }

  // A short tape repeats so the loop never shows a gap, then doubles for the seamless -50% wrap.
  const base = still ? items : Array.from({ length: Math.ceil(6 / items.length) }, () => items).flat()
  const run = still ? base : [...base, ...base]
  const duration = Math.max(18, base.length * 3.2)

  const handles: HTMLAttributes<HTMLDivElement> = still
    ? { role: 'group', tabIndex: 0, 'aria-label': 'Scoring plays in this matchup, scroll to read' }
    : {
        role: 'button',
        tabIndex: 0,
        'aria-pressed': paused,
        'aria-label': paused ? 'Score tape, paused. Tap to resume' : 'Score tape. Tap to pause',
        onClick: () => setPaused((v) => !v),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setPaused((v) => !v)
          }
        },
      }

  return (
    <div
      ref={host}
      className={`lv-tape marquee-host ${still ? 'is-still' : ''}`}
      data-paused={paused || !onScreen || undefined}
      {...handles}
    >
      <div className="marquee lv-tape-run" style={{ '--marquee-duration': `${duration}s` } as CSSProperties}>
        {run.map((item, i) => (
          <span
            key={`${item.id}-${i}`}
            className={`lv-tape-item ${item.pts > 0 ? 'is-up' : 'is-down'}`}
            style={{ '--c': item.color } as CSSProperties}
            aria-hidden={i >= items.length || undefined}
          >
            <b className="lv-tape-arrow" aria-hidden>
              {item.pts > 0 ? '▲' : '▼'}
            </b>
            <b className="tnum">{item.pts > 0 ? `+${fmt(item.pts)}` : `−${fmt(-item.pts)}`}</b>
            <span>{item.player}</span>
            <span className="lv-tape-what">{item.what}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
