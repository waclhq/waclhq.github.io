import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RoastPanel, { RoastButton } from '../components/RoastPanel'
import TradingCard from '../components/TradingCard'
import { BookPanel } from '../components/profile/BookPanel'
import { HoloHeader, type Neighbour } from '../components/profile/HoloHeader'
import { ManagerLink } from '../components/profile/ManagerLink'
import { FormChart, ScoringChart } from '../components/profile/ProfileCharts'
import { TaleOfTheTape } from '../components/profile/TaleOfTheTape'
import { useDocumentTitle } from '../components/profile/useDocumentTitle'
import { viewTransitionsOn } from '../components/profile/viewTransitions'
import { Chip, Empty, Panel, PageHeader, Stat } from '../components/ui'
import { achievements } from '../lib/achievements'
import { careerLuck, luckRows } from '../lib/analytics'
import { applyResults, headToHead, type BetsFile } from '../lib/bets'
import { readBets } from '../lib/betsRepo'
import { useLeagueData } from '../lib/data'
import { useLedger, useTrades } from '../lib/derive'
import { money, num, pct, record } from '../lib/format'
import { managerColor } from '../lib/identity'
import { useMe } from '../lib/me'
import { playerSlugOf } from '../lib/profile-player'
import { storyLine, tablePosition, titleYears } from '../lib/profile-story'
import { bookCareerTable, eraOptions, managerSeasons, rollingWinPct } from '../lib/stats'

