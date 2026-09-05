import type { GoatRow } from './analytics'
import type { ManagerId, Season } from './types'

/*
 * Small facts the boards print in sentences — derived from the data every
 * time, so a subtitle written in 2026 is still true in 2027.
 */

/**
 * Rate boards rank careers, not cameos: five seasons, or 40% of the era for
 * the short windows (Last 3 asks for two).
 */
export function minSeasonsToRank(eraSeasons: number): number {
  return Math.max(1, Math.min(5, Math.ceil(0.4 * eraSeasons)))
}

export function latestSeason(seasons: Season[]): Season | null {
  if (!seasons.length) return null
  return seasons.reduce((latest, season) => (season.year > latest.year ? season : latest))
}

export function reigningChampion(seasons: Season[]): ManagerId | null {
  return latestSeason(seasons)?.champion ?? null
}

export interface TitleRun {
  manager: ManagerId
  from: number
  to: number
  length: number
}

/** The longest unbroken string of titles by one manager. */
export function longestTitleRun(seasons: Season[]): TitleRun | null {
  const chronological = [...seasons].sort((a, b) => a.year - b.year)
  let best: TitleRun | null = null
  let current: TitleRun | null = null
  for (const season of chronological) {
    if (current && current.manager === season.champion && season.year === current.to + 1) {
      current = { manager: current.manager, from: current.from, to: season.year, length: current.length + 1 }
    } else {
      current = { manager: season.champion, from: season.year, to: season.year, length: 1 }
    }
    if (!best || current.length > best.length) best = current
  }
  return best && best.length > 1 ? best : null
}

export interface TitleGap {
  manager: ManagerId
  from: number
  to: number
  years: number
}

/** The longest wait between two titles for one manager. */
export function longestTitleGap(seasons: Season[]): TitleGap | null {
  const wins = new Map<ManagerId, number[]>()
  for (const season of seasons) {
    const list = wins.get(season.champion) ?? []
    list.push(season.year)
    wins.set(season.champion, list)
  }
  let best: TitleGap | null = null
  for (const [manager, years] of wins) {
    const sorted = [...years].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i] - sorted[i - 1]
      if (!best || gap > best.years) best = { manager, from: sorted[i - 1], to: sorted[i], years: gap }
    }
  }
  return best && best.years >= 5 ? best : null
}

/** Years a manager appeared, ascending. */
export function yearsPlayed(seasons: Season[], manager: ManagerId): number[] {
  return seasons
    .filter((season) => season.teams.some((team) => team.manager === manager))
    .map((season) => season.year)
    .sort((a, b) => a - b)
}

/** True when the years run without a break from the first to the latest season. */
export function unbrokenRun(years: number[], latest: number): boolean {
  if (!years.length) return false
  if (years[years.length - 1] !== latest) return false
  return years.every((year, index) => index === 0 || year === years[index - 1] + 1)
}

/** A number spelled out where a sentence wants it (0–99), else digits. */
export function spell(n: number): string {
  const ones = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen',
  ]
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n)
  if (n < 20) return ones[n]
  const rest = n % 10
  return rest ? `${tens[Math.floor(n / 10)]}-${ones[rest]}` : tens[Math.floor(n / 10)]
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

export interface ShrineFacts {
  name: ManagerId
  /** "the only résumé above +9.4" or the honest tie. */
  clubLine: string
  /** "compiled across 22 consecutive seasons" or "across 21 seasons since 2005". */
  runLine: string
  /** "4 rings — more than any human being…" or the truthful alternative. */
  ringsLine: string
  firstYear: number
  runnerUp: GoatRow | null
  gap: number
}

/**
 * The shrine's flattery, kept arithmetically true: every claim is checked
 * against the table it sits under, and the wording bends before the numbers do.
 */
export function shrineFacts(goat: GoatRow[], seasons: Season[]): ShrineFacts | null {
  const top = goat[0]
  if (!top) return null
  const second = goat[1] ?? null
  const latest = latestSeason(seasons)?.year ?? 0
  const years = yearsPlayed(seasons, top.manager)
  const firstYear = years[0] ?? latest
  const gap = top.sumZ - (second?.sumZ ?? 0)

  // The club: the runner-up's own figure is the door, printed at the two
  // decimals the shrine uses, so the table one panel up cannot contradict it.
  const clubLine =
    second && top.sumZ.toFixed(2) !== second.sumZ.toFixed(2)
      ? `the only résumé above +${second.sumZ.toFixed(2)}, which is where second place stops`
      : second
        ? `a résumé the committee could only separate from second place at the third decimal`
        : 'the only résumé the committee bothered to read'

  const runLine = unbrokenRun(years, latest)
    ? `compiled across ${top.seasons} consecutive seasons without one year off for good behaviour`
    : `compiled across ${top.seasons} seasons since ${firstYear}, with the occasional year off for good behaviour`

  const mostRings = Math.max(...goat.map((row) => row.titles))
  const ringHolders = goat.filter((row) => row.titles === mostRings).length
  const ringsLine =
    top.titles === mostRings && ringHolders === 1
      ? 'more than any human being in the history of this league'
      : top.titles === mostRings
        ? `tied for the most in league history, which the committee notes and does not apologise for`
        : `${mostRings - top.titles} short of the record, a fact the committee has filed under "regular season"`

  return { name: top.manager, clubLine, runLine, ringsLine, firstYear, runnerUp: second, gap }
}
