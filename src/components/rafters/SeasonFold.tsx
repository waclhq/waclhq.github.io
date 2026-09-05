import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'

/**
 * One season, folded to its verdict. Unlike the shared Fold it carries an id
 * (so ?year= and the banners can find it) and is controlled from the page,
 * which keeps one season open and the URL naming it.
 */
export function SeasonFold({
  id,
  summary,
  open,
  onToggle,
  children,
  delay = 0,
}: {
  id: string
  summary: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
  delay?: number
}) {
  return (
    <section
      id={id}
      className={`win pop-in season-fold ${open ? 'is-open' : ''}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-story`}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-arc-raised/40"
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">{summary}</span>
        <span
          aria-hidden
          className={`shrink-0 text-[13px] text-arc-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={`${id}-story`} className="unfold border-t border-arc-line">
          {children}
        </div>
      )}
    </section>
  )
}

/**
 * A manager's name as a door: ink text underlined in their colour, so on a
 * phone the link is visible without a hover and the same person looks the
 * same in every sentence.
 */
export function InlineManager({ id, name }: { id: ManagerId; name: string }) {
  return (
    <Link
      to={`/managers/${id}`}
      className="inline-manager"
      style={{ textDecorationColor: managerColor(id) }}
    >
      {name}
    </Link>
  )
}
