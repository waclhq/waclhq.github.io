import {
  careerLuck,
  contractRuns,
  eloTimeline,
  goatIndex,
  luckRows,
  tortureBoard,
} from './analytics'
import { latestSeason } from './boards-facts'
import { managerName } from './data'
import { num, ordinal, pct } from './format'
import { bookCareerTable, eraOptions } from './stats'
import type { LeagueData, ManagerId } from './types'

/*
 * The Roast Booth's writers' room.
 *
 * Every line cites a real number from this site, which is what makes it
 * hurt. Where the old engine only spoke above a threshold (ten seasons, a
 * decade of drought, eight wins of luck) and left a third of the league with
 * a shrug, this one has a generator for every résumé: best and worst season,
 * the luckiest and unluckiest year, playoff W–L, the reigning champion, the
 * title drought, the Elo peak, last season's finish, the single-game board,
 * and a small-sample warning for the newer seats. Each "Again" rotates the
 * window across the pool, so the same three facts never come back to back.
 */

export interface Roast {
  opener: string
  lines: string[]
  closer: string
  /** How many distinct facts the room had to choose from. */
  poolSize: number
}

const pick = <T,>(pool: T[], seed: number): T => pool[Math.abs(seed) % pool.length]
const signed = (value: number, digits = 1) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${num(Math.abs(value), digits)}`

/** Three lines per assembly; the pool rotates one step per "Again". */
const WINDOW = 3

export function roastLines(data: LeagueData, id: ManagerId, seed: number): Roast {
  const seasons = data.seasons
  const name = managerName(data.managers, id)
  const latest = latestSeason(seasons)
  const current = data.league.currentSeason

  const career = bookCareerTable(seasons, eraOptions(seasons)[0], data.careerAverages).find(
    (row) => row.manager === id,
  )
  const torture = tortureBoard(seasons, current).find((row) => row.manager === id)
  if (!career || !torture) {
    return {
      opener: `${name} has no record to roast.`,
      lines: ['Which is, on reflection, its own roast.'],
      closer: 'The committee will reconvene when there are numbers.',
      poolSize: 1,
    }
  }

  const allLuck = luckRows(seasons)
  const luck = careerLuck(allLuck).find((row) => row.manager === id)
  const goat = goatIndex(seasons)
  const goatRank = goat.findIndex((row) => row.manager === id) + 1
  const goatRow = goat[goatRank - 1]
  const contracts = contractRuns(data.keepers, data.playerPoints, data.playerPositions)
  const overpay = contracts.overpays.find((run) => run.manager === id)
  const steal = contracts.steals.find((run) => run.manager === id)
  const elo = eloTimeline(seasons)
  const table = bookCareerTable(seasons, eraOptions(seasons)[0], data.careerAverages)
  const ppgRank =
    [...table]
      .filter((row) => row.avgPointsFor !== null)
      .sort((a, b) => (b.avgPointsFor ?? 0) - (a.avgPointsFor ?? 0))
      .findIndex((row) => row.manager === id) + 1

  const titleYears = seasons
    .filter((season) => season.champion === id)
    .map((season) => season.year)
    .sort((a, b) => a - b)
  const lastTeam = latest?.teams.find((team) => team.manager === id) ?? null
  const reigning = latest?.champion === id
  const lastPlaces = seasons.filter((season) =>
    season.teams.some((team) => team.manager === id && team.rank === season.teamCount),
  ).length
  const small = career.seasonsPlayed < 5

  // Candidate facts, sharpest first. One string per generator goes into the
  // pool; the seed picks the phrasing and the window walks the pool.
  const pool: string[] = []
  const add = (...variants: string[]) => {
    if (variants.length) pool.push(pick(variants, seed))
  }

  // ---- the title situation -------------------------------------------
  if (reigning && lastTeam) {
    add(
      `Reigning champion: ${lastTeam.wins}–${lastTeam.losses} in ${latest!.year}, ${num(lastTeam.avgPointsFor, 1)} a game. Your name is at the top of the book for exactly as long as it takes someone to win in ${current}.`,
      `Defending champion. The league's official position is that ${latest!.year} was a fluke, pending evidence, and the evidence is due in ${current}.`,
    )
  } else if (torture.neverWon && torture.seasonsPlayed >= 10) {
    add(
      `${torture.seasonsPlayed} seasons. Zero titles. The trophy is not hiding; it just does not know your name.`,
      `You have been chasing this championship for ${torture.seasonsPlayed} years. At this point it legally qualifies as a hobby.`,
      `${torture.seasonsPlayed} seasons without a ring. The league constitution predates smartphones; so does your last realistic shot.`,
    )
  } else if (torture.neverWon) {
    add(
      `${torture.seasonsPlayed} ${torture.seasonsPlayed === 1 ? 'season' : 'seasons'} in, no title. The league has seen this film; the sequel is usually longer.`,
      `Titles: none in ${torture.seasonsPlayed} ${torture.seasonsPlayed === 1 ? 'try' : 'tries'}. The good news is that the sample is small. That is also the bad news.`,
    )
  } else if (torture.drought >= 10 && torture.lastTitleYear) {
    add(
      `Last ring: ${torture.lastTitleYear}. Players drafted that year are retired and hosting podcasts.`,
      `You last won in ${torture.lastTitleYear}. That trophy has been legal to drive for a while.`,
      `${torture.drought} years since ${torture.lastTitleYear}. The banner is still up; the dynasty checked out.`,
    )
  } else if (career.titles >= 2) {
    add(
      `Yes, ${career.titles} titles (${titleYears.join(', ')}). Mentioned so often the group chat auto-collapses it.`,
      `${career.titles} rings, and somehow the same number of humble seasons: zero.`,
    )
  } else if (career.titles === 1 && torture.lastTitleYear) {
    add(
      `One ring, ${torture.lastTitleYear}. A lovely year. The word "dynasty" has not come up.`,
      `Champion of ${torture.lastTitleYear}, and of nothing since. The ${current - torture.lastTitleYear}-year victory lap continues.`,
    )
  }

  // ---- silver ----------------------------------------------------------
  if (torture.runnerUps >= 3) {
    add(
      `${torture.runnerUps} runner-up finishes. The second-place photographer knows your good side by heart.`,
      `${torture.runnerUps} silvers. You have spent more time on the podium's second step than some champions spent in the league.`,
    )
  } else if (torture.runnerUps > 0) {
    add(
      `${torture.runnerUps} runner-up ${torture.runnerUps === 1 ? 'finish' : 'finishes'}: close enough to see the trophy, far enough to describe it from memory.`,
    )
  }

  // ---- luck ------------------------------------------------------------
  if (luck) {
    if (luck.totalLuck > 8) {
      add(
        `The schedule has gifted you ${signed(luck.totalLuck)} wins over your career. Send it a card; it has done more for you than your draft board.`,
        `${signed(luck.totalLuck)} career wins of pure luck. Your points object to being associated with your record.`,
      )
    } else if (luck.totalLuck < -8) {
      add(
        `${signed(luck.totalLuck)} wins, stolen by the schedule. Unlucky, yes — but the schedule did not set your lineup either.`,
        `You are ${num(Math.abs(luck.totalLuck), 1)} wins short of what your points earned. The universe apologises; it will not be changing its behaviour.`,
      )
    } else {
      add(
        `Career luck: ${signed(luck.totalLuck)} wins. Neither blessed nor cursed — the schedule simply had no opinion about you.`,
      )
    }

    const blessed = [...allLuck].sort((a, b) => b.luck - a.luck)
    const luckyRank = blessed.findIndex((row) => row === luck.luckiestYear) + 1
    const lucky = luck.luckiestYear
    if (lucky.luck > 0.5) {
      const standing =
        luckyRank === 1
          ? 'the luckiest season in league history'
          : luckyRank <= 5
            ? `the #${luckyRank} luckiest season in league history`
            : 'a gift you have never acknowledged'
      add(
        `Your ${lucky.year} went ${lucky.wins}–${lucky.losses} on ${num(lucky.expectedWins, 1)} deserved wins — ${signed(lucky.luck)} of pure fortune, ${standing}.`,
      )
    }
    const cursed = luck.unluckiestYear
    if (cursed.luck < -0.5) {
      add(
        `${cursed.year}: ${cursed.wins}–${cursed.losses} with points good for ${num(cursed.expectedWins, 1)} wins. You were robbed, and you have told everyone, and the ruling stands.`,
      )
    }
  }

  // ---- the contract ----------------------------------------------------
  if (overpay) {
    add(
      `You paid $${overpay.totalPaid} for ${overpay.player} and received ${Math.round(overpay.totalPoints)} points. A vending machine returns more.`,
      `$${overpay.totalPaid} on ${overpay.player}, ${Math.round(overpay.totalPoints)} points back. That is not a contract; it is a donation.`,
    )
  }
  if (steal) {
    add(
      `${steal.player} at $${steal.totalPaid} for ${Math.round(steal.totalPoints)} points: the one deal you made that the rest of the league cannot make fun of.`,
    )
  }

  // ---- scoring ---------------------------------------------------------
  if (goatRank > goat.length * 0.6) {
    add(
      `Era-adjusted scoring rank: #${goatRank} of ${goat.length} all-time. Consistency is a virtue; this is not the consistency they meant.`,
    )
  } else if (goatRank <= 3 && goatRow) {
    add(
      `Era-adjusted scoring rank #${goatRank} of ${goat.length}, ${signed(goatRow.sumZ)} GOAT points. The numbers like you. The numbers have been wrong before.`,
    )
  } else if (career.avgPointsFor !== null && ppgRank) {
    add(
      `${num(career.avgPointsFor, 1)} points a game across your career, #${ppgRank} of ${table.length} all-time. Respectable, which is the word people use when they mean nothing else.`,
    )
  }

  // ---- best and worst years -------------------------------------------
  if (career.bestSeason && latest) {
    const best = career.bestSeason
    add(
      best.year < latest.year - 2
        ? `Your best year was ${best.year}, ${num(best.avg, 1)} a game. You have spent every season since looking for that lineup in the couch cushions.`
        : `Your best year was ${best.year}, ${num(best.avg, 1)} a game. Recency is doing a lot of work in your self-image.`,
    )
  }
  if (career.worstSeason && career.seasonsPlayed > 1) {
    const worst = career.worstSeason
    add(
      `${worst.year}: ${num(worst.avg, 1)} points a game. The league remembers. The league has receipts.`,
      `Career low: ${num(worst.avg, 1)} a game in ${worst.year}. Some years are learning experiences; that one was a syllabus.`,
    )
  }

  // ---- the postseason --------------------------------------------------
  const playoffGames = career.playoffWins + career.playoffLosses
  if (playoffGames === 0) {
    add(
      `Playoff record: 0–0. The postseason has heard of you the way it has heard of the metric system.`,
    )
  } else if (career.playoffRate < 0.4) {
    add(
      `Playoffs in ${career.playoffAppearances} of ${career.seasonsPlayed} seasons. Your December rivals are the waiver wire and acceptance.`,
    )
  } else if (career.playoffWins >= 8) {
    add(
      `${career.playoffWins}–${career.playoffLosses} in the playoffs across ${career.playoffAppearances} trips. December is the one month the group chat is quiet about you.`,
    )
  } else {
    add(
      `Playoffs: ${career.playoffAppearances} trips in ${career.seasonsPlayed} seasons, ${career.playoffWins}–${career.playoffLosses} once there. The bracket keeps letting you in; it has not yet let you leave with anything.`,
    )
  }

  // ---- last season -----------------------------------------------------
  if (lastTeam && latest && !reigning) {
    const place = ordinal(lastTeam.rank)
    add(
      lastTeam.rank === latest.teamCount
        ? `${latest.year}: ${lastTeam.wins}–${lastTeam.losses}, dead last of ${latest.teamCount}. The good news is the draft order.`
        : lastTeam.rank <= 3
          ? `${latest.year}: ${lastTeam.wins}–${lastTeam.losses}, ${place}. Close enough to the podium to be photographed near it.`
          : `${latest.year}: ${lastTeam.wins}–${lastTeam.losses}, ${place} of ${latest.teamCount}. Middle of the table, where the league keeps people it has no strong feelings about.`,
    )
  }

  // ---- elo -------------------------------------------------------------
  const ratings = elo.map((point) => ({ year: point.year, rating: point.ratings[id] })).filter((p) => p.rating !== undefined)
  if (ratings.length >= 2) {
    const peak = ratings.reduce((best, point) => (point.rating > best.rating ? point : best))
    const now = ratings[ratings.length - 1]
    add(
      now.rating < peak.rating - 30
        ? `Your Elo peaked at ${peak.rating} in ${peak.year}. It is ${now.rating} today, which the chart draws as a gentle slope and the league reads as a hill you fell down.`
        : `Your Elo sits at ${now.rating}, within reach of your all-time peak of ${peak.rating} (${peak.year}). Consistency, or a ceiling; the committee declines to say which.`,
    )
  }

  // ---- the single-game book -------------------------------------------
  const book = data.gameRecords?.allTime
  if (book) {
    const high = book.highest.findIndex((row) => row.manager === id)
    const low = book.lowest.findIndex((row) => row.manager === id)
    if (high >= 0) {
      const row = book.highest[high]
      add(
        `Your ${num(row.points, 2)} in ${row.year} is still #${high + 1} on the all-time single-game board. Nobody has forgotten; you have made sure of that.`,
      )
    }
    if (low >= 0) {
      const row = book.lowest[low]
      add(
        `${num(row.points, 2)} in ${row.year}: the #${low + 1} lowest single game in the book. It is framed. Not by you.`,
      )
    }
  }

  // ---- the basement ----------------------------------------------------
  if (lastPlaces >= 2) {
    add(
      `${lastPlaces} last-place finishes. The draft lottery, had we one, would know you by name.`,
    )
  }

  // ---- small sample ----------------------------------------------------
  if (small) {
    add(
      career.winPct < 0.5
        ? `${career.seasonsPlayed} ${career.seasonsPlayed === 1 ? 'season' : 'seasons'} in, ${pct(career.winPct, 0)} win rate. The sample is small; the trend is not encouraging.`
        : `${career.seasonsPlayed} ${career.seasonsPlayed === 1 ? 'season' : 'seasons'} in, ${pct(career.winPct, 0)} win rate. The league is waiting for regression; it is very patient.`,
    )
  }

  // ---- assembly --------------------------------------------------------
  const opener = pick(
    [
      `${name}. Let's go to the numbers, since the numbers cannot be muted in the group chat.`,
      `The record book on ${name} is public, which is unfortunate for ${name}.`,
      `${name} asked for feedback. The spreadsheet obliges.`,
      `A brief word on ${name}, from the only source in this league that has never lost an argument.`,
    ],
    seed,
  )
  const closer = pick(
    [
      `Anyway — see you at the auction. Bring the usual optimism; the league will supply the usual result.`,
      `The good news: every stat above resets to zero never. Good luck in ${current}.`,
      `Printed, framed, and legally admissible. The Almanac sends its regards.`,
      `None of this is personal. All of it is on the record.`,
    ],
    seed + 5,
  )

  const size = pool.length
  const lines: string[] = []
  if (size) {
    // Take one opens at the top of the pool (the sharpest fact); every
    // "Again" slides the window one step.
    const start = Math.abs(seed - 1) % size
    for (let i = 0; i < Math.min(WINDOW, size); i += 1) lines.push(pool[(start + i) % size])
  }
  return { opener, lines, closer, poolSize: size }
}
