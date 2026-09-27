import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Mountains from './Mountains'
import ShareCardButton from './ShareCardButton'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { useDialog } from '../../lib/dialog'
import { fmt, recapFacts } from '../../lib/live-view'
import { benchCard, comebackCard, ghostCard, matchupCard, recapCard, starCard, type NameOf } from '../../lib/live-cards'
import type { CardSpec } from '../../lib/live-share'
import type { LivePoints, ManagerId } from '../../lib/types'

/**
 * The week as a story: full-screen slides you tap through, like the ones in
 * everyone's phone already. Results, the blowout and the nail-biter, the
 * comeback, the star, the bench of shame, the ghost, and the mountain range
 * of the day. Every slide has its own share card. Slides advance on their own
 * every six seconds unless motion is off or you are holding a finger down.
 */

interface Slide {
  key: string
  accent: string
  body: ReactNode
  card: CardSpec
  text: string
}

const SLIDE_MS = 6000

export default function Recap({ board, me, onClose }: { board: LivePoints; me: ManagerId | null; onClose: () => void }) {
  const { managers } = useLeagueData()
  const nameOf: NameOf = (id) => (id ? managerName(managers, id) : '—')
  const facts = useMemo(() => recapFacts(board), [board])
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useDialog(panel, onClose, { initialFocus: closeRef })

  const slides: Slide[] = useMemo(() => {
    const list: Slide[] = []
    const green = 'var(--color-arc-green)'
    list.push({
      key: 'intro',
      accent: green,
      card: recapCard(facts, nameOf),
      text: `WACL week ${facts.week} ${facts.done ? 'is in the books' : 'so far'}.`,
      body: (
        <>
          <div className="lv-rc-eyebrow">Week {facts.week} · {facts.done ? 'final' : 'so far'}</div>
          <h2 className="lv-rc-title">The recap</h2>
          <div className="lv-rc-stats">
            <span><b className="tnum">{fmt(facts.totalPoints)}</b> points scored</span>
            <span><b className="tnum">{facts.touchdowns}</b> touchdowns that touched a roster</span>
            {facts.topTeam && <span>Top score: <b>{facts.topTeam.team}</b> {fmt(facts.topTeam.total)}</span>}
          </div>
          <p className="lv-rc-hint">Tap to go on. Hold to pause.</p>
        </>
      ),
    })
    list.push({
      key: 'results',
      accent: green,
      card: recapCard(facts, nameOf),
      text: `WACL week ${facts.week} results.`,
      body: (
        <>
          <div className="lv-rc-eyebrow">{facts.done ? 'Final scores' : 'Where it stands'}</div>
          <ol className="lv-rc-results">
            {facts.results.map((r) => (
              <li key={r.winner.team} className={[r.winner, r.loser].some((t) => t.manager === me && me) ? 'is-mine' : ''}>
                <span style={{ color: managerColor(r.winner.manager) }}>{r.winner.team}</span>
                <b className="tnum">{fmt(r.winner.total)}</b>
                <b className="tnum is-lost">{fmt(r.loser.total)}</b>
                <span className="is-lost">{r.loser.team}</span>
              </li>
            ))}
          </ol>
        </>
      ),
    })
    if (facts.blowout) {
      const r = facts.blowout
      list.push({
        key: 'blowout',
        accent: managerColor(r.winner.manager),
        card: matchupCard(r.matchup, facts.week, nameOf),
        text: `${r.winner.team} by ${fmt(r.margin)}.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">The blowout</div>
            <h2 className="lv-rc-title">{r.winner.team}</h2>
            <div className="lv-rc-big tnum" style={{ color: managerColor(r.winner.manager) }}>+{fmt(r.margin)}</div>
            <p className="lv-rc-line">
              {nameOf(r.winner.manager)} put {fmt(r.winner.total)} on {nameOf(r.loser.manager)}, who managed {fmt(r.loser.total)}.
            </p>
          </>
        ),
      })
    }
    if (facts.nailbiter && facts.nailbiter !== facts.blowout) {
      const r = facts.nailbiter
      list.push({
        key: 'nailbiter',
        accent: 'var(--color-arc-yellow)',
        card: matchupCard(r.matchup, facts.week, nameOf),
        text: `${r.winner.team} by ${fmt(r.margin)}. Nerves.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">The nail-biter</div>
            <h2 className="lv-rc-title">
              {r.winner.team} v {r.loser.team}
            </h2>
            <div className="lv-rc-big tnum" style={{ color: 'var(--color-arc-yellow)' }}>{fmt(r.margin)}</div>
            <p className="lv-rc-line">That is the whole margin. One dropped pass, one stat correction, one very long week.</p>
          </>
        ),
      })
    }
    if (facts.comeback) {
      const c = facts.comeback
      list.push({
        key: 'comeback',
        accent: managerColor(c.result.winner.manager),
        card: comebackCard(c, facts.week, nameOf),
        text: `${c.result.winner.team} came back from ${Math.round(c.low * 100)}%.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">The comeback</div>
            <h2 className="lv-rc-title">{c.result.winner.team}</h2>
            <div className="lv-rc-big tnum" style={{ color: managerColor(c.result.winner.manager) }}>
              {Math.round(c.low * 100)}%
            </div>
            <p className="lv-rc-line">Their odds at the bottom. {nameOf(c.result.winner.manager)} climbed out anyway.</p>
          </>
        ),
      })
    }
    if (facts.star) {
      const s = facts.star
      list.push({
        key: 'star',
        accent: managerColor(s.team.manager),
        card: starCard(s, facts.week, nameOf),
        text: `${s.player.name}: ${fmt(s.player.pts)}.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">Carrying the week</div>
            <h2 className="lv-rc-title">{s.player.name}</h2>
            <div className="lv-rc-big tnum is-fire" style={{ color: managerColor(s.team.manager) }}>{fmt(s.player.pts)}</div>
            <p className="lv-rc-line">{s.player.line}. Started by {nameOf(s.team.manager)}.</p>
          </>
        ),
      })
    }
    if (facts.bench) {
      const b = facts.bench
      list.push({
        key: 'bench',
        accent: 'var(--color-arc-orange)',
        card: benchCard(b, facts.week, nameOf),
        text: `${b.player.name} scored ${fmt(b.player.pts)} on a bench.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">Bench of shame</div>
            <h2 className="lv-rc-title">{b.player.name}</h2>
            <div className="lv-rc-big tnum" style={{ color: 'var(--color-arc-orange)' }}>{fmt(b.player.pts)}</div>
            <p className="lv-rc-line">
              On {nameOf(b.team.manager)}'s bench.{' '}
              {facts.benchTeam && `Worst pine in the league: ${facts.benchTeam.team}, ${fmt(facts.benchTeam.benchTotal)} unused.`}
            </p>
          </>
        ),
      })
    }
    if (facts.ghost) {
      const g = facts.ghost
      list.push({
        key: 'ghost',
        accent: 'var(--color-arc-cyan)',
        card: ghostCard(g, facts.week, nameOf),
        text: `${g.player.name}: ${fmt(g.player.pts)}. Boo.`,
        body: (
          <>
            <div className="lv-rc-eyebrow">Ghost of the week</div>
            <h2 className="lv-rc-title">{g.player.name}</h2>
            <div className="lv-rc-big tnum is-ice">{fmt(g.player.pts)}</div>
            <p className="lv-rc-line">Started by {nameOf(g.team.manager)}. Played a full game. Returned {g.player.line || 'nothing'}.</p>
          </>
        ),
      })
    }
    list.push({
      key: 'mountains',
      accent: 'var(--color-arc-cyan)',
      card: recapCard(facts, nameOf),
      text: `WACL week ${facts.week}: the day in win odds.`,
      body: (
        <>
          <div className="lv-rc-eyebrow">The day in win odds</div>
          <Mountains board={board} me={me} compact />
        </>
      ),
    })
    return list
    // nameOf is derived from managers; rebuilding on board is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, board, me, managers])

  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const auto = !animationsDisabled()

  useEffect(() => {
    if (!auto || held) return
    const timer = window.setTimeout(() => {
      setIndex((i) => (i < slides.length - 1 ? i + 1 : i))
    }, SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [index, held, auto, slides.length])

  const slide = slides[Math.min(index, slides.length - 1)]
  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(slides.length - 1, i + delta)))

  return (
    <div className="lv-recap" role="dialog" aria-modal="true" aria-label={`Week ${facts.week} recap`} ref={panel}>
      <div className="lv-rc-frame" style={{ '--accent': slide.accent } as CSSProperties}>
        <div className="lv-rc-bars" aria-hidden>
          {slides.map((s, i) => (
            <i key={s.key} className={i < index ? 'is-done' : i === index ? (auto && !held ? 'is-now' : 'is-held') : ''} style={{ '--ms': `${SLIDE_MS}ms` } as CSSProperties} />
          ))}
        </div>
        <div className="lv-rc-top">
          <span className="label">WACL · week {facts.week}</span>
          <button ref={closeRef} type="button" className="lv-rc-close" onClick={onClose} aria-label="Close the recap">
            ✕
          </button>
        </div>
        <div
          className="lv-rc-body"
          key={slide.key}
          onPointerDown={() => setHeld(true)}
          onPointerUp={(event) => {
            setHeld(false)
            const rect = event.currentTarget.getBoundingClientRect()
            go(event.clientX - rect.left < rect.width / 3 ? -1 : 1)
          }}
          onPointerLeave={() => setHeld(false)}
        >
          {slide.body}
        </div>
        <div className="lv-rc-foot">
          <button type="button" className="lv-rc-nav" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide">
            ‹
          </button>
          <ShareCardButton make={() => slide.card} text={slide.text} label="Share this" />
          <button type="button" className="lv-rc-nav" onClick={() => (index === slides.length - 1 ? onClose() : go(1))} aria-label={index === slides.length - 1 ? 'Close' : 'Next slide'}>
            {index === slides.length - 1 ? '✓' : '›'}
          </button>
        </div>
      </div>
    </div>
  )
}
