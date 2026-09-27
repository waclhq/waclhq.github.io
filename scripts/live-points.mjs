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
 * --previous the last published points.json, to carry the day's history
 * --debug-plays  print sample raw plays and the parsed big plays to stderr
 *
 * Prints one JSON line to stdout for the workflow: { done, nextPollSeconds,
 * live, final, pre, noLine } — noLine lists rostered players in a started game
 * with no box-score line: fine mid-game, a name mismatch if the game is over.
 * Lineups and matchups come from scripts/data/.
 * Writes nothing else; publishing is the workflow's job.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

/*
 * The league's scoring, from its Yahoo settings (League > Settings, 27 Sep
 * 2026). Half-PPR with 5-point passing TDs, -2 interceptions, one-time
 * yardage bonuses, and a richer points-allowed ladder than Yahoo's default.
 * No kickers (the league has no K slot). Not modelled because ESPN's box
 * score does not carry them: blocked kicks, returned extra points, and
 * offensive fumble-return TDs. All are rare.
 */
export const RULES = {
  passYards: 1 / 25,
  passTD: 5,
  interception: -2,
  rushYards: 1 / 10,
  rushTD: 6,
  reception: 0.5,
  recYards: 1 / 10,
  recTD: 6,
  returnTD: 6,
  fumbleLost: -2,
  // Credited from the scoring plays: the player who ran or caught it, and the passer.
  twoPoint: 2,
  passTwoPoint: 2,
  // One-time yardage bonuses: { stat, at, pts }, stat one of passYds, rushYds, recYds.
  bonuses: [
    { stat: 'passYds', at: 300, pts: 2 },
    { stat: 'rushYds', at: 100, pts: 3 },
    { stat: 'recYds', at: 100, pts: 2 },
  ],
  def: {
    sack: 1,
    interception: 2,
    fumbleRecovery: 2,
    touchdown: 6,
    safety: 2,
    // [upper bound of points allowed, fantasy points]
    pointsAllowed: [
      [0, 12],
      [6, 8],
      [13, 5],
      [20, 2],
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
    const state = status.type?.state ?? 'pre' // pre | in | post
    const period = Number(status.period ?? 0)
    const [mm, ss] = String(status.displayClock ?? '15:00').split(':').map(Number)
    const left = (mm || 0) * 60 + (ss || 0)
    // Share of regulation played: 0 before kickoff, 1 once it is over.
    const elapsed = state === 'post' ? 1 : state === 'pre' ? 0 : Math.min(1, Math.max(0, ((Math.min(period, 4) - 1) * 900 + (900 - left)) / 3600))
    const situation = competition.situation ?? {}
    const byId = (id) => [home, away].find((c) => String(c.team?.id ?? c.id) === String(id))
    const possession = situation.possession ? team(byId(situation.possession)?.team?.abbreviation) : null
    return {
      id: String(event.id),
      kickoff: event.date,
      state,
      detail: status.type?.shortDetail ?? '',
      period,
      elapsed: Math.round(elapsed * 1000) / 1000,
      home: team(home.team?.abbreviation),
      away: team(away.team?.abbreviation),
      homeScore: num(home.score),
      awayScore: num(away.score),
      possession: state === 'in' ? possession : null,
      redZone: state === 'in' && Boolean(situation.isRedZone),
      down: state === 'in' ? situation.downDistanceText ?? situation.shortDownDistanceText ?? null : null,
      lastPlay: state === 'in' ? situation.lastPlay?.text ?? null : null,
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
        const raw = (key, label) => {
          let index = keys.indexOf(key)
          if (index < 0 && label) index = labels.indexOf(label)
          return index < 0 ? '' : String(stats[index] ?? '')
        }
        rows.push({ name: entry.athlete?.displayName ?? '', id: String(entry.athlete?.id ?? ''), team: code, stat, raw })
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
        retTD: 0, fumLost: 0, twoPt: 0, passTwoPt: 0,
        tgt: 0, longRush: 0, longRec: 0, sacked: 0,
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
    l.att += Number(row.raw('completions/passingAttempts', 'C/ATT').split('/')[1] ?? 0) || 0
    l.sacked += row.stat('sacks-sackYardsLost', 'SACKS')
  }
  for (const row of categoryRows(summary, 'rushing')) {
    const l = line(row)
    l.car += row.stat('rushingAttempts', 'CAR')
    l.rushYds += row.stat('rushingYards', 'YDS')
    l.rushTD += row.stat('rushingTouchdowns', 'TD')
    l.longRush = Math.max(l.longRush, row.stat('longRushing', 'LONG'))
  }
  for (const row of categoryRows(summary, 'receiving')) {
    const l = line(row)
    l.rec += row.stat('receptions', 'REC')
    l.recYds += row.stat('receivingYards', 'YDS')
    l.recTD += row.stat('receivingTouchdowns', 'TD')
    l.tgt += row.stat('receivingTargets', 'TGTS')
    l.longRec = Math.max(l.longRec, row.stat('longReception', 'LONG'))
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
  const bonus = (rules.bonuses ?? []).reduce((sum, b) => sum + ((l[b.stat] ?? 0) >= b.at ? b.pts : 0), 0)
  return round(
    l.passYds * rules.passYards + l.passTD * rules.passTD + l.int * rules.interception +
      l.rushYds * rules.rushYards + l.rushTD * rules.rushTD +
      l.rec * rules.reception + l.recYds * rules.recYards + l.recTD * rules.recTD +
      l.retTD * rules.returnTD + l.fumLost * rules.fumbleLost +
      (l.twoPt ?? 0) * (rules.twoPoint ?? 0) + (l.passTwoPt ?? 0) * (rules.passTwoPoint ?? 0) +
      bonus,
  )
}

/*
 * Two-point conversions live only in the scoring-play text, e.g.
 * "(Michael Penix Jr. Pass to Chris Blair for Two-Point Conversion)" or
 * "(Bijan Robinson Run for Two-Point Conversion)". Failed tries say so.
 */
function twoPointConversions(summary) {
  const out = []
  for (const play of summary.scoringPlays ?? []) {
    const text = String(play.text ?? '')
    const m = text.match(/\(([^()]*?)\s+for\s+Two-Point Conversion\)/i)
    if (!m || /fail|no good|aborted/i.test(m[1])) continue
    const code = team(play.team?.abbreviation)
    const pass = m[1].match(/^(.*?)\s+Pass\s+to\s+(.*)$/i)
    if (pass) out.push({ team: code, scorer: pass[2].trim(), passer: pass[1].trim() })
    else {
      const run = m[1].match(/^(.*?)\s+(?:Run|Rush)$/i)
      if (run) out.push({ team: code, scorer: run[1].trim(), passer: null })
    }
  }
  return out
}

export function scoreDefense(d, rules = RULES) {
  const tier = rules.def.pointsAllowed.find(([upTo]) => d.allowed <= upTo)
  return round(
    d.sacks * rules.def.sack + d.int * rules.def.interception + d.fumRec * rules.def.fumbleRecovery +
      d.td * rules.def.touchdown + d.safety * rules.def.safety + (tier ? tier[1] : 0),
  )
}

/* How a score was built, line by line, for the player card. Sums to the score. */
export function breakdownPlayer(l, rules = RULES) {
  const rows = []
  const add = (label, pts) => {
    if (Math.abs(pts) >= 0.005) rows.push([label, round(pts)])
  }
  add(`Passing yards (${l.passYds})`, l.passYds * rules.passYards)
  add(`Passing TDs (${l.passTD})`, l.passTD * rules.passTD)
  add(`Interceptions (${l.int})`, l.int * rules.interception)
  add(`Rushing yards (${l.rushYds})`, l.rushYds * rules.rushYards)
  add(`Rushing TDs (${l.rushTD})`, l.rushTD * rules.rushTD)
  add(`Receptions (${l.rec})`, l.rec * rules.reception)
  add(`Receiving yards (${l.recYds})`, l.recYds * rules.recYards)
  add(`Receiving TDs (${l.recTD})`, l.recTD * rules.recTD)
  add(`Return TDs (${l.retTD})`, l.retTD * rules.returnTD)
  add(`Fumbles lost (${l.fumLost})`, l.fumLost * rules.fumbleLost)
  add(`Two-point conversions (${(l.twoPt ?? 0) + (l.passTwoPt ?? 0)})`, (l.twoPt ?? 0) * (rules.twoPoint ?? 0) + (l.passTwoPt ?? 0) * (rules.passTwoPoint ?? 0))
  const name = { passYds: 'passing', rushYds: 'rushing', recYds: 'receiving' }
  for (const b of rules.bonuses ?? []) if ((l[b.stat] ?? 0) >= b.at) add(`${b.at}-yard ${name[b.stat]} bonus`, b.pts)
  return rows
}

export function breakdownDefense(d, rules = RULES) {
  const rows = []
  const add = (label, pts) => {
    if (Math.abs(pts) >= 0.005) rows.push([label, round(pts)])
  }
  const tier = rules.def.pointsAllowed.find(([upTo]) => d.allowed <= upTo)
  add(`Points allowed (${d.allowed})`, tier ? tier[1] : 0)
  add(`Sacks (${d.sacks})`, d.sacks * rules.def.sack)
  add(`Interceptions (${d.int})`, d.int * rules.def.interception)
  add(`Fumble recoveries (${d.fumRec})`, d.fumRec * rules.def.fumbleRecovery)
  add(`Touchdowns (${d.td})`, d.td * rules.def.touchdown)
  add(`Safeties (${d.safety})`, d.safety * rules.def.safety)
  if (!rows.length) rows.push([`Points allowed (${d.allowed})`, 0])
  return rows
}

function statLine(l) {
  const parts = []
  if (l.passYds || l.passTD || l.int) parts.push(`${l.passYds} pass yds${l.passTD ? `, ${l.passTD} TD` : ''}${l.int ? `, ${l.int} INT` : ''}`)
  if (l.car || l.rushYds) parts.push(`${l.car}-${l.rushYds} rush${l.rushTD ? `, ${l.rushTD} TD` : ''}`)
  if (l.rec || l.recYds) parts.push(`${l.rec}-${l.recYds} rec${l.recTD ? `, ${l.recTD} TD` : ''}`)
  if (l.retTD) parts.push(`${l.retTD} return TD`)
  if (l.fumLost) parts.push(`${l.fumLost} fumble lost`)
  if (l.twoPt || l.passTwoPt) parts.push(`${(l.twoPt ?? 0) + (l.passTwoPt ?? 0)} two-pt`)
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

/* ------------------------------------------------------- projections */

/*
 * Each player's expected full-game points before kickoff. Last season's
 * standard points per game from nflverse (public/data/player-points.json),
 * nudged toward this league's scoring (half-PPR, 5-point passing TDs) and
 * blended with a positional baseline, so a rookie or a quiet year still gets
 * a sensible number. The matchup code then scales a team's sum to Yahoo's own
 * projection, so these only need to be right relative to one another.
 */
const POSITION_BASE = { QB: 17, RB: 10.5, WR: 10, TE: 7, DEF: 7 }
const POSITION_SPREAD = { QB: 7, RB: 7, WR: 7, TE: 5, DEF: 5 }
const LEAGUE_NUDGE = { QB: 1.08, RB: 1.12, WR: 1.18, TE: 1.18, DEF: 1 }
const OUT = /^(O|IR|IR-R|PUP-R|CEL|NA|SUSP)$/i

const compact = (name) => loose(name).replace(/ /g, '')

export function baseline(player, lastSeason) {
  const base = POSITION_BASE[player.pos] ?? 8
  if (player.pos === 'DEF') return base
  const hit = lastSeason?.[compact(player.name)]
  if (!hit) return base * 0.8
  const ppg = (hit[0] / 16) * (LEAGUE_NUDGE[player.pos] ?? 1.1)
  return Math.min(base * 2.2, Math.max(base * 0.5, 0.65 * ppg + 0.35 * base))
}

/* Standard normal CDF, for win probability from a projected margin. */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

/* ---------------------------------------------------------- big plays */

/*
 * The plays worth shouting about, from each game's drive log: touchdowns,
 * gains of 20 yards or more, turnovers and sacks, kept when they touch a
 * rostered player or a rostered defense. ESPN's play text names players
 * either in full ("Josh Allen pass to Khalil Shakir") or gamebook style
 * ("J.Allen pass to K.Shakir"); both are matched, and only against players
 * whose NFL team was in that game. Each touched player gets an estimated
 * fantasy swing for that one play.
 */
function nameMatcher(player) {
  const parts = String(player.name).replace(/\b(Jr|Sr|II|III|IV|V)\.?$/i, '').trim().split(/\s+/)
  const first = parts[0] ?? ''
  const last = parts.slice(1).join(' ')
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const full = new RegExp(`\\b${esc(first)}\\s+${esc(last)}\\b`, 'i')
  const short = last ? new RegExp(`\\b${esc(first[0] ?? '')}[a-z']{0,2}\\.\\s?${esc(last)}\\b`, 'i') : null
  return (text) => {
    const a = text.search(full)
    if (a >= 0) return a
    return short ? text.search(short) : -1
  }
}

function playKind(play) {
  const type = String(play.type?.text ?? '')
  const text = String(play.text ?? '')
  const yards = Number(play.statYardage ?? 0)
  if (/touchdown/i.test(type) || (play.scoringPlay && /touchdown/i.test(text))) return 'td'
  if (/interception|fumble recovery \(opponent\)|fumble return/i.test(type) || /INTERCEPTED|FUMBLES.*RECOVERED by/i.test(text)) return 'turnover'
  if (/sack/i.test(type)) return 'sack'
  if (/safety/i.test(type)) return 'safety'
  if (yards >= 20 && /pass|rush|run/i.test(type + ' ' + text) && !/no play|penalty/i.test(text)) return 'boom'
  return null
}

export function bigPlays(summary, game, rostered, rules = RULES) {
  const out = []
  const drives = [...(summary.drives?.previous ?? []), ...(summary.drives?.current ? [summary.drives.current] : [])]
  const inGame = rostered.filter((p) => p.nfl === game.home || p.nfl === game.away)
  const matchers = new Map(inGame.map((p) => [p, nameMatcher(p)]))
  const seen = new Set()
  for (const drive of drives) {
    const offense = team(drive.team?.abbreviation)
    const defense = offense === game.home ? game.away : game.home
    for (const play of drive.plays ?? []) {
      const kind = playKind(play)
      if (!kind) continue
      const id = String(play.id ?? `${game.id}-${play.sequenceNumber ?? out.length}`)
      if (seen.has(id)) continue
      seen.add(id)
      const text = String(play.text ?? '')
      const type = String(play.type?.text ?? '')
      const yards = Number(play.statYardage ?? 0)
      const isPass = /pass/i.test(type) || /\bpass\b/i.test(text)
      const defenseScored = kind === 'td' && /interception|fumble|return|blocked/i.test(type) && !/kickoff|punt/i.test(type)
      // Offensive players named in the text, in the order they appear.
      const named = inGame
        .filter((p) => p.pos !== 'DEF' && p.nfl === offense)
        .map((p) => ({ p, at: matchers.get(p)(text) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => a.at - b.at)
      const hits = []
      const hit = (p, pts) => hits.push({ team: p.team, manager: p.manager, player: p.name, starter: p.slot !== 'BN' && p.slot !== 'IR', pts: round(pts) })
      if (kind === 'td' || kind === 'boom') {
        if (defenseScored) {
          for (const p of inGame) if (p.pos === 'DEF' && p.nfl === defense) hit(p, rules.def.touchdown + (/interception/i.test(type) ? rules.def.interception : rules.def.fumbleRecovery))
        } else if (/kickoff|punt/i.test(type)) {
          for (const p of inGame) if (p.pos === 'DEF' && p.nfl === offense) hit(p, rules.def.touchdown)
          if (named[0]) hit(named[0].p, rules.returnTD)
        } else if (isPass && named.length) {
          const td = kind === 'td'
          hit(named[0].p, yards * rules.passYards + (td ? rules.passTD : 0))
          if (named[1]) hit(named[1].p, rules.reception + yards * rules.recYards + (td ? rules.recTD : 0))
        } else if (named.length) {
          hit(named[0].p, yards * rules.rushYards + (kind === 'td' ? rules.rushTD : 0))
        }
      } else if (kind === 'turnover') {
        const pick = /interception|INTERCEPTED/i.test(type + ' ' + text)
        if (named[0]) hit(named[0].p, pick ? rules.interception : rules.fumbleLost)
        for (const p of inGame) if (p.pos === 'DEF' && p.nfl === defense) hit(p, pick ? rules.def.interception : rules.def.fumbleRecovery)
      } else if (kind === 'sack' || kind === 'safety') {
        for (const p of inGame) if (p.pos === 'DEF' && p.nfl === defense) hit(p, kind === 'sack' ? rules.def.sack : rules.def.safety)
      }
      if (!hits.length) continue
      const clock = String(play.clock?.displayValue ?? '')
      const [mm, ss] = clock.split(':').map(Number)
      const period = Number(play.period?.number ?? 0)
      out.push({
        id,
        kind,
        text,
        yards,
        when: `Q${period || '?'} ${clock}`.trim(),
        game: `${game.away} @ ${game.home}`,
        order: new Date(game.kickoff).getTime() + (period * 1000 + (900 - ((mm || 0) * 60 + (ss || 0)))) * 1000,
        hits,
      })
    }
  }
  return out
}

/* -------------------------------------------------------------- scoring */

export function scoreWeek({ scoreboard, summaries, lineups, rules = RULES, now = new Date(), matchups = null, lastSeason = null, previous = null }) {
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
    const lines = playerLines(summary)
    const credit = (name, code, field) => {
      for (const l of lines.values()) if (l.team === code && loose(l.name) === loose(name)) l[field] += 1
    }
    for (const c of twoPointConversions(summary)) {
      credit(c.scorer, c.team, 'twoPt')
      if (c.passer) credit(c.passer, c.team, 'passTwoPt')
    }
    for (const l of lines.values()) {
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
    // Expected full-game points and the share of the game still to play.
    const prior = p.status && OUT.test(p.status) && state !== 'final' && state !== 'live' ? 0 : baseline(p, lastSeason)
    base.left = state === 'pre' ? 1 : state === 'live' ? round(1 - (game?.elapsed ?? 0)) : 0
    base.prior = round(prior)
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
        base.stats = { allowed: d.allowed, sacks: d.sacks, int: d.int, fumRec: d.fumRec, td: d.td, safety: d.safety }
        base.breakdown = breakdownDefense(d, rules)
      }
      return base
    }
    const l = byNameTeam.get(`${loose(p.name)}|${nfl}`) ?? byLastTeam.get(`${lastName(p.name)}|${nfl}`)
    if (l) {
      base.pts = scorePlayer(l, rules)
      base.line = statLine(l)
      base.yds = { passYds: l.passYds, rushYds: l.rushYds, recYds: l.recYds }
      const { name: _name, team: _team, ...stats } = l
      base.stats = Object.fromEntries(Object.entries(stats).filter(([, v]) => v))
      base.breakdown = breakdownPlayer(l, rules)
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

  /*
   * Projections: a starter still to play is worth his prior scaled by how
   * much of his game is left. Each team's scale is set so that, at the moment
   * Yahoo's matchups page was read, the team's projection equals Yahoo's own
   * (yahooProj); after that it moves with the real points.
   */
  const byTeam = new Map(teams.map((t) => [t.team, t]))
  const pairs = (matchups?.matchups ?? []).filter((pair) => pair.length === 2 && pair.every((side) => byTeam.has(side.team)))
  const calibration = new Map()
  for (const pair of pairs) {
    for (const side of pair) {
      const t = byTeam.get(side.team)
      if (typeof side.yahooProj !== 'number') continue
      // At snapshot time, starters whose games were not over still owed yahooProj - yahooPts.
      const owed = side.yahooProj - (side.yahooPts ?? 0)
      const unplayedAtSnapshot = t.starters.filter((p) => p.state !== 'final' || !matchups.asOf || new Date(matchups.asOf) < new Date(gameByTeam.get(p.nfl)?.kickoff ?? 0))
      const priorSum = unplayedAtSnapshot.reduce((sum, p) => sum + p.prior, 0)
      if (priorSum > 0 && owed > 0) calibration.set(side.team, owed / priorSum)
    }
  }
  for (const t of teams) {
    const scale = calibration.get(t.team) ?? 1
    let variance = 0
    for (const p of [...t.starters, ...t.bench]) {
      p.proj = round(p.pts + p.prior * scale * p.left)
    }
    for (const p of t.starters) variance += (POSITION_SPREAD[p.pos] ?? 6) ** 2 * p.left
    t.proj = round(t.starters.reduce((sum, p) => sum + p.proj, 0))
    t.spread = Math.sqrt(variance)
  }

  const matchupRows = pairs.map((pair) => {
    const [a, b] = pair.map((side) => byTeam.get(side.team))
    const sd = Math.sqrt(a.spread ** 2 + b.spread ** 2)
    const margin = a.proj - b.proj
    const settled = a.live + a.toPlay + b.live + b.toPlay === 0
    const winA = settled ? (a.total === b.total ? 0.5 : a.total > b.total ? 1 : 0) : phi(margin / Math.max(sd, 1))
    return {
      teams: pair.map((side, i) => ({
        team: side.team,
        manager: [a, b][i].manager,
        record: side.record ?? null,
        rank: side.rank ?? null,
        total: [a, b][i].total,
        proj: [a, b][i].proj,
        winProb: round(i === 0 ? winA : 1 - winA),
        live: [a, b][i].live,
        toPlay: [a, b][i].toPlay,
      })),
      settled,
    }
  })
  for (const t of teams) delete t.spread

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

  const plays = []
  for (const game of games) {
    const summary = summaries[game.id]
    if (summary) plays.push(...bigPlays(summary, game, rostered, rules))
  }
  plays.sort((a, b) => b.order - a.order)

  // Bonuses reached, and live players closing in on one.
  const milestones = []
  const chases = []
  const label = { passYds: 'passing', rushYds: 'rushing', recYds: 'receiving' }
  for (const t of teams) {
    for (const p of [...t.starters, ...t.bench]) {
      if (!p.yds) continue
      for (const b of rules.bonuses ?? []) {
        const have = p.yds[b.stat] ?? 0
        const who = { team: t.team, manager: t.manager, player: p.name, starter: p.slot !== 'BN' && p.slot !== 'IR' }
        if (have >= b.at) milestones.push({ ...who, stat: b.stat, label: `${b.at} ${label[b.stat]} yards`, have, pts: b.pts })
        else if (p.state === 'live' && have >= b.at * 0.6) chases.push({ ...who, stat: b.stat, label: `${b.at} ${label[b.stat]} yards`, have, at: b.at, pts: b.pts, clock: p.clock ?? '' })
      }
    }
  }
  chases.sort((a, b) => b.have / b.at - a.have / a.at)

  // The day so far: a sample of every team's total and projection, appended
  // to the previous file's history while the week is the same.
  // w: the first team's win probability in each matchup, in matchups order.
  const order = lineups.teams.map((t) => t.team)
  const pairing = matchupRows.map((m) => m.teams.map((side) => side.team).join(' v '))
  const sample = {
    t: now.toISOString(),
    v: order.map((name) => byTeam.get(name)?.total ?? 0),
    p: order.map((name) => byTeam.get(name)?.proj ?? 0),
    w: matchupRows.map((m) => m.teams[0].winProb),
  }
  const sameShape = previous && previous.week === (scoreboard.week?.number ?? null) && Array.isArray(previous.history?.samples) &&
    String(previous.history?.teams) === String(order) && String(previous.history?.matchups ?? '') === String(pairing)
  let history = sameShape ? previous.history.samples.slice() : []
  const last = history[history.length - 1]
  const moved = !last || String(last.v) !== String(sample.v) || String(last.p) !== String(sample.p) || String(last.w ?? '') !== String(sample.w)
  const stale = !last || now.getTime() - new Date(last.t).getTime() > 10 * 60_000
  if (moved || stale) history.push(sample)
  if (history.length > 480) history = history.slice(-480)

  return {
    board: {
      source: 'ESPN box scores',
      scoring: 'League Yahoo scoring (27 Sep 2026 settings)',
      season: scoreboard.season?.year ?? null,
      week: scoreboard.week?.number ?? null,
      updatedAt: now.toISOString(),
      lineupsAsOf: lineups.asOf ?? null,
      games,
      teams,
      events: events.slice(0, 30).map(({ order, ...rest }) => rest),
      matchups: matchupRows,
      plays: plays.slice(0, 80).map(({ order, ...rest }) => rest),
      milestones,
      chases: chases.slice(0, 12),
      history: { teams: order, matchups: pairing, samples: history },
      scores: scoreChanges(previous, teams, now, scoreboard.week?.number ?? null),
    },
    noLine: [...new Set(unmatched)],
  }
}

/* -------------------------------------------------------- score changes */

const plural = (n, one, many = `${one}s`) => `${n} ${Math.abs(n) === 1 ? one : many}`

/**
 * What moved a player's box score between two passes, in a few words:
 * "1 catch, 12 yds", "rush TD", "2/3, 24 pass yds", "7 pts allowed". Stat
 * corrections come out negative, which is what they are.
 */
export function statDiff(before = {}, after = {}, pos = '') {
  const d = (key) => (after?.[key] ?? 0) - (before?.[key] ?? 0)
  const bits = []
  if (pos === 'DEF') {
    if (d('td') > 0) bits.push(d('td') > 1 ? `${d('td')} DEF TDs` : 'DEF TD')
    if (d('int') > 0) bits.push(d('int') > 1 ? `${d('int')} INTs` : 'INT')
    if (d('fumRec') > 0) bits.push(d('fumRec') > 1 ? `${d('fumRec')} fumble recs` : 'fumble rec')
    if (d('safety') > 0) bits.push('safety')
    if (d('sacks') > 0) bits.push(plural(d('sacks'), 'sack'))
    if (d('allowed')) bits.push(`${d('allowed') > 0 ? '' : '−'}${Math.abs(d('allowed'))} pts allowed`)
    return bits.join(', ')
  }
  for (const [key, label] of [['passTD', 'pass TD'], ['rushTD', 'rush TD'], ['recTD', 'rec TD']]) {
    const n = d(key)
    if (n > 0) bits.push(n > 1 ? `${n} ${label}s` : label)
  }
  if (d('int') > 0) bits.push(d('int') > 1 ? `${d('int')} INTs` : 'INT')
  if (d('fumLost') > 0) bits.push('fumble lost')
  // With no new attempt it's a stat correction: just the yards.
  if (d('att')) bits.push(`${d('comp')}/${d('att')}, ${d('passYds')} pass yds`)
  else if (d('passYds')) bits.push(`${d('passYds')} pass yds`)
  if (d('car')) bits.push(`${plural(d('car'), 'carry', 'carries')}, ${d('rushYds')} yds`)
  else if (d('rushYds')) bits.push(`${d('rushYds')} rush yds`)
  if (d('rec')) bits.push(`${plural(d('rec'), 'catch', 'catches')}, ${d('recYds')} yds`)
  else if (d('recYds')) bits.push(`${d('recYds')} rec yds`)
  return bits.join(', ')
}

/**
 * Every change in a player's points since the previous pass, newest first,
 * carried from the previous file through the week: the "latest scores" each
 * matchup shows. Two passes a minute apart give one entry per player who
 * moved, so a 12-yard catch shows up, not only the big plays.
 */
export function scoreChanges(previous, teams, now, week) {
  const carried = previous && previous.week === week && Array.isArray(previous.scores) ? previous.scores : []
  if (!previous || previous.week !== week || !Array.isArray(previous.teams)) return carried
  const before = new Map()
  for (const t of previous.teams) for (const p of [...(t.starters ?? []), ...(t.bench ?? [])]) before.set(`${t.team}|${p.name}`, p)
  const fresh = []
  for (const t of teams) {
    for (const p of [...t.starters, ...t.bench]) {
      const was = before.get(`${t.team}|${p.name}`)
      if (!was) continue
      const delta = round(p.pts - (was.pts ?? 0))
      if (Math.abs(delta) < 0.05) continue
      fresh.push({
        t: now.toISOString(),
        team: t.team,
        manager: t.manager,
        player: p.name,
        pos: p.pos,
        starter: p.slot !== 'BN' && p.slot !== 'IR',
        delta,
        pts: p.pts,
        what: statDiff(was.stats, p.stats, p.pos) || 'scoring update',
        clock: p.clock ?? (p.state === 'final' ? 'Final' : ''),
      })
    }
  }
  fresh.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return [...fresh, ...carried].slice(0, 150)
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
  const optional = async (path) => {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return null
    }
  }
  const matchups = await optional(join(ROOT, 'scripts', 'data', 'matchups.json'))
  const lastSeason = (await optional(join(ROOT, 'public', 'data', 'player-points.json')))?.['2025'] ?? null
  const previous = arg('previous') ? await optional(arg('previous')) : null

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

  const { board, noLine } = scoreWeek({
    scoreboard,
    summaries,
    lineups,
    matchups: matchups && (week ? Number(week) === matchups.week : matchups.week === scoreboard.week?.number) ? matchups : null,
    lastSeason,
    previous,
  })
  if (arg('debug-plays')) {
    for (const game of Object.keys(summaries).slice(0, 2)) {
      const drive = summaries[game].drives?.previous?.[1]
      for (const play of (drive?.plays ?? []).slice(0, 4)) console.error('PLAY', JSON.stringify({ type: play.type?.text, text: play.text, yards: play.statYardage }))
    }
    console.error('BIGPLAYS', board.plays.length, JSON.stringify(board.plays.slice(0, 5).map((p) => [p.kind, p.text.slice(0, 90), p.hits.map((h) => `${h.player} ${h.pts}`)])))
    console.error('MATCHUPS', JSON.stringify(board.matchups.map((m) => m.teams.map((t) => `${t.team} ${t.total}/${t.proj} ${Math.round(t.winProb * 100)}%`))))
    console.error('MILESTONES', JSON.stringify(board.milestones.slice(0, 6).map((m) => `${m.player} ${m.label}`)))
  }
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
  else if (live > 0) nextPollSeconds = 60
  else if (soonest !== undefined && soonest <= 30 * 60_000) nextPollSeconds = 120
  // Waiting for kickoff: wake at least every 15 minutes, so a scoring fix
  // pushed in the morning is published within a quarter hour, not at noon.
  else if (soonest !== undefined && soonest <= horizon * 60_000) nextPollSeconds = Math.min(900, Math.max(120, Math.round((soonest - 15 * 60_000) / 1000)))
  else done = true

  console.log(JSON.stringify({ done, nextPollSeconds, live, final, pre: upcoming.length, week: board.week, noLine }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.stack ?? error.message)
    process.exit(1)
  })
}
