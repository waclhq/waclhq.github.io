import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import PixelMugshot from '../PixelMugshot'
import { applyResults, type Bet } from '../../lib/bets'
import { readBets } from '../../lib/betsRepo'
import { useLeagueData } from '../../lib/data'
import { useBudgets } from '../../lib/derive'
import { duesRows } from '../../lib/dues'
import { money, num, ordinal } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import { bookCareerTable, eraOptions, type CareerLine } from '../../lib/stats'

/**
 * Your desk. Once a seat is picked, the strip under the scoreboard belongs to
 * that person: their auction budget, their contracts, their action on the
 * Book, their dues, and where they sit in the record book. Every item is a
 * door to the page that explains it.
 */

interface DeskItem {
  label: string
  value: string
  sub: string
  to: string
  tone?: string
}

function rankOf(rows: CareerLine[], id: string, key: (line: CareerLine) => number): number | null {
  const mine = rows.find((row) => row.manager === id)
  if (!mine) return null
  const value = key(mine)
  return 1 + rows.filter((row) => key(row) > value).length
}

export default function YourDesk({ season }: { season: number }) {
  const me = useMe()
  const { league, managers, seasons, keepers, cash, careerAverages, betResults } = useLeagueData()
  const budgets = useBudgets(season)
  const [bets, setBets] = useState<Bet[] | null>(null)

  useEffect(() => {
    if (!me) return
    let cancelled = false
    setBets(null)
    void readBets().then((file) => {
      if (!cancelled) setBets(applyResults(file.bets, betResults.results))
    })
    return () => {
      cancelled = true
    }
  }, [me, betResults])

  const career = useMemo(
    () => bookCareerTable(seasons, eraOptions(seasons)[0], careerAverages),
    [seasons, careerAverages],
  )

  if (!me) {
    return (
      <p className="desk-invite" role="note">
        Pick your seat in the menu and this desk becomes yours.
      </p>
    )
  }

  const manager = managers.find((candidate) => candidate.id === me)
  const color = managerColor(me)
  const budget = budgets.find((row) => row.manager === me)
  const block = keepers[String(season)]?.find((candidate) => candidate.manager === me)
  const contracts = block?.keepers.length ?? 0
  const keeperDollars =
    block?.keeperSalary ??
    block?.keepers.reduce((total, pick) => total + (pick.salary ?? 0), 0) ??
    0
  const dues = duesRows(cash.entries, league, season).find((row) => row.manager === me)
  const line = career.find((row) => row.manager === me)
  const titlesRank = rankOf(career, me, (row) => row.titles)
  const ppgRank = rankOf(career, me, (row) => row.avgPointsFor ?? Number.NEGATIVE_INFINITY)

  const mine = bets?.filter(
    (bet) =>
      (bet.proposer === me || bet.opponent === me) &&
      (bet.status === 'live' || bet.status === 'proposed'),
  )
  const openCount = mine?.length ?? 0
  const riding =
    mine
      ?.filter((bet) => bet.status === 'live' && bet.stakeKind === 'cash')
      .reduce((total, bet) => total + bet.stake, 0) ?? 0
  const waitingOnMe = mine?.filter((bet) => bet.status === 'proposed' && bet.opponent === me).length ?? 0

  const items: DeskItem[] = [
    {
      label: `${season} budget`,
      value: budget ? money(budget.available) : '—',
      sub: budget
        ? budget.overCommitted
          ? 'Underwater — trim keepers'
          : `of $${league.baseDraftBudget} to spend on draft day`
        : 'No sheet on file',
      to: '/keepers',
      tone: budget?.overCommitted ? 'var(--color-arc-red)' : 'var(--color-arc-green)',
    },
    {
      label: 'Keepers',
      value: money(keeperDollars),
      sub: contracts
        ? `${contracts} contract${contracts === 1 ? '' : 's'} kept`
        : 'No keepers named yet',
      to: '/keepers',
    },
    {
      label: 'On the Book',
      value: bets === null ? '—' : `${openCount} open`,
      sub:
        bets === null
          ? 'Reading the book…'
          : waitingOnMe
            ? `${waitingOnMe} waiting on you · ${money(riding)} riding`
            : riding
              ? `${money(riding)} riding`
              : openCount
                ? 'Pride only'
                : 'Nothing riding',
      to: '/bets',
      tone: waitingOnMe ? 'var(--color-arc-yellow)' : undefined,
    },
    {
      label: `${season} dues`,
      value: dues ? (dues.settled ? 'Paid' : money(dues.owed)) : '—',
      sub: dues
        ? dues.settled
          ? 'Good people'
          : dues.tier === 'pending'
            ? 'Outstanding'
            : `${dues.daysOverdue} days past due`
        : 'Not yet recorded',
      to: '/finances',
      tone: dues ? (dues.settled ? 'var(--color-arc-green)' : 'var(--color-arc-red)') : undefined,
    },
    {
      label: 'Titles',
      value: line ? String(line.titles) : '—',
      sub: titlesRank ? `${ordinal(titlesRank)} all-time` : 'No seasons on record',
      to: '/records',
      tone: line?.titles ? 'var(--color-arc-yellow)' : undefined,
    },
    {
      label: 'Career PPG',
      value: line?.avgPointsFor != null ? num(line.avgPointsFor) : '—',
      sub: ppgRank ? `${ordinal(ppgRank)} all-time` : 'No seasons on record',
      to: '/records',
    },
  ]

  return (
    <section
      className="win desk-mine pop-in"
      style={{ '--c': color } as CSSProperties}
      aria-labelledby="desk-mine-title"
    >
      <header className="desk-mine-head">
        <span className="seat-face shrink-0" style={{ '--c': color } as CSSProperties}>
          <PixelMugshot seed={me} scale={2} />
        </span>
        <div className="min-w-0">
          <h2 id="desk-mine-title" className="label">
            Your desk
          </h2>
          <div className="desk-mine-name truncate" style={{ color }}>
            {manager?.displayName ?? me}
            {(block?.team ?? manager?.team) && (
              <span className="desk-mine-team"> · {block?.team ?? manager?.team}</span>
            )}
          </div>
        </div>
      </header>
      <ul className="desk-mine-grid">
        {items.map((item, index) => (
          <li key={item.label} className="pop-in" style={{ animationDelay: `${140 + index * 55}ms` }}>
            <Link to={item.to} className="desk-mine-item">
              <span className="label">{item.label}</span>
              <span className="desk-mine-val tnum" style={item.tone ? { color: item.tone } : undefined}>
                {item.value}
              </span>
              <span className="desk-mine-sub">{item.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
