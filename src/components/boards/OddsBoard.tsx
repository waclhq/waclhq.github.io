import { useEffect, useMemo, useRef, useState } from 'react'
import ManagerTag from '../ManagerTag'
import { Panel, useRevealed } from '../ui'
import { oddsSeed, seededVegasBoard } from '../../lib/boards-odds'
import { pct } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import { animationsDisabled } from '../../lib/motion'
import type { ManagerId, Season } from '../../lib/types'

/**
 * The Vegas board. Seeded by the season, so the +230 a member quotes in the
 * chat is the +230 everyone else sees; "Re-run the sim" walks the same
 * sequence of runs for everyone and replays the rattle. Twelve lines read
 * like a book: badge, name, price, implied probability, and a bar in the
 * manager's colour under each line for the odds you can see from across the
 * room.
 */
export default function OddsBoard({
  id,
  seasons,
  entrants,
  season,
}: {
  id?: string
  seasons: Season[]
  entrants: ManagerId[]
  season: number
}) {
  const [run, setRun] = useState(1)
  const odds = useMemo(
    () => seededVegasBoard(seasons, entrants, oddsSeed(season, run)),
    [seasons, entrants, season, run],
  )
  const top = odds[0]?.probability ?? 0
  const me = useMe()
  const mine = me ? odds.find((row) => row.manager === me) : null
  const stage = useRef<HTMLDivElement>(null)
  const lit = useRevealed(stage)

  return (
    <Panel
      id={id}
      title={`${season} title odds`}
      subtitle={`Monte Carlo on each manager's keeper-era scoring history — 5,000 simulated seasons, no schedules, no mercy. Run 1 is the posted line and is the same for everyone; re-runs replay the sim with fresh dice.${
        mine ? ` You are ${mine.american} (${pct(mine.probability)}).` : ''
      }`}
      action={
        <div className="flex items-center gap-3">
          <span className="label" role="status" aria-live="polite">
            run {run}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => setRun((current) => current + 1)}
            title="Replay the simulation with the next seed"
          >
            Re-run the sim
          </button>
        </div>
      }
    >
      <div
        ref={stage}
        className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {odds.map((row, index) => (
          <div
            key={row.manager}
            className="odds-line flex min-h-[56px] items-center gap-3 border-b border-arc-line/60 px-4 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <ManagerTag id={row.manager} size={24} />
            </span>
            {index === 0 && <span className="tag bg-arc-yellow text-arc-bg">fav</span>}
            <span className="flex shrink-0 items-baseline gap-2">
              <span
                className="tnum text-[17px] font-bold"
                style={{ color: index === 0 ? 'var(--color-arc-yellow)' : 'var(--color-arc-ink)' }}
              >
                <Rattle key={run} text={row.american} delay={index * 55} />
              </span>
              <span className="tnum w-11 text-right text-[11.5px] text-arc-ink-soft">
                {pct(row.probability)}
              </span>
            </span>
            <span
              aria-hidden
              className="odds-bar"
              style={{
                background: managerColor(row.manager),
                ['--p' as string]: lit && top ? (row.probability / top).toFixed(3) : 0,
                ['--d' as string]: `${index * 55}ms`,
              }}
            />
          </div>
        ))}
      </div>
    </Panel>
  )
}

/**
 * A departures-board figure: when first seen, the characters rattle through
 * random digits and settle left to right, like the book updating its lines.
 * Under reduced motion the value simply prints.
 */
export function Rattle({ text, delay = 0 }: { text: string; delay?: number }) {
  const host = useRef<HTMLSpanElement>(null)
  const revealed = useRevealed(host)
  const [shown, setShown] = useState(() => (animationsDisabled() ? text : ''))

  useEffect(() => {
    if (animationsDisabled()) {
      setShown(text)
      return
    }
    if (!revealed) return
    const started = performance.now() + delay
    let frame = 0
    const tick = (now: number) => {
      if (document.hidden) {
        setShown(text)
        return
      }
      const elapsed = now - started
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick)
        return
      }
      // each character locks in 70ms after the one before
      const settled = Math.floor(elapsed / 70)
      if (settled >= text.length) {
        setShown(text)
        return
      }
      let next = text.slice(0, settled)
      for (let i = settled; i < text.length; i += 1) {
        const ch = text[i]
        next += /[0-9]/.test(ch) ? String((Math.random() * 10) | 0) : ch
      }
      setShown(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [revealed, text, delay])

  return (
    <span ref={host} className="tnum">
      {shown || ' '}
    </span>
  )
}
