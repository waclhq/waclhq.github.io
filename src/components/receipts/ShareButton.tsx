import { useEffect, useRef, useState } from 'react'
import type { Bet } from '../../lib/bets'
import { betLink, shareText, type NameOf } from './provenance'

/**
 * Hand someone the ticket. The share sheet where the device has one; the
 * link on the clipboard everywhere else, with a status line that says so.
 * If even the clipboard is off limits, the address appears selected so it
 * can be copied by hand — a share button that can fail silently is worse
 * than none.
 */
export default function ShareButton({
  bet,
  nameOf,
  className = '',
}: {
  bet: Bet
  nameOf: NameOf
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const timer = useRef(0)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (state === 'manual') field.current?.select()
  }, [state])

  const settle = (next: 'copied' | 'manual') => {
    setState(next)
    window.clearTimeout(timer.current)
    if (next === 'copied') timer.current = window.setTimeout(() => setState('idle'), 2600)
  }

  const share = async () => {
    const url = betLink(bet.id)
    const text = shareText(bet, nameOf)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'WACL side bet', text, url })
        return
      } catch (cause) {
        // A dismissed sheet is not a failure; anything else falls back to copy.
        if (cause instanceof Error && cause.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      settle('copied')
    } catch {
      settle('manual')
    }
  }

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        className="btn min-h-[40px] px-3 py-1 text-[12px]"
        onClick={() => void share()}
        aria-label={`Share a link to this bet: ${bet.terms}`}
      >
        <span aria-hidden>⇪</span> Share
      </button>
      <span role="status" aria-live="polite" className="text-[11.5px] text-arc-green">
        {state === 'copied' ? 'Link copied' : ''}
      </span>
      {state === 'manual' && (
        <input
          ref={field}
          readOnly
          className="field min-h-[40px] w-full max-w-[260px] px-2 py-1 text-[11.5px]"
          value={betLink(bet.id)}
          aria-label="Link to this bet"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </span>
  )
}
