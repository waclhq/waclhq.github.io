import type { CSSProperties, ReactNode } from 'react'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'

/** The leader's row is lit by their own colour, not a generic highlight. */
export function leadWash(manager: ManagerId): CSSProperties {
  const color = managerColor(manager)
  return {
    backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 11%, transparent), transparent 60%)`,
    boxShadow: `inset 2px 0 0 ${color}`,
  }
}

/** Medal colours for the top three; the field stays quiet. Mirrors Records. */
export function rankTone(rank: number, medals = true): string {
  if (medals && rank >= 1 && rank <= 3) return ['pod-1', 'pod-2', 'pod-3'][rank - 1]
  return 'text-arc-ink-faint'
}

/** A small flag in the champion's colour, planted on their row. */
export function Pennant({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg
      className={`pennant ${className}`}
      viewBox="0 0 12 14"
      width="12"
      height="14"
      aria-hidden
      style={{ color }}
    >
      <path d="M2.6 1.2h8.9L8.7 4.8l2.8 3.6H2.6z" fill="currentColor" />
      <rect x="1" y="0.5" width="1.6" height="13" rx="0.8" fill="currentColor" opacity="0.75" />
    </svg>
  )
}

export type SortDir = 'asc' | 'desc'

/**
 * A column header that ranks the table. One tap sorts by the column, a second
 * flips the direction; the active column carries aria-sort and a lit arrow,
 * the others reserve the arrow's width so nothing shifts when it moves.
 */
export function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = '',
  numeric = true,
  hint,
  children,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
  className?: string
  numeric?: boolean
  hint?: string
  children?: ReactNode
}) {
  return (
    <th
      scope="col"
      className={`${numeric ? 'n' : ''} ${className}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className={`sorter ${active ? 'is-on' : ''}`}
        onClick={onClick}
        title={hint}
      >
        <span>{label}</span>
        {children}
        <svg
          className={`sorter-arrow ${dir === 'asc' ? 'is-asc' : ''}`}
          viewBox="0 0 10 10"
          width="9"
          height="9"
          aria-hidden
        >
          <path d="M1 3h8L5 8z" fill="currentColor" />
        </svg>
      </button>
    </th>
  )
}
