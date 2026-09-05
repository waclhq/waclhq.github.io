import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animationsDisabled } from '../lib/motion'

/**
 * True once the element has entered the viewport. Drives every one-shot
 * reveal — bars growing, the on-air sweep — so data animates when seen,
 * not when mounted three screens below the fold.
 */
export function useRevealed<T extends Element>(ref: React.RefObject<T | null>): boolean {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (animationsDisabled()) {
      setRevealed(true)
      return
    }
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return revealed
}

/**
 * FLIP for a re-sorting list: rows carry data-flip keys, and when an update
 * moves one, it slides from where it was to where it is. Watching the table
 * reshuffle when the era toggle flips IS the content — teleporting rows
 * throw that information away.
 */
export function useFlipList<T extends HTMLElement>(ref: React.RefObject<T | null>): void {
  const previous = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-flip]'))
    const next = new Map<string, number>()
    for (const row of rows) next.set(row.dataset.flip!, row.getBoundingClientRect().top)
    if (!animationsDisabled()) {
      for (const row of rows) {
        const before = previous.current.get(row.dataset.flip!)
        const after = next.get(row.dataset.flip!)
        if (before === undefined || after === undefined) continue
        const dy = before - after
        if (Math.abs(dy) < 2) continue
        row.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 440, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
        )
      }
    }
    previous.current = next
  })
}

/**
 * Horizontal scroll with a visible invitation. A wide table on a phone used
 * to clip silently — the reader had no way to know the numbers continued.
 * Now anything cut off gets an edge fade and a chevron pill that sits there
 * until the reader has actually scrolled.
 */
