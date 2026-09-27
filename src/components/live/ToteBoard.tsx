import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Flap } from '../desk/Flap'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { orderedMatchups, pairingKey } from '../../lib/live-view'
import { jumpToMatchup } from './MatchupCard'
import { confetti, flyFootball } from './tote-fx'
import type { LiveMatchupSide, LivePoints, LivePointsMatchup, ManagerId } from '../../lib/types'

/**
 * The tote board, as a primetime open. Every matchup is a card of two lines,
 * each manager's name on split flaps and his score on slot reels, over a bar
 * of his colour filled to his share of the points, so a blowout is one
 * colour and a close game is half and half.
 *
 * The first time the board comes into view on a visit it boots like a
 * broadcast package: the board is dark, floodlights sweep across and each
 * card flickers on, the two lines fly in from opposite edges and slam
 * together, the colours flood out to the split, the reels spin and land left
 * to right, the leaders' scores catch a glint, and your card is picked out.
 *
 * After that it sits still until a score lands. Then the scorer's line
 * flashes, "+6.8" rises out of it and the bar sloshes to the new split; a
 * touchdown sends a football spiralling out of its game in the strip above
 * into the card, bursting into confetti in the scorer's colour; a turnover
 * cracks the line's glass for a second; a lead change flips the whole card
 * over under a LEAD CHANGE stamp. All of it is transform and opacity, all of
 * it one-shot, none of it under reduced motion. Tap a card to jump to that
 * matchup.
 */

const NAME = 7
const SCORE = 5
/** A blank card, as opposed to a space, which draws a gap. */
const BLANK = ' '
/** Boot choreography, seconds: when the lines hit, per card stagger, how long it all runs. */
const IMPACT = 0.65
const STAGGER = 0.07
const BOOT_MS = 3600
/** How long a score moment stays on a card. */
const MOMENT_MS = 2600

type Phase = 'hold' | 'boot' | 'live'
type Kind = 'score' | 'td' | 'turnover'
interface Hit {
  delta: number
  kind: Kind
  nfl: string | null
}
interface Moment {
  id: number
  hits: [Hit | null, Hit | null]
  flip: boolean
}

// Once per visit: coming back to the room doesn't replay the open.
let bootedThisVisit = false
let momentId = 0

/** A score digit on a slot reel. It spins through whole turns on boot, and forward to the next digit after. */
function Reel({ digit, order, phase, delay }: { digit: number; order: number; phase: Phase; delay: number }) {
  const [k, setK] = useState(phase === 'hold' ? 0 : 10 + digit)
  const [moving, setMoving] = useState<{ dur: number; delay: number } | null>(null)
  const shown = useRef(digit)
  const last = useRef(phase)

  useEffect(() => {
    const was = last.current
    last.current = phase
    if (phase === 'hold') return
    if (animationsDisabled()) {
      setMoving(null)
      setK(10 + digit)
      shown.current = digit
      return
    }
    let dur: number
    let wait = 0
    if (was === 'hold') {
      // Boot: two full turns, each reel a little slower than the one before it.
      dur = 0.85 + order * 0.22
      wait = delay
      setK(20 + digit)
    } else {
      if (digit === shown.current) return
      dur = 0.55
      setK(digit > shown.current ? 10 + digit : 20 + digit)
    }
    shown.current = digit
    setMoving({ dur, delay: wait })
    // Once it lands, snap back to the middle turn so the next spin has room to go forward.
    const timer = window.setTimeout(() => {
      setMoving(null)
      setK(10 + digit)
    }, (wait + dur) * 1000 + 80)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit, phase])

  return (
    <span className="lv-reel" aria-hidden>
      <span
        className={`lv-reel-strip ${moving ? 'is-moving' : ''}`}
        style={{ '--k': k, '--dur': `${moving?.dur ?? 0}s`, '--delay': `${moving?.delay ?? 0}s` } as CSSProperties}
      >
        {Array.from({ length: 30 }, (_, n) => (
          <span key={n}>{n % 10}</span>
        ))}
      </span>
    </span>
  )
}

