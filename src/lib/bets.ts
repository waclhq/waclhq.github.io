import type { BetResult, ManagerId } from './types'

/**
 * Side bets. These live in their own repo (see betsRepo.ts) so the whole
 * league can write them without holding a token that could touch keepers,
 * trades, or cash. Everything here is pure derivation over that file.
 */

export type BetStatus = 'proposed' | 'live' | 'settled' | 'void'
export type StakeKind = 'cash' | 'forfeit'

export interface Bet {
  id: string
  season: number
  proposer: ManagerId
  opponent: ManagerId
  terms: string
  stakeKind: StakeKind
  /** Dollars the proposer puts up; 0 when the stake is a forfeit. */
  stake: number
  /**
   * Dollars the opponent puts up, which is what the proposer collects on a
   * win. Absent on an even-money bet (and on every bet from before odds), so
   * both sides risk `stake`. The odds are just the ratio of the two.
   */
  toWin?: number
  /** What the loser owes when it isn't money. */
  forfeit: string
  /** Free text — "Week 3", "End of season", a date. */
  resolves: string
  status: BetStatus
  winner: ManagerId | null
  proposedAt: string
  acceptedAt?: string
  settledAt?: string
  /** When the loser actually handed the money over. Resolving != paying. */
  paidAt?: string
  /** Who last touched it, by display name — the shared password has no identity. */
  lastTouchedBy?: string
}

export interface BetsFile {
  bets: Bet[]
}

export const EMPTY_BETS: BetsFile = { bets: [] }

/**
 * Fold the commissioner's settlements into the league-writable bets.
 *
 * A winner is only ever taken from the results file, which lives in the repo
 * the league password cannot touch. A bet that claims `settled` in bets.json
 * without a matching result is treated as still live — otherwise anyone
 * holding the shared password could declare themselves the winner by editing
 * the file directly.
 */
export function applyResults(bets: Bet[], results: BetResult[]): Bet[] {
  const byId = new Map(results.map((r) => [r.betId, r]))
  return bets.map((bet) => {
    const result = byId.get(bet.id)
    if (result) {
      return { ...bet, status: 'settled', winner: result.winner, settledAt: result.settledAt }
    }
    return bet.status === 'settled'
      ? { ...bet, status: 'live', winner: null, settledAt: undefined }
      : bet
  })
}

export function newBetId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** How long a bet reads as fresh money on the board. */
export const NEW_BET_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * True while a bet is still new — two days from the handshake, or from the
 * proposal for one nobody has taken yet. Drives the flaming badge on the
 * board, so the eye lands on this week's action rather than the backlog.
 */
export function isNewBet(bet: Bet, now: number = Date.now()): boolean {
  const stamp = bet.acceptedAt ?? bet.proposedAt
  const at = stamp ? Date.parse(stamp) : NaN
  if (Number.isNaN(at)) return false
  // A clock running fast should not hide a brand-new bet.
  return now - at < NEW_BET_WINDOW_MS
}

/** The fields the commissioner can correct after the fact. */
export interface BetEdit {
  terms: string
  stakeKind: StakeKind
  stake: number
  /** The opponent's side; null for even money. */
  toWin: number | null
  forfeit: string
  resolves: string
  /** Cash bets only — whether the loser has handed the money over. */
  paid: boolean
}

export function betEditOf(bet: Bet): BetEdit {
  return {
    terms: bet.terms,
    stakeKind: bet.stakeKind,
    stake: bet.stake,
    toWin: isEven(bet) ? null : riskOf(bet, 'opponent'),
    forfeit: bet.forfeit,
    resolves: bet.resolves,
    paid: Boolean(bet.paidAt),
  }
}

/**
 * Fold a correction back into a bet, keeping the two stake kinds from
 * contaminating each other — a bet edited down to a dare carries no dollars,
 * and a bet edited up to cash carries no forfeit text.
 */
