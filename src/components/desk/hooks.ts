import { useEffect, useRef, useState } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * A clock that ticks on the minute. Re-syncs when the tab comes back, so a
 * phone that slept through an hour shows the right minute the moment it
 * wakes rather than sixty seconds later.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: number | undefined
    const tick = () => setNow(new Date())
    const align = window.setTimeout(
      () => {
        tick()
        interval = window.setInterval(tick, 60_000)
      },
      60_000 - (Date.now() % 60_000) + 20,
    )
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(align)
      if (interval !== undefined) window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}

/**
 * Counts a readout up from zero once `run` turns true. The same easing as the
 * shared Stat readout — a slight overshoot that settles — and the same
 * fallback timer so a background tab still lands on the true value.
 */
export function useCountUp(target: number, run: boolean, duration = 780): number {
  const [value, setValue] = useState(() => (run || animationsDisabled() ? target : 0))
  const frame = useRef(0)

  useEffect(() => {
    if (!run) return
    if (animationsDisabled()) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased =
        progress === 1
          ? 1
          : 1 + 2.2 * Math.pow(progress - 1, 3) + 1.2 * Math.pow(progress - 1, 2)
      setValue(target * eased)
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    const settle = setTimeout(() => setValue(target), duration + 260)
    return () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(settle)
    }
  }, [target, run, duration])

  return value
}

/** True while the element is on screen (with a margin), false when it leaves. */
export function useOnScreen<T extends Element>(
  ref: React.RefObject<T | null>,
  rootMargin = '160px 0px',
): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), {
      rootMargin,
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, rootMargin])
  return on
}