function Line({
  side,
  name,
  up,
  row,
  index,
  phase,
  share,
  hit,
  hitKey,
}: {
  side: LiveMatchupSide
  name: string
  up: boolean
  /** 0 for the top line, 1 for the bottom. */
  row: 0 | 1
  /** The card's place on the board, for the boot stagger. */
  index: number
  phase: Phase
  share: number
  hit: Hit | null
  hitKey: number
}) {
  const hold = (glyph: string) => (phase !== 'hold' || glyph === ' ' ? glyph : BLANK)
  const text = name.toUpperCase().slice(0, NAME).padEnd(NAME, ' ')
  const score = side.total.toFixed(1).padStart(SCORE, ' ')
  const reelDelay = IMPACT + 0.1 + index * STAGGER
  let order = 0
  return (
    <div
      className={`lv-tote-line ${up ? 'is-up' : ''} ${hit ? `is-hit is-${hit.kind}` : ''}`}
      data-row={row}
      style={{ '--c': managerColor(side.manager), '--w': share } as CSSProperties}
    >
      <span className="lv-tote-fill" aria-hidden />
      <span className={`lv-tote-front ${hit ? 'is-slosh' : ''}`} key={`front-${hitKey}`} aria-hidden />
      <i className="lv-tote-chip" aria-hidden />
      <span className="flap-word lv-tote-name">
        {Array.from(text).map((glyph, g) => (
          <Flap key={g} char={hold(glyph)} index={index * 2 + row + g} size="sm" />
        ))}
      </span>
      <span className="lv-tote-score">
        {Array.from(score).map((glyph, g) => {
          if (glyph === ' ') return <span key={g} className="lv-reel-gap" />
          if (glyph === '.') return <span key={g} className="lv-reel is-dot">.</span>
          return <Reel key={g} digit={Number(glyph)} order={order++} phase={phase} delay={reelDelay} />
        })}
      </span>
      {hit && (
        <>
          <b className="lv-tote-pop tnum" key={`pop-${hitKey}`} aria-hidden>
            {hit.delta > 0 ? `+${hit.delta.toFixed(1)}` : `−${Math.abs(hit.delta).toFixed(1)}`}
          </b>
          {hit.kind === 'turnover' && (
            <svg className="lv-tote-crack" key={`crack-${hitKey}`} viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
              <path d="M70 10 L62 4 L55 6 L47 1" />
              <path d="M70 10 L78 3 L86 5 L95 0" />
              <path d="M70 10 L64 15 L57 14 L50 20" />
              <path d="M70 10 L77 16 L88 15 L96 20" />
              <path d="M70 10 L72 20" />
            </svg>
          )}
        </>
      )}
    </div>
  )
}

