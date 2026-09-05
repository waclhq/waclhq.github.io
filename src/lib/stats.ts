import type { CareerAverages, ManagerId, Season, TeamSeason } from './types'

export const KEEPER_ERA_START = 2014

export interface EraFilter {
  id: string
  label: string
  from: number | null
  to: number | null
}

export function eraOptions(seasons: Season[]): EraFilter[] {
  const latest = seasons.length ? Math.max(...seasons.map((season) => season.year)) : 0
  return [
    { id: 'all', label: 'All-Time', from: null, to: null },
    { id: 'keeper', label: 'Keeper Era', from: KEEPER_ERA_START, to: null },
    { id: 'last5', label: 'Last 5', from: latest - 4, to: null },
    { id: 'last3', label: 'Last 3', from: latest - 2, to: null },
  ]
}

export function inEra(year: number, era: EraFilter): boolean {
  if (era.from !== null && year < era.from) return false
  if (era.to !== null && year > era.to) return false
  return true
}

export interface CareerLine {
  manager: ManagerId
  seasonsPlayed: number
  wins: number
  losses: number
  winPct: number
  playoffWins: number
  playoffLosses: number
  playoffAppearances: number
  playoffRate: number
  titles: number
  runnerUps: number
  thirds: number
  topThree: number
  pointsFor: number
  pointsAgainst: number
  avgPointsFor: number | null
  avgPointsAgainst: number | null
  bestFinish: number
  /** Season-average points, best and worst, with the year each happened. */
  bestSeason: { year: number; avg: number } | null
  worstSeason: { year: number; avg: number } | null
}

function blankLine(manager: ManagerId): CareerLine {
  return {
    manager,
    seasonsPlayed: 0,
    wins: 0,
    losses: 0,
    winPct: 0,
    playoffWins: 0,
    playoffLosses: 0,
    playoffAppearances: 0,
    playoffRate: 0,
    titles: 0,
    runnerUps: 0,
    thirds: 0,
    topThree: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avgPointsFor: null,
    avgPointsAgainst: null,
    bestFinish: Number.POSITIVE_INFINITY,
    bestSeason: null,
    worstSeason: null,
  }
}

/** Career records for every manager who played inside the given era. */
export function careerTable(seasons: Season[], era: EraFilter): CareerLine[] {
  const lines = new Map<ManagerId, CareerLine>()
  // Career points per game is the MEAN OF SEASON AVERAGES, not a
  // games-weighted average — that's how the league's workbook has always
  // computed it, and the site's numbers must tie to the book.
  const avgFor = new Map<ManagerId, { total: number; count: number }>()
  const avgAgainst = new Map<ManagerId, { total: number; count: number }>()

  for (const season of seasons) {
    if (!inEra(season.year, era)) continue
    for (const team of season.teams) {
      const line = lines.get(team.manager) ?? blankLine(team.manager)

      line.seasonsPlayed += 1
      line.wins += team.wins
      line.losses += team.losses
      line.playoffWins += team.playoffWins
      line.playoffLosses += team.playoffLosses
      if (team.playoffWins + team.playoffLosses > 0) line.playoffAppearances += 1
      if (team.rank === 1) line.titles += 1
      if (team.rank === 2) line.runnerUps += 1
      if (team.rank === 3) line.thirds += 1
      if (team.rank <= 3) line.topThree += 1
      line.bestFinish = Math.min(line.bestFinish, team.rank)
      line.pointsFor += team.pointsFor ?? 0
      line.pointsAgainst += team.pointsAgainst ?? 0

      if (team.avgPointsFor !== null) {
        const bucket = avgFor.get(team.manager) ?? { total: 0, count: 0 }
        bucket.total += team.avgPointsFor
        bucket.count += 1
        avgFor.set(team.manager, bucket)

        if (!line.bestSeason || team.avgPointsFor > line.bestSeason.avg) {
          line.bestSeason = { year: season.year, avg: team.avgPointsFor }
        }
        if (!line.worstSeason || team.avgPointsFor < line.worstSeason.avg) {
          line.worstSeason = { year: season.year, avg: team.avgPointsFor }
        }
      }
      if (team.avgPointsAgainst !== null) {
        const bucket = avgAgainst.get(team.manager) ?? { total: 0, count: 0 }
        bucket.total += team.avgPointsAgainst
        bucket.count += 1
        avgAgainst.set(team.manager, bucket)
      }

      lines.set(team.manager, line)
    }
  }

  for (const line of lines.values()) {
    const games = line.wins + line.losses
    line.winPct = games ? line.wins / games : 0
    line.playoffRate = line.seasonsPlayed ? line.playoffAppearances / line.seasonsPlayed : 0
    const forBucket = avgFor.get(line.manager)
    const againstBucket = avgAgainst.get(line.manager)
    line.avgPointsFor = forBucket?.count ? forBucket.total / forBucket.count : null
    line.avgPointsAgainst = againstBucket?.count ? againstBucket.total / againstBucket.count : null
    if (!Number.isFinite(line.bestFinish)) line.bestFinish = 0
  }

  return [...lines.values()].sort((a, b) => b.winPct - a.winPct)
}

