import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { managerName } from '../../lib/data'
import { num, ordinal, record } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { play } from '../../lib/sfx'
import type { Manager, ManagerId, Season } from '../../lib/types'

const REEL = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * The season scrubber. Twenty-two years of the league on one strip: a year
 * that rolls like an odometer, a tick per season in that year's champion's
 * colour, arrows, keyboard, drag, and a roll of champions you can tap. The
 * page below re-sorts itself as the year moves; this is the dial.
 */
export default function SeasonScrubber({
  seasons,
  managers,
  year,
  onChange,
  me,
}: {
  seasons: Season[]
  managers: Manager[]
  year: number
  onChange: (year: number) => void
  me: ManagerId | null
}) {
  const timeline = useMemo(() => [...seasons].sort((a, b) => a.year - b.year), [seasons])
  const last = timeline.length - 1
  const index = Math.max(
    0,
    timeline.findIndex((season) => season.year === year),
  )
  const season = timeline[index]
  const champ = managerColor(season.champion)
  const champName = managerName(managers, season.champion)
  const keeperIndex = timeline.findIndex((season) => season.keeperEra)
  const mine = me ? season.teams.find((team) => team.manager === me) : undefined

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(last, next))
    if (clamped === index) return
    onChange(timeline[clamped].year)
    play('blip')
  }

  // The timeline is one slider: tap anywhere to land on that season, drag to
  // sweep. pan-y in CSS keeps a vertical thumb free to scroll the page.
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const pick = (clientX: number) => {
    const rail = track.current
    if (!rail) return
    const rect = rail.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = (clientX - rect.left) / rect.width
    goTo(Math.floor(ratio * timeline.length))
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    pick(event.clientX)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) pick(event.clientX)
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 5,
      PageDown: -5,
    }
    if (event.key in step) {
      event.preventDefault()
      goTo(index + step[event.key])
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(last)
    }
  }

  // Left and right arrows scrub from anywhere on the page that is not a
  // control of its own. The slider handles its own keys first and marks them
  // handled, so nothing fires twice.
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"], [role="listbox"]',
        )
      ) {
        return
      }
      event.preventDefault()
      goTo(index + (event.key === 'ArrowRight' ? 1 : -1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // The roll keeps its lit chip in view — instantly on arrival, smoothly after.
  const roll = useRef<HTMLDivElement>(null)
  const settled = useRef(false)
  useEffect(() => {
    const rail = roll.current
    if (!rail) return
    const chip = rail.querySelector<HTMLElement>('[aria-current]')
    if (!chip) return
    const left = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2
    rail.scrollTo({ left, behavior: settled.current && !animationsDisabled() ? 'smooth' : 'auto' })
    settled.current = true
  }, [year])

  const runnerUp = season.runnerUp ? managerName(managers, season.runnerUp) : null
  const third = season.thirdPlace ? managerName(managers, season.thirdPlace) : null

  return (
    <section
      className="win scrub pop-in"
      aria-label="Season scrubber"
      style={{ ['--champ' as string]: champ }}
    >
      <div className="scrub-tint" aria-hidden />

      <div className="scrub-head">
        <div className="scrub-dial">
          <button
            type="button"
            className="scrub-arrow"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous season"
          >
            ‹
          </button>
          <RollingYear value={season.year} />
          <button
            type="button"
            className="scrub-arrow"
            onClick={() => goTo(index + 1)}
            disabled={index === last}
            aria-label="Next season"
          >
            ›
          </button>
        </div>

        <div className="scrub-cap" key={season.year}>
          <div className="label">Champion</div>
          <div className="scrub-line scrub-in">
            <Link
              to={`/managers/${season.champion}`}
              className="scrub-champ glint"
              style={{ color: champ, ['--glint-delay' as string]: '1.4s' }}
            >
              {champName}
            </Link>
            {runnerUp && <span className="text-[13px] text-arc-ink-soft">d. {runnerUp}</span>}
            {third && (
              <span className="hidden text-[13px] text-arc-ink-faint sm:inline">· 3rd {third}</span>
            )}
          </div>
          <div className="scrub-meta scrub-in" style={{ animationDelay: '60ms' }}>
            <span>
              {season.teamCount} teams · {season.keeperEra ? 'Keeper era' : 'Pre-keeper era'}
            </span>
            {me && (
              <span className="scrub-you" style={{ ['--c' as string]: managerColor(me) }}>
                <i aria-hidden />
                {mine
                  ? `You finished ${ordinal(mine.rank)} · ${record(mine.wins, mine.losses)} · ${num(mine.avgPointsFor)} PF/gm`
                  : `You were not in the league in ${season.year}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        ref={track}
        className="scrub-track"
        role="slider"
        tabIndex={0}
        aria-label="Season"
        aria-orientation="horizontal"
        aria-valuemin={timeline[0].year}
        aria-valuemax={timeline[last].year}
        aria-valuenow={season.year}
        aria-valuetext={`${season.year}, champion ${champName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        {timeline.map((row, i) => (
          <span
            key={row.year}
            className="scrub-tick"
            data-on={i === index || undefined}
            data-past={i < index || undefined}
            style={{ ['--c' as string]: managerColor(row.champion) }}
            aria-hidden
          >
            <i />
          </span>
        ))}
      </div>

      <div className="scrub-axis" aria-hidden>
        <div className="scrub-years">
          {timeline.map((row, i) => (
            <span
              key={row.year}
              className={
                i === 0 || i === last
                  ? ''
                  : i % 2
                    ? 'invisible lg:visible'
                    : 'invisible sm:visible'
              }
            >
              {row.year}
            </span>
          ))}
        </div>
        {keeperIndex > 0 && (
          <div
            className="scrub-era"
            style={{
              marginLeft: `${(keeperIndex / timeline.length) * 100}%`,
            }}
          >
            <span>keeper era</span>
          </div>
        )}
      </div>

      <div ref={roll} className="scrub-roll" role="group" aria-label="Roll of champions">
        {timeline.map((row, i) => (
          <button
            key={row.year}
            type="button"
            className="scrub-chip"
            aria-current={i === index ? 'true' : undefined}
            aria-label={`${row.year}: ${managerName(managers, row.champion)}${
              row.runnerUp ? ` over ${managerName(managers, row.runnerUp)}` : ''
            }`}
            onClick={() => goTo(i)}
            style={{ ['--c' as string]: managerColor(row.champion) }}
          >
            <span className="scrub-chip-year">{row.year}</span>
            <span className="scrub-chip-name">{managerName(managers, row.champion)}</span>
          </button>
        ))}
      </div>

      <p role="status" className="sr-only">
        {season.year} season: champion {champName}
        {runnerUp ? `, over ${runnerUp}` : ''}.
      </p>
    </section>
  )
}

/**
 * The year as four odometer reels. Each digit column holds a strip of 0–9 and
 * slides to the one showing; a change of year rolls only the digits that
 * changed. On arrival the reels spin up from zero — the board powering on.
 */
function RollingYear({ value }: { value: number }) {
  const [live, setLive] = useState(() => animationsDisabled())
  useEffect(() => {
    if (live) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLive(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [live])

  const digits = String(value).split('')
  return (
    <span className="scrub-year" aria-hidden>
      {digits.map((digit, position) => (
        <span key={position} className="scrub-digit">
          <span
            className="scrub-reel"
            style={{
              transform: `translateY(${live ? -Number(digit) * 10 : 0}%)`,
              transitionDelay: live ? `${position * 45}ms` : '0ms',
            }}
          >
            {REEL.map((glyph) => (
              <span key={glyph}>{glyph}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