export default function ToteBoard({ board, me }: { board: LivePoints; me: ManagerId | null }) {
  const { managers } = useLeagueData()
  const rows = orderedMatchups(board, me)
  const ref = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const [phase, setPhase] = useState<Phase>(() => (animationsDisabled() || bootedThisVisit ? 'live' : 'hold'))
  const [moments, setMoments] = useState<Record<string, Moment>>({})

  // Hold the board dark until it's on screen, then run the open once.
  useEffect(() => {
    const node = ref.current
    if (phase !== 'hold' || !node) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        bootedThisVisit = true
        setPhase('boot')
      },
      // Not until its top is in the upper two-thirds of the screen, so the open plays where it can be seen.
      { rootMargin: '0px 0px -35% 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [phase, rows.length])
  useEffect(() => {
    if (phase !== 'boot') return
    const timer = window.setTimeout(() => setPhase('live'), BOOT_MS + rows.length * STAGGER * 1000)
    return () => window.clearTimeout(timer)
  }, [phase, rows.length])

  // Score moments: compare each card with the last update it showed.
  const prev = useRef<Map<string, { a: number; b: number; lead: 0 | 1 | null }>>(new Map())
  useEffect(() => {
    const before = prev.current
    const next = new Map<string, { a: number; b: number; lead: 0 | 1 | null }>()
    const fresh: Record<string, Moment> = {}
    const nflOf = (team: string, player: string) =>
      board.teams.find((t) => t.team === team)?.starters.find((p) => p.name === player)?.nfl ?? null
    const latest = (board.scores ?? []).filter((s) => s.t === board.updatedAt && s.starter)
    for (const m of board.matchups ?? []) {
      const key = pairingKey(m)
      const [a, b] = m.teams
      const lead: 0 | 1 | null = a.total > b.total ? 0 : b.total > a.total ? 1 : null
      next.set(key, { a: a.total, b: b.total, lead })
      const was = before.get(key)
      if (!was || phase !== 'live' || animationsDisabled()) continue
      const hitFor = (side: LiveMatchupSide, delta: number): Hit | null => {
        if (Math.abs(delta) < 0.05) return null
        const mine = latest.filter((s) => s.team === side.team)
        const td = mine.find((s) => s.delta > 0 && /TD/.test(s.what))
        const turnover = mine.find((s) => s.delta < 0 && /INT|fumble lost/.test(s.what))
        const who = td ?? turnover ?? mine[0]
        return { delta, kind: td ? 'td' : turnover ? 'turnover' : 'score', nfl: who ? nflOf(side.team, who.player) : null }
      }
      const hits: [Hit | null, Hit | null] = [hitFor(a, a.total - was.a), hitFor(b, b.total - was.b)]
      const flip = was.lead !== null && lead !== null && was.lead !== lead
      if (hits[0] || hits[1] || flip) fresh[key] = { id: ++momentId, hits, flip }
    }
    prev.current = next
    if (!Object.keys(fresh).length) return
    setMoments((current) => ({ ...current, ...fresh }))
    // Touchdowns: a football from the game in the strip, confetti where it lands.
    for (const [key, moment] of Object.entries(fresh)) {
      const card = cards.current.get(key)
      const m = (board.matchups ?? []).find((x) => pairingKey(x) === key)
      if (!card || !m) continue
      moment.hits.forEach((hit, side) => {
        if (hit?.kind !== 'td') return
        const from = hit.nfl ? document.querySelector(`.lv-game[data-teams~="${hit.nfl}"]`) : null
        flyFootball(from, card, () => confetti(card, managerColor(m.teams[side].manager)))
      })
    }
    const ids = Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, v.id]))
    window.setTimeout(() => {
      setMoments((current) => {
        const out = { ...current }
        for (const [k, id] of Object.entries(ids)) if (out[k]?.id === id) delete out[k]
        return out
      })
    }, MOMENT_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.updatedAt])

  if (!rows.length) return null
  // Seven cards a name: the display name when it fits, else the first name.
  const short = (id: ManagerId | null) => {
    if (!id) return null
    const display = managerName(managers, id)
    if (display.length <= NAME) return display
    const first = managers.find((m) => m.id === id)?.firstName
    return first && first.length <= NAME ? first : display
  }
  const shareOf = (m: LivePointsMatchup): [number, number] => {
    const a = Math.max(0, m.teams[0].total)
    const b = Math.max(0, m.teams[1].total)
    return a + b > 0 ? [a / (a + b), b / (a + b)] : [0.5, 0.5]
  }

  return (
    <div className={`lv-tote is-${phase}`} ref={ref} aria-label="Every matchup's score">
      {phase === 'boot' && (
        <span className="lv-tote-lights" aria-hidden>
          <i className="lv-tote-dark" />
          <i className="lv-tote-beam" />
          <i className="lv-tote-beam is-back" />
        </span>
      )}
      {rows.map((m, i) => {
        const [a, b] = m.teams
        const key = pairingKey(m)
        const nameA = short(a.manager) ?? a.team
        const nameB = short(b.manager) ?? b.team
        const mine = [a, b].some((t) => t.manager && t.manager === me)
        const [sa, sb] = shareOf(m)
        const moment = moments[key]
        const leader = a.total > b.total ? a : b.total > a.total ? b : null
        return (
          <button
            type="button"
            key={`${a.team}|${b.team}`}
            ref={(el) => {
              if (el) cards.current.set(key, el)
              else cards.current.delete(key)
            }}
            className={`lv-tote-match ${mine ? 'is-mine' : ''} ${moment?.flip ? 'is-flip' : ''}`}
            data-flip={moment?.flip ? moment.id : undefined}
            style={{ '--i': i } as CSSProperties}
            aria-label={`${nameA} ${a.total.toFixed(1)}, ${nameB} ${b.total.toFixed(1)}. Go to this matchup.`}
            onClick={() => jumpToMatchup(key)}
          >
            {phase === 'boot' && <span className="lv-tote-shock" aria-hidden />}
            <Line side={a} name={nameA} up={a.total > b.total} row={0} index={i} phase={phase} share={sa} hit={moment?.hits[0] ?? null} hitKey={moment?.id ?? 0} />
            <Line side={b} name={nameB} up={b.total > a.total} row={1} index={i} phase={phase} share={sb} hit={moment?.hits[1] ?? null} hitKey={moment?.id ?? 0} />
            {moment?.flip && leader && (
              <span className="lv-tote-stamp" key={`stamp-${moment.id}`} style={{ '--c': managerColor(leader.manager) } as CSSProperties} aria-hidden>
                Lead change
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
