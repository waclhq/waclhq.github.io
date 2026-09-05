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
 *
 * `accepts` names the values the page can actually show. A value it rejects
 * — ?season=1999, ?sort=bogus — is read as absent and swept out of the
 * address bar, so the link a member texts is the view they are looking at
 * rather than the junk they arrived with.
 */
export function useUrlParam(
  name: string,
  accepts?: (value: string) => boolean,
): [string | null, (next: string | null) => void] {
  const location = useLocation()
  const raw = new URLSearchParams(location.search).get(name)
  const fromRouter = raw !== null && accepts && !accepts(raw) ? null : raw
  const [value, setValue] = useState<string | null>(fromRouter)

  useEffect(() => {
    setValue(fromRouter)
  }, [fromRouter, location.key])

  // Sweep the rejected value out once the page has resolved its fallback.
  // No dependency list on purpose: replaceState does not wake the router, so
  // the router keeps handing back the junk the reader arrived with, and the
  // honest question is whether the address bar still shows it. Once it does
  // not — swept already, or the reader has since picked a real value — this
  // leaves history alone.
  useEffect(() => {
    if (raw !== null && fromRouter === null && readHashParam(name) === raw) {
      writeHashParam(name, null)
    }
  })

  const set = useCallback(
    (next: string | null) => {
      setValue(next)
      writeHashParam(name, next)
    },
    [name],
  )

  return [value, set]
}

function readHashParam(name: string): string | null {
  const at = window.location.hash.indexOf('?')
  if (at < 0) return null
  return new URLSearchParams(window.location.hash.slice(at + 1)).get(name)
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
