import type { KeeperBlock, LeagueData, Trade } from './types'

/**
 * Approved trades move players as well as dollars. The trade's players field
 * is free text, so this parses the names and walks them across the keeper
 * blocks of the trade's season: a name found on the seller's roster moves to
 * the buyer, and — so straight swaps need no special syntax — a name found on
 * the buyer's roster moves to the seller. The keeper contract (salary,
 * contract year) travels with the player and each block's keeper salary is
 * re-summed. Names matching neither roster are reported, not guessed.
 */

export interface RosterMoveResult {
  keepers: LeagueData['keepers']
  moved: { player: string; to: string }[]
  unmatched: string[]
}

function parsePlayers(players: string): string[] {
  return players
    .split(/<->|<>|↔|,|;|\/|\band\b|\+/i)
    .map((name) => name.trim())
    .filter(Boolean)
}

function findSpot(block: KeeperBlock | undefined, name: string): number {
  if (!block) return -1
  const needle = name.toLowerCase()
  return block.endingRoster.findIndex((spot) => spot.player.trim().toLowerCase() === needle)
}

export function applyTradeRoster(keepers: LeagueData['keepers'], trade: Trade): RosterMoveResult {
  const yearKey = String(trade.season)
  const blocks = keepers[yearKey]
  const names = parsePlayers(trade.players)
  if (!blocks || names.length === 0) return { keepers, moved: [], unmatched: names }

  const next = blocks.map((block) => ({
    ...block,
    endingRoster: [...block.endingRoster],
    keepers: [...block.keepers],
  }))
  const seller = next.find((block) => block.manager === trade.seller)
  const buyer = next.find((block) => block.manager === trade.buyer)
  if (!seller || !buyer) return { keepers, moved: [], unmatched: names }

  const moved: RosterMoveResult['moved'] = []
  const unmatched: string[] = []

  const moveContract = (from: KeeperBlock, to: KeeperBlock, player: string) => {
    const needle = player.trim().toLowerCase()
    const index = from.keepers.findIndex((pick) => pick.player.trim().toLowerCase() === needle)
    if (index < 0) return
    const [pick] = from.keepers.splice(index, 1)
    to.keepers.push(pick)
  }
  const resum = (block: KeeperBlock) => {
    if (block.keeperSalary === null) return
    block.keeperSalary = block.keepers.reduce((total, pick) => total + (pick.salary ?? 0), 0)
  }

  for (const name of names) {
    const fromSeller = findSpot(seller, name)
    if (fromSeller >= 0) {
      const [spot] = seller.endingRoster.splice(fromSeller, 1)
      buyer.endingRoster.push(spot)
      moveContract(seller, buyer, spot.player)
      moved.push({ player: spot.player, to: trade.buyer })
      continue
    }
    const fromBuyer = findSpot(buyer, name)
    if (fromBuyer >= 0) {
      const [spot] = buyer.endingRoster.splice(fromBuyer, 1)
      seller.endingRoster.push(spot)
      moveContract(buyer, seller, spot.player)
      moved.push({ player: spot.player, to: trade.seller })
      continue
    }
    unmatched.push(name)
  }

  if (moved.length === 0) return { keepers, moved, unmatched }
  resum(seller)
  resum(buyer)
  return { keepers: { ...keepers, [yearKey]: next }, moved, unmatched }
}
