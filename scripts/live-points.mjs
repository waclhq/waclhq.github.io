/**
 * Live fantasy points for the league, from ESPN's public box scores.
 *
 * Yahoo's API is the official source and the Yahoo jobs will take over once it
 * is enabled. Until then, this reads the NFL's live box scores from ESPN's
 * unauthenticated JSON endpoints, scores every rostered player with the
 * league's rules, and writes one compact file the Ledger polls:
 *
 *   node scripts/live-points.mjs --out points.json [--week 3] [--horizon 300]
 *
 * --week     score a given regular-season week instead of the current one
 *            (a finished week is the way to test this against real data)
 * --horizon  minutes this run can still wait; with no game live and none
 *            kicking off inside it, the summary says done
 * --fixture  read { scoreboard, summaries } from a file instead of ESPN
 *
 * Prints one JSON line to stdout for the workflow: { done, nextPollSeconds,
 * live, final, pre, noLine } — noLine lists rostered players in a started game
 * with no box-score line: fine mid-game, a name mismatch if the game is over.. Lineups come from scripts/data/lineups.json.
 * Writes nothing else; publishing is the workflow's job.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

/*
 * The league's scoring. The workbook does not record it, so this is Yahoo's
 * default half-point PPR, with no kickers (the league has no K slot). Change
 * a number here and every total follows; the panel says "estimate" either way.
 */
export const RULES = {
  passYards: 1 / 25,
  passTD: 4,
  interception: -1,
  rushYards: 1 / 10,
  rushTD: 6,
  reception: 0.5,
  recYards: 1 / 10,
  recTD: 6,
  returnTD: 6,
  fumbleLost: -2,
  def: {
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    touchdown: 6,
    safety: 2,
    // [upper bound of points allowed, fantasy points]
    pointsAllowed: [
      [0, 10],
      [6, 7],
      [13, 4],
      [20, 1],
      [27, 0],
      [34, -1],
      [Infinity, -4],
    ],
  },
}

/* Yahoo's team codes where ESPN spells them differently. */
const TEAM_ALIAS = { WAS: 'WSH', JAC: 'JAX' }
const team = (code) => {
  const up = String(code ?? '').toUpperCase()
  return TEAM_ALIAS[up] ?? up
}

