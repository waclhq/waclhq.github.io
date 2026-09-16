/**
 * What the Yahoo scripts share: the token dance, one authenticated GET, the
 * two helpers that make Yahoo's JSON readable, and the team → manager map.
 *
 * yahoo-sync.mjs (standings, twice a week, into main) and yahoo-scores.mjs
 * (matchups, every ten minutes while games are on, into the `live` branch)
 * both import from here. Each still runs alone and writes only its own file.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const DATA = join(ROOT, 'public', 'data')

const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token'
const API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'

export function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

export async function accessToken() {
  const body = new URLSearchParams({
    client_id: required('YAHOO_CLIENT_ID'),
    client_secret: required('YAHOO_CLIENT_SECRET'),
    refresh_token: required('YAHOO_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
    redirect_uri: process.env.YAHOO_REDIRECT_URI ?? 'oob',
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error(
      `Yahoo token refresh failed (${response.status}). ` +
        `If this is a 400, the refresh token has been revoked — re-run scripts/yahoo-auth.mjs.\n` +
        (await response.text()),
    )
  }
  const { access_token: token } = await response.json()
  return token
}

export async function api(path, token) {
  const response = await fetch(`${API_BASE}/${path}?format=json`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Yahoo API ${path} failed (${response.status}): ${await response.text()}`)
  }
  return response.json()
}

/**
 * Yahoo mixes arrays of single-key objects with numeric-keyed maps. Flatten one
 * branch into a plain object of scalars. Later keys win, so only hand this a
 * branch whose scalars you actually want — never a whole matchup, whose
 * stat_winners would overwrite winner_team_key.
 */
export function flatten(chunk) {
  const out = {}
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (value !== null && typeof value === 'object') visit(value)
        else out[key] = value
      }
    }
  }
  visit(chunk)
  return out
}

/** Walk a numeric-keyed Yahoo collection ({0:…, 1:…, count:N}). */
export function collection(node) {
  if (!node || typeof node !== 'object') return []
  return Object.entries(node)
    .filter(([key]) => key !== 'count')
    .map(([, value]) => value)
}

/** public/data/yahoo-map.json: team key or team name → manager id. */
export async function loadMap() {
  try {
    return JSON.parse(await readFile(join(DATA, 'yahoo-map.json'), 'utf8'))
  } catch {
    return {}
  }
}

/** A team → manager lookup that tries the key, the name, then the name lowercased. */
export function resolver(map) {
  return (key, name) => map[key] ?? map[name] ?? map[(name ?? '').toLowerCase()] ?? null
}
