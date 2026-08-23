import { useMemo } from 'react'
import RoastPanel from '../components/RoastPanel'
import TradingCard from '../components/TradingCard'
import { achievements } from '../lib/achievements'
import { Link, useParams } from 'react-router-dom'
import { ForAgainstChart, WinPctChart } from '../components/charts'
import { Chip, Empty, Panel, PageHeader, Stat } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { useLedger, useTrades } from '../lib/derive'
import { money, num, ordinal, pct, record } from '../lib/format'
import { careerTable, eraOptions, managerSeasons, rollingWinPct } from '../lib/stats'

export default function ManagerDetail() {
  const { id = '' } = useParams()
  const data = useLeagueData()
  const { managers, seasons, keepers, league } = data
  const ledger = useLedger()
  const allTrades = useTrades()

  const manager = managers.find((candidate) => candidate.id === id)
  const badges = useMemo(() => achievements(data).get(id) ?? [], [data, id])
  const eras = eraOptions(seasons)
  const career = careerTable(seasons, eras[0]).find((line) => line.manager === id)
  const rows = managerSeasons(seasons, id)
  const rolling = useMemo(() => rollingWinPct(seasons, id, 3), [seasons, id])
  const forAgainst = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.season.year - b.season.year)
        .map((row) => ({
          year: row.season.year,
          for: row.team.avgPointsFor,
          against: row.team.avgPointsAgainst,
        })),
    [rows],
  )
  const trades = allTrades.filter(
    (trade) => (trade.seller === id || trade.buyer === id) && trade.status === 'approved',
  )
  const currentBlock = keepers[String(league.currentSeason)]?.find(
    (block) => block.manager === id,
  )
  const obligationYears = Object.keys(ledger)
    .map(Number)
    .filter((year) => year >= league.currentSeason)
    .sort((a, b) => a - b)

  if (!manager || !career) {
    return (
      <>
        <PageHeader eyebrow="Manager" title="Not found" />
        <Panel>
          <Empty>
            No records for that manager. <Link to="/managers" className="text-arc-green">Back to the list</Link>
          </Empty>
        </Panel>
      </>
    )
  }

  return (
    <>
      {/* The room takes on the manager's colour: their page is lit by their
          own light, the way their row and badge already are. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[46vh]"
        style={{
          zIndex: -1,
          background: `radial-gradient(85% 100% at 50% 0%, ${managerColor(id)}1c, transparent 72%)`,
        }}
      />
      <PageHeader
        path="~/managers"
        eyebrow={manager.active ? `Active · ${manager.team}` : 'Former manager'}
        title={manager.displayName}
        lede={`${career.seasonsPlayed} seasons · ${record(career.wins, career.losses)} regular season · best finish ${ordinal(career.bestFinish)}${
          manager.displayName !== manager.surname ? ` · recorded as ${manager.surname} in the stat books` : ''
        }`}
        action={<TradingCard id={id} />}
      />

      <div className="mb-6">
        <RoastPanel id={id} />
      </div>

      {badges.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2.5">
          {badges.map((badge) => (
            <span
              key={badge.id}
              className="tag !text-[11px]"
              style={{ background: 'var(--color-arc-raised)', color: 'var(--color-arc-ink)' }}
              title={badge.reason}
            >
              {badge.emoji} {badge.name}
            </span>
          ))}
        </div>
      )}

      <div className="line-in mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat
          label="Titles"
          value={career.titles}
          tone={career.titles ? 'gold' : 'default'}
          hint={`${career.topThree} top-three finishes`}
        />
        <Stat label="Win %" value={pct(career.winPct)} hint={record(career.wins, career.losses)} />
        <Stat
          label="Playoff rate"
          value={pct(career.playoffRate, 0)}
          hint={`${career.playoffAppearances} of ${career.seasonsPlayed} · ${record(career.playoffWins, career.playoffLosses)} in the bracket`}
        />
        <Stat
          label="Avg points"
          value={num(career.avgPointsFor)}
          hint={`${num(career.avgPointsAgainst)} against`}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="Form"
          subtitle="Rolling three-season regular-season win percentage."
          delay={80}
        >
          <div className="px-4 py-5">
            <WinPctChart data={rolling} />
          </div>
        </Panel>

        <Panel title="Scoring" subtitle="Points per game, for and against." delay={120}>
          <div className="px-4 py-5">
            <ForAgainstChart data={forAgainst} />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Season by season" delay={160}>
          <div>
            <table className="out">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Team</th>
                  <th className="n">#</th>
                  <th className="n">Record</th>
                  <th className="n">PF/gm</th>
                  <th className="n">PA/gm</th>
                  <th className="n">Playoffs</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.season.year}>
                    <td className="tnum">{row.season.year}</td>
                    <td className="text-arc-ink-soft">{row.team.team}</td>
                    <td className="n">
                      <span className={row.team.rank === 1 ? 'text-arc-green' : undefined}>
                        {row.team.rank === 1 && '★ '}
                        {row.team.rank}
                      </span>
                    </td>
                    <td className="n">{record(row.team.wins, row.team.losses)}</td>
                    <td className="n text-arc-ink-soft">{num(row.team.avgPointsFor)}</td>
                    <td className="n text-arc-ink-faint">{num(row.team.avgPointsAgainst)}</td>
                    <td className="n text-arc-ink-faint">
                      {row.team.playoffWins + row.team.playoffLosses > 0
                        ? record(row.team.playoffWins, row.team.playoffLosses)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-6">
          {currentBlock && (
            <Panel title={`${league.currentSeason} keepers`} delay={200}>
              <table className="out">
                <tbody>
                  {currentBlock.keepers.map((pick) => (
                    <tr key={pick.player}>
                      <td>{pick.player}</td>
                      <td className="n text-arc-ink-soft">{money(pick.salary)}</td>
                      <td className="n text-arc-ink-faint">Yr {pick.contractYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-arc-line px-5 py-3">
                <Link to="/keepers" className="label hover:text-arc-green">
                  Full roster →
                </Link>
              </div>
            </Panel>
          )}

          <Panel title="Auction dollars owed / owing" delay={240}>
            {obligationYears.length === 0 ? (
              <Empty>No forward obligations.</Empty>
            ) : (
              <table className="out">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th className="n">Received</th>
                    <th className="n">Sent</th>
                    <th className="n">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {obligationYears.map((year) => {
                    const entry = ledger[String(year)]?.[id]
                    if (!entry) return null
                    return (
                      <tr key={year}>
                        <td className="tnum">{year}</td>
                        <td className="n text-arc-ink-soft">{money(entry.received)}</td>
                        <td className="n text-arc-ink-soft">{money(entry.sent)}</td>
                        <td
                          className={`n ${
                            entry.net > 0
                              ? 'text-[var(--color-arc-green)]'
                              : entry.net < 0
                                ? 'text-[var(--color-arc-red)]'
                                : 'text-arc-ink-faint'
                          }`}
                        >
                          {money(entry.net, { sign: true })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Trade history" subtitle={`${trades.length} recorded trades`} delay={280}>
            {trades.length === 0 ? (
              <Empty>No trades on the structured ledger.</Empty>
            ) : (
              <ul className="divide-y divide-arc-ink">
                {trades.map((trade) => {
                  const selling = trade.seller === id
                  return (
                    <li key={trade.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Chip tone={selling ? 'up' : 'down'}>{selling ? 'Sold' : 'Bought'}</Chip>
                        <span className="tnum text-[12px] text-arc-green">
                          {money(trade.totalDollars)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[13px] text-arc-ink-soft">{trade.players}</div>
                      <div className="mt-0.5 text-[11px] text-arc-ink-faint">
                        {trade.batch} · {selling ? 'to' : 'from'}{' '}
                        {managerName(managers, selling ? trade.buyer : trade.seller)}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
