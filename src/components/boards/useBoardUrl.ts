import { useEffect, useRef, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

/*
 * Receipts. Trash talk needs a link that opens on the exact board, so the
 * long stat pages keep two things in the query string (which lives inside
 * the hash under HashRouter, so `#/records?era=all&s=points` is pasteable):
 *   era=<id>  the era control
 *   s=<id>    the section last chosen from the rail
 * Both are written with replace, so the back button still leaves the page.
 */

export function useEraParam(valid: string[], fallback: string): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('era')
  const era = raw && valid.includes(raw) ? raw : fallback
  const setEra = (id: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (id === fallback) next.delete('era')
        else next.set('era', id)
        return next
      },
      { replace: true },
    )
  return [era, setEra]
}

/**
 * Lands on `?s=<section>` once the page has laid out, and records the
 * section whenever a rail chip is tapped. The rail is shared chrome, so the
 * tap is caught on the way down (capture) rather than by changing the rail.
 */
export function useSectionParam(): {
  onClickCapture: (event: MouseEvent<HTMLElement>) => void
} {
  const [params, setParams] = useSearchParams()
  const landing = useRef(params.get('s'))

  useEffect(() => {
    const target = landing.current
    if (!target) return
    let tries = 0
    let timer = 0
    const attempt = () => {
      const node = document.getElementById(target)
      if (node) node.scrollIntoView({ block: 'start', behavior: 'auto' })
      else if (tries++ < 12) timer = window.setTimeout(attempt, 120)
    }
    timer = window.setTimeout(attempt, 60)
    return () => window.clearTimeout(timer)
  }, [])

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    const chip = (event.target as Element).closest<HTMLElement>('[data-chip]')
    const id = chip?.dataset.chip
    if (!id) return
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('s', id)
        return next
      },
      { replace: true },
    )
  }
  return { onClickCapture }
}
