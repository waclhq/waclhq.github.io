import type { KeeperBlock, LeagueData, Trade } from './types'

/**
 * Approved trades move players as well as dollars. The trade's players field
 * is free text, so this parses the names and walks them across the keeper
 * blocks of the trade's season: a name found on the seller's roster moves to
 * the buyer, and — when the deal is written as a swap — a name found on the
 * buyer's roster moves the other way. The keeper contract (salary, contract
 * year) travels with the player and each block's keeper salary is re-summed.
 * Names matching neither roster are reported, not guessed.
 *
 * RUNNING IT TWICE MUST BE SAFE. A commit can fail after the approval landed,
 * so the roster half gets retried; if a one-way move were re-read as a swap
 * leg on the second pass it would carry the player back and quietly undo the
 * trade. So a name already sitting on the buyer counts as done, and only a
 * deal that says it is a swap moves anyone backwards.
 */

export interface RosterMoveResult {
  keepers: LeagueData['keepers']
  moved: { player: string; to: string }[]
  unmatched: string[]
  /** Names already where the trade would put them: a retry, not a mistake. */
  settled: string[]
}

/** Written as a swap: "A <-> B", "A ↔ B", "A <> B". */
function isSwap(players: string): boolean {
  return /<->|<>|↔/.test(players)
}

function parsePlayers(players: string): string[] {
  return players
    .split(/<->|<>|↔|,|;|\/|\band\b|\+/i)
    .map((name) => name.trim())
    .filter(Boolean)
}

/**
 * Rosters carry a player's full name; a trade is typed by hand and often does
 * not. "Kyle Pitts" has to find "Kyle Pitts Sr." — twenty-eight names on the
 * current rosters wear a generational suffix — so an exact match is tried
 * first and, failing that, one that ignores suffixes and punctuation.
 *
 * The looser pass only counts when it lands on exactly one player. Two names
 * on one roster that blur into each other (2017 fielded two defenses both
 * written "Los Angeles") stay unmatched and get reported, which is the honest
 * answer: a guess here moves the wrong player.
 */
const SUFFIX = /\b(?:jr|sr|ii|iii|iv)\b/g

function loosely(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(SUFFIX, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function indexOfPlayer(list: { player: string }[], name: string): number {
  const exact = name.trim().toLowerCase()
  const hit = list.findIndex((row) => row.player.trim().toLowerCase() === exact)
  if (hit >= 0) return hit
  const needle = loosely(name)
  if (!needle) return -1
  let only = -1
  for (let i = 0; i < list.length; i += 1) {
    if (loosely(list[i].player) !== needle) continue
    if (only >= 0) return -1
    only = i
  }
  return only
}

function findSpot(block: KeeperBlock | undefined, name: string): number {
  return block ? indexOfPlayer(block.endingRoster, name) : -1
}

/**
 * Undoing an approval: the same walk with the two sides exchanged, so every
 * player the trade carried is carried home. A one-way deal reverts safely
 * twice over — on the second pass the names are already back on the seller,
 * which reads as settled — while a swap, as ever, moves whoever it finds.
 */
export function revertTradeRoster(
  keepers: LeagueData['keepers'],
  trade: Trade,
): RosterMoveResult {
  return applyTradeRoster(keepers, { ...trade, seller: trade.buyer, buyer: trade.seller })
}

export function applyTradeRoster(keepers: LeagueData['keepers'], trade: Trade): RosterMoveResult {
  const yearKey = String(trade.season)
  const blocks = keepers[yearKey]
  const names = parsePlayers(trade.players)
  if (!blocks || names.length === 0) return { keepers, moved: [], unmatched: names, settled: [] }

  const next = blocks.map((block) => ({
    ...block,
    endingRoster: [...block.endingRoster],
    keepers: [...block.keepers],
  }))
  const seller = next.find((block) => block.manager === trade.seller)
  const buyer = next.find((block) => block.manager === trade.buyer)
  if (!seller || !buyer) return { keepers, moved: [], unmatched: names, settled: [] }

  const moved: RosterMoveResult['moved'] = []
  const unmatched: string[] = []
  const settled: string[] = []
  const swap = isSwap(trade.players)

  const moveContract = (from: KeeperBlock, to: KeeperBlock, player: string) => {
    const index = indexOfPlayer(from.keepers, player)
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
      // Already on the buyer: on a one-way deal this move has happened, and
      // sending them back is how a retry undoes a trade.
      if (!swap) {
        settled.push(buyer.endingRoster[fromBuyer].player)
        continue
      }
      const [spot] = buyer.endingRoster.splice(fromBuyer, 1)
      seller.endingRoster.push(spot)
      moveContract(buyer, seller, spot.player)
      moved.push({ player: spot.player, to: trade.seller })
      continue
    }
    unmatched.push(name)
  }

  if (moved.length === 0) return { keepers, moved, unmatched, settled }
  resum(seller)
  resum(buyer)
  return { keepers: { ...keepers, [yearKey]: next }, moved, unmatched, settled }
}
