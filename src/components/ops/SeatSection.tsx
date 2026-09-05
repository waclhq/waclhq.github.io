import { useRef } from 'react'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'
import PixelMugshot from '../PixelMugshot'
import { useRevealed } from '../ui'

/**
 * A section of the stands: one seat per active manager, on a curved row,
 * lit in the manager's colour once their dues are in and dark graphite until
 * then. On a phone the section is two curved rows of six; from the tablet up
 * it is one long arc of twelve. The commissioner's tap on a seat is the same
 * 44px checkbox it always was — tick to mark paid, untick to undo.
 */

export interface Seat {
  manager: ManagerId
  name: string
  /** null = no dues entry on the books yet. */
  paid: boolean | null
  owed: number
  isMe: boolean
}

export default function SeatSection({
  seats,
  commissioner,
  busy,
  lit,
  onToggle,
  caption,
}: {
  seats: Seat[]
  commissioner: boolean
  /** Manager whose save is in flight. */
  busy: ManagerId | null
  /** Seat that just turned on — plays the light-up once. */
  lit: ManagerId | null
  onToggle: (seat: Seat) => void
  caption: string
}) {
  const stand = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(stand)
  const rows = [seats.slice(0, 6), seats.slice(6, 12)]

  return (
    <div ref={stand} className={`ops-stand ${revealed ? 'is-on' : ''}`}>
      {rows.map((row, r) => (
        <ol key={r} className="ops-row" aria-label={r === 0 ? 'Back row' : 'Front row'}>
          {row.map((seat, i) => {
            const index = r * 6 + i
            const color = managerColor(seat.manager)
            const status =
              seat.paid === null ? 'no dues entry yet' : seat.paid ? 'paid' : 'not paid yet'
            const seatClass = `ops-seat ${lit === seat.manager ? 'ops-ignite' : ''}`
            const inner = (
              <>
                <span className="ops-seat-glow" aria-hidden />
                <span className="ops-seat-face">
                  <PixelMugshot seed={seat.manager} scale={1.5} />
                </span>
                {seat.paid && (
                  <span className="ops-seat-tick" aria-hidden>
                    ✓
                  </span>
                )}
              </>
            )
            return (
              <li
                key={seat.manager}
                className="ops-slot"
                style={{
                  ['--k6' as string]: i - 2.5,
                  ['--k12' as string]: index - 5.5,
                  ['--i' as string]: index,
                  ['--c' as string]: color,
                }}
                data-paid={seat.paid === true ? '' : undefined}
                data-none={seat.paid === null ? '' : undefined}
                data-me={seat.isMe ? '' : undefined}
              >
                {commissioner && seat.paid !== null ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={seat.paid}
                    aria-label={`Mark ${seat.name} as ${seat.paid ? 'unpaid' : 'paid'}`}
                    title={seat.paid ? 'Paid — tap to reopen' : 'Tap to check off as paid'}
                    disabled={busy === seat.manager}
                    aria-busy={busy === seat.manager || undefined}
                    onClick={() => onToggle(seat)}
                    className={seatClass}
                  >
                    {inner}
                  </button>
                ) : (
                  <span className={seatClass} title={`${seat.name} — ${status}`}>
                    <span className="sr-only">
                      {seat.name}: {status}
                    </span>
                    {inner}
                  </span>
                )}
                <span className="ops-seat-name" aria-hidden>
                  {seat.name}
                </span>
                {seat.isMe && (
                  <span className="ops-seat-you" aria-hidden>
                    you
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      ))}
      <p className="ops-caption" role="status">
        {caption}
      </p>
    </div>
  )
}
