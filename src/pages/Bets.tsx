import { Fragment, useEffect, useMemo, useState } from 'react'
import PixelMugshot from '../components/PixelMugshot'
import { Chip, Panel, PageHeader, Scroller, Stat } from '../components/ui'
import { Confetti } from '../components/effects'
import FireFrame from '../components/FireFrame'
import { play } from '../lib/sfx'
import { animationsDisabled } from '../lib/motion'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { money, pct, shortDate } from '../lib/format'
import {
  applyResults,
  betEditOf,
  betRecords,
  editedBet,
  headToHead,
  isNewBet,
  loserOf,
  newBetId,
  openDebts,
  stakeLabel,
  venmoUrl,
  type Bet,
  type BetEdit,
  type BetsFile,
  type Debt,
  type StakeKind,
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

/**
 * The book. Anyone with the league password can propose a bet and accept one
 * against them; only the commissioner settles. Bets live in their own repo,
 * so posting one shows up on the next refresh rather than waiting on a
 * Pages deploy.
 */
export default function Bets() {
  const { league, managers, leagueVault, betResults } = useLeagueData()
  const { commissioner, save } = useLeague()
  const active = useMemo(() => managers.filter((m) => m.active), [managers])

  const [file, setFile] = useState<BetsFile | null>(null)
  const [unlocked, setUnlocked] = useState(canPostBets)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  // The bet the commissioner is correcting, if any.
  const [editing, setEditing] = useState<Bet | null>(null)
  // Which tile on the board is unfolded into a full slip.
  const [open, setOpen] = useState<string | null>(null)
  // Bumped on a settle so the confetti remounts and fires again.
  const [celebrate, setCelebrate] = useState(0)

  useEffect(() => {
    void readBets().then(setFile)
  }, [])

  // Winners come only from the commissioner-only results file.
  const bets = useMemo(
    () => applyResults(file?.bets ?? [], betResults.results),
    [file, betResults],
  )
  const season = league.currentSeason
  const proposed = bets.filter((b) => b.status === 'proposed')
  const live = bets.filter((b) => b.status === 'live')
  const settled = bets
    .filter((b) => b.status === 'settled')
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''))
  const records = useMemo(() => betRecords(bets), [bets])
  const h2h = useMemo(() => headToHead(bets), [bets])
  const debts = useMemo(() => openDebts(bets), [bets])
  const handleOf = (id: ManagerId) => managers.find((m) => m.id === id)?.venmo

  const riding = live.reduce((sum, b) => sum + (b.stakeKind === 'cash' ? b.stake : 0), 0)
  const biggest = [...bets]
    .filter((b) => b.stakeKind === 'cash')
    .sort((a, b) => b.stake - a.stake)[0]
  const hottest = [...records].sort((a, b) => b.streak - a.streak)[0]

  // Recent action, newest first, for the tape.
  const tape = [...bets]
    .filter((b) => b.status === 'settled' || b.status === 'live')
    .sort((a, b) => (b.settledAt ?? b.acceptedAt ?? '').localeCompare(a.settledAt ?? a.acceptedAt ?? ''))
    .slice(0, 18)

  async function mutate(update: (current: BetsFile) => BetsFile, message: string, id: string) {
    setBusy(id)
    setError(null)
    try {
      setFile(await saveBets(update, message))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  async function unlock() {
    if (!leagueVault) return
    setBusy('unlock')
    setError(null)
    try {
      await unlockLeague(leagueVault, password)
      setUnlocked(true)
      setPassword('')
      // Now that we hold a token, re-read through the API — raw's CDN copy
      // can be up to five minutes behind.
      setFile(await readBets())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unlock.')
    } finally {
      setBusy(null)
    }
  }

  const accept = (bet: Bet) =>
    mutate(
      (current) => ({
        ...current,
        bets: current.bets.map((b) =>
          b.id === bet.id ? { ...b, status: 'live', acceptedAt: new Date().toISOString() } : b,
        ),
      }),
      `Bet accepted: ${managerName(managers, bet.opponent)} vs ${managerName(managers, bet.proposer)}`,
      bet.id,
    )

  /**
   * Settling writes to the MAIN repo, not the bets repo — so it needs the
   * commissioner's token. The league password cannot reach this file.
   */
  const settle = async (bet: Bet, winner: ManagerId) => {
    setBusy(bet.id)
    setError(null)
    try {
      await save<BetResultsFile>(
        'bet-results.json',
        (current) => ({
          results: [
            ...current.results.filter((r) => r.betId !== bet.id),
            { betId: bet.id, winner, settledAt: new Date().toISOString() },
          ],
        }),
        `Bet settled: ${managerName(managers, winner)} wins`,
      )
      play('roar')
      if (!animationsDisabled()) setCelebrate((n) => n + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the result.')
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
      `Bet debt paid: ${managerName(managers, debt.from)} → ${managerName(managers, debt.to)} ${money(debt.amount)}`,
      `debt-${debt.from}-${debt.to}`,
    )

  const drop = (bet: Bet) =>
    mutate(
      (current) => ({ ...current, bets: current.bets.filter((b) => b.id !== bet.id) }),
      `Bet withdrawn: ${managerName(managers, bet.proposer)} vs ${managerName(managers, bet.opponent)}`,
      bet.id,
    )

  const matchup = (bet: Bet) =>
    `${managerName(managers, bet.proposer)} vs ${managerName(managers, bet.opponent)}`

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
    setError(null)
    try {
      const now = new Date().toISOString()
      // Edit the STORED bet, never the one applyResults has already folded a
      // winner into — the results file stays the only source of settlements.
      const stored = file?.bets.find((b) => b.id === bet.id)
      if (stored && JSON.stringify(editedBet(stored, edit, now)) !== JSON.stringify(stored)) {
        setFile(
          await saveBets(
            (current) => ({
              ...current,
              bets: current.bets.map((b) => (b.id === bet.id ? editedBet(b, edit, now) : b)),
            }),
            `Bet corrected by the commissioner: ${matchup(bet)}`,
          ),
        )
      }

      if (winner !== bet.winner) {
        await save<BetResultsFile>(
          'bet-results.json',
          (current) => ({
            results: [
              ...current.results.filter((r) => r.betId !== bet.id),
              ...(winner
                ? [{ betId: bet.id, winner, settledAt: bet.settledAt ?? now }]
                : []),
            ],
          }),
          winner
            ? `Bet result corrected: ${managerName(managers, winner)} wins`
            : `Bet reopened: ${matchup(bet)}`,
        )
      }
      setEditing(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that correction.')
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
    setError(null)
    try {
      setFile(
        await saveBets(
          (current) => ({ ...current, bets: current.bets.filter((b) => b.id !== bet.id) }),
          `Bet deleted by the commissioner: ${matchup(bet)}`,
        ),
      )
      if (betResults.results.some((r) => r.betId === bet.id)) {
        await save<BetResultsFile>(
          'bet-results.json',
          (current) => ({ results: current.results.filter((r) => r.betId !== bet.id) }),
          `Bet result removed: ${matchup(bet)}`,
        )
      }
      setEditing(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that bet.')
    } finally {
      setBusy(null)
    }
  }

  /** The commissioner's way into the editor. Icon-only — slip footers are tight. */
  const EditButton = ({ bet }: { bet: Bet }) => (
    <button
      type="button"
      className="btn min-h-[34px] px-2.5 py-1"
      disabled={busy === bet.id}
      onClick={() => setEditing(bet)}
      aria-label={`Edit or delete the bet: ${bet.terms}`}
      title="Edit or delete this bet"
    >
      ✎
    </button>
  )

  /**
   * Pointer-tracked 3D tilt with a foil catch-light, holo-card style. Vars
   * feed the CSS transform; reduced motion leaves the card flat.
   */
  const tiltHandlers = {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (animationsDisabled()) return
      const el = event.currentTarget
      const box = el.getBoundingClientRect()
      const px = (event.clientX - box.left) / box.width - 0.5
      const py = (event.clientY - box.top) / box.height - 0.5
      el.style.setProperty('--ty', `${(px * 9).toFixed(2)}deg`)
      el.style.setProperty('--tx', `${(-py * 7).toFixed(2)}deg`)
      el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`)
      el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`)
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      const el = event.currentTarget
      el.style.removeProperty('--ty')
      el.style.removeProperty('--tx')
    },
  }

  /**
   * A matchup slab: square card split on the diagonal, each manager holding
   * their triangle in their own colour with their portrait in the corner,
   * the stake on a ribbon along the bottom. Tap to unfold the full slip.
   */
  const BetTile = ({ bet, coals = false }: { bet: Bet; coals?: boolean }) => {
    const [a, b] = [bet.proposer, bet.opponent]
    const [colorA, colorB] = [managerColor(a), managerColor(b)]
    const active = open === bet.id
    return (
      <button
        type="button"
        className="bet-tile"
        style={
          active
            ? { borderColor: colorA, boxShadow: `0 12px 30px rgba(0,0,0,.5), 0 0 16px ${colorB}44` }
            : undefined
        }
        aria-expanded={active}
        aria-label={`${managerName(managers, a)} versus ${managerName(managers, b)}, ${stakeLabel(bet)} — details`}
        onClick={() => setOpen(active ? null : bet.id)}
        {...tiltHandlers}
      >
        <span className="flex h-[3px]">
          <span className="flex-1" style={{ background: colorA }} />
          <span className="flex-1" style={{ background: colorB }} />
        </span>
        <span className="tile-face">
          <span className="tile-half tile-half-a" style={{ ['--half' as string]: `${colorA}2e` }} />
          <span className="tile-half tile-half-b" style={{ ['--half' as string]: `${colorB}2e` }} />
          <span className="tile-seam" aria-hidden />
          <span className="absolute top-[7%] left-[5%] flex w-[38%] flex-col items-start gap-1">
            <span className="tile-mug w-full overflow-hidden rounded-md border border-arc-line">
              <PixelMugshot seed={a} scale={3} />
            </span>
            <span
              className="arcade max-w-full truncate text-[11px] uppercase"
              style={{ color: colorA }}
            >
              {managerName(managers, a)}
            </span>
          </span>
          <span className="absolute right-[5%] bottom-[6%] flex w-[38%] flex-col items-end gap-1">
            <span
              className="arcade max-w-full truncate text-[11px] uppercase"
              style={{ color: colorB }}
            >
              {managerName(managers, b)}
            </span>
            <span className="tile-mug w-full overflow-hidden rounded-md border border-arc-line">
              <PixelMugshot seed={b} scale={3} />
            </span>
          </span>
          <span className="tile-vs arcade" aria-hidden>
            VS
          </span>
          {coals && <span className="tile-coals" aria-hidden />}
          <span className="tile-shine" aria-hidden />
        </span>
        <span className="tile-bar">
          <span
            className={`tnum min-w-0 flex-1 truncate leading-tight font-semibold ${
              bet.stakeKind === 'cash'
                ? 'text-[15px] text-arc-green'
                : 'text-[12px] text-[var(--color-arc-orange)]'
            }`}
          >
            {stakeLabel(bet)}
          </span>
          {bet.status === 'live' ? (
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] tracking-[0.14em] whitespace-nowrap text-arc-green uppercase">
              <span className="live-dot" aria-hidden />
              Live
            </span>
          ) : (
            <span className="text-[10px] tracking-[0.14em] text-[var(--color-arc-orange)] uppercase">
              Open
            </span>
          )}
        </span>
      </button>
    )
  }

  /**
   * The checkerboard. Tiles flow in a dense grid; the open one unfolds the
   * full slip across the next row, app-store style. Fresh live bets burn and
   * are dealt first, so the fire sits on the top row where it has headroom.
   */
  const BetBoard = ({
    bets,
    actions,
  }: {
    bets: Bet[]
    actions: (bet: Bet) => React.ReactNode
  }) => {
    const burning = (bet: Bet) => bet.status === 'live' && isNewBet(bet) && !animationsDisabled()
    const dealt = [...bets].sort((x, y) => Number(burning(y)) - Number(burning(x)))
    return (
      <div
        className={`grid grid-cols-2 px-5 sm:grid-cols-3 xl:grid-cols-4 ${
          dealt.some(burning) ? 'gap-8 pt-11 pb-8' : 'gap-3 py-5'
        }`}
      >
        {dealt.map((bet) => (
          <Fragment key={bet.id}>
            {burning(bet) ? (
              <FireFrame>
                <BetTile bet={bet} />
              </FireFrame>
            ) : (
              // Live but past the blaze: banked down to smouldering coals.
              <BetTile bet={bet} coals={bet.status === 'live'} />
            )}
            {open === bet.id && (
              <div className="unfold col-span-full">
                <Slip bet={bet}>
                  {actions(bet)}
                  <button
                    type="button"
                    className="ml-auto px-1 text-[18px] leading-none text-arc-ink-faint hover:text-arc-ink"
                    onClick={() => setOpen(null)}
                    aria-label="Collapse"
                  >
                    ×
                  </button>
                </Slip>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    )
  }

  const face = (id: ManagerId, size = 2) => (
    <span className="shrink-0 overflow-hidden rounded-md border border-arc-line">
      <PixelMugshot seed={id} scale={size} />
    </span>
  )

  /**
   * A matchup card in the sportsbook idiom: the two managers as opposing
   * sides under their own colours, the stake as a big tile, action beneath.
   */
  const Slip = ({ bet, children }: { bet: Bet; children?: React.ReactNode }) => {
    const won = (id: ManagerId) => bet.status === 'settled' && bet.winner === id
    const lost = (id: ManagerId) => bet.status === 'settled' && bet.winner !== null && !won(id)
    const halves = [bet.proposer, bet.opponent] as const

    const card = (
      <div className="overflow-hidden rounded-xl border border-arc-line bg-arc-panel transition-colors hover:border-arc-ink-faint">
        {/* team colours across the top, like a game card */}
        <div className="flex h-1">
          {halves.map((id) => (
            <span key={id} className="flex-1" style={{ background: managerColor(id) }} />
          ))}
        </div>

        <div className="relative flex items-stretch">
          {halves.map((id, i) => (
            <div
              key={id}
              className={`flex flex-1 items-center gap-2.5 p-3 ${i ? 'flex-row-reverse text-right' : ''}`}
              style={{ opacity: lost(id) ? 0.45 : 1 }}
            >
              {face(id, 2)}
              <span className="min-w-0">
                <span
                  className="block truncate text-[15px] leading-tight"
                  style={{ color: managerColor(id) }}
                >
                  {managerName(managers, id)}
                </span>
                {won(id) && (
                  <span className="arcade text-[11px] text-arc-green">WON</span>
                )}
              </span>
            </div>
          ))}
          <span className="arcade absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-arc-line bg-arc-bg px-2 py-0.5 text-[11px] text-arc-ink-faint">
            VS
          </span>
        </div>

        <p className="px-3 pb-3 text-[14px] leading-snug text-arc-ink">{bet.terms}</p>

        <div className="flex items-stretch border-t border-arc-line">
          <div className="flex min-w-[104px] flex-col justify-center border-r border-arc-line px-3 py-2">
            <span className="text-[10px] tracking-[0.14em] text-arc-ink-faint uppercase">
              {bet.stakeKind === 'cash' ? 'Each' : 'Forfeit'}
            </span>
            <span
              className={`tnum text-[20px] leading-tight ${
                bet.stakeKind === 'cash' ? 'text-arc-green' : 'text-[var(--color-arc-orange)]'
              }`}
            >
              {stakeLabel(bet)}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 px-3 py-2">
            {bet.resolves && (
              <span className="text-[11px] text-arc-ink-faint">{bet.resolves}</span>
            )}
            {children}
          </div>
        </div>
      </div>
    )

    return card
  }

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
          ) : undefined
        }
      />

      {tape.length > 0 && (
        <div className="marquee-host relative -mx-4 mb-6 overflow-hidden border-y border-arc-line bg-arc-panel sm:-mx-6 lg:-mx-9">
          <div
            className="marquee flex w-max items-center gap-7 py-2"
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
                    <span className="text-arc-ink-soft">{managerName(managers, b.winner)}</span>
                    <span className="text-arc-ink-faint">beat</span>
                    <span className="text-arc-ink-soft">
                      {managerName(managers, loserOf(b)!)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[var(--color-arc-orange)]">●</span>
                    <span className="text-arc-ink-soft">
                      {managerName(managers, b.proposer)} v {managerName(managers, b.opponent)}
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
        </div>
      )}

      {bets.length > 0 && (
        <div className="line-in mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
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
            hint={
              biggest
                ? `${managerName(managers, biggest.proposer)} v ${managerName(managers, biggest.opponent)}`
                : undefined
            }
          />
          <Stat
            label="Hot hand"
            value={hottest && hottest.streak > 0 ? managerName(managers, hottest.manager) : '—'}
            hint={
              hottest && hottest.streak > 0
                ? `${hottest.streak} straight`
                : 'Nobody on a run'
            }
            tone={hottest && hottest.streak > 0 ? 'gold' : 'default'}
          />
        </div>
      )}

      {/* Unlock */}
      {!unlocked && (
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
            </div>
          )}
        </Panel>
      )}

      {composing && unlocked && (
        <div className="mt-6">
          <Composer
            season={season}
            managers={active.map((m) => ({ id: m.id, name: m.displayName }))}
            busy={busy === 'new'}
            onSubmit={(bet) =>
              mutate(
                (current) => ({ ...current, bets: [...current.bets, bet] }),
                `Bet proposed: ${managerName(managers, bet.proposer)} vs ${managerName(managers, bet.opponent)}`,
                'new',
              ).then(() => setComposing(false))
            }
          />
        </div>
      )}

      {error && (
        <p className="mt-4 border-l-2 border-[var(--color-arc-red)] pl-3 text-[12.5px] text-[var(--color-arc-red)]">
          {error}
        </p>
      )}

      {file === null ? (
        <Panel title="loading">
          <p className="px-5 py-6 text-[13px] text-arc-ink-faint italic">Reading the book…</p>
        </Panel>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            title="on the table"
            subtitle={
              proposed.length
                ? 'Proposed and waiting to be taken. Tap Accept if it is against you.'
                : 'Nothing pending. Propose one.'
            }
          >
            {proposed.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-arc-ink-faint italic">No open proposals.</p>
            ) : (
              <BetBoard
                bets={proposed}
                actions={(bet) => (
                  <>
                    <Chip tone="flag">Awaiting {managerName(managers, bet.opponent)}</Chip>
                    {unlocked && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary min-h-[34px] px-3 py-1"
                          disabled={busy === bet.id}
                          onClick={() => void accept(bet)}
                        >
                          {busy === bet.id ? 'Saving…' : "I'm in"}
                        </button>
                        <button
                          type="button"
                          className="btn min-h-[34px] px-3 py-1"
                          disabled={busy === bet.id}
                          onClick={() => void drop(bet)}
                        >
                          Withdraw
                        </button>
                      </>
                    )}
                  </>
                )}
              />
            )}
          </Panel>

          <Panel
            title="live action"
            subtitle={`${live.length} bet${live.length === 1 ? '' : 's'} riding. ${
              commissioner ? 'Tap a winner when it resolves.' : 'The commissioner calls these.'
            }`}
          >
            {live.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-arc-ink-faint italic">
                Nothing riding right now.
              </p>
            ) : (
              <BetBoard
                bets={live}
                actions={(bet) => (
                  <>
                    <Chip tone="up">Live</Chip>
                    {commissioner && (
                      <>
                        <span className="text-[12px] text-arc-ink-faint">Winner:</span>
                        {[bet.proposer, bet.opponent].map((id) => (
                          <button
                            key={id}
                            type="button"
                            className="btn min-h-[34px] px-3 py-1"
                            disabled={busy === bet.id}
                            onClick={() => void settle(bet, id)}
                          >
                            {managerName(managers, id)}
                          </button>
                        ))}
                        <EditButton bet={bet} />
                      </>
                    )}
                  </>
                )}
              />
            )}
          </Panel>

          {settled.length > 0 && (
            <Panel
              title="settled"
              subtitle={
                commissioner
                  ? 'The record. Winners in green. Yours to correct — ✎ fixes the terms, the stake, or the wrong name called.'
                  : 'The record. Winners in green.'
              }
            >
              <Scroller>
                <table className="out">
                  <thead>
                    <tr>
                      <th>Bet</th>
                      <th>Winner</th>
                      <th>Loser</th>
                      <th className="n">Stake</th>
                      <th className="n">Settled</th>
                      {commissioner && <th className="n">Fix</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {settled.map((bet) => (
                      <tr key={bet.id}>
                        <td className="max-w-[280px] truncate">{bet.terms}</td>
                        <td className="text-arc-green">{managerName(managers, bet.winner!)}</td>
                        <td className="text-arc-ink-faint">
                          {managerName(managers, loserOf(bet)!)}
                        </td>
                        <td className="n">{stakeLabel(bet)}</td>
                        <td className="n text-arc-ink-faint">
                          {bet.settledAt ? shortDate(bet.settledAt) : '—'}
                        </td>
                        {commissioner && (
                          <td className="n">
                            <button
                              type="button"
                              className="px-1 text-[15px] leading-none text-arc-ink-faint hover:text-arc-green"
                              disabled={busy === bet.id}
                              onClick={() => setEditing(bet)}
                              aria-label={`Edit or delete the bet: ${bet.terms}`}
                              title="Edit or delete this bet"
                            >
                              ✎
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </Panel>
          )}

          <Panel
            title="the tab"
            subtitle="Betting debts only — kept apart from league dues and payouts. Wins and losses between the same two people net down to one number."
          >
            {debts.length === 0 ? (
              <p className="px-5 py-6 text-[14px] text-arc-green">
                All square. Nobody owes anybody a dollar.
              </p>
            ) : (
              <ul>
                {debts.map((debt) => {
                  const key = `debt-${debt.from}-${debt.to}`
                  const pay = venmoUrl(
                    handleOf(debt.to),
                    debt.amount,
                    `WACL side bet — ${managerName(managers, debt.from)} to ${managerName(managers, debt.to)}`,
                  )
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-3 border-b border-arc-line/40 px-5 py-3 last:border-b-0"
                    >
                      {face(debt.from, 1.6)}
                      <span className="min-w-0 flex-1 text-[14px]">
                        <b style={{ color: managerColor(debt.from) }}>
                          {managerName(managers, debt.from)}
                        </b>
                        <span className="text-arc-ink-faint"> owes </span>
                        <b style={{ color: managerColor(debt.to) }}>
                          {managerName(managers, debt.to)}
                        </b>
                        <span className="block text-[11px] text-arc-ink-faint">
                          across {debt.betIds.length} settled bet
                          {debt.betIds.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[17px] text-[var(--color-arc-red)]">
                        {money(debt.amount)}
                      </span>
                      {pay && (
                        <a
                          href={pay}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="arcade shrink-0 rounded-md px-2.5 py-1 text-[12px]"
                          style={{ background: 'var(--color-arc-green)', color: '#06210a' }}
                        >
                          PAY
                        </a>
                      )}
                      {unlocked && (
                        <button
                          type="button"
                          className="btn min-h-[34px] shrink-0 px-3 py-1"
                          disabled={busy === key}
                          onClick={() => void settleUp(debt)}
                        >
                          {busy === key ? 'Saving…' : 'Mark paid'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {records.length > 0 && (
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <Panel title="the sharps" subtitle="Career betting records, by money won.">
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
                        <td style={{ color: managerColor(row.manager) }}>
                          {managerName(managers, row.manager)}
                          {row.streak >= 3 && (
                            <span title={`${row.streak} straight`} className="ml-1.5">
                              🔥
                            </span>
                          )}
                          {row.streak <= -3 && (
                            <span title={`${-row.streak} straight losses`} className="ml-1.5 opacity-60">
                              🧊
                            </span>
                          )}
                        </td>
                        <td className="n">
                          {row.won}–{row.lost}
                        </td>
                        <td className="n text-arc-ink-faint">
                          {row.settled ? pct(row.winPct, 0) : '—'}
                        </td>
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
                          {row.live ? `${row.live} · ${money(row.exposure)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                            <span style={{ color: managerColor(row.a) }}>
                              {managerName(managers, row.a)}
                            </span>
                            <span className="text-arc-ink-faint"> vs </span>
                            <span style={{ color: managerColor(row.b) }}>
                              {managerName(managers, row.b)}
                            </span>
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
      )}

      {editing && (
        <BetEditor
          bet={editing}
          sides={[editing.proposer, editing.opponent].map((id) => ({
            id,
            name: managerName(managers, id),
          }))}
          unlocked={unlocked}
          busy={busy === editing.id}
          error={error}
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
        are the referee.
        {unlocked && (
          <>
            {' '}
            <button
              type="button"
              className="underline underline-offset-2"
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

/* ------------------------------------------------------------------ */

const TEMPLATES = [
  'I beat you head-to-head in week __',
  'I finish above you in the final standings',
  'My first-round pick outscores yours this season',
  'You miss the playoffs',
]

function Composer({
  season,
  managers,
  busy,
  onSubmit,
}: {
  season: number
  managers: { id: ManagerId; name: string }[]
  busy: boolean
  onSubmit: (bet: Bet) => void
}) {
  const [proposer, setProposer] = useState('')
  const [opponent, setOpponent] = useState('')
  const [terms, setTerms] = useState('')
  const [stakeKind, setStakeKind] = useState<StakeKind>('cash')
  const [stake, setStake] = useState(20)
  const [forfeit, setForfeit] = useState('')
  const [resolves, setResolves] = useState('')

  const ready =
    proposer && opponent && proposer !== opponent && terms.trim() &&
    (stakeKind === 'cash' ? stake > 0 : forfeit.trim())

  return (
    <Panel title="propose a bet" subtitle="Pick your name, pick your mark, name the terms.">
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <label>
          <span className="label">You</span>
          <select className="field mt-1.5" value={proposer} onChange={(e) => setProposer(e.target.value)}>
            <option value="">Select…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Against</span>
          <select className="field mt-1.5" value={opponent} onChange={(e) => setOpponent(e.target.value)}>
            <option value="">Select…</option>
            {managers.filter((m) => m.id !== proposer).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <label className="sm:col-span-2">
          <span className="label">The bet</span>
          <input
            className="field mt-1.5"
            placeholder="Say exactly what has to happen"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
          <span className="mt-2 flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                className="rounded border border-arc-line px-2 py-1 text-[11px] text-arc-ink-faint hover:border-arc-green hover:text-arc-green"
                onClick={() => setTerms(t)}
              >
                {t}
              </button>
            ))}
          </span>
        </label>

        <label>
          <span className="label">Stake</span>
          <select
            className="field mt-1.5"
            value={stakeKind}
            onChange={(e) => setStakeKind(e.target.value as StakeKind)}
          >
            <option value="cash">Cash</option>
            <option value="forfeit">Forfeit / dare</option>
          </select>
        </label>
        {stakeKind === 'cash' ? (
          <label>
            <span className="label">Amount each</span>
            <input
              type="number"
              min={1}
              className="field tnum mt-1.5"
              value={stake}
              onChange={(e) => setStake(Number(e.target.value) || 0)}
            />
            <span className="mt-2 flex flex-wrap gap-1.5">
              {[10, 20, 50, 100].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="tnum rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                  style={
                    stake === amount
                      ? { borderColor: 'var(--color-arc-green)', color: '#06210a', background: 'var(--color-arc-green)' }
                      : { borderColor: 'var(--color-arc-line)', color: 'var(--color-arc-ink-soft)' }
                  }
                  onClick={() => setStake(amount)}
                >
                  ${amount}
                </button>
              ))}
            </span>
          </label>
        ) : (
          <label>
            <span className="label">Loser must…</span>
            <input
              className="field mt-1.5"
              placeholder="wear the jersey to the draft"
              value={forfeit}
              onChange={(e) => setForfeit(e.target.value)}
            />
          </label>
        )}

        <label className="sm:col-span-2">
          <span className="label">Resolves</span>
          <input
            className="field mt-1.5"
            placeholder="Week 3 · End of season · Draft night"
            value={resolves}
            onChange={(e) => setResolves(e.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-arc-line px-5 py-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready || busy}
          onClick={() =>
            onSubmit({
              id: newBetId(),
              season,
              proposer,
              opponent,
              terms: terms.trim(),
              stakeKind,
              stake: stakeKind === 'cash' ? stake : 0,
              forfeit: stakeKind === 'forfeit' ? forfeit.trim() : '',
              resolves: resolves.trim(),
              status: 'proposed',
              winner: null,
              proposedAt: new Date().toISOString(),
            })
          }
        >
          {busy ? 'Posting…' : 'Post it'}
        </button>
        <span className="text-[12px] text-arc-ink-faint">
          It lands on the table until they take it.
        </span>
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The commissioner's correction desk for one bet.
 *
 * A bet's two halves live in two repos: the terms and the stake in the
 * league-writable bets repo, the winner in the commissioner-only results
 * file. So a commissioner who hasn't entered the league password on this
 * device can still overturn a call — they just can't rewrite the terms or
 * delete the bet until they do, and the panel says so rather than failing at
 * the save.
 */
function BetEditor({
  bet,
  sides,
  unlocked,
  busy,
  error,
  onCancel,
  onSave,
  onDelete,
}: {
  bet: Bet
  sides: { id: ManagerId; name: string }[]
  unlocked: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (edit: BetEdit, winner: ManagerId | null) => void
  onDelete: () => void
}) {
  const initial = useMemo(() => betEditOf(bet), [bet])
  const [edit, setEdit] = useState<BetEdit>(initial)
  const [winner, setWinner] = useState<ManagerId | null>(bet.winner)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const set = (patch: Partial<BetEdit>) => setEdit((current) => ({ ...current, ...patch }))
  const cash = edit.stakeKind === 'cash'
  const dirty = JSON.stringify(edit) !== JSON.stringify(initial) || winner !== bet.winner
  const ready = Boolean(edit.terms.trim()) && (cash ? edit.stake > 0 : Boolean(edit.forfeit.trim()))

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-arc-bg-deep/85 px-3 py-[6vh] backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit bet"
    >
      <div className="win rise-in w-full max-w-xl">
        <div className="win-head">
          <span className="label">Editing a bet — {sides.map((s) => s.name).join(' v ')}</span>
          <button
            type="button"
            className="px-1 text-[18px] leading-none text-arc-ink-faint hover:text-arc-ink"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">The bet</span>
            <input
              className="field mt-1.5"
              value={edit.terms}
              disabled={!unlocked}
              onChange={(event) => set({ terms: event.target.value })}
            />
          </label>

          <label>
            <span className="label">Stake</span>
            <select
              className="field mt-1.5"
              value={edit.stakeKind}
              disabled={!unlocked}
              onChange={(event) => set({ stakeKind: event.target.value as StakeKind })}
            >
              <option value="cash">Cash</option>
              <option value="forfeit">Forfeit / dare</option>
            </select>
          </label>
          {cash ? (
            <label>
              <span className="label">Amount each</span>
              <input
                type="number"
                min={1}
                className="field tnum mt-1.5"
                value={edit.stake}
                disabled={!unlocked}
                onChange={(event) => set({ stake: Number(event.target.value) || 0 })}
              />
            </label>
          ) : (
            <label>
              <span className="label">Loser must…</span>
              <input
                className="field mt-1.5"
                value={edit.forfeit}
                disabled={!unlocked}
                onChange={(event) => set({ forfeit: event.target.value })}
              />
            </label>
          )}

          <label className="sm:col-span-2">
            <span className="label">Resolves</span>
            <input
              className="field mt-1.5"
              value={edit.resolves}
              disabled={!unlocked}
              onChange={(event) => set({ resolves: event.target.value })}
            />
          </label>

          <div className="sm:col-span-2">
            <span className="label">Winner</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {sides.map((side) => (
                <button
                  key={side.id}
                  type="button"
                  className="btn min-h-[36px] px-3 py-1"
                  style={
                    winner === side.id
                      ? {
                          borderColor: 'var(--color-arc-green)',
                          background: 'var(--color-arc-green)',
                          color: '#06210a',
                        }
                      : undefined
                  }
                  onClick={() => setWinner(side.id)}
                >
                  {side.name}
                </button>
              ))}
              <button
                type="button"
                className="btn min-h-[36px] px-3 py-1"
                style={winner === null ? { borderColor: 'var(--color-arc-orange)' } : undefined}
                onClick={() => setWinner(null)}
              >
                Nobody yet
              </button>
            </div>
            <p className="mt-2 text-[12px] text-arc-ink-faint">
              {winner === null
                ? 'Clearing the winner puts the bet back on the live board.'
                : 'The result file is the only place a winner can come from, so this is the call of record.'}
            </p>
          </div>

          {cash && (
            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                checked={edit.paid}
                disabled={!unlocked}
                onChange={(event) => set({ paid: event.target.checked })}
              />
              <span className="text-[13.5px]">
                Loser has paid up
                <span className="block text-[12px] text-arc-ink-faint">
                  Unticking it puts the money back on the tab.
                </span>
              </span>
            </label>
          )}
        </div>

        {!unlocked && (
          <p className="border-t border-arc-line px-5 py-3 text-[12.5px] text-[var(--color-arc-orange)]">
            Enter the league password on this device to change the terms, the stake, or to delete
            the bet. The winner can be corrected without it.
          </p>
        )}
        {error && (
          <p className="border-t border-arc-line px-5 py-3 text-[12.5px] text-[var(--color-arc-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-arc-line px-5 py-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || !ready || busy}
            onClick={() => onSave(edit, winner)}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {unlocked && (
            <span className="ml-auto flex items-center gap-2">
              {confirming && (
                <span className="text-[12px] text-arc-ink-faint">Wipes it from the record.</span>
              )}
              <button
                type="button"
                className={`btn min-h-[36px] px-3 py-1 ${confirming ? 'btn-danger' : ''}`}
                style={
                  confirming
                    ? undefined
                    : { borderColor: 'var(--color-arc-red)', color: 'var(--color-arc-red)' }
                }
                disabled={busy}
                onClick={() => (confirming ? onDelete() : setConfirming(true))}
              >
                {busy ? 'Working…' : confirming ? 'Delete for good' : 'Delete bet'}
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