export function editedBet(bet: Bet, edit: BetEdit, now: string): Bet {
  const cash = edit.stakeKind === 'cash'
  const stake = cash ? Math.max(0, Math.round(edit.stake)) : 0
  const toWin = cash && edit.toWin !== null ? Math.round(edit.toWin) : null
  return {
    ...bet,
    terms: edit.terms.trim(),
    stakeKind: edit.stakeKind,
    stake,
    toWin: toWin !== null && toWin > 0 && toWin !== stake ? toWin : undefined,
    forfeit: cash ? '' : edit.forfeit.trim(),
    resolves: edit.resolves.trim(),
    paidAt: edit.paid ? (bet.paidAt ?? now) : undefined,
  }
}

export function sideOf(bet: Bet, manager: ManagerId): 'proposer' | 'opponent' | null {
  if (bet.proposer === manager) return 'proposer'
  if (bet.opponent === manager) return 'opponent'
  return null
}

export function loserOf(bet: Bet): ManagerId | null {
  if (!bet.winner) return null
  return bet.winner === bet.proposer ? bet.opponent : bet.proposer
}

/* ------------------------------------------------------------------ *
 * Odds. A bet is two amounts: what the proposer puts up (`stake`) and
 * what the opponent puts up (`toWin`). Even money is the two being equal.
 * Prices read the sportsbook way, from one side: +150 risks 100 to win
 * 150, −200 risks 200 to win 100.
 * ------------------------------------------------------------------ */

/** What one side of a cash bet puts up. A forfeit carries no dollars. */
export function riskOf(bet: Bet, side: 'proposer' | 'opponent'): number {
  if (bet.stakeKind !== 'cash') return 0
  if (side === 'proposer') return bet.stake
  const w = bet.toWin
  // Anything that isn't a positive number reads as even money.
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : bet.stake
}

/** What a manager puts up on this bet; 0 when they aren't on it. */
export function riskFor(bet: Bet, manager: ManagerId | null): number {
  const side = manager ? sideOf(bet, manager) : null
  return side ? riskOf(bet, side) : 0
}

/** What a manager collects if they win: the other side's money. */
export function prizeFor(bet: Bet, manager: ManagerId | null): number {
  const side = manager ? sideOf(bet, manager) : null
  return side ? riskOf(bet, side === 'proposer' ? 'opponent' : 'proposer') : 0
}

/** True for a dare, or a cash bet where both sides put up the same. */
export function isEven(bet: Bet): boolean {
  return bet.stakeKind !== 'cash' || riskOf(bet, 'opponent') === bet.stake
}

/** What changes hands once it's called: the loser's side. */
export function owedOn(bet: Bet): number {
  const loser = loserOf(bet)
  return loser ? riskFor(bet, loser) : 0
}

/** The most that can change hands — the bigger side. Even money: the stake. */
export function topRisk(bet: Bet): number {
  return Math.max(riskOf(bet, 'proposer'), riskOf(bet, 'opponent'))
}

/** American odds for risking `risk` to win `win`: +150, −200, or ±100 at evens. */
export function americanOdds(risk: number, win: number): number {
  if (!(risk > 0) || !(win > 0)) return 100
  return win >= risk ? Math.round((100 * win) / risk) : -Math.round((100 * risk) / win)
}

/** "+150", "−200", or "EVEN". */
export function oddsText(odds: number): string {
  if (Math.abs(odds) <= 100) return 'EVEN'
  return odds > 0 ? `+${odds}` : `\u2212${-odds}`
}

/** The price from one side — the proposer's unless a manager is named. */
export function oddsOf(bet: Bet, manager?: ManagerId | null): string {
  const who = manager && sideOf(bet, manager) ? manager : bet.proposer
  return oddsText(americanOdds(riskFor(bet, who), prizeFor(bet, who)))
}

/**
 * Read a price as typed: American ("+150", "150", "-200", "−200"), the
 * way people say it ("4:1", "4/1", "4-1", "4 to 1", "1:2"), or "even",
 * "evs", "pk". Returns American odds (±100 for evens), or null for anything
 * that isn't a price — an American magnitude under 100 is not one.
 */