const SUFFIX = /\b(?:jr|sr|ii|iii|iv|v)\b/g
export function loose(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/-/g, ' ')
    .replace(SUFFIX, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const lastName = (name) => loose(name).split(' ').slice(-1)[0] ?? ''

const num = (value) => {
  const n = Number(String(value ?? '').split('/')[0].split('-')[0])
  return Number.isFinite(n) ? n : 0
}
const round = (n) => Math.round(n * 100) / 100

/* ---------------------------------------------------------------- ESPN */

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'waclhq-live-points' } })
      if (response.ok) return await response.json()
      if (response.status < 500) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      if (attempt === 2) throw new Error(`${url}: ${error.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
  }
  throw new Error(`${url}: gave up`)
}

function parseGames(scoreboard) {
  return (scoreboard.events ?? []).map((event) => {
    const competition = event.competitions?.[0] ?? {}
    const side = (homeAway) => competition.competitors?.find((c) => c.homeAway === homeAway) ?? {}
    const home = side('home')
    const away = side('away')
    const status = competition.status ?? event.status ?? {}
    return {
      id: String(event.id),
      kickoff: event.date,
      state: status.type?.state ?? 'pre', // pre | in | post
      detail: status.type?.shortDetail ?? '',
      home: team(home.team?.abbreviation),
      away: team(away.team?.abbreviation),
      homeScore: num(home.score),
      awayScore: num(away.score),
    }
  })
}

/* Rows of one box-score category as { name, team, id, stat(key) }. */
function categoryRows(summary, categoryName) {
  const rows = []
  for (const side of summary.boxscore?.players ?? []) {
    const code = team(side.team?.abbreviation)
    for (const category of side.statistics ?? []) {
      if (category.name !== categoryName) continue
      const keys = category.keys ?? []
      const labels = category.labels ?? []
      for (const entry of category.athletes ?? []) {
        const stats = entry.stats ?? []
        const stat = (key, label) => {
          let index = keys.indexOf(key)
          if (index < 0 && label) index = labels.indexOf(label)
          return index < 0 ? 0 : num(stats[index])
        }
        rows.push({ name: entry.athlete?.displayName ?? '', id: String(entry.athlete?.id ?? ''), team: code, stat })
      }
    }
  }
  return rows
}

/* Every player's raw line in one game, keyed by ESPN athlete id. */
function playerLines(summary) {
  const lines = new Map()
  const line = (row) => {
    if (!lines.has(row.id)) {
      lines.set(row.id, {
        name: row.name, team: row.team,
        passYds: 0, passTD: 0, int: 0, comp: 0, att: 0,
        rushYds: 0, rushTD: 0, car: 0,
        rec: 0, recYds: 0, recTD: 0,
        retTD: 0, fumLost: 0,
      })
    }
    return lines.get(row.id)
  }
  for (const row of categoryRows(summary, 'passing')) {
    const l = line(row)
    l.passYds += row.stat('passingYards', 'YDS')
    l.passTD += row.stat('passingTouchdowns', 'TD')
    l.int += row.stat('interceptions', 'INT')
    l.comp += row.stat('completions/passingAttempts', 'C/ATT')
  }
  for (const row of categoryRows(summary, 'rushing')) {
    const l = line(row)
    l.car += row.stat('rushingAttempts', 'CAR')
    l.rushYds += row.stat('rushingYards', 'YDS')
    l.rushTD += row.stat('rushingTouchdowns', 'TD')
  }
  for (const row of categoryRows(summary, 'receiving')) {
    const l = line(row)
    l.rec += row.stat('receptions', 'REC')
    l.recYds += row.stat('receivingYards', 'YDS')
    l.recTD += row.stat('receivingTouchdowns', 'TD')
  }
  for (const row of categoryRows(summary, 'fumbles')) {
    line(row).fumLost += row.stat('fumblesLost', 'LOST')
  }
  for (const [name, key] of [['kickReturns', 'kickReturnTouchdowns'], ['puntReturns', 'puntReturnTouchdowns']]) {
    for (const row of categoryRows(summary, name)) line(row).retTD += row.stat(key, 'TD')
  }
  return lines
}

/* What each defense did in one game: sacks, takeaways, TDs, safeties. */
function defenseLines(summary, game) {
  const out = new Map()
  const blank = () => ({ sacks: 0, int: 0, fumRec: 0, td: 0, safety: 0, allowed: 0 })
  out.set(game.home, { ...blank(), allowed: game.awayScore })
  out.set(game.away, { ...blank(), allowed: game.homeScore })
  for (const row of categoryRows(summary, 'defensive')) {
    const d = out.get(row.team)
    if (!d) continue
    d.sacks += row.stat('sacks', 'SACKS')
    d.td += row.stat('defensiveTouchdowns', 'TD')
  }
  for (const row of categoryRows(summary, 'interceptions')) {
    const d = out.get(row.team)
    if (!d) continue
    d.int += row.stat('interceptions', 'INT')
    d.td += row.stat('interceptionTouchdowns', 'TD')
  }
  for (const [name, key] of [['kickReturns', 'kickReturnTouchdowns'], ['puntReturns', 'puntReturnTouchdowns']]) {
    for (const row of categoryRows(summary, name)) {
      const d = out.get(row.team)
      if (d) d.td += row.stat(key, 'TD')
    }
  }
  // Fumble recoveries are the other side's fumbles lost; safeties come from
  // the scoring plays, credited to the team that scored them.
  for (const side of summary.boxscore?.teams ?? []) {
    const code = team(side.team?.abbreviation)
    const other = code === game.home ? game.away : game.home
    const lost = (side.statistics ?? []).find((s) => s.name === 'fumblesLost')
    if (lost && out.has(other)) out.get(other).fumRec += num(lost.displayValue)
  }
  for (const play of summary.scoringPlays ?? []) {
    const kind = String(play.type?.text ?? '').toLowerCase()
    const code = team(play.team?.abbreviation)
    if (kind.includes('safety') && out.has(code)) out.get(code).safety += 1
    if (/fumble return|fumble recovery|blocked/.test(kind) && out.has(code)) {
      // Fumble-return and blocked-kick TDs are not always in a stat category.
      const counted = categoryRows(summary, 'defensive').some((r) => r.team === code && r.stat('defensiveTouchdowns', 'TD') > 0)
      if (!counted && kind.includes('touchdown')) out.get(code).td += 1
    }
  }
  return out
}

export function scorePlayer(l, rules = RULES) {
  return round(
    l.passYds * rules.passYards + l.passTD * rules.passTD + l.int * rules.interception +
      l.rushYds * rules.rushYards + l.rushTD * rules.rushTD +
      l.rec * rules.reception + l.recYds * rules.recYards + l.recTD * rules.recTD +
      l.retTD * rules.returnTD + l.fumLost * rules.fumbleLost,
  )
}

export function scoreDefense(d, rules = RULES) {
  const tier = rules.def.pointsAllowed.find(([upTo]) => d.allowed <= upTo)
  return round(
    d.sacks * rules.def.sack + d.int * rules.def.interception + d.fumRec * rules.def.fumbleRecovery +
      d.td * rules.def.touchdown + d.safety * rules.def.safety + (tier ? tier[1] : 0),
  )
}

function statLine(l) {
  const parts = []
  if (l.passYds || l.passTD || l.int) parts.push(`${l.passYds} pass yds${l.passTD ? `, ${l.passTD} TD` : ''}${l.int ? `, ${l.int} INT` : ''}`)
  if (l.car || l.rushYds) parts.push(`${l.car}-${l.rushYds} rush${l.rushTD ? `, ${l.rushTD} TD` : ''}`)
  if (l.rec || l.recYds) parts.push(`${l.rec}-${l.recYds} rec${l.recTD ? `, ${l.recTD} TD` : ''}`)
  if (l.retTD) parts.push(`${l.retTD} return TD`)
  if (l.fumLost) parts.push(`${l.fumLost} fumble lost`)
  return parts.join(' · ')
}

function defenseStatLine(d) {
  const parts = [`${d.allowed} allowed`]
  if (d.sacks) parts.push(`${d.sacks} sack${d.sacks === 1 ? '' : 's'}`)
  if (d.int) parts.push(`${d.int} INT`)
  if (d.fumRec) parts.push(`${d.fumRec} FR`)
  if (d.td) parts.push(`${d.td} TD`)
  if (d.safety) parts.push(`${d.safety} safety`)
  return parts.join(' · ')
}

/* -------------------------------------------------------------- scoring */

export function scoreWeek({ scoreboard, summaries, lineups, rules = RULES, now = new Date() }) {
  const games = parseGames(scoreboard)
  const gameByTeam = new Map()
  for (const game of games) {
    gameByTeam.set(game.home, game)
    gameByTeam.set(game.away, game)
  }

  // Index every player who appears in a fetched box score.
  const byNameTeam = new Map()
  const byLastTeam = new Map()
  const defenses = new Map()
  for (const game of games) {
    const summary = summaries[game.id]
    if (!summary) continue
    for (const l of playerLines(summary).values()) {
      byNameTeam.set(`${loose(l.name)}|${l.team}`, l)
      const key = `${lastName(l.name)}|${l.team}`
      byLastTeam.set(key, byLastTeam.has(key) ? null : l) // null marks ambiguous
    }
    for (const [code, d] of defenseLines(summary, game)) defenses.set(code, d)
  }

  const unmatched = []
  const scorePlayerRow = (p) => {
    const nfl = team(p.nfl)
    const game = gameByTeam.get(nfl)
    const state = !game ? 'bye' : game.state === 'in' ? 'live' : game.state === 'post' ? 'final' : 'pre'
    const base = { slot: p.slot, name: p.name, pos: p.pos, nfl, state, pts: 0, line: '' }
    if (p.status) base.status = p.status
    if (game) {
      base.opp = game.home === nfl ? `v ${game.away}` : `@ ${game.home}`
      if (state === 'pre') base.kickoff = game.kickoff
      if (state === 'live') base.clock = game.detail
    }
    if (state === 'bye' || state === 'pre') return base
    if (p.pos === 'DEF') {
      const d = defenses.get(nfl)
      if (d) {
        base.pts = scoreDefense(d, rules)
        base.line = defenseStatLine(d)
      }
      return base
    }
    const l = byNameTeam.get(`${loose(p.name)}|${nfl}`) ?? byLastTeam.get(`${lastName(p.name)}|${nfl}`)
    if (l) {
      base.pts = scorePlayer(l, rules)
      base.line = statLine(l)
    } else if (state === 'final') {
      base.line = 'no stats'
    }
    if (!l && summaries[game.id]) unmatched.push(`${p.name} (${nfl})`)
    return base
  }

  const teams = lineups.teams.map((t) => {
    const players = t.players.map(scorePlayerRow)
    const starters = players.filter((p) => p.slot !== 'BN' && p.slot !== 'IR')
    const bench = players.filter((p) => p.slot === 'BN' || p.slot === 'IR')
    const total = round(starters.reduce((sum, p) => sum + p.pts, 0))
    const benchTotal = round(bench.reduce((sum, p) => sum + p.pts, 0))
    const count = (state) => starters.filter((p) => p.state === state).length
    return {
      team: t.team,
      manager: t.manager ?? null,
      total,
      benchTotal,
      live: count('live'),
      toPlay: count('pre'),
      done: count('final') + count('bye'),
      starters,
      bench,
    }
  })
  teams.sort((a, b) => b.total - a.total)

  // Scoring plays that involve someone on a roster, newest first.
  const rostered = []
  for (const t of lineups.teams) {
    for (const p of t.players) rostered.push({ ...p, nfl: team(p.nfl), team: t.team, manager: t.manager })
  }
  const events = []
  for (const game of games) {
    const summary = summaries[game.id]
    if (!summary) continue
    for (const play of summary.scoringPlays ?? []) {
      const kind = String(play.type?.text ?? '')
      if (!/touchdown|safety/i.test(kind)) continue
      const text = String(play.text ?? '')
      const hay = ` ${loose(text)} `
      const code = team(play.team?.abbreviation)
      const who = rostered.filter((p) => {
        if (p.pos === 'DEF') return p.nfl === code && /return|interception|fumble|safety|blocked/i.test(kind)
        return (p.nfl === game.home || p.nfl === game.away) && hay.includes(` ${loose(p.name)} `)
      })
      if (!who.length) continue
      const clock = String(play.clock?.displayValue ?? '')
      const [mm, ss] = clock.split(':').map(Number)
      const order = new Date(game.kickoff).getTime() + (Number(play.period?.number ?? 0) * 1000 + (900 - ((mm || 0) * 60 + (ss || 0)))) * 1000
      events.push({
        id: String(play.id ?? `${game.id}-${order}`),
        order,
        kind,
        text,
        when: `Q${play.period?.number ?? '?'} ${clock}`.trim(),
        game: `${game.away} @ ${game.home}`,
        who: who.map((p) => ({ team: p.team, manager: p.manager, player: p.name, starter: p.slot !== 'BN' && p.slot !== 'IR' })),
      })
    }
  }
  events.sort((a, b) => b.order - a.order)

  return {
    board: {
      source: 'ESPN box scores',
      scoring: 'Yahoo default half-PPR (estimate)',
      season: scoreboard.season?.year ?? null,
      week: scoreboard.week?.number ?? null,
      updatedAt: now.toISOString(),
      lineupsAsOf: lineups.asOf ?? null,
      games: games.map(({ id, kickoff, state, detail, home, away, homeScore, awayScore }) => ({
        id, kickoff, state, detail, home, away, homeScore, awayScore,
      })),
      teams,
      events: events.slice(0, 30).map(({ order, ...rest }) => rest),
    },
    noLine: [...new Set(unmatched)],
  }
}

/* ----------------------------------------------------------------- run */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const out = arg('out') ?? 'points.json'
  const week = arg('week')
  const horizon = Number(arg('horizon') ?? 300)
  const lineups = JSON.parse(await readFile(join(ROOT, 'scripts', 'data', 'lineups.json'), 'utf8'))

  let scoreboard
  const summaries = {}
  const fixture = arg('fixture')
  if (fixture) {
    const data = JSON.parse(await readFile(fixture, 'utf8'))
    scoreboard = data.scoreboard
    Object.assign(summaries, data.summaries)
  } else {
    const query = week ? `?seasontype=2&week=${week}` : ''
    scoreboard = await getJSON(`${ESPN}/scoreboard${query}`)
    const started = parseGames(scoreboard).filter((g) => g.state !== 'pre')
    for (const game of started) {
      try {
        summaries[game.id] = await getJSON(`${ESPN}/summary?event=${game.id}`)
      } catch (error) {
        console.error(`summary ${game.id}: ${error.message}`)
      }
    }
  }

  const { board, noLine } = scoreWeek({ scoreboard, summaries, lineups })
  await writeFile(out, JSON.stringify(board))

  const now = Date.now()
  const live = board.games.filter((g) => g.state === 'in').length
  const final = board.games.filter((g) => g.state === 'post').length
  const upcoming = board.games
    .filter((g) => g.state === 'pre')
    .map((g) => new Date(g.kickoff).getTime() - now)
    .filter((ms) => ms > -3 * 3600_000)
    .sort((a, b) => a - b)
  const soonest = upcoming[0]
  let nextPollSeconds = 0
  let done = false
  if (week || fixture) done = true
  else if (live > 0) nextPollSeconds = 90
  else if (soonest !== undefined && soonest <= 30 * 60_000) nextPollSeconds = 120
  else if (soonest !== undefined && soonest <= horizon * 60_000) nextPollSeconds = Math.max(120, Math.round((soonest - 15 * 60_000) / 1000))
  else done = true

  console.log(JSON.stringify({ done, nextPollSeconds, live, final, pre: upcoming.length, week: board.week, noLine }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack ?? error.message)
    process.exit(1)
  })
}
