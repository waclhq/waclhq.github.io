import { useEffect, useRef, useState } from 'react'
import { Panel } from '../ui'
import { fairOdds, fractionText, newBetId, oddsText, parseOdds, winAt, type Bet, type StakeKind } from '../../lib/bets'
import { animationsDisabled } from '../../lib/motion'
import { useLivePoints } from '../../lib/points'
import type { ManagerId } from '../../lib/types'
import { landOn } from './land'

/** The prices most bets between friends land on, as people say them. */
const QUICK_ODDS = ['Even', '2:1', '3:1', '4:1', '5:1', '1:2', '+150', '\u2212150']

const TEMPLATES = [
  'I beat you head-to-head in week __',
  'I finish above you in the final standings',
  'My first-round pick outscores yours this season',
  'You miss the playoffs',
]

/** The name this device posted under last time — the shared password has none. */
const REMEMBER_KEY = 'wacl.bets.me'

function rememberedProposer(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Propose a bet. Your seat fills in "You"; the form scrolls itself into view
 * the moment it opens, so the tap on the header button lands on the fields
 * rather than on a button that changed its label.
 */
export default function Composer({
  season,
  managers,
  busy,
  me,
  error,
  onSubmit,
}: {
  season: number
  managers: { id: ManagerId; name: string }[]
  busy: boolean
  me: ManagerId | null
  error?: string | null
  onSubmit: (bet: Bet) => void
}) {
  const known = (id: string) => managers.some((m) => m.id === id)
  const [proposer, setProposer] = useState(() => {
    const preferred = me && known(me) ? me : rememberedProposer()
    return known(preferred) ? preferred : ''
  })
  const [opponent, setOpponent] = useState('')
  const [terms, setTerms] = useState('')
  const [stakeKind, setStakeKind] = useState<StakeKind>('cash')
  // Kept as typed so a half-entered amount is never coerced to a sticky zero.
  const [stakeText, setStakeText] = useState('20')
  // Your price, as typed. Blank is even money.
  const [oddsInput, setOddsInput] = useState('')
  const [forfeit, setForfeit] = useState('')
  const [resolves, setResolves] = useState('')
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (host.current) landOn(host.current, animationsDisabled() ? 'auto' : 'smooth')
  }, [])

  const stake = Math.round(Number(stakeText))
  const odds = oddsInput.trim() ? parseOdds(oddsInput) : 100
  const priced = odds !== null && Math.abs(odds) > 100
  const toWin = odds !== null && Number.isFinite(stake) && stake > 0 ? winAt(stake, odds) : null
  const nameOf = (id: string) => managers.find((m) => m.id === id)?.name ?? 'They'

  // The live line: when the two of you play each other this week, the
  // matchup's own win odds give a fair price for the head-to-head.
  const board = useLivePoints()
  const line = (() => {
    if (!board || !proposer || !opponent) return null
    const m = board.matchups?.find(
      (x) => !x.settled && x.teams.some((t) => t.manager === proposer) && x.teams.some((t) => t.manager === opponent),
    )
    const side = m?.teams.find((t) => t.manager === proposer)
    return side ? { odds: fairOdds(side.winProb), pct: Math.round(side.winProb * 100), week: board.week } : null
  })()

  const ready =
    proposer &&
    opponent &&
    proposer !== opponent &&
    terms.trim() &&
    (stakeKind === 'cash' ? Number.isFinite(stake) && stake > 0 && toWin !== null : forfeit.trim())

  return (
    <div ref={host} className="scroll-mt-[124px] lg:scroll-mt-[72px]">
      <Panel
        id="propose"
        title="propose a bet"
        subtitle={
          me && proposer === me
            ? 'Your seat is in. Pick your mark, name the terms.'
            : 'Pick your name, pick your mark, name the terms.'
        }
      >
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <label>
            <span className="label">You</span>
            <select className="field mt-1.5" value={proposer} onChange={(e) => setProposer(e.target.value)}>
              <option value="">Select…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Against</span>
            <select className="field mt-1.5" value={opponent} onChange={(e) => setOpponent(e.target.value)}>
              <option value="">Select…</option>
              {managers
                .filter((m) => m.id !== proposer)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
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
                  className="inline-flex min-h-[40px] items-center rounded-md border border-arc-line px-2.5 text-[11.5px] text-arc-ink-soft hover:border-arc-green hover:text-arc-green"
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
              <span className="label">{priced ? 'You put up' : 'Amount each'}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="field tnum mt-1.5"
                value={stakeText}
                onChange={(e) => setStakeText(e.target.value)}
              />
              <span className="mt-2 flex flex-wrap gap-1.5">
                {[10, 20, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="tnum inline-flex min-h-[40px] items-center rounded-md border px-3 text-[12.5px] transition-colors"
                    aria-pressed={stake === amount}
                    style={
                      stake === amount
                        ? {
                            borderColor: 'var(--color-arc-green)',
                            color: 'var(--color-arc-bg-deep)',
                            background: 'var(--color-arc-green)',
                          }
                        : { borderColor: 'var(--color-arc-line)', color: 'var(--color-arc-ink-soft)' }
                    }
                    onClick={() => setStakeText(String(amount))}
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

          {stakeKind === 'cash' && (
            <div className="sm:col-span-2">
              <label>
                <span className="label">Your odds</span>
                <input
                  className="field tnum mt-1.5"
                  inputMode="text"
                  placeholder="Even · +150 · −200 · 4:1"
                  value={oddsInput}
                  aria-invalid={odds === null}
                  onChange={(e) => setOddsInput(e.target.value)}
                />
              </label>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_ODDS.map((price) => {
                  const even = price === 'Even'
                  const on = even ? odds !== null && !priced : odds === parseOdds(price)
                  return (
                    <button
                      key={price}
                      type="button"
                      className="tnum bk-odds-chip"
                      aria-pressed={on}
                      onClick={() => setOddsInput(even ? '' : price)}
                    >
                      {price}
                    </button>
                  )
                })}
                {line && (
                  <button
                    type="button"
                    className="tnum bk-odds-chip is-line"
                    aria-pressed={odds === line.odds}
                    title={`${nameOf(proposer)} is ${line.pct}% to win this week's matchup, on the live board`}
                    onClick={() => {
                      setOddsInput(line.odds === 100 ? '' : oddsText(line.odds))
                      if (!terms.trim() && line.week) setTerms(`I beat you head-to-head in week ${line.week}`)
                    }}
                  >
                    <span className="live-dot" aria-hidden />
                    Live line {oddsText(line.odds)}
                  </button>
                )}
              </span>
              <p className="bk-odds-say" aria-live="polite">
                {odds === null ? (
                  <span className="text-[var(--color-arc-red)]">
                    Not a price. Try Even, +150 or 4:1 (you're the underdog), or −200 or 1:2 (you're the favourite).
                  </span>
                ) : toWin === null ? (
                  'Set an amount to see who puts up what.'
                ) : priced ? (
                  <>
                    You put up <b>${stake}</b> to win <b>${toWin}</b>. {opponent ? `${nameOf(opponent)} puts` : 'They put'}{' '}
                    up <b>${toWin}</b> to win <b>${stake}</b>
                    {odds > 0 ? ' — you are the underdog' : ' — you are the favourite'}
                    {' '}({[fractionText(odds), oddsText(odds)].filter(Boolean).join(' · ')}).
                  </>
                ) : (
                  <>
                    Even money: <b>${stake}</b> each, winner takes it.
                  </>
                )}
              </p>
            </div>
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

        {error && (
          <p role="alert" className="border-t border-arc-line px-5 py-3 text-[12.5px] text-[var(--color-arc-red)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-arc-line px-5 py-4">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || busy}
            onClick={() => {
              try {
                localStorage.setItem(REMEMBER_KEY, proposer)
              } catch {
                /* private browsing */
              }
              onSubmit({
                id: newBetId(),
                season,
                proposer,
                opponent,
                terms: terms.trim(),
                stakeKind,
                stake: stakeKind === 'cash' ? stake : 0,
                ...(stakeKind === 'cash' && priced && toWin !== null && toWin !== stake ? { toWin } : {}),
                forfeit: stakeKind === 'forfeit' ? forfeit.trim() : '',
                resolves: resolves.trim(),
                status: 'proposed',
                winner: null,
                proposedAt: new Date().toISOString(),
              })
            }}
          >
            {busy ? 'Posting…' : 'Post it'}
          </button>
          <span className="text-[12px] text-arc-ink-faint">It lands on the table until they take it.</span>
        </div>
      </Panel>
    </div>
  )
}
