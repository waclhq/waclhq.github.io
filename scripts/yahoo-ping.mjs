/**
 * Asks Yahoo two questions with the real credentials and reports the HTTP
 * status of each, never failing: is this app allowed to see the account's
 * leagues at all, and can it read this league's standings? The pair tells
 * "Yahoo has not enabled the Client ID yet" (both 403) apart from "the
 * account that authorised is not in the league" (leagues 200, standings 403).
 *
 *   YAHOO_CLIENT_ID=… YAHOO_CLIENT_SECRET=… YAHOO_REFRESH_TOKEN=… YAHOO_LEAGUE_KEY=… node scripts/yahoo-ping.mjs
 *
 * Run by the provisioning probe workflow once the four secrets exist.
 */

import { accessToken } from './lib/yahoo.mjs'

const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'

async function status(path, token) {
  try {
    const response = await fetch(`${API_BASE}/${path}?format=json`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return response.status
  } catch (error) {
    return `error (${error.message})`
  }
}

let token
try {
  token = await accessToken()
} catch (error) {
  console.log(`Yahoo API answered: token refresh failed — ${error.message.split('\n')[0]}`)
  process.exit(0)
}

const leagueKey = process.env.YAHOO_LEAGUE_KEY ?? 'nfl.l.134099'
const leagues = await status('users;use_login=1/games;game_codes=nfl/leagues', token)
const standings = await status(`league/${leagueKey}/standings`, token)
console.log(`Yahoo API answered: leagues=${leagues} standings=${standings}`)
