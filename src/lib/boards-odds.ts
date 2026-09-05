import type { OddsRow } from './analytics'
import type { ManagerId, Season } from './types'

/**
 * The Vegas board, posted once.
 *
 * A sportsbook whose favourite drifts twenty points between refreshes cannot
 * be quoted in the group chat, so the pre-season line is drawn from a seeded
 * generator: everyone who opens the Lab this season sees the same numbers,
 * and "Re-run the sim" walks the same sequence of runs for everyone too.
 * The model is analytics.vegasBoard's, line for line, with the dice swapped.
 */

/** mulberry32: small, fast, good enough for a toy book. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One seed per season and run, so run 1 of 2026 is the posted line. */
export function oddsSeed(season: number, run = 1): number {
  return (season * 7919 + run * 104729) >>> 0
}

export function seededVegasBoard(
  seasons: Season[],
  managers: ManagerId[],
  seed: number,
  sims = 5000,
): OddsRow[] {
  const rand = mulberry32(seed)
  const samples = new Map<ManagerId, number[]>()
  for (const season of seasons) {
    if (!season.keeperEra) continue
    for (const team of season.teams) {
      if (team.avgPointsFor === null || !managers.includes(team.manager)) continue
      const list = samples.get(team.manager) ?? []
      list.push(team.avgPointsFor)
      samples.set(team.manager, list)
    }
  }
  const entrants = managers.filter((id) => (samples.get(id)?.length ?? 0) >= 2)
  const wins = new Map<ManagerId, number>(entrants.map((id) => [id, 0]))

  for (let sim = 0; sim < sims; sim++) {
    let best: ManagerId | null = null
    let bestScore = -Infinity
    for (const id of entrants) {
      const history = samples.get(id)!
      const pick = history[Math.floor(rand() * history.length)]
      const score = pick + (rand() + rand() + rand() - 1.5) * 6
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }
    if (best) wins.set(best, (wins.get(best) ?? 0) + 1)
  }

  return entrants
    .map((id) => {
      const p = (wins.get(id) ?? 0) / sims
      const american =
        p >= 0.5
          ? `-${Math.round((100 * p) / (1 - p) / 5) * 5}`
          : `+${Math.round((100 * (1 - p)) / Math.max(p, 0.001) / 5) * 5}`
      return { manager: id, probability: p, american }
    })
    .sort((a, b) => b.probability - a.probability)
}
