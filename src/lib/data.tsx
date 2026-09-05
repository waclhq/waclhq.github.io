import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { commitFile, friendlySaveError, isCommissioner } from './github'
import type {
  CashFile,
  FaabFile,
  LeagueData,
  LiveStandings,
  Manager,
  ManagerId,
  TradeQueueFile,
} from './types'

const FILES = {
  league: 'league.json',
  managers: 'managers.json',
  seasons: 'seasons.json',
  keepers: 'keepers.json',
  trades: 'trades.json',
  tradeLedger: 'trade-ledger.json',
  waivers: 'waivers.json',
  legacyTrades: 'legacy-trades.json',
  rules: 'rules.json',
  cash: 'cash.json',
  faab: 'faab.json',
  tradeQueue: 'trade-queue.json',
  live: 'live.json',
  playerPoints: 'player-points.json',
  playerPositions: 'player-positions.json',
  vault: 'auth.json',
  draftPool: 'draft-pool.json',
  gameRecords: 'game-records.json',
  careerAverages: 'career-averages.json',
  leagueVault: 'league-auth.json',
  betResults: 'bet-results.json',
} as const

/** Files the commissioner edits in-app. Writes go to GitHub *and* to this cache. */
export type WritableFile =
  | 'cash.json'
  | 'faab.json'
  | 'trade-queue.json'
  | 'auth.json'
  | 'keepers.json'
  | 'league-auth.json'
  | 'bet-results.json'

const OVERLAY_KEY = 'wacl.overlay'
const OVERLAY_AGE_KEY = 'wacl.overlay.age'
/** Pages redeploys in ~1–2 minutes; after this the served site wins. */
const OVERLAY_TTL_MS = 5 * 60_000

/**
 * GitHub Pages redeploys a minute or two after a commit, so a fresh fetch can
 * still return the pre-write file. This overlay keeps the UI truthful in the
 * meantime and is discarded once the served file catches up — or once it
 * expires. The expiry matters for multi-device commissioners: an overlay from
 * THIS device only knows how to wait for the site to catch up to it; if
 * another device has since moved the data further, exact-match catch-up never
 * happens and a stale overlay would otherwise mask the newer edits forever.
 */
type Overlay = Partial<Record<WritableFile, unknown>>
type OverlayAges = Partial<Record<WritableFile, number>>

function readOverlay(): Overlay {
  try {
    return JSON.parse(localStorage.getItem(OVERLAY_KEY) ?? '{}') as Overlay
  } catch {
    return {}
  }
}

function readAges(): OverlayAges {
  try {
    return JSON.parse(localStorage.getItem(OVERLAY_AGE_KEY) ?? '{}') as OverlayAges
  } catch {
    return {}
  }
}

function writeOverlay(overlay: Overlay, ages: OverlayAges): void {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlay))
    localStorage.setItem(OVERLAY_AGE_KEY, JSON.stringify(ages))
  } catch {
    /* ignore quota / private mode */
  }
}

/** The overlay minus anything past its bridge-the-deploy window. */
function freshOverlay(): { overlay: Overlay; ages: OverlayAges } {
  const overlay = readOverlay()
  const ages = readAges()
  const now = Date.now()
  let changed = false
  for (const file of Object.keys(overlay) as WritableFile[]) {
    const age = ages[file]
    if (age === undefined || now - age > OVERLAY_TTL_MS) {
      delete overlay[file]
      delete ages[file]
      changed = true
    }
  }
  if (changed) writeOverlay(overlay, ages)
  return { overlay, ages }
}