function ScrollHint({ children, className = '' }: { children: ReactNode; className?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [clipped, setClipped] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const el = track.current
    if (!el) return
    const check = () => setClipped(el.scrollWidth - el.clientWidth - el.scrollLeft > 8)
    const onScroll = () => {
      setTouched(true)
      check()
    }
    check()
    el.addEventListener('scroll', onScroll, { passive: true })
    const watch = new ResizeObserver(check)
    watch.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      watch.disconnect()
    }
  }, [])

  return (
    <div className="relative min-w-0">
      <div ref={track} className={`min-w-0 overflow-x-auto ${className}`}>
        {children}
      </div>
      {clipped && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-arc-panel to-transparent"
          />
          {!touched && (
            <span
              aria-hidden
              className="arcade pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full border border-arc-line bg-arc-bg-deep/90 px-2 py-0.5 text-[10px] text-arc-ink-soft"
            >
              swipe ›
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** Framed block of terminal output. */
export function Panel({
  id,
  title,
  subtitle,
  action,
  children,
  className = '',
  delay = 0,
}: {
  id?: string
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  delay?: number
}) {
  const frame = useRef<HTMLElement>(null)
  const aired = useRevealed(frame)
  return (
    <section
      ref={frame}
      id={id}
      className={`win pop-in ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {(title || action) && (
        <header
          className={`win-head flex-wrap ${aired ? 'on-air' : ''}`}
          style={{ ['--air-delay' as string]: `${delay + 180}ms` }}
        >
          <div className="min-w-0">
            {title && <h2 className="label">{title}</h2>}
            {subtitle && (
              <p className="mt-1 text-[12px] leading-snug text-arc-ink-soft">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {/* Tables inside panels scroll here rather than splitting thead/tbody
          into separate layout contexts, which desynced header columns. */}
      <ScrollHint>{children}</ScrollHint>
    </section>
  )
}

/**
 * Counts a numeric readout up on mount. Static values (names, strings) pass
 * straight through.
 */
function useCountUp(target: number, run: boolean): number {
  const [value, setValue] = useState(run ? 0 : target)
  const frame = useRef(0)

  useEffect(() => {
    if (!run) {
      setValue(target)
      return
    }
    if (animationsDisabled()) {
      setValue(target)
      return
    }
    const start = performance.now()
    const duration = 780
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      // Overshoot slightly past the target, then settle — matches --ease-spring.
      const eased =
        progress === 1
          ? 1
          : 1 + 2.2 * Math.pow(progress - 1, 3) + 1.2 * Math.pow(progress - 1, 2)
      setValue(target * eased)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    // rAF is paused in background tabs, which would strand the readout at zero.
    // A timer still fires there, so the true value always lands.
    const settle = setTimeout(() => setValue(target), duration + 260)

    return () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(settle)
    }
  }, [target, run])

  return value
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  countTo,
  format,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'up' | 'down' | 'gold'
  /** When set, the readout animates from zero to this number on mount. */
  countTo?: number
  format?: (value: number) => string
}) {
  const toneClass = {
    default: 'text-arc-ink',
    up: 'text-arc-green',
    down: 'text-arc-red',
    gold: 'text-arc-yellow',
  }[tone]

  const counted = useCountUp(countTo ?? 0, countTo !== undefined)

  return (
    <div className="win px-3 py-3">
      <div className="label">{label}</div>
      <div className={`tnum mt-2 text-[21px] leading-none font-bold ${toneClass}`}>
        {countTo !== undefined ? (format ? format(counted) : Math.round(counted)) : value}
      </div>
      {hint && <div className="mt-2 text-[13px] leading-snug text-arc-ink-soft">{hint}</div>}
    </div>
  )
}

/**
 * The one figure a screen is about. Everything else is subordinate to it, so
 * there is exactly one of these per view.
 */
export function Hero({
  label,
  value,
  countTo,
  format,
  caption,
}: {
  label: string
  value: string
  countTo?: number
  format?: (value: number) => string
  caption?: ReactNode
  /** Retained for callers written against the previous design. */
  accent?: boolean
}) {
  const counted = useCountUp(countTo ?? 0, countTo !== undefined)
  return (
    <div className="rise-in">
      <div className="label">{label}</div>
      <div className="hero-num mt-3">
        {countTo !== undefined && format ? format(counted) : value}
      </div>
      {caption && (
        <div className="mt-4 max-w-md text-[14px] leading-relaxed text-arc-ink-soft">{caption}</div>
      )}
    </div>
  )
}

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'gold' | 'up' | 'down' | 'flag'
}) {
  const bg = {
    neutral: 'var(--color-arc-bg-deep)',
    gold: 'var(--color-arc-yellow)',
    up: 'var(--color-arc-lime)',
    down: 'var(--color-arc-red)',
    flag: 'var(--color-arc-orange)',
  }[tone]
  // Dark type on every coloured chip: the lime/amber/orange fills sit at
  // 9-12:1 against arc-bg, where near-white ink was 1.4:1.
  const fg =
    tone === 'neutral'
      ? 'var(--color-arc-ink)'
      : tone === 'down'
        ? 'var(--color-arc-panel)'
        : 'var(--color-arc-bg)'
  return (
    <span className="tag" style={{ background: bg, color: fg }}>
      {children}
    </span>
  )
}

/** Command-prompt page header. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow: string
  title: string
  lede?: string
  action?: ReactNode
  /** Retained so callers written for the previous layout still compile. */
  path?: string
}) {
  return (
    <header className="pop-in mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="label type-in">{eyebrow}</div>
          <h1
            className="display cursor neon-soft mt-3 text-arc-ink"
            style={{ viewTransitionName: 'page-title' }}
          >
            {title}
          </h1>
          <div aria-hidden className="dot-wave mt-3 w-full max-w-md text-arc-purple">
            {Array.from({ length: 72 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.055}s` }} />
            ))}
          </div>
          {lede && <p className="mt-3 text-[14px] leading-relaxed text-arc-ink-soft">{lede}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (next: T) => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="label">{label}</span>}
      <div className="scroll-x flex border-[3px] border-arc-line shadow-hard-sm">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={`arcade min-h-[38px] px-3 py-1 text-[11px] whitespace-nowrap transition-colors ${
              value === option.id
                ? 'bg-arc-blue text-arc-panel'
                : 'bg-arc-panel text-arc-ink hover:bg-arc-yellow hover:text-arc-bg'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="arcade px-4 py-10 text-center text-[10px] leading-relaxed text-arc-ink-soft">
      {children}
    </div>
  )
}

/** Meter drawn as terminal blocks rather than a solid bar. */
export function Bar({
  value,
  max,
  tone = 'var(--color-arc-blue)',
  cells = 12,
}: {
  value: number
  max: number
  tone?: string
  cells?: number
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filled = Math.round(ratio * cells)
  return (
    <span
      className="text-[11px] leading-none tracking-[-0.5px] tabular-nums"
      aria-hidden
      title={`${Math.round(ratio * 100)}%`}
    >
      <span style={{ color: tone }}>{'█'.repeat(filled)}</span>
      <span className="text-arc-ink-faint">{'░'.repeat(cells - filled)}</span>
    </span>
  )
}

/**
 * Inline block sparkline. Reads at any size and costs nothing to render, which
 * makes it the right chart for a table cell on a phone.
 */
export function Sparkline({
  values,
  tone = 'text-arc-blue',
}: {
  values: (number | null)[]
  tone?: string
}) {
  const blocks = '▁▂▃▄▅▆▇█'
  const present = values.filter((value): value is number => value !== null)
  if (present.length === 0) return <span className="text-arc-ink-faint">—</span>
  const min = Math.min(...present)
  const max = Math.max(...present)
  const span = max - min || 1
  return (
    <span className={`spark-in text-[13px] leading-none tracking-[-0.5px] ${tone}`} aria-hidden>
      {values
        .map((value) =>
          value === null ? ' ' : blocks[Math.round(((value - min) / span) * (blocks.length - 1))],
        )
        .join('')}
    </span>
  )
}

/** Horizontally scrollable wrapper for wide tables on small screens. */
export function Scroller({ children }: { children: ReactNode }) {
  return <ScrollHint className="scroll-x">{children}</ScrollHint>
}

/**
 * Sticky rail of section chips for the long stat pages — fifteen screens of
 * scroll needs doors, not a corridor. Chips jump to panel anchors; the one
 * whose section is on screen stays lit.
 */
export function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting)
        const current = sections.find((section) => seen.get(section.id))
        if (current) setActive(current.id)
      },
      { rootMargin: '-120px 0px -55% 0px' },
    )
    for (const section of sections) {
      const node = document.getElementById(section.id)
      if (node) observer.observe(node)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav
      aria-label="Sections"
      className="section-rail sticky top-[calc(env(safe-area-inset-top,0px)+56px)] z-30 -mx-4 mb-5 px-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-9 lg:px-9"
    >
      <div className="scroll-x flex gap-1.5 py-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => {
              event.preventDefault()
              document.getElementById(section.id)?.scrollIntoView({
                behavior: animationsDisabled() ? 'auto' : 'smooth',
                block: 'start',
              })
            }}
            className={`arcade shrink-0 rounded-full border px-3 py-1.5 text-[10px] whitespace-nowrap transition-colors ${
              active === section.id
                ? 'border-arc-green bg-arc-green text-[#06210a]'
                : 'border-arc-line bg-arc-panel text-arc-ink-soft hover:border-arc-ink-faint hover:text-arc-ink'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

/**
 * A panel that has said everything it needs to in one line. Solved states
 * (dues all paid, a finished season) collapse to their conclusion and open
 * on demand, so the archive stops taxing every scroll past it.
 */
export function Fold({
  summary,
  children,
  defaultOpen = false,
  delay = 0,
}: {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  delay?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section
      className="win pop-in"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-arc-raised/40"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">{summary}</span>
        <span
          aria-hidden
          className={`shrink-0 text-[13px] text-arc-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>
      {open && <div className="border-t border-arc-line">{children}</div>}
    </section>
  )
}
