import { money } from './format'
import type {
  ContractYear,
  FaabEntry,
  KeeperBlock,
  League,
  ManagerId,
  Trade,
  TradeLedger,
} from './types'

/* ------------------------------------------------------------------ *
 * Auction dollars
 * ------------------------------------------------------------------ */

/** Rebuilds the received/sent/net ledger from a trade list. */
export function buildLedger(trades: Trade[]): TradeLedger {
  const ledger: TradeLedger = {}
  for (const trade of trades) {
    if (trade.status !== 'approved') continue
    for (const obligation of trade.obligations) {
      const year = String(obligation.year)
      ledger[year] ??= {}
      const seller = (ledger[year][trade.seller] ??= { received: 0, sent: 0, net: 0 })
      const buyer = (ledger[year][trade.buyer] ??= { received: 0, sent: 0, net: 0 })
      seller.received += obligation.amount
      buyer.sent += obligation.amount
    }
  }
  for (const year of Object.keys(ledger)) {
    for (const entry of Object.values(ledger[year])) {
      entry.net = Math.round((entry.received - entry.sent) * 100) / 100
    }
  }
  return ledger
}

export interface DraftBudget {
  manager: ManagerId
  team: string
  base: number
  keeperSalary: number
  cashReceived: number
  cashSent: number
  cashNet: number
  available: number
  keeperCount: number
  overCommitted: boolean
}

/**
 * Draft budget for a season:
 *   $200 base − total keeper salaries + net auction dollars traded for that year.
 * A negative result is legal and has happened (El Morro entered 2026 at −$5).
 */
export function draftBudgets(
  league: League,
  blocks: KeeperBlock[] | undefined,
  ledger: TradeLedger,
  year: number,
): DraftBudget[] {
  const yearLedger = ledger[String(year)] ?? {}
  return (blocks ?? [])
    .filter((block): block is KeeperBlock & { manager: ManagerId } => Boolean(block.manager))
    .map((block) => {
      const keeperSalary = block.keepers.reduce((total, pick) => total + (pick.salary ?? 0), 0)
      const entry = yearLedger[block.manager] ?? { received: 0, sent: 0, net: 0 }
      const available = league.baseDraftBudget - keeperSalary + entry.net
      return {
        manager: block.manager,
        team: block.team,
        base: league.baseDraftBudget,
        keeperSalary,
        cashReceived: entry.received,
        cashSent: entry.sent,
        cashNet: entry.net,
        available,
        keeperCount: block.keepers.length,
        overCommitted: available < 0,
      }
    })
    .sort((a, b) => b.available - a.available)
}

/* ------------------------------------------------------------------ *
 * Keeper contracts
 * ------------------------------------------------------------------ */

const CONTRACT_ORDER: ContractYear[] = ['A', 'B', 'C', 'D']

/** Contract year A→B→C→D; D is the last season a player may be kept. */
export function nextContractYear(current: ContractYear | null): ContractYear | null {
  if (!current) return 'A'
  const index = CONTRACT_ORDER.indexOf(current)
  if (index < 0 || index >= CONTRACT_ORDER.length - 1) return null
  return CONTRACT_ORDER[index + 1]
}

export function isFinalContractYear(current: ContractYear | null): boolean {
  return current === 'D'
}

export function contractYearsRemaining(current: ContractYear | null): number {
  if (!current) return CONTRACT_ORDER.length
  const index = CONTRACT_ORDER.indexOf(current)
  return index < 0 ? 0 : CONTRACT_ORDER.length - 1 - index
}

export interface KeeperEligibility {
  player: string
  cost: number | null
  contractYear: ContractYear | null
  eligible: boolean
  reason: string
  nextYear: ContractYear | null
}

/** Which of a manager's ending roster can legally be kept next season. */
export function keeperEligibility(block: KeeperBlock): KeeperEligibility[] {
  return block.endingRoster.map((spot) => {
    const next = nextContractYear(spot.contractYear)
    if (!next) {
      return {
        player: spot.player,
        cost: spot.cost,
        contractYear: spot.contractYear,
        eligible: false,
        reason: 'Contract expired — max 4 years',
        nextYear: null,
      }
    }
    return {
      player: spot.player,
      cost: spot.cost,
      contractYear: spot.contractYear,
      eligible: true,
      reason: `Year ${next} of 4 if kept`,
      nextYear: next,
    }
  })
}

/* ------------------------------------------------------------------ *
 * FAAB
 * ------------------------------------------------------------------ */

/**
 * Keeper cost of a waiver pickup, from the league's sliding scale on the bid
 * as a percentage of the season FAAB budget.
 *   0–20% → $5 · 21–40% → $10 · 41–60% → $15 · >60% → $20
 * Verified against every 2025 claim that carried into the 2026 rosters.
 */
export function faabKeeperCost(bid: number, league: League): number {
  const percent = (bid / league.baseFaabBudget) * 100
  for (const tier of league.faabScale) {
    if (percent <= tier.maxPct) return tier.keeperCost
  }
  return league.faabScale[league.faabScale.length - 1].keeperCost
}

/**
 * A player drafted in the auction and later re-acquired off waivers keeps the
 * GREATER of the auction value and the waiver-derived cost.
 */
