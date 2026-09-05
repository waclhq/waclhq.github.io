import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Page state mirrored into the hash route's query — #/standings?season=2019,
 * #/managers?sort=titles — so a member can text the exact view that settles
 * an argument and a reload keeps it.
 *
 * Writes go straight to history.replaceState rather than through the router.
 * Dragging across twenty-two seasons is not twenty-two navigations: history
 * should gain no entries, and the Shell, which scrolls every navigation to
 * the top, should not hear about it. Router-driven arrivals still win — a
 * pasted link, back/forward, the sidebar tab — because the hook re-reads the
 * router's location whenever the router itself moves.
 */
export function useUrlParam(name: string): [string | null, (next: string | null) => void] {
  const location = useLocation()
  const fromRouter = new URLSearchParams(location.search).get(name)
  const [value, setValue] = useState<string | null>(fromRouter)

  useEffect(() => {
    setValue(fromRouter)
  }, [fromRouter, location.key])

  const set = useCallback(
    (next: string | null) => {
      setValue(next)
      writeHashParam(name, next)
    },
    [name],
  )

  return [value, set]
}

function writeHashParam(name: string, value: string | null): void {
  const { pathname, search, hash } = window.location
  const at = hash.indexOf('?')
  const route = at < 0 ? hash || '#/' : hash.slice(0, at)
  const params = new URLSearchParams(at < 0 ? '' : hash.slice(at + 1))
  if (value === null || value === '') params.delete(name)
  else params.set(name, value)
  const query = params.toString()
  const next = `${pathname}${search}${route}${query ? `?${query}` : ''}`
  if (next === `${pathname}${search}${hash}`) return
  try {
    window.history.replaceState(window.history.state, '', next)
  } catch {
    /* a sandboxed frame may refuse; the page state is still right */
  }
}
