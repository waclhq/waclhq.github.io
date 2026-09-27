import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { animationsDisabled } from '../../lib/motion'

/**
 * Split-flap board characters — the departures board at the far end of the
 * desk. Each card carries one glyph on a dark face split by a hard seam. When
 * the character changes, the old top half falls forward and the new bottom
 * half falls in behind it, one card after the next. Transform-only, so a row
 * of thirty costs nothing, and under reduced motion the cards simply sit at
 * their final characters with no fold layers at all.
 *
 * A digit card can run on a drum, like a real departures board: instead of
 * jumping from 3 to 7 it clacks through 4, 5 and 6 on the way, so a score
 * rolls up to its number.
 */

const FLIP_MS = 420
const STAGGER_MS = 42
const DRUM = '0123456789'
const STEP_MS = 85
const LAND_MS = 300

interface Flip {
  from: string
  to: string
  id: number
  delay: number
  ms: number
}

/** The glyphs a drum card passes through from one digit to the next, ending on the target. */
function drumPath(from: string, to: string): string[] {
  if (from === to) return []
  if (!DRUM.includes(to)) return [to]
  const path: string[] = []
  let i = DRUM.indexOf(from)
  do {
    i = (i + 1) % DRUM.length
    path.push(DRUM[i])
  } while (DRUM[i] !== to)
  return path
}

let flipCounter = 0

export function Flap({
  char,
  index = 0,
  size = 'sm',
  drum = false,
}: {
  char: string
  /** Position on the board, for the left-to-right stagger. */
  index?: number
  size?: 'sm' | 'lg'
  /** Roll through the digits in between instead of jumping straight there. */
  drum?: boolean
}) {
  const still = animationsDisabled()
  // The card at rest shows `rest`; a flip in flight carries the old and new
  // glyphs on its moving halves. Motion-on boards start blank so the first
  // render is the cards flipping in; still boards start on the answer.
  const [rest, setRest] = useState(still ? char : ' ')
  const [flip, setFlip] = useState<Flip | null>(null)
  // Only the board's first change staggers left to right; later ones flip at once.
  const flipped = useRef(false)
  const flipRef = useRef<Flip | null>(null)
  flipRef.current = flip
  // Drum steps still to come after the flip in flight.
  const queue = useRef<string[]>([])

  useEffect(() => {
    const current = flipRef.current
    const showing = current ? current.to : rest
    const heading = queue.current.length ? queue.current[queue.current.length - 1] : showing
    if (heading === char) return
    if (animationsDisabled()) {
      queue.current = []
      setRest(char)
      setFlip(null)
      return
    }
    if (current) {
      // Mid-flip: finish this card, then head for the new glyph from there.
      queue.current = drum ? drumPath(showing, char) : [char]
      return
    }
    const path = drum ? drumPath(showing, char) : [char]
    const [first, ...later] = path
    queue.current = later
    const delay = flipped.current ? 0 : index * STAGGER_MS
    flipped.current = true
    setFlip({ from: showing, to: first, id: ++flipCounter, delay, ms: later.length ? STEP_MS : drum ? LAND_MS : FLIP_MS })
    // rest here is the resting glyph; changing it never needs a new flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, index])

  // Commit the flip once the bottom half has landed, or take the next drum
  // step. A timer rather than animationend, which a background tab can swallow.
  useEffect(() => {
    if (!flip) return
    const timer = setTimeout(
      () => {
        const next = queue.current.shift()
        if (next !== undefined) {
          const landing = queue.current.length === 0
          setFlip({ from: flip.to, to: next, id: ++flipCounter, delay: 0, ms: landing ? LAND_MS : STEP_MS })
          return
        }
        setRest(flip.to)
        setFlip((current) => (current?.id === flip.id ? null : current))
      },
      flip.ms + flip.delay + (flip.ms === STEP_MS ? 10 : 80),
    )
    return () => clearTimeout(timer)
  }, [flip])

  if (char === ' ') return <span className={`flap-gap flap-${size}`} aria-hidden />

  const top = flip ? flip.to : rest
  const bottom = flip ? flip.from : rest
  const style = flip
    ? ({ '--flap-delay': `${flip.delay}ms`, '--flap-ms': `${flip.ms}ms` } as CSSProperties)
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
