/**
 * Pulls this week's matchups — live points, Yahoo's projection, win
 * probability — and writes scores.json. Runs every ten minutes while games
 * are on, from .github/workflows/yahoo-scores.yml, and lands on the orphan
 * `live` branch rather than main: eighty commits a Sunday would bury the
 * trades and rulings that make main's log the league's audit trail. The site
 * reads the branch straight from raw.githubusercontent, the way the Book
 * reads the bets repo.
 *
 * Required environment: the same four YAHOO_* variables as yahoo-sync.mjs.
 *
 *   node scripts/yahoo-scores.mjs --out scores.json
 *   node scripts/yahoo-scores.mjs --fixture scripts/fixtures/yahoo-scoreboard.json   (prints, writes nothing)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { accessToken, api, collection, flatten, loadMap, required, resolver } from './lib/yahoo.mjs'

/** Yahoo's own word for each state of a matchup. */
const STATUSES = new Set(['preevent', 'midevent', 'postevent'])

/**
 * When Yahoo leaves win_probability off, lean on the projections: a
 * twelve-point edge in projected total is about a three-to-one favourite,
 * which matches what their number tends to say. A finished game is settled
 * by the score.
 */
function impliedProbability(team, other, status) {
  if (status === 'postevent') {
    if (team.points === other.points) return 0.5
    return team.points > other.points ? 1 : 0
  }
  if (team.projected === null || other.projected === null) return null
  const edge = team.projected - other.projected
  return 1 / (1 + Math.exp(-edge / 12))
}

export function parseScoreboard(payload) {
  const league = payload?.fantasy_content?.league
  if (!league) throw new Error('Unexpected Yahoo payload: no league node')
  const meta = flatten(league[0] ?? {})
  const board = league[1]?.scoreboard
  if (!board) throw new Error('Unexpected Yahoo payload: no scoreboard node')

  const week = Number(board.week ?? meta.current_week) || null
  const matchups = []
  for (const entry of collection(board['0']?.matchups ?? board.matchups)) {
    const matchup = entry?.matchup
    if (!matchup) continue
    // Read the matchup's own scalars directly: flattening the whole node
    // would let stat_winners' winner_team_key overwrite the real one.
    const status = STATUSES.has(matchup.status) ? matchup.status : 'preevent'
    const teams = []
    for (const slot of collection(matchup['0']?.teams)) {
      const team = slot?.team
      if (!team) continue
      const info = flatten(team[0])
      const stats = team[1] ?? {}
      const projected = stats.team_projected_points?.total
      const probability = stats.win_probability
      teams.push({
        teamKey: info.team_key ?? null,
        teamName: info.name ?? null,
        points: Number(stats.team_points?.total) || 0,
        projected: projected === undefined || projected === null ? null : Number(projected) || 0,
        winProbability:
          probability === undefined || probability === null ? null : Number(probability),
      })
    }
    if (teams.length === 2) {
      for (const [i, team] of teams.entries()) {
        if (team.winProbability === null) {
          team.winProbability = impliedProbability(team, teams[1 - i], status)
        }
      }
    }
    matchups.push({
      status,
      isPlayoffs: String(matchup.is_playoffs) === '1',
      winnerTeamKey: matchup.winner_team_key ?? null,
      teams,
    })
  }

  return {
    leagueKey: meta.league_key ?? null,
    season: Number(meta.season) || null,
    week,
    matchups,
  }
}

async function main() {
  const fixtureFlag = process.argv.indexOf('--fixture')
  const outFlag = process.argv.indexOf('--out')
  const usingFixture = fixtureFlag !== -1
  const out = outFlag !== -1 ? process.argv[outFlag + 1] : 'scores.json'

  let payload
  if (usingFixture) {
    const path = process.argv[fixtureFlag + 1]
    payload = JSON.parse(await readFile(path, 'utf8'))
    payload = payload.scoreboard ?? payload
    console.log(`Parsing fixture ${path} (no network calls).`)
  } else {
    const leagueKey = required('YAHOO_LEAGUE_KEY')
    const token = await accessToken()
    payload = await api(`league/${leagueKey}/scoreboard`, token)
  }

  const parsed = parseScoreboard(payload)
  const resolve = resolver(await loadMap())
  const unmapped = new Set()
  const matchups = parsed.matchups.map((matchup) => ({
    ...matchup,
    teams: matchup.teams.map((team) => {
      const manager = resolve(team.teamKey, team.teamName)
      if (!manager) unmapped.add(`${team.teamName} (${team.teamKey})`)
      return { ...team, manager }
    }),
  }))

  const output = {
    season: parsed.season,
    week: parsed.week,
    leagueKey: parsed.leagueKey,
    updatedAt: new Date().toISOString(),
    unmapped: [...unmapped],
    matchups,
  }

  if (usingFixture) {
    console.log(JSON.stringify(output, null, 2))
    return
  }

  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  const live = matchups.filter((matchup) => matchup.status === 'midevent').length
  console.log(
    `Wrote ${out} — ${parsed.season} week ${parsed.week}, ${matchups.length} matchups, ${live} in progress`,
  )
  if (unmapped.size) {
    console.warn(`\n${unmapped.size} team(s) not mapped to a manager. Add them to public/data/yahoo-map.json:`)
    for (const team of unmapped) console.warn(`  ${team}`)
  }
}

// Allow importing the parser without running the job.
if (process.argv[1] && process.argv[1].endsWith('yahoo-scores.mjs')) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
