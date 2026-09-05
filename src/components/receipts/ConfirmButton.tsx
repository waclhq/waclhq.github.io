import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Two taps to do something that goes on the record. The first swaps the
 * button for an amber question with a Cancel beside it; the second commits.
 * Left alone, it forgets the question after five seconds — a thumb that
 * slipped costs nothing.
 */
export default function ConfirmButton({
  children,
  confirm,
  onConfirm,
  disabled = false,
  className = 'btn min-h-[34px] px-3 py-1',
  cancelLabel = 'Cancel',
  ariaLabel,
}: {
  children: ReactNode
  /** The question the button turns into: "Call it for Bernstein?" */
  confirm: ReactNode
  onConfirm: () => void
  disabled?: boolean
  className?: string
  cancelLabel?: string
  ariaLabel?: string
}) {
  const [asking, setAsking] = useState(false)
  const timer = useRef(0)
  const arm = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!asking) return
    timer.current = window.setTimeout(() => setAsking(false), 5000)
    arm.current?.focus({ preventScroll: true })
    return () => window.clearTimeout(timer.current)
  }, [asking])

  if (!asking) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
      >
        {children}
      </button>
    )
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        ref={arm}
        type="button"
        className={`${className} book-confirm`}
        disabled={disabled}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirm}
      </button>
      <button
        type="button"
        className="btn min-h-[34px] px-3 py-1 text-[12px]"
        onClick={() => setAsking(false)}
      >
        {cancelLabel}
      </button>
      <span className="sr-only" role="status">
        Tap again to confirm, or cancel.
      </span>
    </span>
  )
}
