import { useLayoutEffect, useRef, type RefObject } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * FLIP for a table that re-sorts. Rows carry data-flip keys and slide from
 * where they were to where they are — the top row leads, the field follows a
 * beat behind, so the eye reads the reshuffle as one movement rather than
 * sixteen. Built for a scrubber that can re-sort twenty times in two seconds:
 * a row still mid-slide is picked up from where it visually is, not snapped
 * back to its last resting place.
 */
export function useFlipRows(
  ref: RefObject<HTMLElement | null>,
  { stagger = 14, duration = 460 }: { stagger?: number; duration?: number } = {},
): void {
  const previous = useRef(new Map<string, number>())

  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-flip]'))
    const next = new Map<string, number>()
    const residual = new Map<string, number>()

    for (const row of rows) {
      const key = row.dataset.flip!
      // offsetTop is layout only; the bounding rect includes whatever
      // transform an earlier slide is still applying. The difference is where
      // the row *looks* like it is right now.
      const parentTop = row.offsetParent?.getBoundingClientRect().top ?? 0
      next.set(key, row.offsetTop)
      residual.set(key, row.getBoundingClientRect().top - parentTop - row.offsetTop)
    }

    if (!animationsDisabled() && !document.hidden) {
      rows.forEach((row, index) => {
        const key = row.dataset.flip!
        const before = previous.current.get(key)
        const after = next.get(key)
        if (before === undefined || after === undefined) return
        const dy = before + (residual.get(key) ?? 0) - after
        for (const animation of row.getAnimations()) if (animation.id === 'flip') animation.cancel()
        if (Math.abs(dy) < 1) return
        row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
          id: 'flip',
          duration,
          delay: Math.min(index, 14) * stagger,
          fill: 'backwards',
          easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
        })
      })
    }

    previous.current = next
  })
}
