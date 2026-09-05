import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import ManagerTag from '../components/ManagerTag'
import { Chip, Panel, PageHeader, SectionNav, Stat } from '../components/ui'
import { Confetti } from '../components/effects'
import BetBoard from '../components/receipts/BetBoard'
import BetEditor from '../components/receipts/BetEditor'
import Composer from '../components/receipts/Composer'
import ConfirmButton from '../components/receipts/ConfirmButton'
import Slip, { Face, type Pyre } from '../components/receipts/Slip'
import Stub from '../components/receipts/Stub'
import { readLastGood, writeLastGood } from '../components/receipts/betsCache'
import type { NameOf } from '../components/receipts/provenance'
import { landOn } from '../components/receipts/land'
import { useStill } from '../components/receipts/useStill'
import { play } from '../lib/sfx'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { friendlySaveError } from '../lib/github'
import { managerColor } from '../lib/identity'
import { useMe } from '../lib/me'
import { money, pct } from '../lib/format'
import {
  applyResults,
  betRecords,
  editedBet,
  headToHead,
  loserOf,
  openDebts,
  stakeLabel,
  venmoUrl,
  type Bet,
  type BetEdit,
  type BetsFile,
  type Debt,
} from '../lib/bets'
import {
  betsRepoUrl,
  canPostBets,
  readBets,
  saveBets,
  setLeagueToken,
  unlockLeague,
} from '../lib/betsRepo'
import type { BetResultsFile, ManagerId } from '../lib/types'

/** The commissioner's way into the editor. Icon-only — slip footers are tight. */
function EditButton({ bet, busy, onEdit }: { bet: Bet; busy: boolean; onEdit: (bet: Bet) => void }) {
  return (
    <button
      type="button"
      className="btn min-h-[40px] min-w-[40px] px-2.5 py-1"
      disabled={busy}
      onClick={() => onEdit(bet)}
      aria-label={`Edit or delete the bet: ${bet.terms}`}
      title="Edit or delete this bet"
    >
      ✎
    </button>
  )
}

/**
 * The bets repo and the vault speak for themselves on their own failures;
 * GitHub's get translated. A mistyped password is not a failed save, so it
 * must not be dressed as one — every member hits it on a typo.
 */
