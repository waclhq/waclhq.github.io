import { useSyncExternalStore } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * animationsDisabled(), read as state.
 *
 * The FX switch writes its choice to localStorage and stamps `data-motion` on
 * the root (lib/motion's applyMotionPreference). A component that only calls
 * animationsDisabled() at render therefore keeps whatever the answer was when
 * it mounted: flipping FX on left the fire unlit until you left the room and
 * came back, and flipping it off left the canvases simulating behind a page
 * the CSS had already stilled. Subscribing to the stamp — and to the OS
 * setting, which can change under a running tab — makes the toggle land on
 * the view you are looking at, which is what rule 4 asks for.
 */
export function useStill(): boolean {
  return useSyncExternalStore(subscribe, animationsDisabled, () => true)
}

function subscribe(onChange: () => void): () => void {
  const stamp = new MutationObserver(onChange)
  stamp.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  const os = window.matchMedia('(prefers-reduced-motion: reduce)')
  os.addEventListener('change', onChange)
  return () => {
    stamp.disconnect()
    os.removeEventListener('change', onChange)
  }
}
