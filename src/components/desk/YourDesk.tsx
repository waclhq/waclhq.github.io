import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import PixelMugshot from '../PixelMugshot'
import { applyResults, type Bet } from '../../lib/bets'
import { readBets } from '../../lib/betsRepo'
import { minSeasonsToRank } from '../../lib/boards-facts'
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

/**
 * Where a seat sits on one of the Records boards. A board ranks by position
 * in its own order — ties broken the way that board breaks them, short
 * careers held out of the rate boards — so the desk sorts the table the same
 * way rather than counting rows above. Otherwise the tile and the door it
 * opens quote different ranks.
 */
function boardRank(order: CareerLine[], id: string): number | null {
  const at = order.findIndex((line) => line.manager === id)
  return at < 0 ? null : at + 1
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
  // The two Records boards these tiles quote, ordered exactly as they are
  // there: titles with podium finishes as the tiebreaker, points per game
  // over the careers long enough to rank.
  const titlesOrder = useMemo(
    () => [...career].sort((a, b) => b.titles - a.titles || b.topThree - a.topThree),
    [career],
  )
  const minSeasons = minSeasonsToRank(seasons.length)
  const ppgOrder = useMemo(
    () =>
      career
        .filter((line) => line.avgPointsFor !== null && line.seasonsPlayed >= minSeasons)
        .sort((a, b) => (b.avgPointsFor ?? 0) - (a.avgPointsFor ?? 0)),
    [career, minSeasons],
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
  const titlesRank = boardRank(titlesOrder, me)
  const ppgRank = boardRank(ppgOrder, me)

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
  const onTable =
    mine
      ?.filter((bet) => bet.status === 'proposed' && bet.stakeKind === 'cash')
      .reduce((total, bet) => total + bet.stake, 0) ?? 0
  const waitingOnMe = mine?.filter((bet) => bet.status === 'proposed' && bet.opponent === me).length ?? 0
  // Only the true parts, in the Book's own words: cash on accepted bets is
  // riding, cash on a bet nobody has taken yet is on the table.
  const bookSub =
    [
      waitingOnMe ? `${waitingOnMe} waiting on you` : '',
      riding ? `${money(riding)} riding` : '',
      onTable ? `${money(onTable)} on the table` : '',
    ]
      .filter(Boolean)
      .join(' · ') || (openCount ? 'Pride only' : 'Nothing riding')

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
      sub: bets === null ? 'Reading the book…' : bookSub,
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
      // All-Time, on the board the number came from — Records itself opens
      // in the Keeper Era.
      to: '/records?era=all&s=titles',
      tone: line?.titles ? 'var(--color-arc-yellow)' : undefined,
    },
    {
      label: 'Career PPG',
      value: line?.avgPointsFor != null ? num(line.avgPointsFor) : '—',
      sub: ppgRank
        ? `${ordinal(ppgRank)} all-time`
        : line
          ? `${line.seasonsPlayed} of ${minSeasons} seasons to rank`
          : 'No seasons on record',
      to: '/records?era=all&s=points',
    },
  ]

  return (
    <section
      className="win desk-seat pop-in"
      style={{ '--c': color } as CSSProperties}
      aria-labelledby="desk-seat-title"
    >
      <header className="desk-seat-head">
        <span className="seat-face shrink-0" style={{ '--c': color } as CSSProperties}>
          <PixelMugshot seed={me} scale={2} />
        </span>
        <div className="min-w-0">
          <h2 id="desk-seat-title" className="label">
            Your desk
          </h2>
          <div className="desk-seat-name truncate" style={{ color }}>
            {manager?.displayName ?? me}
            {(block?.team ?? manager?.team) && (
              <span className="desk-seat-team"> · {block?.team ?? manager?.team}</span>
            )}
          </div>
        </div>
      </header>
      <ul className="desk-seat-grid">
        {items.map((item, index) => (
          <li key={item.label} className="pop-in" style={{ animationDelay: `${140 + index * 55}ms` }}>
            <Link to={item.to} className="desk-seat-item">
              <span className="label">{item.label}</span>
              <span className="desk-seat-val tnum" style={item.tone ? { color: item.tone } : undefined}>
                {item.value}
              </span>
              <span className="desk-seat-sub">{item.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
