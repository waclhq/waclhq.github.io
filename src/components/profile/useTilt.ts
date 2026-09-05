import { useMemo } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * Pointer-tracked holo-card tilt. Feeds four custom properties the stylesheet
 * turns into a transform (--tx/--ty) and a foil catch-light (--gx/--gy);
 * everything that moves is transform or opacity. Flat under reduced motion
 * and on touch — a thumb has no hover, and a card that tilts under a scroll
 * gesture reads as a glitch, not a treat.
 */
export function useTilt(maxX = 5, maxY = 7) {
  return useMemo(() => {
    const finePointer = () => {
      try {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      } catch {
        return false
      }
    }
    return {
      onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
        if (animationsDisabled() || event.pointerType !== 'mouse' || !finePointer()) return
        const el = event.currentTarget
        const box = el.getBoundingClientRect()
        const px = (event.clientX - box.left) / box.width - 0.5
        const py = (event.clientY - box.top) / box.height - 0.5
        el.style.setProperty('--ty', `${(px * maxY).toFixed(2)}deg`)
        el.style.setProperty('--tx', `${(-py * maxX).toFixed(2)}deg`)
        el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`)
        el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`)
      },
      onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
        const el = event.currentTarget
        el.style.removeProperty('--ty')
        el.style.removeProperty('--tx')
      },
    }
  }, [maxX, maxY])
}
