import { careerLuck, luckRows, tortureBoard } from './analytics'
import { managerName } from './data'
import { roast } from './roast'
import { bookCareerTable, eraOptions, managerSeasons } from './stats'
import type { LeagueData, ManagerId } from './types'

/*
 * The roast, with a deeper bench.
 *
 * The base engine (lib/roast.ts) only fires its sharpest lines past hard
 * thresholds — ten seasons, three silvers, eight wins of luck — which left a
 * third of the league with an opener and a closer and nothing in between,
 * and gave "Again" the same four facts every time. This wraps it: the
 * threshold lines stay in as the lead material, a pool of further data-backed
 * lines fills behind them, and the seed rotates the assembly so every reroll
 * surfaces something the last one did not.
 */

const pick = <T,>(pool: T[], seed: number) => pool[Math.abs(seed) % pool.length]

function extraLines(data: LeagueData, id: ManagerId, seed: number): string[] {
  const { seasons, league, careerAverages } = data
  const name = managerName(data.managers, id)
  const eras = eraOptions(seasons)
  const table = bookCareerTable(seasons, eras[0], careerAverages)
  const career = table.find((row) => row.manager === id)
  if (!career) return []
  const torture = tortureBoard(seasons, league.currentSeason).find((row) => row.manager === id)
  const luck = careerLuck(luckRows(seasons)).find((row) => row.manager === id)
  const rows = managerSeasons(seasons, id)
  const latest = seasons.reduce((max, season) => Math.max(max, season.year), 0)
  const lastSeason = seasons.find((season) => season.year === latest)
  const out: string[] = []

  // ---- peak and trough ----
  if (career.bestSeason && career.worstSeason && career.bestSeason.year !== career.worstSeason.year) {
    const gap = career.bestSeason.avg - career.worstSeason.avg
    out.push(
      pick(
        [
          `${career.bestSeason.avg.toFixed(1)} a game in ${career.bestSeason.year}, ${career.worstSeason.avg.toFixed(1)} in ${career.worstSeason.year}. Same manager, allegedly.`,
          `Your ceiling is ${career.bestSeason.year}. Your floor is ${career.worstSeason.year}. The ${gap.toFixed(0)}-point gap between them is where your reputation lives.`,
        ],
        seed + 11,
      ),
    )
  }

  // ---- the schedule's opinion ----
  if (luck) {
    const lucky = luck.luckiestYear
    const unlucky = luck.unluckiestYear
    if (lucky.luck > 1.5) {
      out.push(
        pick(
          [
            `${lucky.year}: ${lucky.wins}–${lucky.losses} on ${lucky.expectedWins.toFixed(1)} deserved wins. The schedule carried you and you never sent a thank-you note.`,
            `In ${lucky.year} the points said ${lucky.expectedWins.toFixed(1)} wins and the standings said ${lucky.wins}. Nobody has asked for a recount, so enjoy it.`,
          ],
          seed + 12,
        ),
      )
    }
    if (unlucky.luck < -1.5) {
      out.push(
        `${unlucky.year} owed you ${Math.abs(unlucky.luck).toFixed(1)} more wins than it paid. The universe keeps a ledger too, and it is not the one on this site.`,
      )
    }
  }

  // ---- the bracket ----
  const bracketGames = career.playoffWins + career.playoffLosses
  if (bracketGames >= 4) {
    const rate = career.playoffWins / bracketGames
    if (rate < 0.4) {
      out.push(
        `${career.playoffWins}–${career.playoffLosses} in the bracket. You get invited to the party and leave before the music starts.`,
      )
    } else if (rate > 0.6 && career.titles < 2) {
      out.push(
        `${career.playoffWins}–${career.playoffLosses} in playoff games and ${career.titles === 0 ? 'still no ring' : 'one ring to show for it'}. Winning the games that don't count as titles is a very specific talent.`,
      )
    }
  }

  // ---- reigning champion ----
  if (lastSeason?.champion === id) {
    out.push(
      pick(
        [
          `Reigning champion, which the group chat has been reminded of roughly hourly since ${latest}. The banner is up; the target is too.`,
          `Defending the ${latest} title. Historically that goes about as well as defending a lead with a kicker in the flex.`,
        ],
        seed + 13,
      ),
    )
  }

  // ---- small sample ----
  if (career.seasonsPlayed < 5) {
    out.push(
      pick(
        [
          `${career.seasonsPlayed} seasons on the books. Not enough for a trend, plenty for a warning.`,
          `Only ${career.seasonsPlayed} seasons of evidence, and the evidence is already this cooperative.`,
        ],
        seed + 14,
      ),
    )
  }

  // ---- silver and drought, below the base thresholds ----
  if (torture && torture.runnerUps > 0 && torture.runnerUps < 3) {
    out.push(
      `${torture.runnerUps === 1 ? 'A runner-up finish' : 'Two runner-up finishes'}: close enough to see the trophy, far enough that someone else took it home.`,
    )
  }
  if (torture && torture.lastTitleYear && torture.drought >= 4 && torture.drought < 10) {
    out.push(
      `${torture.drought} years since the ${torture.lastTitleYear} title. Long enough that the highlight reel needs a content warning about the film quality.`,
    )
  }

  // ---- last season's line ----
  const last = rows[0]
  if (last) {
    const games = last.team.wins + last.team.losses
    const pct = games ? last.team.wins / games : 0
    if (last.team.rank > 8) {
      out.push(
        `${last.season.year}: finished ${last.team.rank}th of ${last.season.teamCount}. The nice thing about the bottom of the table is nobody expects a repeat.`,
      )
    } else if (pct >= 0.7 && last.team.rank !== 1) {
      out.push(
        `${last.team.wins}–${last.team.losses} in ${last.season.year} and no title. That is the fantasy equivalent of leaving the casino up and then finding the second casino.`,
      )
    }
  }

  // ---- points against ----
  const byAgainst = [...table]
    .filter((row) => row.avgPointsAgainst !== null && row.seasonsPlayed >= 3)
    .sort((a, b) => (b.avgPointsAgainst ?? 0) - (a.avgPointsAgainst ?? 0))
  if (byAgainst[0]?.manager === id && career.avgPointsAgainst) {
    out.push(
      `${career.avgPointsAgainst.toFixed(1)} points against per game, the most in the league. Your opponents are not better; they are simply well rested by the time they reach you.`,
    )
  }

  // ---- longevity, spun ----
  if (career.seasonsPlayed >= 15 && career.titles <= 1) {
    out.push(
      `${career.seasonsPlayed} seasons, ${career.titles === 0 ? 'zero' : 'one'} ${career.titles === 1 ? 'title' : 'titles'}. ${name} is the league's longest-running pilot episode.`,
    )
  }

  return out
}

/**
 * Opener, three or four content lines, closer. The base engine's threshold
 * lines lead; the pool fills behind them; the seed rotates which lines from
 * each group appear, so "Again" is a different set every time it can be.
 */
export function profileRoast(data: LeagueData, id: ManagerId, seed: number): string[] {
  const base = roast(data, id, seed)
  if (base.length < 2) return base
  const opener = base[0]
  const closer = base[base.length - 1]
  const sharp = base.slice(1, -1)
  const extras = extraLines(data, id, seed).filter((line) => !sharp.includes(line))

  const target = 4
  const lead = rotate(sharp, seed).slice(0, Math.min(sharp.length, 2))
  const fill = rotate(extras, seed * 7 + 3).slice(0, Math.max(0, target - lead.length))
  const content = [...lead, ...fill]
  // Still short (a thin record): fall back to whatever sharp lines remain.
  if (content.length < 3) {
    for (const line of sharp) {
      if (content.length >= 3) break
      if (!content.includes(line)) content.push(line)
    }
  }
  return [opener, ...content, closer]
}

function rotate<T>(list: T[], seed: number): T[] {
  if (list.length <= 1) return list
  const start = Math.abs(seed) % list.length
  return [...list.slice(start), ...list.slice(0, start)]
}
