import type {
  LivePoints,
  LivePointsMatchup,
  LivePointsPlay,
  LivePointsPlayer,
  LivePointsTeam,
  ManagerId,
} from './types'

/*
 * Pure helpers for the Live room: nothing here renders or fetches, so each
 * piece can be reasoned about (and tested) on a points.json alone.
 */

export const fmt = (n: number) => n.toFixed(1)
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`

export function teamByName(board: LivePoints): Map<string, LivePointsTeam> {
  return new Map(board.teams.map((team) => [team.team, team]))
}

/** Your matchup first, then the closest by win probability, settled ones last. */
export function orderedMatchups(board: LivePoints, me: ManagerId | null): LivePointsMatchup[] {
  const all = board.matchups ?? []
  const mine = (m: LivePointsMatchup) => m.teams.some((side) => side.manager && side.manager === me)
  const tension = (m: LivePointsMatchup) => Math.abs(m.teams[0].winProb - 0.5)
  return [...all].sort((a, b) => {
    if (mine(a) !== mine(b)) return mine(a) ? -1 : 1
    if (a.settled !== b.settled) return a.settled ? 1 : -1
    return tension(a) - tension(b)
  })
}

/**
 * How a team's total moved over the last `minutes`, from the published
 * history. Null until there are two samples that far apart.
 */
export function momentum(board: LivePoints, teamName: string, minutes = 20): number | null {
  const history = board.history
  if (!history || history.samples.length < 2) return null
  const index = history.teams.indexOf(teamName)
  if (index < 0) return null
  const last = history.samples[history.samples.length - 1]
  const cutoff = new Date(last.t).getTime() - minutes * 60_000
  let earlier = history.samples[0]
  for (const sample of history.samples) {
    if (new Date(sample.t).getTime() <= cutoff) earlier = sample
  }
  if (earlier === last) return null
  return last.v[index] - earlier.v[index]
}

/**
 * Both sides' scores through the day, from the history samples. It starts at
 * the day's first kickoff (points carried from earlier in the week make the
 * opening level), so the quiet hours before the games don't take up the
 * chart.
 */
export function raceSeries(board: LivePoints, matchup: LivePointsMatchup) {
  const history = board.history
  if (!history) return []
  const a = history.teams.indexOf(matchup.teams[0].team)
  const b = history.teams.indexOf(matchup.teams[1].team)
  if (a < 0 || b < 0) return []
  const all = history.samples.map((sample) => ({ t: sample.t, a: sample.v[a], b: sample.v[b] }))
  const updated = new Date(board.updatedAt).getTime()
  const kicks = board.games
    .map((g) => new Date(g.kickoff).getTime())
    .filter((k) => k >= updated - 14 * 3600_000 && k <= updated)
    .sort((x, y) => x - y)
  if (!kicks.length) return all
  const start = kicks[0]
  const day = all.filter((s) => new Date(s.t).getTime() >= start)
  const before = all.filter((s) => new Date(s.t).getTime() < start).pop()
  return before ? [{ ...before, t: new Date(start).toISOString() }, ...day] : day
}

/** Plays that touch a manager, for the "mine" filter and for alerts. */
export function touches(play: LivePointsPlay, me: ManagerId | null): boolean {
  return me !== null && play.hits.some((hit) => hit.manager === me)
}

/** The net fantasy swing a play caused one manager's starters. */
export function swingFor(play: LivePointsPlay, me: ManagerId | null): number {
  if (!me) return 0
  return play.hits.filter((hit) => hit.manager === me && hit.starter).reduce((sum, hit) => sum + hit.pts, 0)
}

export type PlayFilter = 'all' | 'mine' | 'td' | 'boom' | 'turnover'

export function filterPlays(plays: LivePointsPlay[], filter: PlayFilter, me: ManagerId | null): LivePointsPlay[] {
  if (filter === 'all') return plays
  if (filter === 'mine') return plays.filter((play) => touches(play, me))
  if (filter === 'turnover') return plays.filter((play) => play.kind === 'turnover' || play.kind === 'sack' || play.kind === 'safety')
  return plays.filter((play) => play.kind === filter)
}

export const KIND_LABEL: Record<LivePointsPlay['kind'], string> = {
  td: 'Touchdown',
  boom: 'Big play',
  turnover: 'Turnover',
  sack: 'Sack',
  safety: 'Safety',
}

/** Every rostered player this week with his team, for the leader boards. */
export function allPlayers(board: LivePoints) {
  return board.teams.flatMap((team) => [
    ...team.starters.map((player) => ({ player, team, starter: true })),
    ...team.bench.map((player) => ({ player, team, starter: false })),
  ])
}

/** Top scorers among starters, the bench points that got away, and starters who gave nothing. */
export function boards(board: LivePoints) {
  const everyone = allPlayers(board).filter(({ player }) => player.state === 'live' || player.state === 'final')
  const stars = everyone.filter((row) => row.starter).sort((a, b) => b.player.pts - a.player.pts).slice(0, 8)
  const bench = everyone.filter((row) => !row.starter && row.player.pts > 0).sort((a, b) => b.player.pts - a.player.pts).slice(0, 5)
  const ghosts = everyone
    .filter((row) => row.starter && row.player.state === 'final' && row.player.pts <= 3)
    .sort((a, b) => a.player.pts - b.player.pts)
    .slice(0, 5)
  return { stars, bench, ghosts }
}

/** A short, dry line for a matchup's state, in the Lab's voice. */
export function matchupLine(m: LivePointsMatchup): string {
  const [a, b] = m.teams
  const lead = a.total - b.total
  const leader = lead >= 0 ? a : b
  const trailer = lead >= 0 ? b : a
  const fav = a.winProb >= b.winProb ? a : b
  const odds = Math.round(Math.max(a.winProb, b.winProb) * 100)
  if (m.settled) return `${leader.team} by ${fmt(Math.abs(lead))}. Final, pending stat corrections.`
  if (a.total === 0 && b.total === 0) return `Nobody has touched the ball. ${fav.team} ${odds}% on paper.`
  if (odds >= 90) return `${fav.team} ${odds}%. ${fav === leader ? trailer.team : leader.team} needs a miracle and a stat correction.`
  if (odds <= 58) return `Coin flip at ${odds}%. Nobody should be sleeping through the late games.`
  if (fav !== leader) return `${leader.team} leads by ${fmt(Math.abs(lead))}, but ${fav.team} has more to play: ${odds}%.`
  return `${leader.team} up ${fmt(Math.abs(lead))} and ${odds}% to hold it.`
}

/** Players still to kick off for one side, and how many are live right now. */
export function sideStatus(team: LivePointsTeam | undefined): string {
  if (!team) return ''
  const bits = []
  if (team.live) bits.push(`${team.live} playing`)
  if (team.toPlay) bits.push(`${team.toPlay} to play`)
  if (!team.live && !team.toPlay) bits.push('all done')
  return bits.join(' · ')
}

export function gameClock(player: LivePointsPlayer): string {
  if (player.state === 'live') return player.clock || 'Live'
  if (player.state === 'final') return 'Final'
  if (player.state === 'bye') return 'Bye'
  if (!player.kickoff) return 'Later'
  const date = new Date(player.kickoff)
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** Slot-by-slot pairing of two lineups, for the head-to-head view. */
export function headToHead(a: LivePointsTeam, b: LivePointsTeam) {
  const rows: { slot: string; left?: LivePointsPlayer; right?: LivePointsPlayer }[] = []
  const n = Math.max(a.starters.length, b.starters.length)
  for (let i = 0; i < n; i += 1) {
    rows.push({ slot: a.starters[i]?.slot ?? b.starters[i]?.slot ?? '', left: a.starters[i], right: b.starters[i] })
  }
  return rows
}

/* ------------------------------------------------ win odds through the day */

/** Pairing key, as the job writes it into history.matchups. */
export const pairingKey = (m: LivePointsMatchup) => m.teams.map((side) => side.team).join(' v ')

/**
 * The first team's win probability through the day for one matchup, from
 * the history samples, ending on the live number. At least two points, so a
 * fresh morning still draws a (flat) line.
 */
export function winSeries(board: LivePoints, m: LivePointsMatchup): { t: string; w: number }[] {
  const history = board.history
  const index = history?.matchups?.indexOf(pairingKey(m)) ?? -1
  const out: { t: string; w: number }[] = []
  if (history && index >= 0) {
    for (const sample of history.samples) {
      const w = sample.w?.[index]
      if (typeof w === 'number') out.push({ t: sample.t, w })
    }
  }
  const now = { t: board.updatedAt, w: m.teams[0].winProb }
  if (!out.length || out[out.length - 1].w !== now.w) out.push(now)
  if (out.length === 1) out.unshift({ t: out[0].t, w: out[0].w })
  return out
}

/** How far a matchup's odds travelled: the range, and the trailer's low point if the leader came back. */
export function swingOf(board: LivePoints, m: LivePointsMatchup) {
  const series = winSeries(board, m)
  const ws = series.map((s) => s.w)
  const range = Math.max(...ws) - Math.min(...ws)
  const winnerIsA = m.teams[0].winProb >= 0.5
  const low = winnerIsA ? Math.min(...ws) : 1 - Math.max(...ws)
  return { range, winner: winnerIsA ? m.teams[0] : m.teams[1], low }
}

/* -------------------------------------------------------- fire and ice */

export const FIRE_AT = 20

export function heat(player: LivePointsPlayer): 'fire' | 'ice' | null {
  if ((player.state === 'live' || player.state === 'final') && player.pts >= FIRE_AT) return 'fire'
  if (player.state === 'final' && player.pts <= 2 && player.pos !== 'DEF') return 'ice'
  return null
}

/** NFL teams with the ball inside the opponent's 20 right now. */
export function redZoneTeams(board: LivePoints): Set<string> {
  return new Set(board.games.filter((g) => g.state === 'in' && g.redZone && g.possession).map((g) => g.possession as string))
}

/** A player whose offense is in the red zone: a touchdown could land on him any second. */
export function inRedZone(player: LivePointsPlayer, teams: Set<string>): boolean {
  return player.state === 'live' && player.pos !== 'DEF' && teams.has(player.nfl)
}

/** For every NFL team in a live game with a known possession: is its offense or its defense out there? */
export function sidesOnField(board: LivePoints): Map<string, 'offense' | 'defense'> {
  const sides = new Map<string, 'offense' | 'defense'>()
  for (const game of board.games) {
    if (game.state !== 'in' || !game.possession) continue
    sides.set(game.possession, 'offense')
    sides.set(game.possession === game.home ? game.away : game.home, 'defense')
  }
  return sides
}

/** Is this player's side of the ball on the field right now? A defense when the other team has it, anyone else when his team does. */
export function onField(player: LivePointsPlayer, sides: Map<string, 'offense' | 'defense'>): boolean {
  if (player.state !== 'live') return false
  return sides.get(player.nfl) === (player.pos === 'DEF' ? 'defense' : 'offense')
}

/* ----------------------------------------------------- living portraits */

/** How a manager's face should look: flush with a lead, grey when it's gone, jolted by a fresh play. */
export function mood(
  side: { manager: ManagerId | null; winProb: number },
  freshPlays: LivePointsPlay[],
): string {
  const classes: string[] = []
  if (side.winProb >= 0.8) classes.push('is-hot')
  if (side.winProb <= 0.15) classes.push('is-cold')
  if (side.manager) {
    const mine = freshPlays.flatMap((play) => play.hits.filter((hit) => hit.manager === side.manager && hit.starter))
    if (mine.some((hit) => hit.pts <= -2)) classes.push('is-hit')
    else if (mine.some((hit) => hit.pts >= 6)) classes.push('is-cheer')
  }
  return classes.join(' ')
}

/* -------------------------------------------------------------- recap */

export interface RecapFacts {
  week: number | null
  done: boolean
  results: { winner: LivePointsMatchup['teams'][number]; loser: LivePointsMatchup['teams'][number]; margin: number; matchup: LivePointsMatchup }[]
  blowout?: RecapFacts['results'][number]
  nailbiter?: RecapFacts['results'][number]
  comeback?: { result: RecapFacts['results'][number]; low: number }
  star?: { player: LivePointsPlayer; team: LivePointsTeam }
  bench?: { player: LivePointsPlayer; team: LivePointsTeam }
  benchTeam?: LivePointsTeam
  ghost?: { player: LivePointsPlayer; team: LivePointsTeam }
  topTeam?: LivePointsTeam
  totalPoints: number
  touchdowns: number
}

/** The week's story in facts: results, the blowout and the nail-biter, the comeback, the star, the bench, the ghost. */
export function recapFacts(board: LivePoints): RecapFacts {
  const results = (board.matchups ?? []).map((matchup) => {
    const [a, b] = matchup.teams
    const aWins = a.total >= b.total
    return { winner: aWins ? a : b, loser: aWins ? b : a, margin: Math.abs(a.total - b.total), matchup }
  })
  const byMargin = [...results].sort((x, y) => y.margin - x.margin)
  let comeback: RecapFacts['comeback']
  for (const result of results) {
    const { low } = swingOf(board, result.matchup)
    if (low < 0.35 && (!comeback || low < comeback.low)) comeback = { result, low }
  }
  const { stars, ghosts } = boards(board)
  const benchRows = allPlayers(board).filter((row) => !row.starter).sort((a, b) => b.player.pts - a.player.pts)
  return {
    week: board.week,
    done: board.games.every((game) => game.state === 'post'),
    results,
    blowout: byMargin[0],
    nailbiter: byMargin[byMargin.length - 1],
    comeback,
    star: stars[0] ? { player: stars[0].player, team: stars[0].team } : undefined,
    bench: benchRows[0] && benchRows[0].player.pts > 0 ? { player: benchRows[0].player, team: benchRows[0].team } : undefined,
    benchTeam: [...board.teams].sort((a, b) => b.benchTotal - a.benchTotal)[0],
    ghost: ghosts[0] ? { player: ghosts[0].player, team: ghosts[0].team } : undefined,
    topTeam: [...board.teams].sort((a, b) => b.total - a.total)[0],
    totalPoints: Math.round(board.teams.reduce((sum, t) => sum + t.total, 0) * 10) / 10,
    touchdowns: (board.plays ?? []).filter((play) => play.kind === 'td').length,
  }
}

/* --------------------------------------------------------- live standings */

export interface LiveStandingRow {
  team: string
  manager: ManagerId | null
  /** Rank before this week, from the matchups snapshot. */
  before: number | null
  rank: number
  wins: number
  losses: number
  ties: number
  /** This week as it stands: winning, losing, level, or not started. */
  now: 'W' | 'L' | 'T' | null
  pf: number | null
  pa: number | null
  score: number
  opp: string
  oppScore: number
  winProb: number
  final: boolean
}

/**
 * The standings if every matchup ended right now: last week's table plus
 * this week's result as it stands (the leader takes the win), this week's
 * points added to points for and against. Ranked by wins, then points for,
 * the way Yahoo breaks ties. A matchup where neither side has played yet
 * doesn't count until someone scores.
 */
export function liveStandings(board: LivePoints): LiveStandingRow[] {
  const rows: LiveStandingRow[] = []
  for (const m of board.matchups ?? []) {
    m.teams.forEach((side, i) => {
      const opp = m.teams[1 - i]
      const [w = 0, l = 0, t = 0] = (side.record ?? '0-0').split('-').map(Number)
      const started = side.total !== 0 || opp.total !== 0 || m.settled
      const now: LiveStandingRow['now'] = !started ? null : side.total > opp.total ? 'W' : side.total < opp.total ? 'L' : 'T'
      rows.push({
        team: side.team,
        manager: side.manager,
        before: side.rank,
        rank: 0,
        wins: w + (now === 'W' ? 1 : 0),
        losses: l + (now === 'L' ? 1 : 0),
        ties: t + (now === 'T' ? 1 : 0),
        now,
        pf: typeof side.pf === 'number' ? Math.round((side.pf + side.total) * 100) / 100 : null,
        pa: typeof side.pa === 'number' ? Math.round((side.pa + opp.total) * 100) / 100 : null,
        score: side.total,
        opp: opp.team,
        oppScore: opp.total,
        winProb: side.winProb,
        final: m.settled,
      })
    })
  }
  const pct = (r: LiveStandingRow) => (r.wins + r.ties / 2) / Math.max(1, r.wins + r.losses + r.ties)
  rows.sort((a, b) => pct(b) - pct(a) || b.wins - a.wins || (b.pf ?? 0) - (a.pf ?? 0))
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}