export default function ManagerDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const data = useLeagueData()
  const { managers, seasons, keepers, league, careerAverages, betResults } = data
  const ledger = useLedger()
  const allTrades = useTrades()
  const me = useMe()

  const manager = managers.find((candidate) => candidate.id === id)
  // The book's table: All-Time scoring averages are the workbook's adjusted
  // figures, so the tiles here agree with Records and the Managers list.
  const table = useMemo(
    () => bookCareerTable(seasons, eraOptions(seasons)[0], careerAverages),
    [seasons, careerAverages],
  )
  const career = table.find((line) => line.manager === id)
  const badges = useMemo(() => achievements(data).get(id) ?? [], [data, id])
  const luck = useMemo(() => careerLuck(luckRows(seasons)), [seasons])
  const rows = useMemo(() => managerSeasons(seasons, id), [seasons, id])
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

  // ---- wayfinding: prev / next follow the career table ----
  const position = tablePosition(table, id)
  const nameOf = (who: string) => managers.find((m) => m.id === who)?.displayName ?? who
  const neighbour = (offset: number): Neighbour | null => {
    if (position.index < 0 || table.length < 2) return null
    const at = (position.index + offset + table.length) % table.length
    const who = table[at].manager
    return { id: who, name: nameOf(who) }
  }
  const prev = neighbour(-1)
  const next = neighbour(1)

  // Left and right flip to the neighbouring manager — but only from the page
  // itself. Anything that owns its own arrows (the opponent radios, the seat
  // listbox, a sheet, a field) keeps them, the same guard the season scrubber
  // uses.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"], [role="listbox"], [role="radiogroup"], [role="tablist"], [role="menu"]',
        )
      )
        return
      const options = { viewTransition: viewTransitionsOn() }
      if (event.key === 'ArrowLeft' && prev) navigate(`/managers/${prev.id}`, options)
      if (event.key === 'ArrowRight' && next) navigate(`/managers/${next.id}`, options)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev?.id, next?.id, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

  useDocumentTitle(manager ? `${manager.displayName} · Managers · WACL League HQ` : null)

  // ---- the Book: one read, shared by the tape and the panel ----
  const [betsFile, setBetsFile] = useState<BetsFile | null>(null)
  useEffect(() => {
    let alive = true
    void readBets().then((file) => {
      if (alive) setBetsFile(file)
    })
    return () => {
      alive = false
    }
  }, [])
  const bets = useMemo(
    () => (betsFile ? applyResults(betsFile.bets, betResults.results) : null),
    [betsFile, betResults],
  )
  const h2h = useMemo(() => headToHead(bets ?? []), [bets])

  // ---- the roast: button in the header, panel below it ----
  const [roastSeed, setRoastSeed] = useState<number | null>(null)
  useEffect(() => setRoastSeed(null), [id])

  if (!manager || !career) {
    return (
      <>
        <PageHeader eyebrow="Manager" title="Not found" />
        <Panel>
          <Empty>
            No records for that manager.{' '}
            <Link to="/managers" className="text-arc-green">
              Back to the list
            </Link>
          </Empty>
        </Panel>
      </>
    )
  }

  const color = managerColor(id)
  const story = storyLine({
    id,
    career,
    table,
    seasons,
    book: careerAverages,
    luck,
    active: manager.active,
  })
  const years = titleYears(seasons, id)
  const latestYear = seasons.reduce((max, season) => Math.max(max, season.year), 0)
  const latest = seasons.find((season) => season.year === latestYear)
  const inTable = (who: string | null | undefined) => Boolean(who) && table.some((line) => line.manager === who)
  const defaultOpponent =
    (me && me !== id && inTable(me) ? me : null) ??
    (latest?.champion !== id && inTable(latest?.champion) ? latest!.champion : null) ??
    (latest?.runnerUp !== id && inTable(latest?.runnerUp) ? latest!.runnerUp! : null) ??
    table.find((line) => line.manager !== id)?.manager ??
    id
  const isMe = me === id

  return (
    <div className="pf-page">
      {/* The room takes on the manager's colour: their page is lit by their
          own light, the way their row and badge already are. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[46vh]"
        style={{
          zIndex: -1,
          background: `radial-gradient(85% 100% at 50% 0%, color-mix(in srgb, ${color} 12%, transparent), transparent 72%)`,
        }}
      />

      <HoloHeader
        manager={manager}
        career={career}
        story={story}
        titleYears={years}
        prev={prev}
        next={next}
        position={position}
        isMe={isMe}
        actions={
          <>
            <TradingCard id={id} />
            <RoastButton
              active={roastSeed !== null}
              onClick={() => setRoastSeed((seed) => (seed === null ? 1 : null))}
            />
            {currentBlock && (
              <Link to={`/keepers#${id}`} className="btn">
                Contracts
              </Link>
            )}
          </>
        }
      />

      {roastSeed !== null && (
        <div className="mb-6">
          <RoastPanel id={id} seed={roastSeed} onSeed={setRoastSeed} />
        </div>
      )}

      {badges.length > 0 && (
        <ul className="pf-badges" aria-label="Badges">
          {badges.map((badge) => (
            <li key={badge.id} className="pf-badge" title={badge.reason}>
              <span className="pf-badge-name">
                <span aria-hidden>{badge.emoji}</span> {badge.name}
              </span>
              <span className="pf-badge-why">{badge.reason}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="line-in mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <Stat
          label="Titles"
          value={career.titles}
          countTo={career.titles}
          tone={career.titles ? 'gold' : 'default'}
          hint={`${career.topThree} top-three ${career.topThree === 1 ? 'finish' : 'finishes'}`}
        />
        <Stat
          label="Win %"
          value={pct(career.winPct)}
          countTo={career.winPct * 100}
          format={(value) => `${value.toFixed(1)}%`}
          hint={`${record(career.wins, career.losses)} regular season`}
        />
        <Stat
          label="Playoff rate"
          value={pct(career.playoffRate, 0)}
          countTo={career.playoffRate * 100}
          format={(value) => `${Math.round(value)}%`}
          hint={`${career.playoffAppearances} of ${career.seasonsPlayed} · ${record(career.playoffWins, career.playoffLosses)} bracket`}
        />
        <Stat
          label="PF/gm"
          value={num(career.avgPointsFor)}
          countTo={career.avgPointsFor ?? undefined}
          format={(value) => num(value)}
          hint={`${num(career.avgPointsAgainst)} PA/gm · the book's figure`}
        />
        <Stat
          label="Best year"
          tone="up"
          value={num(career.bestSeason?.avg)}
          countTo={career.bestSeason?.avg}
          format={(value) => num(value)}
          hint={career.bestSeason ? `${career.bestSeason.year} · PF/gm` : 'no scored seasons'}
        />
        <Stat
          label="Worst year"
          tone="down"
          value={num(career.worstSeason?.avg)}
          countTo={career.worstSeason?.avg}
          format={(value) => num(value)}
          hint={career.worstSeason ? `${career.worstSeason.year} · PF/gm` : 'no scored seasons'}
        />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel
          title="Form"
          subtitle="Rolling three-season regular-season win percentage."
          delay={80}
        >
          <div className="px-4 py-5">
            <FormChart data={rolling} color={color} />
          </div>
        </Panel>

        <Panel
          title="Scoring"
          subtitle="Points per game, for and against, as scored each season. Peak and trough are the book's."
          delay={120}
        >
          <div className="px-4 py-5">
            <ScoringChart
              data={forAgainst}
              color={color}
              peak={career.bestSeason?.year}
              trough={career.worstSeason?.year}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid min-w-0 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <TaleOfTheTape
          key={id}
          id={id}
          table={table}
          managers={managers}
          luck={luck}
          defaultOpponent={defaultOpponent}
          h2h={h2h}
          delay={160}
        />
        <BookPanel id={id} bets={bets} managers={managers} delay={200} />
      </div>

      <div className="mt-6 grid min-w-0 items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Panel
          title="Season by season"
          subtitle="PF/gm as scored that season; the record book re-scores 2004–06 for career averages."
          delay={240}
        >
          <table className="out">
            <thead>
              <tr>
                <th>Year</th>
                <th className="hidden sm:table-cell">Team</th>
                <th className="n">#</th>
                <th className="n">Record</th>
                <th className="n">PF/gm</th>
                <th className="n">PA/gm</th>
                <th className="n hidden sm:table-cell">Bracket</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const bracket =
                  row.team.playoffWins + row.team.playoffLosses > 0
                    ? record(row.team.playoffWins, row.team.playoffLosses)
                    : null
                const best = career.bestSeason?.year === row.season.year
                const worst = career.worstSeason?.year === row.season.year
                return (
                  <tr key={row.season.year}>
                    <td className="tnum">{row.season.year}</td>
                    <td className="hidden text-arc-ink-soft sm:table-cell">{row.team.team}</td>
                    <td className="n">
                      {row.team.rank === 1 ? (
                        <span className="text-arc-yellow">★ 1</span>
                      ) : (
                        row.team.rank
                      )}
                    </td>
                    <td className="n">
                      {record(row.team.wins, row.team.losses)}
                      {bracket && (
                        <span className="text-arc-ink-faint sm:hidden" title="bracket">
                          {' '}
                          · {bracket}
                        </span>
                      )}
                    </td>
                    <td className="n text-arc-ink-soft">
                      {num(row.team.avgPointsFor)}
                      {best && (
                        <span className="ml-1 text-[11px] text-arc-green" title="best year">
                          ▲<span className="sr-only"> best year</span>
                        </span>
                      )}
                      {worst && (
                        <span className="ml-1 text-[11px] text-arc-red" title="worst year">
                          ▼<span className="sr-only"> worst year</span>
                        </span>
                      )}
                    </td>
                    <td className="n text-arc-ink-faint">{num(row.team.avgPointsAgainst)}</td>
                    <td className="n hidden text-arc-ink-faint sm:table-cell">{bracket ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-6">
          {currentBlock && (
            <Panel
              title={`${league.currentSeason} keepers`}
              subtitle={
                currentBlock.keeperSalary !== null
                  ? `${money(currentBlock.keeperSalary)} committed of ${money(league.baseDraftBudget)}`
                  : undefined
              }
              delay={280}
            >
              <table className="out">
                <tbody>
                  {currentBlock.keepers.map((pick) => (
                    <tr key={pick.player}>
                      <td>
                        <Link
                          to={`/players/${playerSlugOf(pick.player)}`}
                          className="pf-name"
                          style={{ ['--c' as string]: color }}
                        >
                          {pick.player}
                        </Link>
                      </td>
                      <td className="n text-arc-ink-soft">{money(pick.salary)}</td>
                      <td className="n text-arc-ink-faint">Yr {pick.contractYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-arc-line px-5 py-3">
                <Link to={`/keepers#${id}`} className="label pf-foot-link hover:text-arc-green">
                  Full roster →
                </Link>
              </div>
            </Panel>
          )}

          <Panel title="Auction dollars owed / owing" delay={320}>
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
                              ? 'text-arc-green'
                              : entry.net < 0
                                ? 'text-arc-red'
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

          <Panel title="Trade history" subtitle={`${trades.length} recorded trades`} delay={360}>
            {trades.length === 0 ? (
              <Empty>No trades on the structured ledger.</Empty>
            ) : (
              <ul className="divide-y divide-arc-line">
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
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-arc-ink-faint">
                        <span>{trade.batch} ·</span>
                        <span>{selling ? 'to' : 'from'}</span>
                        <ManagerLink id={selling ? trade.buyer : trade.seller} className="text-[12.5px]" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
