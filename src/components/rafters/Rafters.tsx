import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import { animationsDisabled } from '../../lib/motion'
import { roman, type Banner } from '../../lib/rafters-history'

/**
 * The rafters. Every title hangs as a pennant in its owner's colour, newest
 * nearest, each on its own slow sway; the one whose season is open below is
 * lifted and lit. A picked seat sees their own banners under a lamp.
 *
 * Motion: the sway is transform-only on the cloth, the lift is a transition
 * on the hanger, and the unfurl on first paint is a one-shot. All three go
 * still under reduced motion (see almanac.css).
 */
export default function Rafters({
  banners,
  current,
  onPick,
}: {
  /** Oldest first, as titleLedger() returns them. */
  banners: Banner[]
  current: number | null
  onPick: (year: number) => void
}) {
  const { managers } = useLeagueData()
  const me = useMe()
  const rail = useRef<HTMLUListElement>(null)
  const firstScroll = useRef(true)
  const [edge, setEdge] = useState({ start: true, end: false })

  const hung = [...banners].reverse()
  const count = hung.length
  const mine = banners.filter((banner) => banner.champion === me)

  // Bring the open season's banner to the middle of the rail. Horizontal only,
  // by hand: scrollIntoView would also drag the page vertically.
  useEffect(() => {
    const list = rail.current
    if (!list || current === null) return
    const slot = list.querySelector<HTMLElement>(`[data-year="${current}"]`)
    if (!slot) return
    const left = slot.offsetLeft - (list.clientWidth - slot.offsetWidth) / 2
    const instant = firstScroll.current || animationsDisabled()
    firstScroll.current = false
    list.scrollTo({ left: Math.max(0, left), behavior: instant ? 'auto' : 'smooth' })
  }, [current])

  // Which end the rail is at, so the pointer nudges only offer a direction
  // that exists.
  useEffect(() => {
    const list = rail.current
    if (!list) return
    const measure = () => {
      const max = list.scrollWidth - list.clientWidth
      const next = { start: list.scrollLeft <= 4, end: list.scrollLeft >= max - 4 }
      setEdge((current) =>
        current.start === next.start && current.end === next.end ? current : next,
      )
    }
    measure()
    list.addEventListener('scroll', measure, { passive: true })
    const watch = new ResizeObserver(measure)
    watch.observe(list)
    return () => {
      list.removeEventListener('scroll', measure)
      watch.disconnect()
    }
  }, [])

  // Roving focus along the beam: one tab stop, arrows walk the banners.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const list = rail.current
    if (!list) return
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>('button.banner'))
    const at = buttons.findIndex((button) => button === document.activeElement)
    if (at < 0) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.min(buttons.length - 1, Math.max(0, at + (event.key === 'ArrowRight' ? 1 : -1)))
    buttons[next]?.focus()
    buttons[next]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: animationsDisabled() ? 'auto' : 'smooth',
    })
  }

  const nudge = (direction: 1 | -1) => {
    const list = rail.current
    if (!list) return
    list.scrollBy({
      left: direction * list.clientWidth * 0.6,
      behavior: animationsDisabled() ? 'auto' : 'smooth',
    })
  }

  const focusYear = current ?? hung[0]?.year

  return (
    <section
      className="rafters -mx-4 sm:-mx-6 lg:-mx-9"
      aria-labelledby="rafters-title"
      data-at-start={edge.start ? '' : undefined}
      data-at-end={edge.end ? '' : undefined}
    >
      <h2 id="rafters-title" className="sr-only">
        Championship banners
      </h2>
      <div className="rafters-beam" aria-hidden />
      <button
        type="button"
        className="rail-nudge rail-nudge-l"
        aria-label="Newer banners"
        onClick={() => nudge(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="rail-nudge rail-nudge-r"
        aria-label="Older banners"
        onClick={() => nudge(1)}
      >
        ›
      </button>
      <ul
        ref={rail}
        className="rafters-rail px-4 sm:px-6 lg:px-9"
        role="list"
        aria-label={`${count} championship banners, newest first`}
        onKeyDown={onKeyDown}
      >
        {hung.map((banner, index) => {
          const age = count > 1 ? index / (count - 1) : 0
          const color = managerColor(banner.champion)
          const name = managerName(managers, banner.champion)
          const isCurrent = banner.year === current
          const isMine = Boolean(me) && banner.champion === me
          // Periods spread across 5–9s from a fixed sequence, phases pushed
          // apart with negative delays: twenty-two banners, no two in step.
          const period = 5 + ((index * 37) % 41) / 10
          const style = {
            '--i': index,
            '--age': age.toFixed(3),
            '--depth': (1 - age * 0.14).toFixed(3),
            '--dim': `${Math.round(age * 22)}%`,
            '--c': color,
            '--sway-dur': `${period.toFixed(1)}s`,
            '--sway-delay': `-${((index * 1.7) % period).toFixed(2)}s`,
            '--amp': index % 2 ? '1.5deg' : '2.2deg',
          } as CSSProperties
          const label = `${banner.year} — ${name}, ${banner.wins}–${banner.losses}${
            banner.nth > 1 ? `, title ${banner.nth}` : ''
          }. ${isCurrent ? 'Season open below.' : 'Open this season.'}`
          return (
            <li
              key={banner.year}
              data-year={banner.year}
              className={`banner-slot ${isCurrent ? 'is-current' : ''} ${isMine ? 'is-mine' : ''}`}
              style={style}
            >
              <button
                type="button"
                className="banner"
                aria-pressed={isCurrent}
                aria-label={label}
                tabIndex={banner.year === focusYear ? 0 : -1}
                onClick={() => onPick(banner.year)}
              >
                <span className="banner-rod" aria-hidden />
                <span className="banner-cloth" aria-hidden>
                  <span className="banner-year">{banner.year}</span>
                  <span className="banner-rule" />
                  <span className="banner-name">{name}</span>
                  <span className="banner-record">
                    {banner.wins}–{banner.losses}
                  </span>
                  {banner.nth > 1 && <span className="banner-nth">Title {roman(banner.nth)}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="rafters-caption px-4 sm:px-6 lg:px-9">
        <span>
          {count} banners, newest nearest. Tap one to open its season.
        </span>
        {me && (
          <span className="rafters-mine">
            {mine.length === 0
              ? 'None with your name on it yet.'
              : `Yours: ${mine.map((banner) => banner.year).join(', ')}.`}
          </span>
        )}
      </div>
    </section>
  )
}
