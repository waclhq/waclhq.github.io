import { normalizePlayer } from './analytics'
import type { LeagueData, ManagerId } from './types'

/*
 * A player's file, keyed by the canonical slug. /players/aaronrodgers,
 * /players/aaron%20rodgers and /players/Aaron%20Rodgers all resolve to the
 * same sheet, because every comparison runs through normalizePlayer — the
 * same normaliser the points and positions extractors use.
 */

export interface PlayerStint {
  year: number
  team: string
  manager: ManagerId | null
  cost: number | null
  contractYear: string | null
  kept: boolean
}

export interface PlayerTrade {
  id: string
  batch: string
  season: number
  seller: ManagerId
  buyer: ManagerId
  total: number
  players: string
}

export interface PlayerFile {
  /** The prettiest spelling the rosters carry. */
  name: string
  slug: string
  position: string | null
  stints: PlayerStint[]
  trades: PlayerTrade[]
  owners: ManagerId[]
  peak: { cost: number; year: number; manager: ManagerId | null } | null
  firstSeen: number | null
  lastSeen: number | null
}

export function playerSlugOf(name: string): string {
  return normalizePlayer(name)
}

export function playerFile(data: LeagueData, raw: string): PlayerFile {
  const needle = normalizePlayer(raw)
  const stints: PlayerStint[] = []
  let display = raw

  if (needle) {
    for (const [year, blocks] of Object.entries(data.keepers)) {
      for (const block of blocks) {
        const kept = block.keepers.find((pick) => normalizePlayer(pick.player) === needle)
        const spot = (block.endingRoster ?? []).find((row) => normalizePlayer(row.player) === needle)
        if (!kept && !spot) continue
        display = kept?.player ?? spot?.player ?? display
        stints.push({
          year: Number(year),
          team: block.team,
          manager: block.manager,
          cost: kept?.salary ?? spot?.cost ?? null,
          contractYear: kept?.contractYear ?? spot?.contractYear ?? null,
          kept: Boolean(kept),
        })
      }
    }
  }

  const trades: PlayerTrade[] = needle
    ? data.trades
        .filter((trade) => normalizePlayer(trade.players).includes(needle))
        .map((trade) => ({
          id: trade.id,
          batch: trade.batch,
          season: trade.season,
          seller: trade.seller,
          buyer: trade.buyer,
          total: trade.totalDollars,
          players: trade.players,
        }))
    : []

  const owners: ManagerId[] = []
  for (const stint of [...stints].sort((a, b) => a.year - b.year)) {
    if (stint.manager && !owners.includes(stint.manager)) owners.push(stint.manager)
  }

  let peak: PlayerFile['peak'] = null
  for (const stint of stints) {
    if (stint.cost === null) continue
    if (!peak || stint.cost > peak.cost || (stint.cost === peak.cost && stint.year < peak.year)) {
      peak = { cost: stint.cost, year: stint.year, manager: stint.manager }
    }
  }

  const years = stints.map((stint) => stint.year)
  return {
    name: display,
    slug: needle,
    position: data.playerPositions?.[needle] ?? null,
    stints: stints.sort((a, b) => b.year - a.year),
    trades,
    owners,
    peak,
    firstSeen: years.length ? Math.min(...years) : null,
    lastSeen: years.length ? Math.max(...years) : null,
  }
}
