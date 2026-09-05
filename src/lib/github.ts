/**
 * The repo is the database. Public reads come from the deployed static files;
 * commissioner writes go through the GitHub Contents API, so every change to
 * league data lands as a commit with a full audit trail in `git log`.
 *
 * The token lives only in this browser's localStorage. It is never bundled,
 * never committed, and never sent anywhere except api.github.com.
 */

export const REPO_OWNER = 'waclhq'
export const REPO_NAME = 'waclhq.github.io'
export const REPO_BRANCH = 'main'
/** Data files live here in the repo and are served from /data/ once deployed. */
export const DATA_DIR = 'public/data'

const TOKEN_KEY = 'wacl.github.token'
const API = 'https://api.github.com'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim())
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private browsing — commissioner mode simply stays off */
  }
}

export function isCommissioner(): boolean {
  return Boolean(getToken())
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** btoa() is latin1-only; league data contains team names with accents. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export interface TokenIdentity {
  login: string
  canWrite: boolean
}

/** Confirms the token works and actually has push rights on this repo. */
export async function verifyToken(token: string): Promise<TokenIdentity> {
  const user = await fetch(`${API}/user`, { headers: headers(token) })
  if (!user.ok) {
    throw new Error(
      user.status === 401 ? 'GitHub rejected that token.' : `GitHub error ${user.status}.`,
    )
  }
  const { login } = (await user.json()) as { login: string }

  const repo = await fetch(`${API}/repos/${REPO_OWNER}/${REPO_NAME}`, { headers: headers(token) })
  if (!repo.ok) throw new Error('That token cannot see this repository.')
  const { permissions } = (await repo.json()) as { permissions?: { push?: boolean } }

  return { login, canWrite: Boolean(permissions?.push) }
}

/**
 * What to tell the commissioner when a write fails. The raw exception is kept
 * for the console; this is the sentence that appears next to the button.
 */
export function friendlySaveError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/Commissioner mode is off/i.test(message)) return 'Sign in as commissioner first — it is at the bottom of the menu.'
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(message))
    return 'Could not reach GitHub. Check the connection and try again — nothing was changed.'
  if (/401|Bad credentials|rejected that token/i.test(message))
    return 'GitHub no longer accepts the saved token. Sign out and back in with a fresh one.'
  if (/409|conflict/i.test(message)) return 'Someone saved at the same moment. Try once more.'
  if (/rate limit/i.test(message)) return 'GitHub is rate-limiting this token for a bit. Try again in a few minutes.'
  if (/read the repo but not write/i.test(message)) return message
  return `The save did not go through: ${message}`
}

interface FileHandle {
  json: unknown
  sha: string
}

export async function readFile(name: string): Promise<FileHandle> {
  const token = getToken()
  if (!token) throw new Error('Commissioner mode is off.')
  const response = await fetch(
    `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_DIR}/${name}?ref=${REPO_BRANCH}`,
    { headers: headers(token), cache: 'no-store' },
  )
  if (!response.ok) throw new Error(`Could not read ${name} (${response.status}).`)
  const body = (await response.json()) as { content: string; sha: string }
  return { json: JSON.parse(fromBase64(body.content)), sha: body.sha }
}

/**
 * Read-modify-write against the live file so two devices editing different
 * records don't clobber each other. Retries once on a 409 conflict.
 */
export async function commitFile<T>(
  name: string,
  update: (current: T) => T,
  message: string,
  attempt = 0,
): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('Commissioner mode is off.')

  const { json, sha } = await readFile(name)
  const next = update(json as T)

  const response = await fetch(
    `${API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_DIR}/${name}`,
    {
      method: 'PUT',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: toBase64(`${JSON.stringify(next, null, 2)}\n`),
        sha,
        branch: REPO_BRANCH,
      }),
    },
  )

  if (response.status === 409 && attempt < 1) {
    return commitFile(name, update, message, attempt + 1)
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    // GitHub reports the account's rights, not the token's, so a read-only
    // token sails through verifyToken and only fails here.
    if (detail?.message?.includes('Resource not accessible')) {
      throw new Error(
        'Your token can read the repo but not write to it. On GitHub → Settings → ' +
          `Personal access tokens, edit the token: Repository access must be "Only select ` +
          `repositories" → ${REPO_NAME}, and Contents must be "Read and write". Then retry.`,
      )
    }
    throw new Error(detail?.message ?? `GitHub rejected the write (${response.status}).`)
  }
  return next
}

export function commitUrl(): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}/${DATA_DIR}`
}
