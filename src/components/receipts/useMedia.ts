import { useSyncExternalStore } from 'react'

/** True while the media query matches; re-renders when it flips. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', callback)
      return () => list.removeEventListener('change', callback)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
