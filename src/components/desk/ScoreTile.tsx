import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useRevealed } from '../ui'
import { useCountUp } from './hooks'

/**
 * One segment of the scoreboard strip: a lamp that carries the state, a
 * condensed italic readout that counts up when first seen, and a hint that
 * says the same thing in words. Tiles that lead somewhere are links.
 */

type Tone = 'default' | 'gold' | 'down' | 'up'

const TONE: Record<Tone, string> = {
  default: 'var(--color-arc-ink)',
  gold: 'var(--color-arc-yellow)',
  down: 'var(--color-arc-red)',
  up: 'var(--color-arc-green)',
}

export function ScoreTile({
  label,
  value,
  countTo,
  format,
  hint,
  tone = 'default',
  lamp,
  to,
  delay = 0,
  className = '',
  children,
}: {
  label: string
  value: ReactNode
  /** When set, the readout counts from zero to this number on first view. */
  countTo?: number
  format?: (value: number) => string
  hint?: ReactNode
  tone?: Tone
  /** Colour of the state lamp; defaults to green for a clear tile. */
  lamp?: string
  to?: string
  delay?: number
  className?: string
  children?: ReactNode
}) {
  const frame = useRef<HTMLAnchorElement & HTMLDivElement>(null)
  const revealed = useRevealed(frame)
  const counted = useCountUp(countTo ?? 0, countTo !== undefined && revealed)
  const shown =
    countTo !== undefined ? (format ? format(counted) : Math.round(counted)) : value

  const style = {
    '--tone': TONE[tone],
    '--lamp': lamp ?? (tone === 'default' ? TONE.up : TONE[tone]),
    animationDelay: delay ? `${delay}ms` : undefined,
  } as CSSProperties

  const body = (
    <>
      {children}
      <div className="desk-tile-head">
        <span className="desk-lamp" aria-hidden />
        <span className="label">{label}</span>
      </div>
      <div className="desk-tile-val tnum">{shown}</div>
      {hint && <div className="desk-tile-hint">{hint}</div>}
    </>
  )

  const classes = `win desk-tile pop-in ${className}`
  if (to) {
    return (
      <Link ref={frame} to={to} className={classes} style={style}>
        {body}
      </Link>
    )
  }
  return (
    <div ref={frame} className={classes} style={style}>
      {body}
    </div>
  )
}
