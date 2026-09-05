import type { BetsFile } from '../../lib/bets'

/**
 * The last board this device actually saw. The bets repo answers an
 * unreachable network with an empty file, and an empty book is a financial
 * statement the site cannot back — so a board that arrives empty when this
 * device has seen bets before is shown from here, stamped with its age,
 * until a read confirms otherwise.
 */

const KEY = 'wacl.bets.lastGood'

export interface LastGood {
  file: BetsFile
  at: number
}

export function readLastGood(): LastGood | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastGood>
    if (!parsed.file || !Array.isArray(parsed.file.bets) || typeof parsed.at !== 'number') return null
    return { file: { bets: parsed.file.bets }, at: parsed.at }
  } catch {
    return null
  }
}

export function writeLastGood(file: BetsFile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ file, at: Date.now() } satisfies LastGood))
  } catch {
    /* private browsing — nothing to fall back on, which is how it was */
  }
}
