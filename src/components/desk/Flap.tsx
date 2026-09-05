import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * Split-flap board characters — the departures board at the far end of the
 * desk. Each card carries one glyph on a dark face split by a hard seam. When
 * the character changes, the old top half falls forward and the new bottom
 * half falls in behind it, one card after the next. Transform-only, so a row
 * of thirty costs nothing, and under reduced motion the cards simply sit at
 * their final characters with no fold layers at all.
 */

const FLIP_MS = 420
const STAGGER_MS = 42

interface Flip {
  from: string
  to: string
  id: number
  delay: number
}

let flipCounter = 0

export function Flap({
  char,
  index = 0,
  size = 'sm',
}: {
  char: string
  /** Position on the board, for the left-to-right stagger. */
  index?: number
  size?: 'sm' | 'lg'
}) {
  const still = animationsDisabled()
  // The card at rest shows `rest`; a flip in flight carries the old and new
  // glyphs on its moving halves. Motion-on boards start blank so the first
  // render is the cards flipping in; still boards start on the answer.
  const [rest, setRest] = useState(still ? char : ' ')
  const [flip, setFlip] = useState<Flip | null>(null)
  const firstRun = useRef(true)
  const flipRef = useRef<Flip | null>(null)
  flipRef.current = flip

  useEffect(() => {
    const current = flipRef.current
    const showing = current ? current.to : rest
    if (showing === char) return
    if (animationsDisabled()) {
      setRest(char)
      setFlip(null)
      return
    }
    const delay = firstRun.current ? index * STAGGER_MS : 0
    setFlip({ from: showing, to: char, id: ++flipCounter, delay })
    // rest here is the resting glyph; changing it never needs a new flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, index])

  useEffect(() => {
    firstRun.current = false
  }, [])

  // Commit the flip once the bottom half has landed. A timer backs up the
  // animationend event, which a background tab can swallow.
  useEffect(() => {
    if (!flip) return
    const timer = setTimeout(() => {
      setRest(flip.to)
      setFlip((current) => (current?.id === flip.id ? null : current))
    }, FLIP_MS + flip.delay + 80)
    return () => clearTimeout(timer)
  }, [flip])

  if (char === ' ') return <span className={`flap-gap flap-${size}`} aria-hidden />

  const top = flip ? flip.to : rest
  const bottom = flip ? flip.from : rest
  const style = flip
    ? ({ '--flap-delay': `${flip.delay}ms` } as CSSProperties)
    : undefined

  return (
    <span className={`flap flap-${size}`} style={style} aria-hidden>
      <span className="flap-half flap-top">
        <span>{top}</span>
      </span>
      <span className="flap-half flap-bot">
        <span>{bottom}</span>
      </span>
      {flip && (
        <>
          <span key={`t${flip.id}`} className="flap-half flap-top flap-fold-top">
            <span>{flip.from}</span>
          </span>
          <span key={`b${flip.id}`} className="flap-half flap-bot flap-fold-bot">
            <span>{flip.to}</span>
          </span>
        </>
      )}
      <span className="flap-seam" />
    </span>
  )
}

/**
 * A line of text on the board. Words stay together so a long line wraps
 * between words on a narrow phone rather than mid-word; a middle dot is drawn
 * as a plain separator, not a card. `offset` continues the stagger from the
 * line above.
 */
export function FlapLine({
  text,
  size = 'sm',
  offset = 0,
  className = '',
}: {
  text: string
  size?: 'sm' | 'lg'
  offset?: number
  className?: string
}) {
  const words = text.toUpperCase().split(' ')
  let index = offset
  return (
    <span className={`flap-line ${className}`} aria-hidden>
      {words.map((word, w) => {
        if (word === '·') {
          index += 1
          return (
            <span key={`dot-${w}`} className={`flap-dot flap-${size}`}>
              ·
            </span>
          )
        }
        return (
          <span key={`w-${w}`} className="flap-word">
            {Array.from(word).map((glyph, g) => {
              const i = index
              index += 1
              return <Flap key={g} char={glyph} index={i} size={size} />
            })}
          </span>
        )
      })}
    </span>
  )
}

/** A zero-padded pair of large cards, captioned. */
export function FlapPair({
  value,
  caption,
  offset = 0,
  digits = 2,
}: {
  value: number
  caption: string
  offset?: number
  digits?: number
}) {
  const text = String(Math.max(0, Math.floor(value))).padStart(digits, '0')
  return (
    <span className="flap-pair">
      <span className="flap-word">
        {Array.from(text).map((glyph, g) => (
          <Flap key={g} char={glyph} index={offset + g} size="lg" />
        ))}
      </span>
      <span className="label flap-caption">{caption}</span>
    </span>
  )
}
