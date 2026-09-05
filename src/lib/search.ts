import { normalizePlayer } from './analytics'
import type { LeagueData, ManagerId } from './types'

export type ResultKind = 'page' | 'manager' | 'player' | 'trade'

export interface SearchResult {
  kind: ResultKind
  id: string
  title: string
  subtitle: string
  to: string
}

export const PAGES: { title: string; subtitle: string; to: string; aliases: string }[] = [
  { title: 'Ledger', subtitle: 'The desk: what changed, what needs a ruling', to: '/', aliases: 'home desk dashboard budgets overview' },
  { title: 'Trades', subtitle: 'Approval queue and trade history', to: '/trades', aliases: 'queue pending approve trade history' },
  { title: 'Keepers', subtitle: 'Rosters, contracts, and the contract board', to: '/keepers', aliases: 'contracts rosters keeper team' },
  { title: 'Draft Board', subtitle: 'Top-ranked players still available at auction', to: '/draft', aliases: 'auction war room rankings available' },
  { title: 'Finances', subtitle: 'Auction dollars and cash', to: '/finances', aliases: 'dues cash money owed payouts venmo' },
  { title: 'The Book', subtitle: 'Side bets between managers', to: '/bets', aliases: 'bets bet book side action wager stake' },
  { title: 'Standings', subtitle: 'Final tables, season by season', to: '/standings', aliases: 'table final results season' },
  { title: 'Managers', subtitle: 'Career records', to: '/managers', aliases: 'people career profiles' },
  { title: 'Records', subtitle: 'Leaderboards, trade flow, champions', to: '/records', aliases: 'leaderboards podium all-time best worst' },
  { title: 'The Lab', subtitle: 'Luck index, GOAT index, Elo, title odds, contracts', to: '/lab', aliases: 'odds vegas luck goat elo roast stats' },
  { title: 'Almanac', subtitle: 'The written record, one entry per season', to: '/almanac', aliases: 'history years champions banners' },
  { title: 'Rules', subtitle: 'League constitution', to: '/rules', aliases: 'constitution bylaws rulebook' },
  { title: 'Manual', subtitle: "Commissioner's guide — how to run the league here", to: '/guide', aliases: 'guide help how to commissioner instructions' },
]

/** /players/<slug>: the normalized name ("Ja'Marr Chase" and "JaMarr Chase" share one door). */
export function playerSlug(name: string): string {
  return normalizePlayer(name) || encodeURIComponent(name.toLowerCase().trim())
}

export interface PlayerStint {
  year: number
  team: string
  manager: ManagerId | null
  cost: number | null
  contractYear: string | null
  kept: boolean
}

export interface PlayerDossier {
  name: string
  stints: PlayerStint[]
  trades: { id: string; batch: string; seller: ManagerId; buyer: ManagerId; total: number }[]
  peakCost: number | null
  firstSeen: number | null
  lastSeen: number | null
}

/**
 * Every roster appearance for one player, across every keeper sheet. Matching
 * is case-insensitive because the workbook spells names inconsistently between
 * vintages ("Ja'Marr Chase" vs "JaMarr Chase").
 */
