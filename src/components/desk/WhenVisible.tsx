import { useRef, type ReactNode } from 'react'
import { useOnScreen } from './hooks'

/**
 * Mounts its children only while the slot is on screen. The field-goal strip
 * carries a canvas loop that otherwise draws sixty frames a second for as
 * long as the Ledger is open; parked below the fold it now draws nothing.
 * The slot keeps its height so nothing below it jumps.
 */
export default function WhenVisible({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const slot = useRef<HTMLDivElement>(null)
  const on = useOnScreen(slot)
  return (
    <div ref={slot} className={className}>
      {on ? children : null}
    </div>
  )
}