export function clearOverlay(): void {
  try {
    localStorage.removeItem(OVERLAY_KEY)
    localStorage.removeItem(OVERLAY_AGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * The record files only change when the commissioner reseeds from the
 * workbook, so the browser may serve them from its cache; the seven the app
 * itself writes are revalidated on every load, because a ruling made on a
 * phone must show up on the laptop. Twenty-one round trips become seven.
 */
const WRITTEN: ReadonlySet<string> = new Set(Object.values(FILES).filter((file) =>
  ['cash.json', 'faab.json', 'trade-queue.json', 'keepers.json', 'auth.json', 'league-auth.json', 'bet-results.json'].includes(file),
))

function fetchData(file: string): Promise<Response> {
  return fetch(`${import.meta.env.BASE_URL}data/${file}`, {
    cache: WRITTEN.has(file) ? 'no-cache' : 'default',
  })
}

/** live.json only exists once the Yahoo sync has run at least once. */
async function loadOptionalJson<T>(file: string): Promise<T | null> {
  try {
    const response = await fetchData(file)
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function loadJson<T>(file: string): Promise<T> {
  const response = await fetchData(file)
  if (!response.ok) throw new Error(`Missing data file: ${file}`)
  return (await response.json()) as T
}

/** What save() broadcasts on window as a 'wacl:save' CustomEvent. */
export interface SaveEvent {
  phase: 'start' | 'ok' | 'error'
  file: WritableFile
  message: string
  error?: string
  retry?: () => void
}

interface DataContextValue {
  data: LeagueData | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  /** Commits to GitHub, then applies the same change locally. */
  save: <T>(file: WritableFile, update: (current: T) => T, message: string) => Promise<void>
  commissioner: boolean
  setCommissioner: (on: boolean) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LeagueData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [commissioner, setCommissioner] = useState(isCommissioner)

  // The rest of the league, once the first screen is up. Nothing here gates
  // a render: every one of these fields is nullable and every reader already
  // handles its absence, so the pages that want them simply fill in.
  const hydrate = useCallback(async () => {
    const [live, playerPoints, playerPositions, draftPool] = await Promise.all([
      loadOptionalJson<LiveStandings>(FILES.live),
      loadOptionalJson<import('./types').PlayerPoints>(FILES.playerPoints),
      loadOptionalJson<import('./types').PlayerPositions>(FILES.playerPositions),
      loadOptionalJson<import('./types').DraftPool>(FILES.draftPool),
    ])
    setData((current) =>
      current ? { ...current, live, playerPoints, playerPositions, draftPool } : current,
    )
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        league,
        managers,
        seasons,
        keepers,
        trades,
        tradeLedger,
        waivers,
        legacyTrades,
        rules,
        cash,
        faab,
        tradeQueue,
        live,
        playerPoints,
        playerPositions,
        vault,
        draftPool,
        gameRecords,
        careerAverages,
        leagueVault,
        betResults,
      ] = await Promise.all([
        loadJson<LeagueData['league']>(FILES.league),
        loadJson<LeagueData['managers']>(FILES.managers),
        loadJson<LeagueData['seasons']>(FILES.seasons),
        loadJson<LeagueData['keepers']>(FILES.keepers),
        loadJson<LeagueData['trades']>(FILES.trades),
        loadJson<LeagueData['tradeLedger']>(FILES.tradeLedger),
        loadJson<LeagueData['waivers']>(FILES.waivers),
        loadJson<LeagueData['legacyTrades']>(FILES.legacyTrades),
        loadJson<LeagueData['rules']>(FILES.rules),
        loadJson<CashFile>(FILES.cash),
        loadJson<FaabFile>(FILES.faab),
        loadJson<TradeQueueFile>(FILES.tradeQueue),
        // Four files nothing on a first screen needs — the per-player scoring
        // matrix alone is bigger than the rest of the league put together —
        // are fetched after the desk is on screen; see hydrate() below.
        Promise.resolve(null) as Promise<LiveStandings | null>,
        Promise.resolve(null) as Promise<import('./types').PlayerPoints | null>,
        Promise.resolve(null) as Promise<import('./types').PlayerPositions | null>,
        loadOptionalJson<import('./types').CommissionerVault>(FILES.vault),
        Promise.resolve(null) as Promise<import('./types').DraftPool | null>,
        loadOptionalJson<import('./types').GameRecords>(FILES.gameRecords),
        loadOptionalJson<import('./types').CareerAverages>(FILES.careerAverages),
        loadOptionalJson<import('./types').CommissionerVault>(FILES.leagueVault),
        loadJson<import('./types').BetResultsFile>(FILES.betResults),
      ])

      const { overlay, ages } = freshOverlay()
      const next: LeagueData = {
        league,
        managers,
        seasons,
        keepers: (overlay['keepers.json'] as LeagueData['keepers']) ?? keepers,
        trades,
        tradeLedger,
        waivers,
        legacyTrades,
        rules,
        cash: (overlay['cash.json'] as CashFile) ?? cash,
        faab: (overlay['faab.json'] as FaabFile) ?? faab,
        tradeQueue: (overlay['trade-queue.json'] as TradeQueueFile) ?? tradeQueue,
        live,
        playerPoints,
        playerPositions,
        // vault may legitimately be overlaid with null (password removed),
        // so presence-check rather than ??
        vault: 'auth.json' in overlay
          ? (overlay['auth.json'] as import('./types').CommissionerVault | null)
          : vault,
        draftPool,
        gameRecords,
        careerAverages,
        leagueVault: 'league-auth.json' in overlay
          ? (overlay['league-auth.json'] as import('./types').CommissionerVault | null)
          : leagueVault,
        betResults:
          (overlay['bet-results.json'] as import('./types').BetResultsFile) ?? betResults,
      }

      // Drop overlay entries the deployed site has caught up on.
      const pruned: Overlay = {}
      const prunedAges: OverlayAges = {}
      const served: Record<WritableFile, unknown> = {
        'cash.json': cash,
        'faab.json': faab,
        'trade-queue.json': tradeQueue,
        'auth.json': vault,
        'keepers.json': keepers,
        'league-auth.json': leagueVault,
        'bet-results.json': betResults,
      }
      for (const [file, value] of Object.entries(overlay) as [WritableFile, unknown][]) {
        if (JSON.stringify(served[file]) !== JSON.stringify(value)) {
          pruned[file] = value
          prunedAges[file] = ages[file]
        }
      }
      writeOverlay(pruned, prunedAges)

      setData(next)
      void hydrate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load league data.')
    } finally {
      setLoading(false)
    }
  }, [hydrate])

  useEffect(() => {
    void reload()
  }, [reload])

  // Every write announces itself (see SaveStatus in the Shell) so a page can
  // stay focused on its own form while one strip tells the commissioner what
  // happened, where their thumb is, on every page alike.
  const save = useCallback<DataContextValue['save']>(async function saveFile(file, update, message) {
    const announce = (detail: Record<string, unknown>) =>
      window.dispatchEvent(new CustomEvent('wacl:save', { detail: { file, message, ...detail } }))
    announce({ phase: 'start' })
    let next: unknown
    try {
      next = await commitFile(file, update, message)
    } catch (cause) {
      announce({
        phase: 'error',
        error: friendlySaveError(cause),
        retry: () => void saveFile(file, update, message).catch(() => undefined),
      })
      throw cause
    }
    announce({ phase: 'ok' })
    const overlay = readOverlay()
    const ages = readAges()
    overlay[file] = next
    ages[file] = Date.now()
    writeOverlay(overlay, ages)
    setData((current) => {
      if (!current) return current
      if (file === 'cash.json') return { ...current, cash: next as CashFile }
      if (file === 'faab.json') return { ...current, faab: next as FaabFile }
      if (file === 'auth.json')
        return { ...current, vault: next as import('./types').CommissionerVault | null }
      if (file === 'keepers.json')
        return { ...current, keepers: next as LeagueData['keepers'] }
      if (file === 'league-auth.json')
        return { ...current, leagueVault: next as import('./types').CommissionerVault | null }
      if (file === 'bet-results.json')
        return { ...current, betResults: next as import('./types').BetResultsFile }
      return { ...current, tradeQueue: next as TradeQueueFile }
    })
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({ data, error, loading, reload, save, commissioner, setCommissioner }),
    [data, error, loading, reload, save, commissioner],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useLeague(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) throw new Error('useLeague must be used inside <DataProvider>')
  return context
}

/** Throws if data has not loaded — use inside routes rendered after the gate. */
export function useLeagueData(): LeagueData {
  const { data } = useLeague()
  if (!data) throw new Error('League data is not ready')
  return data
}

export function managerMap(managers: Manager[]): Map<ManagerId, Manager> {
  return new Map(managers.map((manager) => [manager.id, manager]))
}

export function managerName(managers: Manager[], id: ManagerId | null | undefined): string {
  if (!id) return '—'
  const manager = managers.find((candidate) => candidate.id === id)
  return manager ? manager.displayName : id
}
