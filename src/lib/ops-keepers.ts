import { managerName } from './data'
import type { KeeperBlock, Manager, ManagerId } from './types'

/**
 * One order for the twelve, everywhere on the Keepers page: the seat picked
 * on this device first, then by the name people actually use (the manager,
 * not this year's team name), teams without a manager last.
 */
export function orderBlocks(
  blocks: KeeperBlock[],
  managers: Manager[],
  me: ManagerId | null,
): KeeperBlock[] {
  return [...blocks].sort((a, b) => {
    if (a.manager === me && b.manager !== me) return -1
    if (b.manager === me && a.manager !== me) return 1
    if (!a.manager && b.manager) return 1
    if (a.manager && !b.manager) return -1
    return managerName(managers, a.manager).localeCompare(managerName(managers, b.manager))
  })
}

/** "Baugh — Juggernaut": manager first, team second, on every list. */
export function blockLabel(block: KeeperBlock, managers: Manager[]): string {
  return block.manager ? `${managerName(managers, block.manager)} — ${block.team}` : block.team
}

/** Anchor id for a team card: the manager id, or a slug of the team name. */
export function blockAnchor(block: KeeperBlock): string {
  return block.manager ?? block.team.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
