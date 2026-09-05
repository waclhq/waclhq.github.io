import type { PointerEvent } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * Pointer-tracked 3D tilt with a foil catch-light, holo-card style. The vars
 * feed the CSS transform on `.bet-tile`; reduced motion leaves the card flat.
 * Module-level so a re-render never hands the tile a fresh handler object.
 */
export const tiltHandlers = {
  onPointerMove: (event: PointerEvent<HTMLElement>) => {
    if (animationsDisabled()) return
    const el = event.currentTarget
    const box = el.getBoundingClientRect()
    const px = (event.clientX - box.left) / box.width - 0.5
    const py = (event.clientY - box.top) / box.height - 0.5
    el.style.setProperty('--ty', `${(px * 9).toFixed(2)}deg`)
    el.style.setProperty('--tx', `${(-py * 7).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`)
  },
  onPointerLeave: (event: PointerEvent<HTMLElement>) => {
    const el = event.currentTarget
    el.style.removeProperty('--ty')
    el.style.removeProperty('--tx')
  },
}