export function playerDossier(data: LeagueData, rawName: string): PlayerDossier {
  const needle = rawName.toLowerCase().trim()
  const stints: PlayerStint[] = []
  let display = rawName

  for (const [year, blocks] of Object.entries(data.keepers)) {
    for (const block of blocks) {
      const kept = block.keepers.find((pick) => pick.player.toLowerCase().trim() === needle)
      const spot = block.endingRoster.find((row) => row.player.toLowerCase().trim() === needle)
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

  const trades = data.trades
    .filter((trade) => trade.players.toLowerCase().includes(needle))
    .map((trade) => ({
      id: trade.id,
      batch: trade.batch,
      seller: trade.seller,
      buyer: trade.buyer,
      total: trade.totalDollars,
    }))

  const costs = stints.map((stint) => stint.cost).filter((cost): cost is number => cost !== null)
  const years = stints.map((stint) => stint.year)

  return {
    name: display,
    stints: stints.sort((a, b) => b.year - a.year),
    trades,
    peakCost: costs.length ? Math.max(...costs) : null,
    firstSeen: years.length ? Math.min(...years) : null,
    lastSeen: years.length ? Math.max(...years) : null,
  }
}

/** Distinct player names across every roster the league has recorded. */
export function allPlayers(data: LeagueData): string[] {
  const seen = new Map<string, string>()
  for (const blocks of Object.values(data.keepers)) {
    for (const block of blocks) {
      for (const row of block.endingRoster) {
        const key = row.player.toLowerCase().trim()
        if (!seen.has(key)) seen.set(key, row.player)
      }
      for (const pick of block.keepers) {
        const key = pick.player.toLowerCase().trim()
        if (!seen.has(key)) seen.set(key, pick.player)
      }
    }
  }
  return [...seen.values()]
}

/**
 * Subsequence fuzzy match — "jgib" finds "Jahmyr Gibbs". Returns a score where
 * lower is better, or null when the query does not match at all.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0

  const direct = t.indexOf(q)
  if (direct === 0) return 0
  if (direct > 0) return 1 + direct * 0.01

  let index = 0
  let score = 0
  let lastHit = -1
  for (const char of q) {
    const found = t.indexOf(char, index)
    if (found === -1) return null
    // Reward hits that start a word and consecutive runs.
    const startsWord = found === 0 || t[found - 1] === ' ' || t[found - 1] === '-'
    score += startsWord ? 1 : found === lastHit + 1 ? 2 : 5
    lastHit = found
    index = found + 1
  }
  return 40 + score
}

export function buildResults(data: LeagueData, query: string, limit = 24): SearchResult[] {
  const trimmed = query.trim()
  const scored: { result: SearchResult; score: number }[] = []

  const push = (result: SearchResult, haystack: string, bias: number) => {
    const score = fuzzyScore(trimmed, haystack)
    if (score !== null) scored.push({ result, score: score + bias })
  }

  for (const page of PAGES) {
    const result = { kind: 'page' as const, id: page.to, title: page.title, subtitle: page.subtitle, to: page.to }
    // Best of: the title, any alias, the subtitle — so "bets" and "help" land.
    const scores = [page.title, ...page.aliases.split(' '), page.subtitle]
      .map((haystack) => fuzzyScore(trimmed, haystack))
      .filter((score): score is number => score !== null)
    if (scores.length) scored.push({ result, score: Math.min(...scores) })
  }

  for (const manager of data.managers) {
    const label = `${manager.displayName} ${manager.surname} ${manager.team ?? ''}`
    push(
      {
        kind: 'manager',
        id: manager.id,
        title: manager.displayName,
        subtitle: manager.active
          ? (manager.team ?? 'Active manager')
          : 'Former manager',
        to: `/managers/${manager.id}`,
      },
      label,
      2,
    )
  }

  // Players are the largest bucket, so they sit behind pages and managers.
  if (trimmed.length >= 2) {
    for (const player of allPlayers(data)) {
      push(
        {
          kind: 'player',
          id: player,
          title: player,
          subtitle: data.playerPositions?.[normalizePlayer(player)]
            ? `${data.playerPositions[normalizePlayer(player)]} · player history`
            : 'Player history',
          to: `/players/${playerSlug(player)}`,
        },
        player,
        6,
      )
    }
  }

  if (trimmed.length >= 3) {
    for (const trade of data.trades.slice(0, 60)) {
      push(
        {
          kind: 'trade',
          id: trade.id,
          title: trade.players,
          subtitle: `${trade.batch} · $${trade.totalDollars}`,
          to: '/trades',
        },
        trade.players,
        14,
      )
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.result.title.localeCompare(b.result.title))
    .slice(0, limit)
    .map((entry) => entry.result)
}
