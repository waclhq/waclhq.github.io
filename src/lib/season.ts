/**
 * What day it is, in league time.
 *
 * The desk should never say PRE-SEASON in October. Nothing in the data marks
 * the phase, and there is no server to ask, so the clock is derived from the
 * calendar: NFL kickoff is the Thursday after the first Monday of September,
 * fantasy weeks turn over on Tuesdays, fourteen regular-season weeks, three of
 * playoffs. Good enough for an eyebrow, a countdown and a trade batch label;
 * the commissioner's data still decides everything that counts.
 */

export type SeasonPhase = 'offseason' | 'preseason' | 'kickoff-week' | 'in-season' | 'playoffs'

export interface SeasonClock {
  season: number
  phase: SeasonPhase
  /** Fantasy week (1–17) during the season, else null. */
  week: number | null
  kickoff: Date
  /** Whole days until kickoff; negative once the season is under way. */
  daysToKickoff: number
  /** Eyebrow copy: "2026 PRE-SEASON", "KICKOFF IN 5 DAYS", "2026 · WEEK 7". */
  eyebrow: string
}

const DAY = 86_400_000
const REGULAR_WEEKS = 14
const PLAYOFF_WEEKS = 3

/** The Thursday after the first Monday of September. */
export function nflKickoff(year: number): Date {
  const first = new Date(year, 8, 1)
  const firstMonday = 1 + ((8 - first.getDay()) % 7)
  return new Date(year, 8, firstMonday + 3)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function seasonClock(currentSeason: number, now: Date = new Date()): SeasonClock {
  const kickoff = nflKickoff(currentSeason)
  const daysToKickoff = Math.round((startOfDay(kickoff) - startOfDay(now)) / DAY)
  // Weeks turn on the Tuesday before kickoff Thursday.
  const weekOne = startOfDay(kickoff) - 2 * DAY
  const week = Math.max(1, Math.floor((now.getTime() - weekOne) / (7 * DAY)) + 1)

  // The opener kicks at 8:15pm ET on the Thursday; until then it is still
  // kickoff week (so "Kickoff tonight" is a real line), after it week one.
  const kickoffAt = startOfDay(kickoff) + 20.25 * 3_600_000
  let phase: SeasonPhase
  if (now.getFullYear() < currentSeason || now.getMonth() < 7) phase = 'offseason'
  else if (daysToKickoff > 7) phase = 'preseason'
  else if (now.getTime() < kickoffAt) phase = 'kickoff-week'
  else if (week <= REGULAR_WEEKS) phase = 'in-season'
  else if (week <= REGULAR_WEEKS + PLAYOFF_WEEKS) phase = 'playoffs'
  else phase = 'offseason'

  const inPlay = phase === 'in-season' || phase === 'playoffs'
  const eyebrow =
    phase === 'preseason'
      ? `${currentSeason} Pre-Season`
      : phase === 'kickoff-week'
        ? daysToKickoff <= 0
          ? 'Kickoff tonight'
          : `Kickoff in ${daysToKickoff} day${daysToKickoff === 1 ? '' : 's'}`
        : phase === 'in-season'
          ? `${currentSeason} · Week ${week}`
          : phase === 'playoffs'
            ? `${currentSeason} Playoffs · Week ${week}`
            : `${currentSeason} Offseason`

  return { season: currentSeason, phase, week: inPlay ? week : null, kickoff, daysToKickoff, eyebrow }
}

/** Convenience for the hero countdown: days, hours, minutes to kickoff. */
export function untilKickoff(clock: SeasonClock, now: Date = new Date()) {
  const ms = Math.max(0, clock.kickoff.getTime() + 20.25 * 3_600_000 - now.getTime()) // 8:15pm ET-ish
  return {
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    total: ms,
  }
}
