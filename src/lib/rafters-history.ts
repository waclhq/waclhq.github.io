import type { ManagerId, Season } from './types'

/**
 * The rafters: every title as a banner, and the league's history as a race.
 *
 * Everything here is a plain fold over seasons.json — titles, wins and points
 * for are the workbook's season tabs summed, which is exactly what a running
 * table across the years should be. Nothing adjusted lives here; career
 * averages stay with bookCareerTable() in stats.ts.
 */

export interface Banner {
  year: number
  champion: ManagerId
  runnerUp: ManagerId | null
  wins: number
  losses: number
  /** Which title this was for the champion: 1 for the first, 2 for the repeat. */
  nth: number
  keeperEra: boolean
}

/** One banner per season, oldest first, each numbered within its owner's run. */
export function titleLedger(seasons: Season[]): Banner[] {
  const running = new Map<ManagerId, number>()
  return [...seasons]
    .sort((a, b) => a.year - b.year)
    .map((season) => {
      const nth = (running.get(season.champion) ?? 0) + 1
      running.set(season.champion, nth)
      const champ = season.teams.find((team) => team.rank === 1)
      return {
        year: season.year,
        champion: season.champion,
        runnerUp: season.runnerUp,
        wins: champ?.wins ?? 0,
        losses: champ?.losses ?? 0,
        nth,
        keeperEra: season.keeperEra,
      }
    })
}

export type RaceMetric = 'titles' | 'wins' | 'pointsFor'

/** label names the switch; column heads the table (wins print as a record). */
export const RACE_METRICS: { id: RaceMetric; label: string; column: string }[] = [
  { id: 'titles', label: 'Titles', column: 'Titles' },
  { id: 'wins', label: 'Wins', column: 'W–L' },
  { id: 'pointsFor', label: 'Points for', column: 'Points for' },
]

export interface RaceRow {
  manager: ManagerId
  titles: number
  wins: number
  losses: number
  pointsFor: number
  seasons: number
  /** True in the frame where this manager won the title. */
  champion: boolean
}

export interface RaceFrame {
  year: number
  champion: ManagerId
  champWins: number
  champLosses: number
  /** Cumulative table through this season, sorted by the chosen metric. */
  rows: RaceRow[]
}

function compare(metric: RaceMetric) {
  return (a: RaceRow, b: RaceRow): number =>
    b[metric] - a[metric] ||
    b.titles - a.titles ||
    b.wins - a.wins ||
    b.pointsFor - a.pointsFor ||
    a.manager.localeCompare(b.manager)
}

/**
 * The cumulative table after every season, oldest first: frame 0 is the
 * league after 2004, the last frame is the table as it stands today.
 * Deterministic, so a replay lands on the same rows every time.
 */
export function raceFrames(seasons: Season[], metric: RaceMetric): RaceFrame[] {
  const totals = new Map<ManagerId, RaceRow>()
  const frames: RaceFrame[] = []
  const order = compare(metric)
  for (const season of [...seasons].sort((a, b) => a.year - b.year)) {
    for (const row of totals.values()) row.champion = false
    for (const team of season.teams) {
      const line = totals.get(team.manager) ?? {
        manager: team.manager,
        titles: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        seasons: 0,
        champion: false,
      }
      line.wins += team.wins
      line.losses += team.losses
      line.pointsFor += team.pointsFor ?? 0
      line.seasons += 1
      if (team.manager === season.champion) {
        line.titles += 1
        line.champion = true
      }
      totals.set(team.manager, line)
    }
    const champ = season.teams.find((team) => team.rank === 1)
    frames.push({
      year: season.year,
      champion: season.champion,
      champWins: champ?.wins ?? 0,
      champLosses: champ?.losses ?? 0,
      rows: [...totals.values()].map((row) => ({ ...row })).sort(order),
    })
  }
  return frames
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** "twenty-two" — so the copy keeps counting when 2026 lands in the file. */
export function numberWord(n: number): string {
  if (n < 0 || n > 99 || !Number.isInteger(n)) return String(n)
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  const ones = n % 10
  return ones ? `${tens}-${ONES[ones]}` : tens
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * The verdict line the ticker prints: the opening sentence of a season's
 * story, plus the next one when the opener is only a wind-up.
 */
export function firstSentence(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g)
  if (!sentences) return text
  let line = sentences[0].trim()
  if (line.length < 60 && sentences[1]) line = `${line} ${sentences[1].trim()}`
  return line
}

/** Roman numerals for the banner: TITLE III reads like a rafter, 3 reads like a cell. */
export function roman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let out = ''
  let rest = n
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out || String(n)
}