function describe(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : ''
  if (/wrong password/i.test(message)) return 'Wrong password — try again.'
  if (/league password|league token|bets repo|bets\.json|no longer valid|cannot write/i.test(message))
    return message
  return cause instanceof Error ? friendlySaveError(cause) : fallback
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * The book. Anyone with the league password can propose a bet and accept one
 * against them; only the commissioner settles. Bets live in their own repo,
 * so posting one shows up on the next refresh rather than waiting on a
 * Pages deploy. Every slip carries its own receipt and its own address:
 * /#/bets?bet=<id> opens it.
 */
/** How long the settle ceremony owns the slip: the burn plus the flood. */
const CEREMONY_MS = 2300
/** And how long the last piece of confetti takes to reach the floor. */
const CONFETTI_MS = 4600

export default function Bets() {
  const { league, managers, leagueVault, betResults } = useLeagueData()
  const { commissioner, save } = useLeague()
  const me = useMe()
  const active = useMemo(() => managers.filter((m) => m.active), [managers])
  const nameOf = useCallback<NameOf>((id) => managerName(managers, id), [managers])

  const [file, setFile] = useState<BetsFile | null>(null)
  // Set when the board on screen is this device's last good copy, not a fresh read.
  const [boardAsOf, setBoardAsOf] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(canPostBets)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // One failure at a time, pinned to the control that caused it.
  const [fault, setFault] = useState<{ id: string; message: string } | null>(null)
  const [composing, setComposing] = useState(false)
  // The bet the commissioner is correcting, and only that editor's own failure.
  const [editing, setEditing] = useState<Bet | null>(null)
  const [editorFault, setEditorFault] = useState<string | null>(null)
  // Bumped on a settle so the confetti remounts and fires again.
  const [celebrate, setCelebrate] = useState(0)
  // The execution in progress: whose half of which slip is burning away.
  const [pyre, setPyre] = useState<Pyre | null>(null)
  const [tapePaused, setTapePaused] = useState(false)
  const passwordPanel = useRef<HTMLDivElement>(null)
  const passwordField = useRef<HTMLInputElement>(null)
  const still = useStill()

  // The fire and the confetti belong to the ruling that just happened, not to
  // the bet id. Both are on timers this room owns, so they can be called off
  // if the commissioner corrects or deletes the bet mid-ceremony, and on the
  // way out of the room. Left to itself the confetti loops forever.
  const ceremony = useRef<number[]>([])
  const stopCeremony = useCallback(() => {
    ceremony.current.forEach((id) => window.clearTimeout(id))
    ceremony.current = []
  }, [])
  const endCeremony = useCallback(() => {
    stopCeremony()
    setPyre(null)
    setCelebrate(0)
  }, [stopCeremony])
  useEffect(() => stopCeremony, [stopCeremony])

  // Which bet is unfolded. It lives in the address (?bet=<id>) so a slip can
  // be handed to someone; the route itself never changes. Opening a tile
  // writes the address directly rather than navigating — a router navigation,
  // even a replace, is a page change to the Shell, which scrolls to the top.
  const [params] = useSearchParams()
  const linked = params.get('bet')
  const arrivedAt = useRef(linked)
  const [open, setOpenState] = useState<string | null>(linked)
  const setOpen = useCallback((id: string | null) => {
    setOpenState(id)
    const url = new URL(window.location.href)
    const [path, query = ''] = url.hash.replace(/^#/, '').split('?')
    const search = new URLSearchParams(query)
    if (id) search.set('bet', id)
    else search.delete('bet')
    const qs = search.toString()
    url.hash = `${path}${qs ? `?${qs}` : ''}`
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])
  useEffect(() => {
    if (linked) setOpenState(linked)
  }, [linked])

  const load = useCallback(async () => {
    const fresh = await readBets()
    const cached = readLastGood()
    // An unreachable repo answers as an empty file. A board this device has
    // seen bets on does not go blank on a bad connection — it shows the last
    // copy, stamped with its age, until a read says otherwise.
    if (fresh.bets.length === 0 && cached && cached.file.bets.length > 0) {
      setFile(cached.file)
      setBoardAsOf(cached.at)
      return
    }
    setFile(fresh)
    setBoardAsOf(null)
    if (fresh.bets.length > 0) writeLastGood(fresh)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const again = () => void load()
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [load])

  // Winners come only from the commissioner-only results file.
  const bets = useMemo(() => applyResults(file?.bets ?? [], betResults.results), [file, betResults])
  const season = league.currentSeason
  const proposed = bets.filter((b) => b.status === 'proposed')
  // A bet being burned stays on the live board until its ceremony ends. The
  // commit answers in a few hundred milliseconds; the fire takes two seconds,
  // and moving the slip to Settled the instant the write lands unmounts the
  // burn mid-climb — the ruling's whole moment, gone in a flicker.
  const live = bets.filter((b) => b.status === 'live' || b.id === pyre?.betId)
  const settled = bets
    .filter((b) => b.status === 'settled' && b.id !== pyre?.betId)
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''))
  const records = useMemo(() => betRecords(bets), [bets])
  const h2h = useMemo(() => headToHead(bets), [bets])
  const debts = useMemo(() => {
    const all = openDebts(bets)
    if (!me) return all
    const mine = (d: Debt) => d.from === me || d.to === me
    return [...all].sort((x, y) => Number(mine(y)) - Number(mine(x)))
  }, [bets, me])
  const handleOf = (id: ManagerId) => managers.find((m) => m.id === id)?.venmo

  const riding = live.reduce((sum, b) => sum + (b.stakeKind === 'cash' ? b.stake : 0), 0)
  const biggest = [...bets].filter((b) => b.stakeKind === 'cash').sort((a, b) => b.stake - a.stake)[0]
  const hottest = [...records].sort((a, b) => b.streak - a.streak || b.net - a.net)[0]
  // One win is a win. Two straight is a hand.
  const onARun = hottest && hottest.streak >= 2 ? hottest : null

  // Recent action, newest first, for the tape.
  const tape = [...bets]
    .filter((b) => b.status === 'settled' || b.status === 'live')
    .sort((a, b) => (b.settledAt ?? b.acceptedAt ?? '').localeCompare(a.settledAt ?? a.acceptedAt ?? ''))
    .slice(0, 18)

  // A shared link lands on its slip, once, under the sticky bars. Web fonts
  // and portraits can still move the board for a moment after the first
  // pass, so it realigns twice more unless the reader has started scrolling.
  useEffect(() => {
    const target = arrivedAt.current
    if (!file || !target || linked !== target) return
    arrivedAt.current = null
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    const land = () => {
      if (cancelled) return null
      const node = document.querySelector<HTMLElement>(`[data-bet="${CSS.escape(target)}"]`)
      if (node) landOn(node)
      return node
    }
    for (const type of ['wheel', 'touchstart', 'keydown'] as const)
      window.addEventListener(type, cancel, { passive: true, once: true })
    const first = requestAnimationFrame(() => {
      const node = land()
      const control = node?.matches('button') ? node : node?.querySelector<HTMLElement>('button')
      if (!control) return
      // Focus so assistive tech lands on the bet too — without the keyboard
      // ring, since nobody pressed a key to get here.
      control.style.outline = 'none'
      control.addEventListener('blur', () => control.style.removeProperty('outline'), { once: true })
      control.focus({ preventScroll: true })
    })
    const again = [700, 1600].map((ms) => window.setTimeout(land, ms))
    document.fonts?.ready.then(() => void land()).catch(() => undefined)
    return () => {
      cancelAnimationFrame(first)
      again.forEach((id) => window.clearTimeout(id))
      for (const type of ['wheel', 'touchstart', 'keydown'] as const)
        window.removeEventListener(type, cancel)
    }
  }, [file, linked])

  // The ceremony, visible to CSS and to tests: while a slip is burning the
  // body carries the bet it belongs to.
  useEffect(() => {
    if (pyre) document.body.dataset.ceremony = pyre.betId
    else delete document.body.dataset.ceremony
  }, [pyre])

  const faultFor = (id: string) => (fault?.id === id ? fault.message : null)

  // Every write on the board announces itself the way lib/data's save() does,
  // so the Shell's status strip reports it where the thumb already is.
  const announce = (detail: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent('wacl:save', { detail: { file: 'bets.json', ...detail } }))

  async function mutate(update: (current: BetsFile) => BetsFile, message: string, id: string) {
    setBusy(id)
    setFault(null)
    announce({ phase: 'start', message })
    try {
      const next = await saveBets(update, message)
      setFile(next)
      setBoardAsOf(null)
      writeLastGood(next)
      announce({ phase: 'ok', message })
      return true
    } catch (cause) {
      const error = describe(cause, 'Could not save that.')
      setFault({ id, message: error })
      announce({ phase: 'error', message, error, retry: () => void mutate(update, message, id) })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function unlock() {
    if (!leagueVault) return
    setBusy('unlock')
    setFault(null)
    try {
      await unlockLeague(leagueVault, password)
      setUnlocked(true)
      setPassword('')
      // Now that we hold a token, re-read through the API — raw's CDN copy
      // can be up to five minutes behind.
      await load()
    } catch (cause) {
      setFault({ id: 'unlock', message: describe(cause, 'Could not unlock.') })
    } finally {
      setBusy(null)
    }
  }

  const jumpToPassword = () => {
    if (passwordPanel.current) landOn(passwordPanel.current, still ? 'auto' : 'smooth')
    passwordField.current?.focus({ preventScroll: true })
  }

  const accept = (bet: Bet) =>
    mutate(
      (current) => ({
        ...current,
        bets: current.bets.map((b) =>
          b.id === bet.id ? { ...b, status: 'live', acceptedAt: new Date().toISOString() } : b,
        ),
      }),
      `Bet accepted: ${nameOf(bet.opponent)} vs ${nameOf(bet.proposer)}`,
      bet.id,
    )

  /**
   * Settling writes to the MAIN repo, not the bets repo — so it needs the
   * commissioner's token. The league password cannot reach this file.
   */
  const settle = async (bet: Bet, winner: ManagerId) => {
    setBusy(bet.id)
    setFault(null)
    stopCeremony()
    if (!still) {
      setPyre({ betId: bet.id, loser: winner === bet.proposer ? bet.opponent : bet.proposer, winner })
    }
    try {
      await save<BetResultsFile>(
        'bet-results.json',
        (current) => ({
          results: [
            ...current.results.filter((r) => r.betId !== bet.id),
            { betId: bet.id, winner, settledAt: new Date().toISOString() },
          ],
        }),
        `Bet settled: ${nameOf(winner)} wins`,
      )
      play('roar')
      if (still) {
        setBusy(null)
        return
      }
      // Let it burn: the front needs ~1.6s to climb and the winner's flood
      // runs 2.2s. Only then does the slip cross over to the kept stubs, and
      // the confetti clears once the last piece has landed.
      setCelebrate((n) => n + 1)
      ceremony.current = [
        window.setTimeout(() => setPyre(null), CEREMONY_MS),
        window.setTimeout(() => setCelebrate(0), CONFETTI_MS),
      ]
    } catch (cause) {
      endCeremony()
      setFault({ id: bet.id, message: friendlySaveError(cause) })
    } finally {
      setBusy(null)
    }
  }

  const settleUp = (debt: Debt) =>
    mutate(
      (current) => ({
        ...current,
        bets: current.bets.map((b) =>
          debt.betIds.includes(b.id) ? { ...b, paidAt: new Date().toISOString() } : b,
        ),
      }),
      `Bet debt paid: ${nameOf(debt.from)} → ${nameOf(debt.to)} ${money(debt.amount)}`,
      `debt-${debt.from}-${debt.to}`,
    )

  const drop = (bet: Bet) =>
    mutate(
      (current) => ({ ...current, bets: current.bets.filter((b) => b.id !== bet.id) }),
      `Bet withdrawn: ${nameOf(bet.proposer)} vs ${nameOf(bet.opponent)}`,
      bet.id,
    )

  const matchup = (bet: Bet) => `${nameOf(bet.proposer)} vs ${nameOf(bet.opponent)}`

  const openEditor = (bet: Bet) => {
    setEditorFault(null)
    setEditing(bet)
  }

  /**
   * A commissioner's correction to a bet already on the record.
   *
   * It can land in two places at once: the terms and stake live in the
   * league-writable bets repo, the winner only in the commissioner-only
   * results file. Each is written only if it actually changed, so fixing a
   * typo doesn't restamp the settlement.
   */
  const correct = async (bet: Bet, edit: BetEdit, winner: ManagerId | null) => {
    setBusy(bet.id)
    setEditorFault(null)
    // A correction overrules the ruling being celebrated; a reopened bet is a
    // plain live slip, not one still on fire.
    if (pyre?.betId === bet.id || celebrate > 0) endCeremony()
    try {
      const now = new Date().toISOString()
      // Edit the STORED bet, never the one applyResults has already folded a
      // winner into — the results file stays the only source of settlements.
      const stored = file?.bets.find((b) => b.id === bet.id)
      if (stored && JSON.stringify(editedBet(stored, edit, now)) !== JSON.stringify(stored)) {
        const next = await saveBets(
          (current) => ({
            ...current,
            bets: current.bets.map((b) => (b.id === bet.id ? editedBet(b, edit, now) : b)),
          }),
          `Bet corrected by the commissioner: ${matchup(bet)}`,
        )
        setFile(next)
        writeLastGood(next)
      }

      if (winner !== bet.winner) {
        await save<BetResultsFile>(
          'bet-results.json',
          (current) => ({
            results: [
              ...current.results.filter((r) => r.betId !== bet.id),
              ...(winner ? [{ betId: bet.id, winner, settledAt: bet.settledAt ?? now }] : []),
            ],
          }),
          winner ? `Bet result corrected: ${nameOf(winner)} wins` : `Bet reopened: ${matchup(bet)}`,
        )
      }
      setEditing(null)
    } catch (cause) {
      setEditorFault(describe(cause, 'Could not save that correction.'))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Wipe a bet off the board entirely. The bet goes first and its result
   * second: a leftover result keys off an id that no longer exists and is
   * ignored, whereas a bet left behind without its result would quietly
   * reappear as live.
   */
  const remove = async (bet: Bet) => {
    setBusy(bet.id)
    setEditorFault(null)
    if (pyre?.betId === bet.id || celebrate > 0) endCeremony()
    try {
      const next = await saveBets(
        (current) => ({ ...current, bets: current.bets.filter((b) => b.id !== bet.id) }),
        `Bet deleted by the commissioner: ${matchup(bet)}`,
      )
      setFile(next)
      writeLastGood(next)
      if (betResults.results.some((r) => r.betId === bet.id)) {
        await save<BetResultsFile>(
          'bet-results.json',
          (current) => ({ results: current.results.filter((r) => r.betId !== bet.id) }),
          `Bet result removed: ${matchup(bet)}`,
        )
      }
      if (open === bet.id) setOpen(null)
      setEditing(null)
    } catch (cause) {
      setEditorFault(describe(cause, 'Could not delete that bet.'))
    } finally {
      setBusy(null)
    }
  }

  const loading = file === null
  const sections = loading
    ? [
        { id: 'table', label: 'On the table' },
        { id: 'live', label: 'Live' },
        { id: 'tab', label: 'The Tab' },
      ]
    : [
        { id: 'table', label: 'On the table' },
        { id: 'live', label: 'Live' },
        ...(settled.length ? [{ id: 'settled', label: 'Settled' }] : []),
        { id: 'tab', label: 'The Tab' },
        ...(records.length ? [{ id: 'sharps', label: 'Sharps' }] : []),
      ]

  const slipFor = (bet: Bet, actions: ReactNode) => (
    <Slip
      bet={bet}
      nameOf={nameOf}
      me={me}
      pyre={pyre}
      error={faultFor(bet.id)}
      onClose={() => setOpen(null)}
    >
      {actions}
    </Slip>
  )

  return (
    <>
      <PageHeader
        path="~/bets"
        eyebrow="Side action"
        title="The Book"
        lede="Bets between managers, agreed in the open and settled on the record. Anyone with the league password can post one or take one; only the commissioner calls a winner."
        action={
          unlocked ? (
            <button type="button" className="btn btn-primary" onClick={() => setComposing((c) => !c)}>
              {composing ? 'Cancel' : 'Propose a bet'}
            </button>
          ) : leagueVault ? (
            <button type="button" className="btn btn-primary" onClick={jumpToPassword}>
              Unlock to bet
            </button>
          ) : undefined
        }
      />

      {loading && (
        <div
          className="relative -mx-4 mb-6 overflow-hidden border-y border-arc-line bg-arc-panel sm:-mx-6 lg:-mx-9"
          aria-hidden
        >
          <div className="flex items-center gap-7 py-2 pl-10 text-[11px] text-arc-ink-faint italic">
            Reading the tape…
          </div>
        </div>
      )}
      {tape.length > 0 && (
        <div
          className="marquee-host relative -mx-4 mb-6 overflow-hidden border-y border-arc-line bg-arc-panel sm:-mx-6 lg:-mx-9"
          data-paused={tapePaused || undefined}
          // A still strip has nothing to pause: under reduced motion the tape
          // is a plain scroll track, so it offers no pause affordance either.
          {...(still
            ? {}
            : {
                role: 'button',
                tabIndex: 0,
                'aria-pressed': tapePaused,
                'aria-label': tapePaused
                  ? 'Action tape, paused — tap to resume'
                  : 'Action tape — tap to pause',
                onClick: () => setTapePaused((value) => !value),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setTapePaused((value) => !value)
                  }
                },
              })}
        >
          <div
            className="marquee flex w-max items-center gap-7 py-2 pl-10"
            style={{ ['--marquee-duration' as string]: `${Math.max(40, tape.length * 4.5)}s` }}
          >
            {[...tape, ...tape].map((b, i) => (
              <span
                key={`${b.id}-${i}`}
                className="flex shrink-0 items-center gap-2 text-[11px] whitespace-nowrap"
                aria-hidden={i >= tape.length}
              >
                {b.status === 'settled' && b.winner ? (
                  <>
                    <span className="text-arc-green">✓</span>
                    <span className="text-arc-ink-soft">{nameOf(b.winner)}</span>
                    <span className="text-arc-ink-faint">beat</span>
                    <span className="text-arc-ink-soft">{nameOf(loserOf(b)!)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[var(--color-arc-orange)]">●</span>
                    <span className="text-arc-ink-soft">
                      {nameOf(b.proposer)} v {nameOf(b.opponent)}
                    </span>
                  </>
                )}
                <span className="tnum text-arc-ink">{stakeLabel(b)}</span>
                <span className="text-arc-ink-faint">·</span>
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-arc-panel to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-arc-panel to-transparent" />
          {tapePaused && !still && (
            // Its own backing: printed straight onto the tape it landed on
            // top of whatever item happened to be under it.
            <span className="label pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-arc-line bg-arc-panel px-2 py-0.5 text-[11px] text-arc-yellow">
              Paused
            </span>
          )}
        </div>
      )}

      <SectionNav sections={sections} />

      {(loading || bets.length > 0) && (
        <div className="line-in mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {loading ? (
            <>
              <Stat label="Riding right now" value="—" hint="Reading the book…" />
              <Stat label="On the table" value="—" hint="Awaiting a taker" />
              <Stat label="Biggest pot" value="—" />
              <Stat label="Hot hand" value="—" hint="Two straight or more" />
            </>
          ) : (
            <>
              <Stat
                label="Riding right now"
                countTo={riding}
                format={(v) => money(v)}
                value={money(riding)}
                hint={`${live.length} live bet${live.length === 1 ? '' : 's'}`}
                tone={riding ? 'up' : 'default'}
              />
              <Stat label="On the table" value={proposed.length} hint="Awaiting a taker" />
              <Stat
                label="Biggest pot"
                value={biggest ? money(biggest.stake) : '—'}
                hint={biggest ? `${nameOf(biggest.proposer)} v ${nameOf(biggest.opponent)}` : undefined}
              />
              <Stat
                label="Hot hand"
                value={onARun ? nameOf(onARun.manager) : '—'}
                hint={onARun ? `${onARun.streak} straight` : 'Nobody on a run'}
                tone={onARun ? 'gold' : 'default'}
              />
            </>
          )}
        </div>
      )}

      {boardAsOf !== null && (
        <p
          role="status"
          className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[var(--color-arc-orange)] pl-3 text-[12.5px] leading-snug text-[var(--color-arc-orange)]"
        >
          <span>
            Couldn't confirm the board — showing it as of {clockTime(boardAsOf)}. Nothing here is a
            ruling.
          </span>
          <button type="button" className="btn min-h-[40px] px-3 py-1 text-[12px]" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {/* Unlock */}
      {!unlocked && (
        <div ref={passwordPanel} className="scroll-mt-[124px] lg:scroll-mt-[72px]">
          <Panel
            title="league password"
            subtitle={
              leagueVault
                ? 'One password for the whole league. Enter it once on this device to post and accept bets.'
                : 'No league password has been set yet — the commissioner sets it from the commissioner panel.'
            }
          >
            {leagueVault && (
              <div className="flex flex-wrap items-end gap-3 px-5 py-5">
                <label className="min-w-[220px] flex-1">
                  <span className="label">Password</span>
                  <input
                    ref={passwordField}
                    type="password"
                    className="field mt-1.5"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && password) void unlock()
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!password || busy === 'unlock'}
                  onClick={() => void unlock()}
                >
                  {busy === 'unlock' ? 'Unlocking…' : 'Unlock'}
                </button>
                {faultFor('unlock') && (
                  <p role="alert" className="basis-full text-[12.5px] text-[var(--color-arc-red)]">
                    {faultFor('unlock')}
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {composing && unlocked && (
        <div className="mt-6">
          <Composer
            season={season}
            managers={active.map((m) => ({ id: m.id, name: m.displayName }))}
            busy={busy === 'new'}
            me={me}
            error={faultFor('new')}
            onSubmit={(bet) =>
              void mutate(
                (current) => ({ ...current, bets: [...current.bets, bet] }),
                `Bet proposed: ${nameOf(bet.proposer)} vs ${nameOf(bet.opponent)}`,
                'new',
              ).then((ok) => {
                if (ok) setComposing(false)
              })
            }
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Panel
          id="table"
          flush
          title="on the table"
          subtitle={
            loading
              ? 'Proposed and waiting to be taken.'
              : proposed.length
                ? 'Proposed and waiting to be taken. Tap Accept if it is against you.'
                : unlocked
                  ? 'Nothing pending. Propose one.'
                  : leagueVault
                    ? 'Nothing pending. Unlock above to propose one.'
                    : 'Nothing pending.'
          }
        >
          {loading ? (
            <p className="min-h-[120px] px-5 py-5 text-[13px] text-arc-ink-faint italic">Reading the book…</p>
          ) : proposed.length === 0 ? (
            <p className="px-5 py-5 text-[13px] text-arc-ink-faint italic">No open proposals.</p>
          ) : (
            <BetBoard
              bets={proposed}
              open={open}
              onOpen={setOpen}
              nameOf={nameOf}
              me={me}
              h2h={h2h}
              renderSlip={(bet) =>
                slipFor(
                  bet,
                  <>
                    <Chip tone="flag">Awaiting {nameOf(bet.opponent)}</Chip>
                    {unlocked && (
                      <>
                        <button
                          type="button"
                          className={`btn min-h-[40px] px-3 py-1 ${
                            !me || me === bet.opponent ? 'btn-primary' : ''
                          }`}
                          disabled={busy === bet.id}
                          onClick={() => void accept(bet)}
                        >
                          {busy === bet.id
                            ? 'Saving…'
                            : !me || me === bet.opponent
                              ? "I'm in"
                              : `Accept for ${nameOf(bet.opponent)}`}
                        </button>
                        <ConfirmButton
                          confirm="Withdraw this bet?"
                          onConfirm={() => void drop(bet)}
                          disabled={busy === bet.id}
                        >
                          Withdraw
                        </ConfirmButton>
                      </>
                    )}
                  </>,
                )
              }
            />
          )}
        </Panel>

        <Panel
          id="live"
          flush
          title="live action"
          subtitle={
            loading
              ? 'Bets riding.'
              : `${live.length} bet${live.length === 1 ? '' : 's'} riding. ${
                  commissioner
                    ? 'Open one and tap the winner; it asks once before it calls it.'
                    : 'The commissioner calls these.'
                }`
          }
        >
          {loading ? (
            <p className="min-h-[200px] px-5 py-5 text-[13px] text-arc-ink-faint italic">Reading the book…</p>
          ) : live.length === 0 ? (
            <p className="px-5 py-5 text-[13px] text-arc-ink-faint italic">Nothing riding right now.</p>
          ) : (
            <BetBoard
              bets={live}
              open={open}
              onOpen={setOpen}
              nameOf={nameOf}
              me={me}
              h2h={h2h}
              renderSlip={(bet) =>
                slipFor(
                  bet,
                  <>
                    <Chip tone="up">Live</Chip>
                    {commissioner && (
                      <>
                        <span className="text-[12px] text-arc-ink-faint">Winner:</span>
                        {[bet.proposer, bet.opponent].map((id) => (
                          <ConfirmButton
                            key={id}
                            confirm={`Call it for ${nameOf(id)}?`}
                            onConfirm={() => void settle(bet, id)}
                            disabled={busy === bet.id}
                          >
                            {nameOf(id)}
                          </ConfirmButton>
                        ))}
                        <EditButton bet={bet} busy={busy === bet.id} onEdit={openEditor} />
                      </>
                    )}
                  </>,
                )
              }
            />
          )}
        </Panel>

        {settled.length > 0 && (
          <Panel
            id="settled"
            title="settled"
            subtitle={
              commissioner
                ? 'The stubs you kept. Tap one for its receipt; ✎ fixes the terms, the stake, or the wrong name called.'
                : 'The stubs you kept — every settled bet, stamped by its winner. Tap one for its receipt.'
            }
          >
            <div className="space-y-3.5 px-4 py-5 sm:px-5">
              {settled.map((bet, index) => (
                <Stub
                  key={bet.id}
                  bet={bet}
                  index={index}
                  nameOf={nameOf}
                  me={me}
                  open={open === bet.id}
                  onToggle={() => setOpen(open === bet.id ? null : bet.id)}
                  linked={linked === bet.id}
                  action={
                    commissioner ? (
                      <EditButton bet={bet} busy={busy === bet.id} onEdit={openEditor} />
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Panel>
        )}

        <Panel
          id="tab"
          title="the tab"
          subtitle="Betting debts only — kept apart from league dues and payouts. Wins and losses between the same two people net down to one number."
        >
          {loading ? (
            <p className="px-5 py-6 text-[13px] text-arc-ink-faint italic">Reading the book…</p>
          ) : debts.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-arc-green">All square. Nobody owes anybody a dollar.</p>
          ) : (
            <ul>
              {debts.map((debt) => {
                const key = `debt-${debt.from}-${debt.to}`
                const pay = venmoUrl(
                  handleOf(debt.to),
                  debt.amount,
                  `WACL side bet — ${nameOf(debt.from)} to ${nameOf(debt.to)}`,
                )
                const yours = me === debt.from || me === debt.to
                return (
                  <li
                    key={key}
                    className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b border-arc-line/40 px-5 py-3 last:border-b-0 sm:flex"
                    style={
                      yours
                        ? {
                            background: `color-mix(in srgb, ${managerColor(me)} 9%, transparent)`,
                            boxShadow: `inset 3px 0 0 ${managerColor(me)}`,
                          }
                        : undefined
                    }
                  >
                    <Face id={debt.from} size={1.6} />
                    <span className="min-w-0 flex-1 text-[14px]">
                      <b style={{ color: managerColor(debt.from) }}>{nameOf(debt.from)}</b>
                      <span className="text-arc-ink-faint"> owes </span>
                      <b style={{ color: managerColor(debt.to) }}>{nameOf(debt.to)}</b>
                      {yours && <span className="arcade ml-1.5 text-[12px] whitespace-nowrap text-arc-ink-soft">you</span>}
                      <span className="block text-[11px] text-arc-ink-faint">
                        across {debt.betIds.length} settled bet
                        {debt.betIds.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    {/* Sentence on one line, the money and its buttons on the next
                        below sm; one row on wider screens. */}
                    <span className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:ml-auto">
                      <span className="tnum mr-1 text-[17px] text-[var(--color-arc-red)]">
                        {money(debt.amount)}
                      </span>
                      {pay && (
                        <a
                          href={pay}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="arcade inline-flex min-h-[40px] shrink-0 items-center rounded-md px-3 text-[12px]"
                          style={{ background: 'var(--color-arc-green)', color: 'var(--color-arc-bg-deep)' }}
                        >
                          PAY
                        </a>
                      )}
                      {unlocked && (
                        <button
                          type="button"
                          className="btn min-h-[40px] shrink-0 px-3 py-1"
                          disabled={busy === key}
                          onClick={() => void settleUp(debt)}
                        >
                          {busy === key ? 'Saving…' : 'Mark paid'}
                        </button>
                      )}
                    </span>
                    {faultFor(key) && (
                      <p role="alert" className="col-span-2 text-[12px] text-[var(--color-arc-red)] sm:basis-full">
                        {faultFor(key)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {records.length > 0 && (
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <Panel id="sharps" title="the sharps" subtitle="Career betting records, by money won. Riding is what each has out on live bets.">
              <div className="book-tight">
                <table className="out">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th className="n">W–L</th>
                      <th className="n">Win %</th>
                      <th className="n">Net</th>
                      <th className="n">Riding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row) => (
                      <tr key={row.manager}>
                        <td>
                          <span className="inline-flex items-center gap-1.5">
                            <ManagerTag id={row.manager} link={false} size={20} />
                            {row.streak >= 3 && (
                              <span title={`${row.streak} straight`} aria-label={`${row.streak} straight wins`}>
                                🔥
                              </span>
                            )}
                            {row.streak <= -3 && (
                              <span
                                title={`${-row.streak} straight losses`}
                                aria-label={`${-row.streak} straight losses`}
                                className="opacity-60"
                              >
                                🧊
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="n">
                          {row.won}–{row.lost}
                        </td>
                        <td className="n text-arc-ink-faint">{row.settled ? pct(row.winPct, 0) : '—'}</td>
                        <td
                          className="n"
                          style={{
                            color:
                              row.net > 0
                                ? 'var(--color-arc-green)'
                                : row.net < 0
                                  ? 'var(--color-arc-red)'
                                  : undefined,
                          }}
                        >
                          {row.net === 0 ? '—' : money(row.net, { sign: true })}
                        </td>
                        <td className="n text-arc-ink-faint">
                          {row.live ? (
                            <>
                              <span className="hidden sm:inline">{row.live} · </span>
                              {row.exposure ? money(row.exposure) : 'dare'}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {h2h.length > 0 && (
              <Panel title="who owns whom" subtitle="Settled head-to-head records.">
                <table className="out">
                  <thead>
                    <tr>
                      <th>Matchup</th>
                      <th className="n">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2h.map((row) => (
                      <tr key={`${row.a}-${row.b}`}>
                        <td>
                          <span style={{ color: managerColor(row.a) }}>{nameOf(row.a)}</span>
                          <span className="text-arc-ink-faint"> vs </span>
                          <span style={{ color: managerColor(row.b) }}>{nameOf(row.b)}</span>
                        </td>
                        <td className="n">
                          {row.aWins}–{row.bWins}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>
        )}
      </div>

      {editing && (
        <BetEditor
          bet={editing}
          sides={[editing.proposer, editing.opponent].map((id) => ({ id, name: nameOf(id) }))}
          unlocked={unlocked}
          busy={busy === editing.id}
          error={editorFault}
          onCancel={() => setEditing(null)}
          onSave={(edit, winner) => void correct(editing, edit, winner)}
          onDelete={() => void remove(editing)}
        />
      )}

      {celebrate > 0 && (
        <div key={celebrate} className="pointer-events-none fixed inset-0 z-40">
          <Confetti count={22} />
        </div>
      )}

      <p className="mt-6 text-[12px] leading-relaxed text-arc-ink-faint">
        Bets live in their own repository, so the league password can only ever touch this board —
        never keepers, trades, or cash. Every post, acceptance, and ruling is a commit;{' '}
        <a
          className="text-arc-green underline underline-offset-2"
          href={betsRepoUrl()}
          target="_blank"
          rel="noreferrer noopener"
        >
          the full history is public
        </a>
        . The shared password carries no identity, so pick your own name honestly — the timestamps
        are the referee, and every slip prints its own.
        {unlocked && (
          <>
            {' '}
            <button
              type="button"
              className="-my-2 inline-flex min-h-[40px] items-center px-1 underline underline-offset-2"
              onClick={() => {
                setLeagueToken(null)
                setUnlocked(false)
              }}
            >
              Lock this device
            </button>
          </>
        )}
      </p>
    </>
  )
}
