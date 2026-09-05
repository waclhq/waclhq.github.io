import type { CareerLuck } from './analytics'
import { ordinal } from './format'
import type { CareerLine } from './stats'
import type { CareerAverages, ManagerId, Season } from './types'

/*
 * The manager profile's one-sentence biography, computed from the record.
 * "Three titles, the last in 2025; the league's best regular season ever;
 * 9 top-three finishes." Every clause is a fact the tables below can back.
 */

const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
]

export function countWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const fmt1 = (value: number) => value.toFixed(1)

/** Championship years for a manager, oldest first. */
export function titleYears(seasons: Season[], id: ManagerId): number[] {
  return seasons
    .filter((season) => season.champion === id)
    .map((season) => season.year)
    .sort((a, b) => a - b)
}

/**
 * The best regular season anyone has posted, by win rate then wins. Ties
 * keep every holder so a shared record reads as shared.
 */
function bestRegularSeasons(seasons: Season[]) {
  let best: { manager: ManagerId; year: number; wins: number; losses: number; pct: number }[] = []
  let top = -1
  for (const season of seasons) {
    for (const team of season.teams) {
      const games = team.wins + team.losses
      if (games < 8) continue
      const pct = team.wins / games
      const entry = { manager: team.manager, year: season.year, wins: team.wins, losses: team.losses, pct }
      if (pct > top + 1e-9) {
        top = pct
        best = [entry]
      } else if (Math.abs(pct - top) < 1e-9) {
        best.push(entry)
      }
    }
  }
  return best
}

/**
 * The highest single-season scoring average on record. Read from the book's
 * adjusted matrix when it is available, since that is what Records prints.
 */
function highestScoringSeason(seasons: Season[], book: CareerAverages | null | undefined) {
  let best: { manager: ManagerId; year: number; avg: number } | null = null
  if (book?.seasons) {
    for (const [manager, years] of Object.entries(book.seasons)) {
      for (const [year, values] of Object.entries(years)) {
        if (values.pointsFor === undefined) continue
        if (!best || values.pointsFor > best.avg) best = { manager, year: Number(year), avg: values.pointsFor }
      }
    }
    return best
  }
  for (const season of seasons) {
    for (const team of season.teams) {
      if (team.avgPointsFor === null) continue
      if (!best || team.avgPointsFor > best.avg)
        best = { manager: team.manager, year: season.year, avg: team.avgPointsFor }
    }
  }
  return best
}

export interface StoryInput {
  id: ManagerId
  career: CareerLine
  table: CareerLine[]
  seasons: Season[]
  book: CareerAverages | null | undefined
  luck?: CareerLuck[]
  /** False for a manager who has left: their story is finished, not pending. */
  active?: boolean
}

/** One sentence, three clauses: the rings, the claim to fame, the depth. */
export function storyLine({ id, career, table, seasons, book, luck, active = true }: StoryInput): string {
  const clauses: string[] = []
  const years = titleYears(seasons, id)
  const played = career.seasonsPlayed

  // ---- the rings ----
  if (career.titles === 0) {
    clauses.push(
      !active
        ? `${countWord(played)} seasons, no title`
        : played >= 8
          ? `${played} seasons without a title`
          : `${countWord(played)} seasons in, no title yet`,
    )
  } else if (career.titles === 1) {
    clauses.push(`one title, in ${years[0]}`)
  } else {
    clauses.push(`${countWord(career.titles)} titles, the last in ${years[years.length - 1]}`)
  }

  // ---- the claim to fame: first superlative that holds ----
  const bestSeasons = bestRegularSeasons(seasons)
  const mine = bestSeasons.filter((entry) => entry.manager === id)
  const scoring = highestScoringSeason(seasons, book)
  const byPoints = [...table].sort((a, b) => (b.avgPointsFor ?? 0) - (a.avgPointsFor ?? 0))
  const byWinPct = [...table].sort((a, b) => b.winPct - a.winPct)
  const luckiest = luck?.[0]
  const unluckiest = luck?.[luck.length - 1]
  const mostSeasons = Math.max(...table.map((line) => line.seasonsPlayed))

  if (mine.length) {
    const entry = mine.sort((a, b) => b.year - a.year)[0]
    clauses.push(
      bestSeasons.length === 1
        ? `the league's best regular season ever (${entry.wins}–${entry.losses} in ${entry.year})`
        : `a share of the league's best regular season (${entry.wins}–${entry.losses} in ${entry.year})`,
    )
  } else if (scoring && scoring.manager === id) {
    clauses.push(`the highest-scoring season on record (${fmt1(scoring.avg)} PF/gm in ${scoring.year})`)
  } else if (byPoints[0]?.manager === id && career.avgPointsFor) {
    clauses.push(`the league's best career scorer (${fmt1(career.avgPointsFor)} PF/gm)`)
  } else if (byWinPct[0]?.manager === id) {
    clauses.push(`the best career win rate in the league (${(career.winPct * 100).toFixed(1)}%)`)
  } else if (luckiest && luckiest.manager === id && luckiest.totalLuck > 5) {
    clauses.push(`the league's luckiest career (+${fmt1(luckiest.totalLuck)} wins over what the points earned)`)
  } else if (unluckiest && unluckiest.manager === id && unluckiest.totalLuck < -5) {
    clauses.push(`the league's unluckiest career (${fmt1(unluckiest.totalLuck)} wins against the points)`)
  } else if (career.runnerUps >= 3) {
    clauses.push(`${countWord(career.runnerUps)} runner-up finishes`)
  } else if (played === mostSeasons && played >= 15) {
    clauses.push(`present for every one of the league's ${played} seasons`)
  } else if (career.bestSeason) {
    clauses.push(`a peak of ${fmt1(career.bestSeason.avg)} PF/gm in ${career.bestSeason.year}`)
  }

  // ---- the depth ----
  if (career.topThree > 0) {
    clauses.push(`${career.topThree} top-three ${career.topThree === 1 ? 'finish' : 'finishes'}`)
  } else if (career.playoffAppearances > 0) {
    clauses.push(`playoffs in ${career.playoffAppearances} of ${played}`)
  } else if (career.bestFinish > 0) {
    clauses.push(`a best finish of ${ordinal(career.bestFinish)}`)
  }

  return `${capitalize(clauses.join('; '))}.`
}

/** Position in the career table, for "3rd of 16" wayfinding. */
export function tablePosition(table: CareerLine[], id: ManagerId): { index: number; total: number } {
  return { index: table.findIndex((line) => line.manager === id), total: table.length }
}