/**
 * The career table as the record book prints it.
 *
 * For the two book eras (All-Time and Keeper Era) the workbook's career
 * scoring averages come from an adjusted matrix — 2004–2006 are re-scored
 * for era inflation — that no season-level arithmetic can reproduce, and
 * CLAUDE.md rule 2 says the book wins. This overlays those figures, and the
 * best/worst season they imply, onto the computed table so every page prints
 * one number per manager. Other eras (Last 5, Last 3) have no book column
 * and fall through to the computed table unchanged.
 */
export function bookCareerTable(
  seasons: Season[],
  era: EraFilter,
  book: CareerAverages | null | undefined,
): CareerLine[] {
  const table = careerTable(seasons, era)
  const overlay = era.id === 'all' ? book?.allTime : era.id === 'keeper' ? book?.keeperEra : undefined
  if (!overlay) return table
  return table.map((line) => {
    const averages = overlay[line.manager]
    if (!averages) return line
    let bestSeason = line.bestSeason
    let worstSeason = line.worstSeason
    const years = book?.seasons?.[line.manager]
    if (years) {
      bestSeason = null
      worstSeason = null
      for (const [year, values] of Object.entries(years)) {
        if (values.pointsFor === undefined || !inEra(Number(year), era)) continue
        const point = { year: Number(year), avg: values.pointsFor }
        if (!bestSeason || point.avg > bestSeason.avg) bestSeason = point
        if (!worstSeason || point.avg < worstSeason.avg) worstSeason = point
      }
    }
    return {
      ...line,
      avgPointsFor: averages.pointsFor,
      avgPointsAgainst: averages.pointsAgainst,
      bestSeason,
      worstSeason,
    }
  })
}

export interface SeasonExtreme {
  manager: ManagerId
  year: number
  value: number
}

/** Top/bottom season scoring averages across the era, for the records board. */
export function seasonExtremes(
  seasons: Season[],
  era: EraFilter,
  field: 'avgPointsFor' | 'avgPointsAgainst',
  limit = 10,
): { best: SeasonExtreme[]; worst: SeasonExtreme[] } {
  const rows: SeasonExtreme[] = []
  for (const season of seasons) {
    if (!inEra(season.year, era)) continue
    for (const team of season.teams) {
      const value = team[field]
      if (value !== null) rows.push({ manager: team.manager, year: season.year, value })
    }
  }
  const ascending = [...rows].sort((a, b) => a.value - b.value)
  return {
    best: [...rows].sort((a, b) => b.value - a.value).slice(0, limit),
    worst: ascending.slice(0, limit),
  }
}

/** A manager's season-by-season line, newest first. */
export function managerSeasons(
  seasons: Season[],
  manager: ManagerId,
): { season: Season; team: TeamSeason }[] {
  const rows: { season: Season; team: TeamSeason }[] = []
  for (const season of seasons) {
    const team = season.teams.find((candidate) => candidate.manager === manager)
    if (team) rows.push({ season, team })
  }
  return rows.sort((a, b) => b.season.year - a.season.year)
}

/**
 * Rolling win% over a trailing window, one point per season. Used for the
 * form chart — a manager's recent trajectory rather than their career average.
 */
export function rollingWinPct(
  seasons: Season[],
  manager: ManagerId,
  window = 3,
): { year: number; value: number | null }[] {
  const chronological = [...seasons].sort((a, b) => a.year - b.year)
  const lines = chronological.map((season) => ({
    year: season.year,
    team: season.teams.find((candidate) => candidate.manager === manager) ?? null,
  }))

  return lines.map((line, index) => {
    const slice = lines.slice(Math.max(0, index - window + 1), index + 1).filter((row) => row.team)
    if (!slice.length || !line.team) return { year: line.year, value: null }
    const wins = slice.reduce((total, row) => total + (row.team?.wins ?? 0), 0)
    const losses = slice.reduce((total, row) => total + (row.team?.losses ?? 0), 0)
    const games = wins + losses
    return { year: line.year, value: games ? wins / games : null }
  })
}

/** League-wide scoring average per season, for the era context chart. */
export function leagueScoringByYear(seasons: Season[]): { year: number; avg: number }[] {
  return [...seasons]
    .sort((a, b) => a.year - b.year)
    .map((season) => {
      const values = season.teams
        .map((team) => team.avgPointsFor)
        .filter((value): value is number => value !== null)
      return {
        year: season.year,
        avg: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      }
    })
    .filter((row) => row.avg > 0)
}
