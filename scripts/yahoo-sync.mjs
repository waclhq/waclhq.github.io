/**
 * Pulls live standings and waiver transactions from the Yahoo Fantasy API and
 * writes public/data/live.json. Runs from a GitHub Action on a schedule so the
 * credentials stay in GitHub Secrets and never reach the browser.
 *
 * Required environment:
 *   YAHOO_CLIENT_ID      Consumer key from your Yahoo developer app
 *   YAHOO_CLIENT_SECRET  Consumer secret
 *   YAHOO_REFRESH_TOKEN  Long-lived refresh token (scripts/yahoo-auth.mjs)
 *   YAHOO_LEAGUE_KEY     e.g. "461.l.123456"  (gameKey.l.leagueId)
 *
 * Team-to-manager mapping lives in public/data/yahoo-map.json, keyed by either
 * Yahoo team key or team name, so renaming a team does not break the join.
 *
 * Offline check:
 *   node scripts/yahoo-sync.mjs --fixture scripts/fixtures/yahoo-standings.json
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA, accessToken, api, collection, flatten, loadMap, required, resolver } from './lib/yahoo.mjs'

export function parseStandings(payload) {
  const league = payload?.fantasy_content?.league
  if (!league) throw new Error('Unexpected Yahoo payload: no league node')

  const meta = league[0] ?? {}
  const standings = league[1]?.standings?.[0]?.teams
  if (!standings) throw new Error('Unexpected Yahoo payload: no standings node')

  const teams = []
  for (const entry of collection(standings)) {
    if (!entry?.team) continue
    const info = flatten(entry.team[0])
    const stats = entry.team[1]?.team_standings ?? {}
    const outcome = stats.outcome_totals ?? {}
    teams.push({
      teamKey: info.team_key ?? null,
      teamName: info.name ?? null,
      rank: Number(stats.rank) || null,
      wins: Number(outcome.wins) || 0,
      losses: Number(outcome.losses) || 0,
      ties: Number(outcome.ties) || 0,
      pointsFor: Number(stats.points_for) || 0,
      pointsAgainst: Number(stats.points_against) || 0,
    })
  }

  return {
    leagueKey: meta.league_key ?? null,
    leagueName: meta.name ?? null,
    season: Number(meta.season) || null,
    currentWeek: Number(meta.current_week) || null,
    teams: teams.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
  }
}

/**
 * Waiver adds with their FAAB bid. These feed the keeper-cost sliding scale, so
 * a claim recorded here needs no manual entry on the Finances page.
 */
export function parseTransactions(payload) {
  const league = payload?.fantasy_content?.league
  const node = league?.[1]?.transactions
  if (!node) return []

  const claims = []
  for (const entry of collection(node)) {
    const transaction = entry?.transaction
    if (!transaction) continue
    const head = flatten(transaction[0])
    if (head.status && head.status !== 'successful') continue

    const bid = Number(head.faab_bid)
    // Only waiver claims carry a bid; free-agent adds are keeper cost $5.
    if (!Number.isFinite(bid)) continue

    for (const playerEntry of collection(transaction[1]?.players)) {
      const player = playerEntry?.player
      if (!player) continue
      const info = flatten(player[0])
      const data = flatten(player[1]?.transaction_data)
      if (data.type !== 'add') continue
      claims.push({
        player: info.full ?? info.name ?? null,
        bid,
        teamKey: data.destination_team_key ?? null,
        teamName: data.destination_team_name ?? null,
        timestamp: Number(head.timestamp) || null,
      })
    }
  }
  return claims
}


async function main() {
  const fixtureFlag = process.argv.indexOf('--fixture')
  const usingFixture = fixtureFlag !== -1

  let standingsPayload
  let transactionsPayload = null

  if (usingFixture) {
    const path = process.argv[fixtureFlag + 1]
    const fixture = JSON.parse(await readFile(path, 'utf8'))
    standingsPayload = fixture.standings ?? fixture
    transactionsPayload = fixture.transactions ?? null
    console.log(`Parsing fixture ${path} (no network calls).`)
  } else {
    const leagueKey = required('YAHOO_LEAGUE_KEY')
    const token = await accessToken()
    standingsPayload = await api(`league/${leagueKey}/standings`, token)
    try {
      transactionsPayload = await api(`league/${leagueKey}/transactions;types=add`, token)
    } catch (error) {
      // Standings are the point of this job; transactions are a bonus.
      console.warn(`Could not read transactions: ${error.message}`)
    }
  }

  const parsed = parseStandings(standingsPayload)
  const claims = transactionsPayload ? parseTransactions(transactionsPayload) : []
  const resolve = resolver(await loadMap())

  const unmapped = new Set()
  const teams = parsed.teams.map((team) => {
    const manager = resolve(team.teamKey, team.teamName)
    if (!manager) unmapped.add(`${team.teamName} (${team.teamKey})`)
    const games = team.wins + team.losses + team.ties
    return {
      ...team,
      manager,
      avgPointsFor: games ? Number((team.pointsFor / games).toFixed(2)) : null,
      avgPointsAgainst: games ? Number((team.pointsAgainst / games).toFixed(2)) : null,
    }
  })

  const output = {
    season: parsed.season,
    week: parsed.currentWeek,
    leagueName: parsed.leagueName,
    leagueKey: parsed.leagueKey,
    updatedAt: new Date().toISOString(),
    unmapped: [...unmapped],
    teams,
    claims: claims.map((claim) => ({
      ...claim,
      manager: resolve(claim.teamKey, claim.teamName),
    })),
  }

  if (usingFixture) {
    console.log(JSON.stringify(output, null, 2))
    return
  }

  await writeFile(join(DATA, 'live.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(
    `Wrote live.json — ${parsed.season} week ${parsed.currentWeek}, ` +
      `${teams.length} teams, ${claims.length} waiver claims`,
  )

  if (unmapped.size) {
    console.warn(
      `\n${unmapped.size} team(s) not mapped to a manager. Add them to public/data/yahoo-map.json:`,
    )
    for (const team of unmapped) console.warn(`  ${team}`)
  }
}

// Allow importing the parsers without running the job.
if (process.argv[1] && process.argv[1].endsWith('yahoo-sync.mjs')) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
