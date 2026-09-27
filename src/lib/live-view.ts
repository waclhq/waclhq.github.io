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

/** A matchup's margin (first team minus second) and win odds through the day. */
export function swingSeries(board: LivePoints, matchup: LivePointsMatchup) {
  const history = board.history
  if (!history) return []
  const a = history.teams.indexOf(matchup.teams[0].team)
  const b = history.teams.indexOf(matchup.teams[1].team)
  if (a < 0 || b < 0) return []
  return history.samples.map((sample) => ({
    t: sample.t,
    margin: Math.round((sample.v[a] - sample.v[b]) * 10) / 10,
    projMargin: Math.round((sample.p[a] - sample.p[b]) * 10) / 10,
  }))
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
