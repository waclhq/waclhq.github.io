import type { KeeperBlock, ManagerId } from './types'

/**
 * The war room's memory. Every tick a manager makes at the table is a
 * scratchpad, never the sheet — but a scratchpad that empties itself each
 * time the phone sleeps is useless on auction night. So ticks live in
 * localStorage, keyed by season, per manager, and each slot remembers the
 * fingerprint of the keeper sheet it was made against: when the commissioner
 * saves a new list, stale ticks fall back to the sheet on their own.
 */

export interface WarRoomSlot {
  ticks: string[]
  sheet: string
}

export interface WarRoomState {
  /** The team last open in the war room on this device. */
  team?: ManagerId
  slots: Record<ManagerId, WarRoomSlot>
}

const key = (season: number) => `wacl.warroom.${season}`

/** Lower-cased keeper names, sorted — the identity of a sheet at a moment. */
export function sheetFingerprint(block: KeeperBlock): string {
  return block.keepers
    .map((pick) => pick.player.trim().toLowerCase())
    .sort()
    .join('|')
}

export function readWarRoom(season: number): WarRoomState {
  try {
    const raw = localStorage.getItem(key(season))
    if (!raw) return { slots: {} }
    const parsed = JSON.parse(raw) as Partial<WarRoomState>
    return { team: parsed.team, slots: parsed.slots ?? {} }
  } catch {
    return { slots: {} }
  }
}

export function writeWarRoom(season: number, state: WarRoomState): void {
  try {
    localStorage.setItem(key(season), JSON.stringify(state))
  } catch {
    /* private browsing — the in-memory state still drives the page */
  }
}

/**
 * Auction arithmetic. The league has no roster-size constant in its data, so
 * the two derived figures assume Yahoo's standard fifteen-man roster; the
 * panel says so in plain words. Neither number is a workbook stat.
 */
export const AUCTION_ROSTER_SPOTS = 15

export function auctionMath(budget: number, kept: number) {
  const spots = Math.max(0, AUCTION_ROSTER_SPOTS - kept)
  const avg = spots > 0 ? budget / spots : 0
  // Every other open spot needs at least a dollar. A budget too small to
  // put a dollar on each one has no maximum bid at all — it has a hole, and
  // the shortfall is the size of it.
  const maxBid = spots > 0 ? Math.max(0, budget - (spots - 1)) : 0
  const shortfall = spots > 0 ? Math.max(0, spots - budget) : 0
  return { spots, avg, maxBid, shortfall }
}