export function parseOdds(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[\u2212\u2013\u2014]/g, '-')
  if (!t) return null
  if (/^(e|ev|evs|even|evens|pk|pick|pickem)$/.test(t)) return 100
  // Fractional: win `a` for every `b` put up. 4:1 is +400, 1:2 is −200.
  const f = /^(\d+(?:\.\d+)?)\s*(?::|\/|-|to)\s*(\d+(?:\.\d+)?)$/.exec(t)
  if (f) {
    const [a, b] = [Number(f[1]), Number(f[2])]
    if (!(a > 0) || !(b > 0) || a / b > 100 || b / a > 100) return null
    return americanOdds(b, a)
  }
  const m = /^([+-]?)(\d{3,5})$/.exec(t)
  if (!m) return null
  const n = Number(m[2])
  if (n < 100) return null
  return m[1] === '-' ? -n : n
}

/** What `risk` wins at a price, to the dollar (never less than one). */
export function winAt(risk: number, odds: number): number {
  const win = odds >= 100 ? (risk * odds) / 100 : (risk * 100) / -odds
  return Math.max(1, Math.round(win))
}

/**
 * Fair odds from a win probability, with no house cut — two friends don't
 * need a bookie's margin. Kept inside 2%–98% so a blowout doesn't print a
 * five-digit price.
 */
export function fairOdds(probability: number): number {
  const p = Math.min(0.98, Math.max(0.02, probability))
  if (Math.abs(p - 0.5) < 0.005) return 100
  const raw = p > 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p
  // Round to the nearest five, the way a board prints them.
  const five = Math.round(raw / 5) * 5
  return Math.abs(five) < 100 ? 100 : five
}

/**
 * A one-line summary of what's on the line, for slips and tickers. Even
 * money is one number; a priced bet reads from the proposer's side unless a
 * manager is named: "$20 to win $30".
 */
export function stakeLabel(bet: Bet, manager?: ManagerId | null): string {
  if (bet.stakeKind !== 'cash') return bet.forfeit || 'Forfeit'
  if (isEven(bet)) return `$${bet.stake}`
  const who = manager && sideOf(bet, manager) ? manager : bet.proposer
  return `$${riskFor(bet, who)} to win $${prizeFor(bet, who)}`
}

export interface BetRecord {
  manager: ManagerId
  won: number
  lost: number
  settled: number
  winPct: number
  /** Cash won minus cash lost across settled cash bets. */
  net: number
  /** Bets currently live. */
  live: number
  /** Cash riding on live bets. */
  exposure: number
  /** Current run: positive for wins, negative for losses. */
  streak: number
}

function blankRecord(manager: ManagerId): BetRecord {
  return {
    manager,
    won: 0,
    lost: 0,
    settled: 0,
    winPct: 0,
    net: 0,
    live: 0,
    exposure: 0,
    streak: 0,
  }
}

/** Career betting records, most profitable first. */
export function betRecords(bets: Bet[]): BetRecord[] {
  const rows = new Map<ManagerId, BetRecord>()
  const touch = (id: ManagerId) => {
    const row = rows.get(id) ?? blankRecord(id)
    rows.set(id, row)
    return row
  }

  for (const bet of bets) {
    if (bet.status === 'void') continue
    const a = touch(bet.proposer)
    const b = touch(bet.opponent)

    if (bet.status === 'live') {
      for (const row of [a, b]) {
        row.live += 1
        row.exposure += riskFor(bet, row.manager)
      }
      continue
    }
    if (bet.status !== 'settled' || !bet.winner) continue

    const loser = loserOf(bet)
    // The loser's side is what changes hands, whichever way the price ran.
    const owed = owedOn(bet)
    for (const row of [a, b]) {
      row.settled += 1
      if (row.manager === bet.winner) {
        row.won += 1
        row.net += owed
      } else if (row.manager === loser) {
        row.lost += 1
        row.net -= owed
      }
    }
  }

  // Streaks run over settled bets in chronological order.
  const settled = bets
    .filter((bet) => bet.status === 'settled' && bet.winner)
    .sort((a, b) => (a.settledAt ?? '').localeCompare(b.settledAt ?? ''))
  for (const row of rows.values()) {
    let streak = 0
    for (const bet of settled) {
      if (!sideOf(bet, row.manager)) continue
      const won = bet.winner === row.manager
      streak = won ? (streak > 0 ? streak + 1 : 1) : streak < 0 ? streak - 1 : -1
    }
    row.streak = streak
    row.winPct = row.settled ? row.won / row.settled : 0
  }

  return [...rows.values()].sort((a, b) => b.net - a.net || b.won - a.won)
}

