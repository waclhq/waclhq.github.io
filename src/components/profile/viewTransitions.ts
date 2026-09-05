import { animationsDisabled } from '../../lib/motion'

/**
 * Whether a route change should ask for a view transition — the same test
 * the Shell applies to its own links, so flipping between managers morphs
 * the title under a still chrome exactly like the sidebar does.
 */
export function viewTransitionsOn(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document && !animationsDisabled()
}
