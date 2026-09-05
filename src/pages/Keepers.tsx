import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import ContractBoard from '../components/ContractBoard'
import KeeperEditor from '../components/KeeperEditor'
import ManagerTag from '../components/ManagerTag'
import WarRoom from '../components/WarRoom'
import { Chip, Empty, Panel, PageHeader } from '../components/ui'
import { managerName, useLeague, useLeagueData } from '../lib/data'
import { useBudgets } from '../lib/derive'
import { money } from '../lib/format'
import { useMe } from '../lib/me'
import { animationsDisabled } from '../lib/motion'
import { blockAnchor, orderBlocks } from '../lib/ops-keepers'
import { contractYearsRemaining, keeperEligibility } from '../lib/rules'
import type { ContractYear } from '../lib/types'

// A fresh -> D expiring, so the colour reads as a fuse burning down.
const CONTRACT_TONE: Record<ContractYear, string> = {
  A: 'text-arc-green',
  B: 'text-arc-cyan',
  C: 'text-arc-orange',
  D: 'text-arc-red',
}

export default function Keepers() {
  const { league, managers, keepers } = useLeagueData()
  const { commissioner } = useLeague()
  const me = useMe()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const years = useMemo(
    () =>
      Object.keys(keepers)
        .map(Number)
        .sort((a, b) => b - a),
    [keepers],
  )
  // The season lives in the URL (#/keepers?season=2024) so it survives a
  // reload and can be texted to the group.
  const requested = Number(params.get('season'))
  const year = years.includes(requested) ? requested : (years[0] ?? league.currentSeason)
  const setYear = (next: number) =>
    setParams(
      (current) => {
        current.set('season', String(next))
        return current
      },
      { replace: true },
    )
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const blocks = orderBlocks(keepers[String(year)] ?? [], managers, me)
  const budgets = useBudgets(year)
  const budgetFor = (manager: string | null) =>
    budgets.find((budget) => budget.manager === manager)
  const mine = blocks.find((block) => block.manager && block.manager === me)

  // Deep links from a manager page (#/keepers#baugh) land on that card.
  useEffect(() => {
    const id = location.hash.replace(/^#/, '')
    if (!id) return
    const node = document.getElementById(id)
    if (!node) return
    node.scrollIntoView({ behavior: animationsDisabled() ? 'auto' : 'smooth', block: 'start' })
  }, [location.hash, year])

  const jumpTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: animationsDisabled() ? 'auto' : 'smooth', block: 'start' })

  return (
    <div className="ops-room">
      <PageHeader
        path="~/keepers"
        eyebrow="Contracts & Rosters"
        title="Keepers"
        lede={`Each team retains up to ${league.keeperSlots} players for a maximum ${league.maxContractYears}-year contract. Salary comes off the $${league.baseDraftBudget} auction budget.`}
        action={
          <select
            className="field w-auto"
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value))
              setEditing(null)
            }}
            aria-label="Keeper season"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option} keepers
              </option>
            ))}
          </select>
        }
      />

      {mine && (
        <div className="line-in -mt-2 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-arc-line bg-arc-panel/80 px-3 py-2.5 text-[13px]">
          <span className="label">Your seat</span>
          <ManagerTag id={mine.manager} />
          <span className="truncate text-arc-ink-soft">{mine.team}</span>
          <span className="tnum text-arc-ink-soft">
            <span className="text-arc-ink-faint">Budget </span>
            <span
              className={
                (budgetFor(mine.manager)?.available ?? 0) < 0 ? 'text-arc-red' : 'text-arc-green'
              }
            >
              {money(budgetFor(mine.manager)?.available ?? mine.draftBudget)}
            </span>
          </span>
          <button
            type="button"
            className="btn ml-auto min-h-[40px] px-3 py-1 text-[12.5px]"
            onClick={() => jumpTo(blockAnchor(mine))}
          >
            Your card ↓
          </button>
        </div>
      )}

      <div className="mb-6">
        {/* flush: the panel's horizontal-scroll wrapper is a scroll container,
            and the budget strip inside cannot stick to a box that scrolls. */}
        <Panel
          flush
          className="ops-clip"
          title="war room"
          subtitle="Try any keeper combination and watch the draft budget move. Costs and contract years follow the league rules automatically."
        >
          <WarRoom year={year} />
        </Panel>
      </div>

      <div className="mb-6">
        <ContractBoard year={year} />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        {blocks.map((block, index) => {
          const budget = budgetFor(block.manager)
          const salary = block.keepers.reduce((total, pick) => total + (pick.salary ?? 0), 0)
          const open = expanded === block.team
          const eligible = keeperEligibility(block)
          const isMe = Boolean(block.manager) && block.manager === me
          const available = budget?.available ?? block.draftBudget ?? 0

          return (
            <Panel
              key={block.team}
              id={blockAnchor(block)}
              delay={Math.min(index, 6) * 40}
              className={isMe ? 'ops-me-card' : ''}
            >
              <div className="px-4 py-5 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 font-display text-[22px] leading-tight font-bold text-arc-ink">
                      {block.manager ? (
                        <ManagerTag id={block.manager} size={28} />
                      ) : (
                        <span>{block.team}</span>
                      )}
                      {isMe && <span className="tag">you</span>}
                    </div>
                    {block.manager && (
                      <div className="mt-1 truncate text-[13px] text-arc-ink-soft">{block.team}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="label">Draft budget</div>
                    <div
                      className={`tnum font-display text-[28px] leading-none font-bold italic ${
                        available < 0 ? 'text-arc-red' : 'text-arc-green'
                      }`}
                    >
                      {money(available)}
                    </div>
                  </div>
                </div>

                {editing === block.team ? (
                  <KeeperEditor
                    key={`${year}-${block.team}`}
                    year={year}
                    block={block}
                    onDone={() => setEditing(null)}
                  />
                ) : (
                  <table className="out mt-4">
                    <thead>
                      <tr>
                        <th>Keeper</th>
                        <th className="n">Salary</th>
                        <th className="n">{year} yr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.keepers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-arc-ink-faint italic">
                            No keepers selected.
                          </td>
                        </tr>
                      ) : (
                        block.keepers.map((pick) => (
                          <tr key={`${pick.player}-${pick.salary}`}>
                            <td>{pick.player}</td>
                            <td className="n text-arc-ink-soft">{money(pick.salary)}</td>
                            <td className="n">
                              <span
                                className={`font-semibold ${
                                  pick.contractYear ? CONTRACT_TONE[pick.contractYear] : ''
                                }`}
                              >
                                {pick.contractYear ?? '—'}
                              </span>
                              <span className="ml-2 text-[11px] text-arc-ink-faint">
                                {contractYearsRemaining(pick.contractYear) === 0
                                  ? 'final year'
                                  : `${contractYearsRemaining(pick.contractYear)} left`}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-arc-line pt-4 text-[12px]">
                  <div>
                    <dt className="text-arc-ink-faint">Base</dt>
                    <dd className="tnum mt-0.5 text-arc-ink-soft">
                      {money(league.baseDraftBudget)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-arc-ink-faint">Keeper salary</dt>
                    <dd className="tnum mt-0.5 text-arc-red">{money(-salary)}</dd>
                  </div>
                  <div>
                    <dt className="text-arc-ink-faint">Traded cash</dt>
                    <dd
                      className={`tnum mt-0.5 ${
                        (budget?.cashNet ?? block.cashTraded) > 0
                          ? 'text-arc-green'
                          : (budget?.cashNet ?? block.cashTraded) < 0
                            ? 'text-arc-red'
                            : 'text-arc-ink-faint'
                      }`}
                    >
                      {money(budget?.cashNet ?? block.cashTraded, { sign: true })}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : block.team)}
                  >
                    {open ? '− Hide' : '+ Show'} {year - 1} ending roster (
                    {block.endingRoster.length})
                  </button>
                  {commissioner && editing !== block.team && (
                    <button type="button" className="btn" onClick={() => setEditing(block.team)}>
                      ✎ Edit keepers
                    </button>
                  )}
                  {block.manager && (
                    <Link
                      to={`/managers/${block.manager}`}
                      className="label self-center transition-colors hover:text-arc-green sm:ml-auto"
                    >
                      {managerName(managers, block.manager)}'s page →
                    </Link>
                  )}
                </div>
              </div>

              {open && (
                <div className="border-t border-arc-line">
                  <table className="out">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th className="n hidden sm:table-cell">Cost</th>
                        <th className="n hidden sm:table-cell">{year - 1} yr</th>
                        <th>If kept in {year}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligible.map((spot) => (
                        <tr key={`${spot.player}-${spot.cost}`}>
                          <td>
                            {spot.player}
                            <span className="tnum block text-[11px] text-arc-ink-faint sm:hidden">
                              {money(spot.cost)} · {year - 1} yr{' '}
                              <span
                                className={spot.contractYear ? CONTRACT_TONE[spot.contractYear] : ''}
                              >
                                {spot.contractYear ?? '—'}
                              </span>
                            </span>
                          </td>
                          <td className="n hidden text-arc-ink-soft sm:table-cell">
                            {money(spot.cost)}
                          </td>
                          <td className="n hidden sm:table-cell">
                            <span
                              className={`font-semibold ${
                                spot.contractYear ? CONTRACT_TONE[spot.contractYear] : ''
                              }`}
                            >
                              {spot.contractYear ?? '—'}
                            </span>
                          </td>
                          <td className="text-[12.5px]">
                            {spot.eligible && spot.nextYear ? (
                              <span className="text-arc-ink-soft">
                                Year{' '}
                                <span className={`font-semibold ${CONTRACT_TONE[spot.nextYear]}`}>
                                  {spot.nextYear}
                                </span>{' '}
                                of {league.maxContractYears}
                              </span>
                            ) : (
                              <Chip tone="down">Expired</Chip>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )
        })}
        {blocks.length === 0 && (
          <Panel>
            <Empty kicker="no sheet">No keeper records for {year}.</Empty>
          </Panel>
        )}
      </div>
    </div>
  )
}
