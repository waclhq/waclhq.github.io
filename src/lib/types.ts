export type ManagerId = string

export interface Manager {
  id: ManagerId
  surname: string
  firstName: string
  displayName: string
  team: string | null
  active: boolean
  /** Venmo username, for settling side bets person-to-person. */
  venmo?: string
}

export interface TeamSeason {
  rank: number
  team: string | null
  manager: ManagerId
  wins: number
  losses: number
  pointsFor: number | null
  pointsAgainst: number | null
  avgPointsFor: number | null
  avgPointsAgainst: number | null
  playoffWins: number
  playoffLosses: number
}

export interface Season {
  year: number
  teamCount: number
  keeperEra: boolean
  champion: ManagerId
  runnerUp: ManagerId | null
  thirdPlace: ManagerId | null
  teams: TeamSeason[]
}

/** Contract years run A -> D; D is the final year a player may be kept. */
export type ContractYear = 'A' | 'B' | 'C' | 'D'

export interface RosterSpot {
  player: string
  cost: number | null
  contractYear: ContractYear | null
}

export interface KeeperPick {
  player: string
  salary: number | null
  contractYear: ContractYear | null
}

export interface KeeperBlock {
  team: string
  manager: ManagerId | null
  endingRoster: RosterSpot[]
  keepers: KeeperPick[]
  keeperSalary: number | null
  cashTraded: number
  draftBudget: number | null
}

export interface TradeObligation {
  year: number
  amount: number
}

export type TradeStatus = 'pending' | 'market-check' | 'approved' | 'rejected'

export interface Trade {
  id: string
  batch: string
  season: number
  preseason: boolean
  seller: ManagerId
  buyer: ManagerId
  players: string
  terms: string | null
  totalDollars: number
  obligations: TradeObligation[]
  status: TradeStatus
  source: 'workbook' | 'app'
  /** ISO timestamps, set by the app for anything it records itself. */
  proposedAt?: string
  decidedAt?: string
  /** Set when the anti-dumping rule opens a 24-hour market check. */
  marketCheckUntil?: string
  commissionerNote?: string
}

export interface LedgerEntry {
  received: number
  sent: number
  net: number
}

/** year -> managerId -> received/sent/net auction dollars */
export type TradeLedger = Record<string, Record<ManagerId, LedgerEntry>>

export interface WaiverClaim {
  season: number
  player: string
  bid: number
  team: string | null
  manager: ManagerId | null
}

export interface FaabEntry {
  id: string
  season: number
  manager: ManagerId
  player: string
  bid: number
  week: number | null
  /** True when this claim set the player's ending-roster keeper cost. */
  onEndingRoster: boolean
  note?: string
}

export interface FaabFile {
  season: number
  entries: FaabEntry[]
}

export type CashType = 'dues' | 'payout' | 'bet' | 'fee' | 'adjustment'

export interface CashEntry {
  id: string
  season: number
  date: string
  manager: ManagerId
  type: CashType
  /** Positive = the league owes the manager. Negative = the manager owes the league. */
  amount: number
  description: string
  settled: boolean
}

export interface CashFile {
  entries: CashEntry[]
}

export interface TradeQueueFile {
  proposals: Trade[]
}

export interface LegacyTradeGroup {
  heading: string
  entries: string[]
}

export interface FaabTier {
  maxPct: number
  keeperCost: number
}

export interface League {
  name: string
  commissioner: string
  currentSeason: number
  baseDraftBudget: number
  baseFaabBudget: number
  keeperSlots: number
  maxContractYears: number
  faabScale: FaabTier[]
  sourceWorkbook: string
  /** Venmo username dues are paid to, without the leading @. */
  venmoHandle?: string
  /** ISO date (YYYY-MM-DD) dues are due. Null leaves the board un-escalated. */
  duesDeadline?: string | null
}

export interface LiveTeam {
  teamKey: string | null
  teamName: string | null
  manager: ManagerId | null
  rank: number | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number | null
  avgPointsAgainst: number | null
}

export interface LiveClaim {
  player: string | null
  bid: number
  teamKey: string | null
  teamName: string | null
  timestamp: number | null
  manager: ManagerId | null
}

/** Written by the Yahoo sync action; absent until the first successful run. */
export interface LiveStandings {
  season: number | null
  week: number | null
  leagueName: string | null
  leagueKey: string | null
  updatedAt: string
  unmapped: string[]
  teams: LiveTeam[]
  /** Waiver adds carrying a FAAB bid. Older live.json files may omit this. */
  claims?: LiveClaim[]
}