export interface HeadToHead {
  a: ManagerId
  b: ManagerId
  /** Wins for `a` against `b`. */
  aWins: number
  bWins: number
}

/** Settled head-to-head records, keyed so each pair appears once. */
export function headToHead(bets: Bet[]): HeadToHead[] {
  const pairs = new Map<string, HeadToHead>()
  for (const bet of bets) {
    if (bet.status !== 'settled' || !bet.winner) continue
    const [a, b] = [bet.proposer, bet.opponent].sort()
    const key = `${a}|${b}`
    const row = pairs.get(key) ?? { a, b, aWins: 0, bWins: 0 }
    if (bet.winner === a) row.aWins += 1
    else row.bWins += 1
    pairs.set(key, row)
  }
  return [...pairs.values()].sort(
    (x, y) => y.aWins + y.bWins - (x.aWins + x.bWins),
  )
}

/* ------------------------------------------------------------------ *
 * The side-bet ledger — kept deliberately apart from league cash
 * ------------------------------------------------------------------ */

export interface Debt {
  /** Owes the money. */
  from: ManagerId
  /** Is owed the money. */
  to: ManagerId
  amount: number
  /** The settled bets this nets together. */
  betIds: string[]
}

/**
 * Outstanding betting debts, netted per pair. Two managers who have beaten
 * each other several times owe one number, not a stack of them — which is how
 * people actually settle up. Forfeit bets never appear here; you cannot net a
 * dare against a dollar.
 */
export function openDebts(bets: Bet[]): Debt[] {
  const pairs = new Map<string, { a: ManagerId; b: ManagerId; balance: number; betIds: string[] }>()

  for (const bet of bets) {
    if (bet.status !== 'settled' || !bet.winner || bet.paidAt) continue
    const owed = owedOn(bet)
    if (bet.stakeKind !== 'cash' || owed <= 0) continue

    const [a, b] = [bet.proposer, bet.opponent].sort()
    const key = `${a}|${b}`
    const row = pairs.get(key) ?? { a, b, balance: 0, betIds: [] }
    // Positive balance means b owes a.
    row.balance += bet.winner === a ? owed : -owed
    row.betIds.push(bet.id)
    pairs.set(key, row)
  }

  const debts: Debt[] = []
  for (const row of pairs.values()) {
    if (row.balance === 0) continue
    debts.push(
      row.balance > 0
        ? { from: row.b, to: row.a, amount: row.balance, betIds: row.betIds }
        : { from: row.a, to: row.b, amount: -row.balance, betIds: row.betIds },
    )
  }
  return debts.sort((x, y) => y.amount - x.amount)
}

/** Everything a manager is owed minus everything they owe, right now. */
export function netOwed(debts: Debt[], manager: ManagerId): number {
  return debts.reduce(
    (total, debt) =>
      total + (debt.to === manager ? debt.amount : debt.from === manager ? -debt.amount : 0),
    0,
  )
}

/** Venmo prefilled payment, when the payee has a handle on file. */
export function venmoUrl(handle: string | undefined, amount: number, note: string): string | null {
  const user = handle?.replace(/^@/, '').trim()
  if (!user) return null
  const params = new URLSearchParams({
    txn: 'pay',
    audience: 'private',
    recipients: user,
    amount: amount.toFixed(2),
    note,
  })
  return `https://venmo.com/?${params.toString()}`
}