export function effectiveKeeperCost(
  auctionCost: number | null,
  waiverBid: number | null,
  league: League,
): { cost: number; basis: string } {
  const fromWaiver = waiverBid !== null ? faabKeeperCost(waiverBid, league) : null
  if (auctionCost !== null && fromWaiver !== null) {
    return auctionCost >= fromWaiver
      ? { cost: auctionCost, basis: 'Auction value (greater of the two)' }
      : { cost: fromWaiver, basis: `Waiver scale on ${money(waiverBid)} bid (greater of the two)` }
  }
  if (fromWaiver !== null) return { cost: fromWaiver, basis: `Waiver scale on ${money(waiverBid)} bid` }
  if (auctionCost !== null) return { cost: auctionCost, basis: 'Auction draft value' }
  return { cost: 5, basis: 'Undrafted free agent — flat $5' }
}

export interface FaabPosition {
  manager: ManagerId
  spent: number
  remaining: number
  claims: number
  pctUsed: number
}

export function faabPositions(
  league: League,
  entries: FaabEntry[],
  season: number,
  managers: ManagerId[],
): FaabPosition[] {
  const seasonEntries = entries.filter((entry) => entry.season === season)
  return managers
    .map((manager) => {
      const mine = seasonEntries.filter((entry) => entry.manager === manager)
      const spent = mine.reduce((total, entry) => total + entry.bid, 0)
      return {
        manager,
        spent,
        remaining: league.baseFaabBudget - spent,
        claims: mine.length,
        pctUsed: spent / league.baseFaabBudget,
      }
    })
    .sort((a, b) => b.spent - a.spent)
}

/* ------------------------------------------------------------------ *
 * Anti-dumping / market check
 * ------------------------------------------------------------------ */

export interface AntiDumpingVerdict {
  triggered: boolean
  firstYearAmount: number | null
  summary: string
}

export const MARKET_CHECK_HOURS = 24

/**
 * The anti-dumping rule: if a trade moves less than $10 in the *subsequent*
 * year, the commissioner may hold it 24 hours for a market check. Per the rule
 * text, a $5/$10 trade triggers but a $10/$2 trade does not — the test is the
 * first obligation year, not the total.
 */
export function antiDumpingCheck(trade: Pick<Trade, 'obligations'>): AntiDumpingVerdict {
  const sorted = [...trade.obligations].sort((a, b) => a.year - b.year)
  const first = sorted[0]
  if (!first) {
    return {
      triggered: true,
      firstYearAmount: 0,
      summary: 'No cash changes hands — review as a player-for-player swap.',
    }
  }
  if (first.amount < 10) {
    return {
      triggered: true,
      firstYearAmount: first.amount,
      summary: `${money(first.amount)} in ${first.year} is below the ${money(10)} trigger — market check available.`,
    }
  }
  return {
    triggered: false,
    firstYearAmount: first.amount,
    summary: `${money(first.amount)} in ${first.year} clears the ${money(10)} trigger.`,
  }
}

export function marketCheckDeadline(from = new Date()): string {
  return new Date(from.getTime() + MARKET_CHECK_HOURS * 3_600_000).toISOString()
}

/* ------------------------------------------------------------------ *
 * Trade validation
 * ------------------------------------------------------------------ */

export interface TradeIssue {
  level: 'error' | 'warning'
  message: string
}

/** Blocking errors vs. things worth a second look before approving. */
export function validateTrade(
  trade: Pick<Trade, 'seller' | 'buyer' | 'players' | 'obligations' | 'season'>,
  league: League,
  budgets: DraftBudget[],
): TradeIssue[] {
  const issues: TradeIssue[] = []

  if (!trade.seller || !trade.buyer) {
    issues.push({ level: 'error', message: 'Both a seller and a buyer are required.' })
  }
  if (trade.seller && trade.seller === trade.buyer) {
    issues.push({ level: 'error', message: 'Seller and buyer must be different managers.' })
  }
  if (!trade.players.trim()) {
    issues.push({ level: 'error', message: 'List the players involved.' })
  }

  const years = trade.obligations.map((obligation) => obligation.year)
  if (new Set(years).size !== years.length) {
    issues.push({ level: 'error', message: 'Each obligation year may appear only once.' })
  }
  for (const obligation of trade.obligations) {
    if (obligation.amount < 0) {
      issues.push({
        level: 'error',
        message: `Negative amount in ${obligation.year} — record the direction with seller/buyer instead.`,
      })
    }
    if (obligation.year > league.currentSeason + league.maxContractYears) {
      issues.push({
        level: 'warning',
        message: `${obligation.year} is beyond the ${league.maxContractYears}-year contract horizon.`,
      })
    }
  }

  // Would the buyer end up underwater in the first obligation year?
  const first = [...trade.obligations].sort((a, b) => a.year - b.year)[0]
  if (first && first.year === league.currentSeason) {
    const buyerBudget = budgets.find((budget) => budget.manager === trade.buyer)
    if (buyerBudget) {
      const after = buyerBudget.available - first.amount
      if (after < 0) {
        issues.push({
          level: 'warning',
          message: `Buyer would sit at ${money(after)} for the ${first.year} draft.`,
        })
      }
    }
  }

  const verdict = antiDumpingCheck(trade)
  if (verdict.triggered) {
    issues.push({ level: 'warning', message: `Anti-dumping: ${verdict.summary}` })
  }

  return issues
}

/** Net auction-dollar swing this trade causes, by manager and year. */
export function tradeImpact(trade: Pick<Trade, 'seller' | 'buyer' | 'obligations'>): {
  year: number
  seller: number
  buyer: number
}[] {
  return [...trade.obligations]
    .sort((a, b) => a.year - b.year)
    .map((obligation) => ({
      year: obligation.year,
      seller: obligation.amount,
      buyer: -obligation.amount,
    }))
}
