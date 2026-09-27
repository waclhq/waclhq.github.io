import { managerColor } from './identity'
import { fmt, matchupLine, type RecapFacts } from './live-view'
import type { CardSpec } from './live-share'
import type { LivePointsMatchup, LivePointsPlayer, LivePointsTeam, ManagerId } from './types'

/*
 * What each share card says. Plain data for live-share.ts to draw; the words
 * follow the Lab: dry, specific, using people's own numbers against them.
 */

export type NameOf = (id: ManagerId | null) => string

const weekTag = (week: number | null) => `Week ${week ?? '—'}`

export function matchupCard(m: LivePointsMatchup, week: number | null, nameOf: NameOf): CardSpec {
  const [a, b] = m.teams
  const status = m.settled ? 'Final' : a.live + b.live > 0 ? 'Live' : 'Upcoming'
  return {
    eyebrow: `${weekTag(week)} · ${status}`,
    title: `${a.team} v ${b.team}`,
    sides: [
      { label: a.team, sub: `${nameOf(a.manager)} · proj ${fmt(a.proj)}`, value: fmt(a.total), color: managerColor(a.manager) },
      { label: b.team, sub: `${nameOf(b.manager)} · proj ${fmt(b.proj)}`, value: fmt(b.total), color: managerColor(b.manager) },
    ],
    odds: a.winProb,
    sub: matchupLine(m),
    accent: managerColor(a.winProb >= 0.5 ? a.manager : b.manager),
    file: `wacl-${a.team}-v-${b.team}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  }
}

function playerLine(player: LivePointsPlayer) {
  return player.line || (player.state === 'final' ? 'nothing' : 'still playing')
}

export function starCard(row: { player: LivePointsPlayer; team: LivePointsTeam }, week: number | null, nameOf: NameOf): CardSpec {
  return {
    eyebrow: `${weekTag(week)} · Carrying the week`,
    title: row.player.name,
    big: fmt(row.player.pts),
    bigColor: managerColor(row.team.manager),
    sub: `${playerLine(row.player)}. Started by ${nameOf(row.team.manager)}, who will not be quiet about it.`,
    accent: managerColor(row.team.manager),
    file: `wacl-star-${row.player.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  }
}

export function benchCard(row: { player: LivePointsPlayer; team: LivePointsTeam }, week: number | null, nameOf: NameOf): CardSpec {
  return {
    eyebrow: `${weekTag(week)} · Bench of shame`,
    title: `${row.player.name}, on ${nameOf(row.team.manager)}'s bench`,
    big: fmt(row.player.pts),
    bigColor: token('--color-arc-orange'),
    sub: `${playerLine(row.player)}. Real points, zero credit. ${row.team.team} left ${fmt(row.team.benchTotal)} on the pine this week.`,
    accent: token('--color-arc-orange'),
    file: `wacl-bench-${row.player.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  }
}

export function ghostCard(row: { player: LivePointsPlayer; team: LivePointsTeam }, week: number | null, nameOf: NameOf): CardSpec {
  return {
    eyebrow: `${weekTag(week)} · Ghost of the week`,
    title: row.player.name,
    big: fmt(row.player.pts),
    bigColor: token('--color-arc-ink-faint'),
    sub: `Started by ${nameOf(row.team.manager)}. Played the whole game. ${playerLine(row.player)}. Boo.`,
    accent: token('--color-arc-cyan'),
    file: `wacl-ghost-${row.player.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  }
}

export function comebackCard(facts: NonNullable<RecapFacts['comeback']>, week: number | null, nameOf: NameOf): CardSpec {
  const { result, low } = facts
  return {
    eyebrow: `${weekTag(week)} · The comeback`,
    title: `${result.winner.team} was dead at ${Math.round(low * 100)}%`,
    big: `${Math.round(low * 100)}% → ${result.matchup.settled ? 'W' : `${Math.round(Math.max(result.winner.winProb, 0) * 100)}%`}`,
    bigColor: managerColor(result.winner.manager),
    sub: `${nameOf(result.winner.manager)} climbed out of the grave against ${nameOf(result.loser.manager)}: ${fmt(result.winner.total)} to ${fmt(result.loser.total)}.`,
    accent: managerColor(result.winner.manager),
    file: `wacl-comeback-${result.winner.team}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
  }
}

export function recapCard(facts: RecapFacts, nameOf: NameOf): CardSpec {
  const lines = facts.results.map(
    (r) => `${r.winner.team} ${fmt(r.winner.total)}  def.  ${r.loser.team} ${fmt(r.loser.total)}`,
  )
  return {
    eyebrow: `${weekTag(facts.week)} · ${facts.done ? 'Final' : 'So far'}`,
    title: facts.done ? 'The week, settled' : 'The week so far',
    sub: facts.topTeam ? `Top score: ${facts.topTeam.team} (${nameOf(facts.topTeam.manager)}) with ${fmt(facts.topTeam.total)}.` : undefined,
    lines,
    accent: token('--color-arc-green'),
    file: `wacl-week-${facts.week ?? ''}-recap`,
  }
}

function token(name: string): string {
  return `var(${name})`
}
