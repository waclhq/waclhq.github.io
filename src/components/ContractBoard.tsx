import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueData } from '../lib/data'
import { money } from '../lib/format'
import { useMe } from '../lib/me'
import { orderBlocks } from '../lib/ops-keepers'
import { contractYearsRemaining } from '../lib/rules'
import { playerSlug } from '../lib/search'
import type { ContractYear, KeeperBlock } from '../lib/types'
import ManagerTag from './ManagerTag'
import { useRevealed } from './ui'

/**
 * Every keeper contract as a bar running from the current season to its
 * expiry. Reading down a column shows how much of the league is committed in a
 * given year; reading across a team shows who is about to lose their core.
 *
 * Renders its own panel rather than <Panel>: the year ruler has to stick to
 * the viewport, and Panel's scroll wrapper (overflow) would pin it to itself.
 */
export default function ContractBoard({ year }: { year: number }) {
  const { keepers, managers, league } = useLeagueData()
  const me = useMe()
  const frame = useRef<HTMLElement>(null)
  const revealed = useRevealed(frame)
  const blocks = orderBlocks(keepers[String(year)] ?? [], managers, me)

  // Only show seasons a contract can actually reach. A kept player has already
  // advanced past year A, so the horizon is usually three columns, not four.
  const maxRemaining = Math.max(
    0,
    ...blocks.flatMap((block) =>
      block.keepers.map((pick) =>
        contractYearsRemaining(pick.contractYear as ContractYear | null),
      ),
    ),
  )
  const horizon = Array.from({ length: maxRemaining + 1 }, (_, offset) => year + offset)

  // A/B/C/D advanced by n seasons; null once the contract has expired.
  const ORDER: ContractYear[] = ['A', 'B', 'C', 'D']
  const letterAt = (current: ContractYear | null, offset: number): ContractYear | null => {
    if (!current) return null
    const index = ORDER.indexOf(current) + offset
    return index < ORDER.length ? ORDER[index] : null
  }

  const toneFor = (remaining: number) =>
    remaining >= 3
      ? 'var(--color-arc-green)'
      : remaining === 2
        ? 'var(--color-arc-cyan)'
        : remaining === 1
          ? 'var(--color-arc-orange)'
          : 'var(--color-arc-red)'

  // Total salary committed per future season, against the whole pool.
  const pool = league.baseDraftBudget * Math.max(1, blocks.length)
  const committed = horizon.map((target) =>
    blocks.reduce(
      (total, block) =>
        total +
        block.keepers.reduce((sum, pick) => {
          const remaining = contractYearsRemaining(pick.contractYear as ContractYear | null)
          return target <= year + remaining ? sum + (pick.salary ?? 0) : sum
        }, 0),
      0,
    ),
  )

  const cols = horizon.length
  let rowIndex = 0

  return (
    <section ref={frame} className="win ops-clip pop-in">
      <header className={`win-head flex-wrap ${revealed ? 'on-air' : ''}`}>
        <div className="min-w-0">
          <h2 className="label">contract board</h2>
          <p className="mt-1 text-[12px] leading-snug text-arc-ink-soft">
            Every keeper contract from this season to its expiry. Read down a column to see how
            much of the league is already committed in that year.
          </p>
        </div>
      </header>

      <div className="px-2 pb-3 sm:px-4">
        {/* year ruler — rides under the phone top bar for all twelve teams */}
        <div className="ops-ruler flex items-end border-b border-arc-line bg-arc-panel pt-2 pb-1.5">
          <div className="label w-[156px] shrink-0 pl-1 text-[11px] sm:w-[188px]">Player</div>
          <div className="flex flex-1">
            {horizon.map((target, offset) => (
              <div
                key={target}
                className={`label flex-1 text-center text-[11px] ${offset === 0 ? 'text-arc-ink' : ''}`}
              >
                {target}
              </div>
            ))}
          </div>
          <div className="label hidden w-16 shrink-0 text-right text-[11px] sm:block">Left</div>
        </div>

        {blocks.map((block: KeeperBlock) => (
          <div key={block.team} className="border-b border-arc-line/60 py-2.5 last:border-b-0">
            <div className="mb-1.5 flex min-w-0 items-center gap-2 pl-1 text-[12.5px]">
              {block.manager ? (
                <ManagerTag id={block.manager} size={18} />
              ) : (
                <span className="text-arc-ink">{block.team}</span>
              )}
              <span className="truncate text-[11px] text-arc-ink-faint">{block.team}</span>
              {block.manager === me && <span className="tag ml-1 text-[9.5px]">you</span>}
            </div>

            {block.keepers.length === 0 && (
              <p className="pl-1 text-[12px] text-arc-ink-faint italic">No contracts on the books.</p>
            )}

            {block.keepers.map((pick) => {
              const remaining = contractYearsRemaining(pick.contractYear as ContractYear | null)
              const span = Math.min(cols, remaining + 1)
              const index = rowIndex++
              return (
                <div
                  key={`${block.team}-${pick.player}`}
                  className="ops-crow flex min-h-[32px] items-center rounded-md transition-colors hover:bg-arc-raised"
                >
                  <div className="flex w-[156px] shrink-0 items-baseline justify-between gap-1.5 pr-2 pl-1 sm:w-[188px] sm:pr-3">
                    <Link
                      to={`/players/${playerSlug(pick.player)}`}
                      className="truncate text-[12px] text-arc-ink-soft transition-colors hover:text-arc-green sm:text-[13px]"
                      title={pick.player}
                    >
                      {pick.player}
                    </Link>
                    <span className="tnum shrink-0 text-[11.5px] text-arc-ink sm:text-[12px]">
                      {money(pick.salary)}
                    </span>
                  </div>

                  {/* the timeline: a track across the horizon, a bar to expiry */}
                  <div className="relative flex flex-1 items-center self-stretch">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-arc-line"
                    />
                    <span
                      aria-hidden
                      className={`ops-bar pointer-events-none absolute top-1/2 h-[10px] -translate-y-1/2 rounded-full ${
                        revealed ? 'is-on' : ''
                      }`}
                      style={{
                        left: `${(0.5 / cols) * 100}%`,
                        width: `${((span - 1) / cols) * 100}%`,
                        background: `color-mix(in srgb, ${toneFor(remaining)} 32%, transparent)`,
                        ['--i' as string]: index,
                      }}
                    />
                    {horizon.map((target, offset) => {
                      const letter = letterAt(pick.contractYear as ContractYear | null, offset)
                      const remainingThen = remaining - offset
                      return (
                        <div key={target} className="relative flex flex-1 justify-center">
                          {letter ? (
                            <span
                              className="arcade flex h-6 w-7 items-center justify-center rounded-[5px] border-2 text-[11px]"
                              style={{
                                borderColor: toneFor(remainingThen),
                                color: offset === 0 ? 'var(--color-arc-bg)' : toneFor(remainingThen),
                                background:
                                  offset === 0 ? toneFor(remainingThen) : 'var(--color-arc-panel)',
                              }}
                              title={`${pick.player}: year ${letter} in ${target}`}
                            >
                              {letter}
                            </span>
                          ) : (
                            <span className="h-6 w-7" aria-hidden />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <span
                    className="arcade hidden w-16 shrink-0 text-right text-[11px] sm:block"
                    style={{ color: toneFor(remaining) }}
                  >
                    {remaining === 0 ? 'FINAL YR' : `${remaining} LEFT`}
                  </span>
                </div>
              )
            })}
          </div>
        ))}

        {/* committed salary per season, against the twelve budgets combined */}
        <div className="flex items-start border-t border-arc-line pt-2.5">
          <div className="w-[156px] shrink-0 pr-2 pl-1 sm:w-[188px] sm:pr-3">
            <div className="label text-[11px]">Committed</div>
            <div className="mt-0.5 text-[11px] leading-snug text-arc-ink-faint">
              of the {money(pool)} pool
            </div>
          </div>
          <div className="flex flex-1">
            {committed.map((total, index) => (
              <div key={horizon[index]} className="flex-1 text-center">
                <div className="tnum text-[13px] font-semibold text-arc-ink">{money(total)}</div>
                <div className="tnum mt-0.5 text-[11px] text-arc-ink-faint">
                  {Math.round((total / pool) * 100)}%
                </div>
              </div>
            ))}
          </div>
          <div className="hidden w-16 shrink-0 sm:block" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-arc-ink-faint">
          <span>Chip = contract year (A–D) in that season · solid = this year</span>
          {[
            { remaining: 3, label: '3 yrs left', tone: 'var(--color-arc-green)' },
            { remaining: 2, label: '2 yrs', tone: 'var(--color-arc-cyan)' },
            { remaining: 1, label: '1 yr', tone: 'var(--color-arc-orange)' },
            { remaining: 0, label: 'final year', tone: 'var(--color-arc-red)' },
          ]
            .filter((item) => item.remaining <= maxRemaining)
            .map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-3.5 rounded-sm" style={{ background: item.tone }} />
                {item.label}
              </span>
            ))}
        </div>
      </div>
    </section>
  )
}
