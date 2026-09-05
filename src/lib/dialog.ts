import { useEffect, type RefObject } from 'react'

/**
 * The manners of a dialog, in one hook: focus moves in when it opens, Tab
 * stays inside, Escape closes it, and focus goes back to whatever opened it
 * when it goes away. Used by the command palette, the commissioner panel and
 * the phone menu sheet so a keyboard or a screen reader never falls behind
 * an overlay.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { active = true, initialFocus }: { active?: boolean; initialFocus?: RefObject<HTMLElement | null> } = {},
): void {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    const first = initialFocus?.current ?? focusables()[0]
    if (first && !node.contains(document.activeElement)) first.focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const head = items[0]
      const tail = items[items.length - 1]
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      } else if (!node.contains(document.activeElement)) {
        event.preventDefault()
        head.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [ref, onClose, active, initialFocus])
}
