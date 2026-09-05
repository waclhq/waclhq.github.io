import { Link } from 'react-router-dom'
import { useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import type { ManagerId } from '../../lib/types'
import PixelMugshot from '../PixelMugshot'

/**
 * A manager's name as a door, in prose or a table cell: ink type with an
 * underline in the manager's own colour, so on a phone — where nothing
 * hovers — every tappable name still says whose it is. Optionally leads with
 * the face.
 */
export function ManagerLink({
  id,
  face = false,
  className = '',
}: {
  id: ManagerId | null | undefined
  face?: boolean
  className?: string
}) {
  const { managers } = useLeagueData()
  const me = useMe()
  const manager = managers.find((candidate) => candidate.id === id)
  const name = manager?.displayName ?? id ?? '—'
  if (!id) return <span className="text-arc-ink-soft">{name}</span>
  return (
    <Link
      to={`/managers/${id}`}
      className={`pf-name ${id === me ? 'pf-name-me' : ''} ${className}`}
      style={{ ['--c' as string]: managerColor(id) }}
    >
      {face && (
        <span className="pf-face pf-face-sm" aria-hidden>
          <PixelMugshot seed={id} scale={1} />
        </span>
      )}
      <span>{name}</span>
    </Link>
  )
}

/** A framed face at a fixed size, ringed in the manager's colour. */
export function Face({
  id,
  size = 40,
  ring = true,
}: {
  id: ManagerId
  size?: number
  ring?: boolean
}) {
  return (
    <span
      className={`pf-face ${ring ? 'pf-face-ring' : ''}`}
      style={{ width: size, height: size, ['--c' as string]: managerColor(id) }}
      aria-hidden
    >
      <PixelMugshot seed={id} scale={2} />
    </span>
  )
}