export interface LiveMatchupTeam {
  teamKey: string | null
  teamName: string | null
  manager: ManagerId | null
  /** Points so far this week; final once the matchup is postevent. */
  points: number
  /** Yahoo's projected weekly total, or null when it isn't offering one. */
  projected: number | null
  /** 0–1. Yahoo's own where it sends one, otherwise implied from projections. */
  winProbability: number | null
}

export interface LiveMatchup {
  /** Yahoo's words: before kickoff, games on, all final. */
  status: 'preevent' | 'midevent' | 'postevent'
  isPlayoffs: boolean
  winnerTeamKey: string | null
  teams: LiveMatchupTeam[]
}

/** Written by the scores job to the orphan `live` branch; read by lib/scores.ts. */
export interface LiveScoreboard {
  season: number | null
  week: number | null
  leagueKey: string | null
  updatedAt: string
  unmapped: string[]
  matchups: LiveMatchup[]
}

/** year -> normalised player name -> [standard fantasy points, position]. */
export type PlayerPoints = Record<string, Record<string, [number, string]>>

/** normalised player name -> position, for everyone the league ever rostered. */
export type PlayerPositions = Record<string, string>

export interface GameRecordEntry {
  manager: ManagerId
  points: number
  year: number
  playoff: boolean
}

/** Top-10 single-game scoring records from the workbook's Summary Stats. */
export interface GameRecords {
  keeperEra: { highest: GameRecordEntry[]; lowest: GameRecordEntry[] }
  allTime: { highest: GameRecordEntry[]; lowest: GameRecordEntry[] }
}

/**
 * The book's own career scoring averages per manager. Not derivable from
 * season data: 2004–2006 feed the workbook's career math through adjusted
 * totals, so these are lifted verbatim by scripts/career_averages.py.
 */
export interface CareerAverages {
  keeperEra: Record<ManagerId, { pointsFor: number; pointsAgainst: number }>
  allTime: Record<ManagerId, { pointsFor: number; pointsAgainst: number }>
  /** Per-manager per-season averages from the same adjusted matrix. */
  seasons: Record<
    ManagerId,
    Record<string, { pointsFor?: number; pointsAgainst?: number }>
  >
}

export interface DraftPoolPlayer {
  rank: number
  player: string
  pos: string
  posRank: string
  team: string
  bye: string
  tier: number
}

/** Third-party consensus rankings snapshot; regenerate with scripts/draft_pool.py. */
export interface DraftPool {
  source: string
  sourceUrl: string
  scoring: string
  season: string
  experts: number
  sourceUpdated: string
  retrieved: string
  rookiesExcluded: boolean
  players: DraftPoolPlayer[]
}

/**
 * Bet settlements. Deliberately kept in the main repo — which only the
 * commissioner can write — while proposals and acceptances live in the
 * league-writable bets repo. That split is what makes "only the commissioner
 * decides a winner" an actual permission rather than a hidden button.
 */
export interface BetResult {
  betId: string
  winner: ManagerId
  settledAt: string
}

export interface BetResultsFile {
  results: BetResult[]
}

export interface CommissionerVault {
  v: 1
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  ct: string
}

export interface LeagueData {
  league: League
  managers: Manager[]
  seasons: Season[]
  keepers: Record<string, KeeperBlock[]>
  trades: Trade[]
  tradeLedger: TradeLedger
  waivers: WaiverClaim[]
  legacyTrades: LegacyTradeGroup[]
  rules: string[]
  cash: CashFile
  faab: FaabFile
  tradeQueue: TradeQueueFile
  live: LiveStandings | null
  /** Absent until scripts/player_points.py has been run. */
  playerPoints: PlayerPoints | null
  /** Absent until scripts/player_positions.py has been run. */
  playerPositions: PlayerPositions | null
  /** The password-sealed commissioner token; null until a password is set. */
  vault: CommissionerVault | null
  /** Absent until scripts/draft_pool.py has been run. */
  draftPool: DraftPool | null
  /** Absent until scripts/game_records.py has been run. */
  gameRecords: GameRecords | null
  /** Absent until scripts/career_averages.py has been run. */
  careerAverages: CareerAverages | null
  /** Bets-repo token sealed under the shared league password; null until set. */
  leagueVault: CommissionerVault | null
  /** Commissioner-only bet settlements. */
  betResults: BetResultsFile
}
