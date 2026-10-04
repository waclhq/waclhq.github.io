import type { Manager, ManagerId } from './types'

/**
 * Every manager owns one colour for the life of the league. It appears on their
 * badge, their standings row, their contract bars — so the league reads as
 * twelve identities rather than twelve rows of grey.
 *
 * All values are bright enough to carry near-black badge text on a dark panel.
 */
export const MANAGER_COLOR: Record<ManagerId, string> = {
  varghese: '#5a83ff',
  waldman: '#ff5f52',
  tollinche: '#8be356',
  buzik: '#b07cff',
  bernstein: '#ffa92e',
  baugh: '#3fe0f5',
  velamoor: '#ff6fb3',
  mukheja: '#ff33f5',
  snyder: '#4db8ff',
  incognito: '#2ad68a',
  konciak: '#c98d5f',
  lalwani: '#ffd84d',
  // Former managers sit muted so the active twelve stay loudest.
  evans: '#8d84a8',
  banerjee: '#7d7398',
  kim: '#9a92b0',
  kurucz: '#6e6588',
}

export const FALLBACK_COLOR = '#8d84a8'

export function managerColor(id: ManagerId | null | undefined): string {
  if (!id) return FALLBACK_COLOR
  return MANAGER_COLOR[id] ?? FALLBACK_COLOR
}

/** Two letters for the badge — distinct across the whole league. */
export function managerInitials(manager: Manager | undefined, id?: ManagerId): string {
  const source = manager?.displayName ?? id ?? '?'
  const parts = source.trim().split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}
