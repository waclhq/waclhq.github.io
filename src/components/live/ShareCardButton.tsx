import { useState } from 'react'
import { shareCard, type CardSpec } from '../../lib/live-share'

/**
 * One tap, one image for the group chat. The card is drawn only when asked
 * for, so the page never pays for canvases nobody shares.
 */
export default function ShareCardButton({
  make,
  text,
  label = 'Share card',
  className = '',
}: {
  make: () => CardSpec
  text: string
  label?: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'saved' | 'failed'>('idle')
  const go = async () => {
    setState('busy')
    try {
      const result = await shareCard(make(), text)
      setState(result === 'shared' ? 'done' : result === 'downloaded' ? 'saved' : 'idle')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2600)
  }
  return (
    <button type="button" className={`lv-share ${className}`} onClick={go} disabled={state === 'busy'}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
        <path d="M12 3 7 8h3v7h4V8h3zM5 13v7h14v-7h-2v5H7v-5z" fill="currentColor" />
      </svg>
      {state === 'busy' ? 'Drawing…' : state === 'done' ? 'Shared' : state === 'saved' ? 'Image saved' : state === 'failed' ? 'Could not draw it' : label}
    </button>
  )
}
