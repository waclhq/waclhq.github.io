import { useRef, type CSSProperties, type ReactNode } from 'react'
import { animationsDisabled } from '../../lib/motion'
import { useRevealed } from '../ui'

/**
 * A mechanical counter for the one figure the Ledger is about. Every digit is
 * a vertical strip of numerals that spins to rest when the hero is first
 * seen; the ones wheel settles first and each higher place a beat later, so
 * the size of the number is the last thing to land. Chrome-gradient numerals
 * under the hero's green glow. Under reduced motion the strips are already
 * parked on the answer and nothing turns.
 */

const DIGITS = Array.from('0123456789')

export function Odometer({ text, revealed }: { text: string; revealed: boolean }) {
  const chars = Array.from(text)
  const digitCount = chars.filter((glyph) => /\d/.test(glyph)).length
  const live = revealed || animationsDisabled()
  let seen = 0

  return (
    <span className="odo">
      <span className="odo-glow" aria-hidden>
        {text}
      </span>
      <span className="odo-face" aria-hidden>
        {chars.map((glyph, i) => {
          if (!/\d/.test(glyph)) {
            return (
              <span key={i} className="odo-glyph">
                {glyph}
              </span>
            )
          }
          // Place value from the right: ones = 0. Higher places spin more
          // turns and take longer, so they settle last.
          const place = digitCount - 1 - seen
          seen += 1
          const spins = 1 + place
          const rest = spins * 10 + Number(glyph)
          const style = {
            '--n': live ? rest : 0,
            '--odo-dur': `${(1.05 + place * 0.34).toFixed(2)}s`,
          } as CSSProperties
          return (
            <span key={i} className="odo-win">
              <span className="odo-strip" style={style}>
                {Array.from({ length: spins + 1 }, (_, set) =>
                  DIGITS.map((digit) => (
                    <span key={`${set}-${digit}`} className="odo-glyph">
                      {digit}
                    </span>
                  )),
                )}
              </span>
            </span>
          )
        })}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  )
}

/** The Hero layout from the shared kit, with the odometer as its figure. */
export function DeskHero({
  label,
  value,
  caption,
}: {
  label: string
  value: string
  caption?: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(frame)
  return (
    <div ref={frame} className="rise-in">
      <div className="label">{label}</div>
      <div className="hero-num mt-3">
        <Odometer text={value} revealed={revealed} />
      </div>
      {caption && (
        <div className="mt-4 max-w-md text-[14px] leading-relaxed text-arc-ink-soft">{caption}</div>
      )}
    </div>
  )
}
