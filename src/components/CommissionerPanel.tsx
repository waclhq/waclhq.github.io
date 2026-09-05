import { useRef, useState } from 'react'
import { useDialog } from '../lib/dialog'
import { useNavigate } from 'react-router-dom'
import { clearOverlay, useLeague } from '../lib/data'
import {
  commitUrl,
  getToken,
  isCommissioner,
  REPO_NAME,
  REPO_OWNER,
  setToken,
  verifyToken,
} from '../lib/github'
import { MIN_PASSWORD_LENGTH, openVault, sealToken } from '../lib/vault'
import type { CommissionerVault } from '../lib/types'

/**
 * Commissioner access. Reads are public; writes need the GitHub token. The
 * token can be sealed under a commissioner password (AES-GCM, key derived
 * from the password) and stored in the repo, so any device unlocks with the
 * password alone — no token pasting, nothing secret ever leaving the browser
 * unencrypted.
 */
export default function CommissionerPanel({ onClose }: { onClose: () => void }) {
  const { data, setCommissioner, reload, save } = useLeague()
  const navigate = useNavigate()
  const vault = data?.vault ?? null
  const active = isCommissioner()

  const [password, setPassword] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [showTokenFlow, setShowTokenFlow] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [leagueSetup, setLeagueSetup] = useState(false)
  const [leagueToken, setLeagueToken] = useState('')
  const [leaguePassword, setLeaguePassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  useDialog(host, onClose)

  const finish = (message: string) => {
    setStatus(message)
    setError(null)
    setPassword('')
    setTokenInput('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function unlockWithPassword() {
    if (!vault) return
    setBusy(true)
    setError(null)
    try {
      const pat = await openVault(vault, password)
      const identity = await verifyToken(pat)
      if (!identity.canWrite) throw new Error('The stored token has lost its write access.')
      setToken(pat)
      setCommissioner(true)
      finish(`Unlocked. Signed in as ${identity.login}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unlock.')
    } finally {
      setBusy(false)
    }
  }

  async function connectWithToken() {
    setBusy(true)
    setError(null)
    try {
      const identity = await verifyToken(tokenInput)
      if (!identity.canWrite) {
        throw new Error(`${identity.login} does not have push access to ${REPO_NAME}.`)
      }
      setToken(tokenInput)
      setCommissioner(true)
      finish(`Connected as ${identity.login}. Now set a password below so future sign-ins are easy.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify that token.')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    const pat = getToken()
    if (!pat) return
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password needs at least ${MIN_PASSWORD_LENGTH} characters — it guards the keys.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sealed = await sealToken(pat, newPassword)
      await save<CommissionerVault | null>(
        'auth.json',
        () => sealed,
        'Commissioner password ' + (vault ? 'changed' : 'set'),
      )
      setSettingPassword(false)
      finish(
        vault
          ? 'Password changed. Old password no longer unlocks.'
          : 'Password set. Any device can now unlock commissioner mode with it.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the password.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Seals the bets-repo token under a password the whole league shares. That
   * token can only write the bets repo, so handing it around cannot expose
   * keepers, trades, cash, or this vault.
   */
  async function saveLeaguePassword() {
    if (leaguePassword.length < MIN_PASSWORD_LENGTH) {
      setError(`League password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (!leagueToken.trim()) {
      setError('Paste the bets-repo token first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sealed = await sealToken(leagueToken.trim(), leaguePassword)
      await save<CommissionerVault | null>(
        'league-auth.json',
        () => sealed,
        'League betting password set',
      )
      setLeagueSetup(false)
      setLeagueToken('')
      setLeaguePassword('')
      finish('League password set. Share it with the league — they can post bets now.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the league password.')
    } finally {
      setBusy(false)
    }
  }

  async function removePassword() {
    setBusy(true)
    setError(null)
    try {
      await save<CommissionerVault | null>('auth.json', () => null, 'Commissioner password removed')
      finish('Password removed. Sign-in is token-only again.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the password.')
    } finally {
      setBusy(false)
    }
  }

  function disconnect() {
    setToken(null)
    setCommissioner(false)
    clearOverlay()
    finish('Signed out. This device is read-only again.')
    void reload()
  }

  const passwordForm = (
    <div className="space-y-3">
      <label className="label block">
        {vault ? 'New password' : 'Choose a commissioner password'} (min {MIN_PASSWORD_LENGTH}{' '}
        chars)
      </label>
      <input
        type="password"
        className="field"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <label className="label block">Repeat it</label>
      <input
        type="password"
        className="field"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !newPassword}
          onClick={() => void savePassword()}
        >
          {busy ? 'Sealing…' : vault ? 'Change password' : 'Set password'}
        </button>
        <button type="button" className="btn" onClick={() => setSettingPassword(false)}>
          Cancel
        </button>
      </div>
      <p className="text-[12px] text-arc-ink-faint">
        The token is encrypted with this password and stored in the repo. A long phrase beats a
        clever short one — the sealed file is public, so the password is the whole lock.
      </p>
    </div>
  )

  return (
    <div
      ref={host}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-arc-bg-deep/85 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Commissioner access"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="win w-full max-w-xl">
        <header className="flex items-start justify-between gap-4 border-b border-arc-line px-6 py-5">
          <div>
            <div className="label">Access</div>
            <h2 className="mt-1.5 text-[24px] leading-none text-arc-ink">Commissioner mode</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[22px] leading-none text-arc-ink-faint transition-colors hover:text-arc-ink"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="space-y-5 px-6 py-6 text-[13.5px] leading-relaxed text-arc-ink-soft">
          {active ? (
            <>
              <p>
                Commissioner mode is <span className="text-arc-green">on</span>. Trades, keepers,
                and cash entries commit straight to{' '}
                <code className="text-arc-green">
                  {REPO_OWNER}/{REPO_NAME}
                </code>{' '}
                with a full audit trail.
              </p>

              {settingPassword ? (
                passwordForm
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setSettingPassword(true)}
                  >
                    {vault ? 'Change password' : '🔑 Set commissioner password'}
                  </button>
                  {vault && (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void removePassword()}
                    >
                      Remove password
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setLeagueSetup((open) => !open)}
                  >
                    🎲 League betting password
                  </button>
                  <a className="btn" href={commitUrl()} target="_blank" rel="noreferrer noopener">
                    Audit log
                  </a>
                  <button type="button" className="btn btn-danger" onClick={disconnect}>
                    Sign out
                  </button>
                </div>
              )}
              {leagueSetup && (
                <div className="space-y-3 border-t border-arc-line pt-4">
                  <p className="text-[12.5px] text-arc-ink-soft">
                    Paste a fine-grained token scoped to the <b>bets</b> repo only (Contents: Read
                    and write), then choose a password to share with the league. They will be able
                    to post and accept bets — and nothing else.
                  </p>
                  <label className="label block">Bets-repo token</label>
                  <input
                    type="password"
                    className="field tnum"
                    placeholder="github_pat_…"
                    autoComplete="off"
                    value={leagueToken}
                    onChange={(event) => setLeagueToken(event.target.value)}
                  />
                  <label className="label block">
                    League password (min {MIN_PASSWORD_LENGTH} chars)
                  </label>
                  <input
                    type="password"
                    className="field"
                    autoComplete="new-password"
                    value={leaguePassword}
                    onChange={(event) => setLeaguePassword(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || !leagueToken || !leaguePassword}
                      onClick={() => void saveLeaguePassword()}
                    >
                      {busy ? 'Sealing…' : 'Set league password'}
                    </button>
                    <button type="button" className="btn" onClick={() => setLeagueSetup(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!vault && !settingPassword && (
                <p className="text-[12px] text-arc-ink-faint">
                  Set a password and you'll never paste a token again — any device unlocks with it.
                </p>
              )}
            </>
          ) : vault && !showTokenFlow ? (
            <>
              <p>
                The site is public and read-only. Only the commissioner can record trades and
                league data — enter the commissioner password to unlock this device.
              </p>
              <div className="space-y-3">
                <label className="label block" htmlFor="commish-pw">
                  Commissioner password
                </label>
                <input
                  id="commish-pw"
                  type="password"
                  className="field"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && password && !busy) void unlockWithPassword()
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!password || busy}
                  onClick={() => void unlockWithPassword()}
                >
                  {busy ? 'Unlocking…' : 'Unlock'}
                </button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <button
                  type="button"
                  className="text-[12px] text-arc-ink-faint underline underline-offset-2"
                  onClick={() => {
                    onClose()
                    navigate('/guide')
                  }}
                >
                  New commissioner? Read the manual
                </button>
                <button
                  type="button"
                  className="text-[12px] text-arc-ink-faint underline underline-offset-2"
                  onClick={() => setShowTokenFlow(true)}
                >
                  Use a GitHub token instead
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Writes need a GitHub fine-grained token with{' '}
                <span className="text-arc-ink">Contents: Read and write</span> on{' '}
                <code className="text-arc-green">{REPO_NAME}</code>.
                {vault && ' (You can also go back and use the commissioner password.)'}
              </p>
              <ol className="ml-4 list-decimal space-y-1.5 text-arc-ink-faint">
                <li>
                  <a
                    className="text-arc-green underline underline-offset-2"
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Create a fine-grained token
                  </a>{' '}
                  scoped to this one repository.
                </li>
                <li>Grant Repository permissions → Contents → Read and write.</li>
                <li>Paste it below. It stays in this browser only.</li>
              </ol>
              <div className="space-y-3">
                <label className="label block" htmlFor="pat">
                  Personal access token
                </label>
                <input
                  id="pat"
                  type="password"
                  className="field tnum"
                  placeholder="github_pat_…"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && tokenInput && !busy) void connectWithToken()
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!tokenInput || busy}
                    onClick={() => void connectWithToken()}
                  >
                    {busy ? 'Verifying…' : 'Connect'}
                  </button>
                  {vault && (
                    <button type="button" className="btn" onClick={() => setShowTokenFlow(false)}>
                      Back to password
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {status && <p className="text-arc-green">{status}</p>}
          {error && <p className="text-arc-red">{error}</p>}
        </div>
      </div>
    </div>
  )
}
