import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Chip, Empty, Panel, PageHeader, SegmentedControl, Stat } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { normalizePlayer } from '../lib/analytics'
import { money } from '../lib/format'
import { playerSlug } from '../lib/search'
import { seasonClock } from '../lib/season'

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const
type Position = (typeof POSITIONS)[number]

/**
 * The Draft Board: third-party consensus rankings with everyone already kept
 * struck off, so the whole league can see what talent is actually reaching
 * auction night. Rankings are a committed snapshot (scripts/draft_pool.py);
 * availability recomputes live against the keeper lists. Filters live in the
 * URL (#/draft?pos=RB&kept=1) so a filtered board can be texted around.
 */
export default function Draft() {
  const { league, managers, keepers, draftPool } = useLeagueData()
  const [params, setParams] = useSearchParams()
  const posParam = (params.get('pos') ?? 'ALL').toUpperCase()
  const position: Position = (POSITIONS as readonly string[]).includes(posParam)
    ? (posParam as Position)
    : 'ALL'
  const showKept = params.get('kept') === '1'
  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        if (value === null) current.delete(key)
        else current.set(key, value)
        return current
      },
      { replace: true },
    )

  const season = league.currentSeason
  const clock = seasonClock(season)
  const auctionDone = clock.phase === 'in-season' || clock.phase === 'playoffs'

  // Every keeper this season, by normalized name -> who has him and for what.
  const kept = useMemo(() => {
    const map = new Map<string, { manager: string | null; salary: number | null }>()
    for (const block of keepers[String(season)] ?? []) {
      for (const pick of block.keepers) {
        map.set(normalizePlayer(pick.player), { manager: block.manager, salary: pick.salary })
      }
    }
    return map
  }, [keepers, season])

  if (!draftPool) {
    return (
      <>
        <PageHeader
          path="~/draft"
          eyebrow="Auction night"
          title="Draft Board"
          lede="Consensus rankings with the kept players struck off."
        />
        <Panel>
          <Empty kicker="no snapshot">
            No rankings snapshot yet — run <code>python scripts/draft_pool.py</code> and commit.
          </Empty>
        </Panel>
      </>
    )
  }

  const rows = draftPool.players.map((player) => ({
    ...player,
    keeper: kept.get(normalizePlayer(player.player)),
  }))
  const availableCount = rows.filter((row) => !row.keeper).length
  const inPosition = rows.filter((row) => position === 'ALL' || row.pos === position)
  const visible = inPosition.filter((row) => showKept || !row.keeper)
  const visibleAvailable = inPosition.filter((row) => !row.keeper).length

  // Tier breaks: the board reads in groups, each with its own count.
  const tierSize = new Map<number, { total: number; available: number }>()
  for (const row of inPosition) {
    const entry = tierSize.get(row.tier) ?? { total: 0, available: 0 }
    entry.total += 1
    if (!row.keeper) entry.available += 1
    tierSize.set(row.tier, entry)
  }

  return (
    <div className="ops-room">
      <PageHeader
        path="~/draft"
        eyebrow={auctionDone ? `${season} auction · in the books` : 'Auction night'}
        title="Draft Board"
        lede={
          auctionDone
            ? `The ${season} auction has happened. This is the board as it stood: expert consensus with every keeper struck off.`
            : `The top-ranked veterans still reaching the ${season} auction. Rankings are expert consensus; every player already locked up as a keeper is struck off the moment the commissioner saves a list.`
        }
      />

      <div className="line-in mb-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <Stat label="Ranked players" value={draftPool.players.length} hint="Rookies excluded" />
        <Stat label="Still available" value={availableCount} tone="up" />
        <Stat
          label="Off the board"
          value={draftPool.players.length - availableCount}
          hint="Kept before the draft"
        />
        <Stat label="Experts polled" value={draftPool.experts} hint={draftPool.source} />
      </div>

      {/* The filter rail sticks under the top bar: on auction night a thumb
          deep in the WRs can still flip to RBs without scrolling back up. */}
      <div
        className="section-rail ops-under-bar sticky z-30 -mx-4 mb-4 px-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-9 lg:px-9"
        role="group"
        aria-label="Board filters"
      >
        {/* One row at 360 too: the positions scroll inside their own strip
            rather than pushing the toggle onto a second line. */}
        <div className="ops-rail flex items-center gap-x-3 py-2">
          <SegmentedControl<Position>
            value={position}
            onChange={(next) => setParam('pos', next === 'ALL' ? null : next)}
            options={POSITIONS.map((id) => ({ id, label: id }))}
          />
          <button
            type="button"
            className="btn ops-toggle min-h-[40px] shrink-0 px-3 py-1 text-[12.5px]"
            aria-pressed={showKept}
            aria-label={showKept ? 'Hide kept players' : 'Show kept players'}
            onClick={() => setParam('kept', showKept ? null : '1')}
          >
            {/* Fixed-width glyph: '+' and '✓' must not resize the button. */}
            <span aria-hidden className="inline-block w-3 text-center">
              {showKept ? '✓' : '+'}
            </span>{' '}
            Kept
          </button>
          <span className="tnum ml-auto hidden text-[12px] text-arc-ink-soft sm:inline" role="status">
            <span className="font-semibold text-arc-green">{visibleAvailable}</span>
            <span className="text-arc-ink-faint"> of {inPosition.length} available</span>
          </span>
        </div>
      </div>

      <Panel
        title={`${season} board`}
        subtitle={`${draftPool.scoring} scoring. Tiers and ranks straight from the source — the league adds only who's gone.`}
      >
        <table className="out ops-board">
          {/* The grid is declared here and sized in ops.css: left to itself
              the table re-measures when a Status chip grows from AVAILABLE
              to KEPT — VELAMOOR $69, and all seven columns slide. */}
          <colgroup>
            <col className="ops-c-rank" />
            <col />
            <col className="ops-c-pos" />
            <col className="ops-c-team" />
            <col className="ops-c-bye" />
            <col className="ops-c-tier" />
            <col className="ops-c-status" />
          </colgroup>
          <thead>
            <tr>
              <th className="n">Rank</th>
              <th>Player</th>
              <th>Pos</th>
              <th className="hidden sm:table-cell">Team</th>
              <th className="n hidden sm:table-cell">Bye</th>
              <th className="n hidden md:table-cell">Tier</th>
              <th className="hidden sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const breaks = index === 0 || visible[index - 1].tier !== row.tier
              const size = tierSize.get(row.tier)
              return [
                breaks && (
                  <tr key={`tier-${row.tier}-${row.rank}`} className="ops-tier">
                    <td colSpan={7}>
                      <span className="label text-[11px] text-arc-ink-soft">Tier {row.tier}</span>
                      {size && (
                        <span className="tnum ml-3 text-[11px] text-arc-ink-faint">
                          {size.available} of {size.total} available
                        </span>
                      )}
                    </td>
                  </tr>
                ),
                <tr key={row.rank} className={row.keeper ? 'ops-kept' : ''}>
                  <td className="n text-arc-ink-soft">{row.rank}</td>
                  <td className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      {!row.keeper && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-arc-lime sm:hidden"
                        />
                      )}
                      <Link
                        to={`/players/${playerSlug(row.player)}`}
                        className={`truncate transition-colors hover:text-arc-green ${
                          row.keeper ? 'text-arc-ink-faint line-through decoration-arc-red/70' : ''
                        }`}
                      >
                        {row.player}
                      </Link>
                    </span>
                    <span className="block truncate text-[11.5px] leading-snug text-arc-ink-faint sm:hidden">
                      {row.team} · bye {row.bye}
                      {row.keeper && (
                        <>
                          {' · '}
                          <span className="text-arc-ink-soft">
                            Kept — {managerName(managers, row.keeper.manager)}
                            {row.keeper.salary !== null ? ` ${money(row.keeper.salary)}` : ''}
                          </span>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="text-arc-ink-soft">{row.posRank}</td>
                  <td className="hidden text-arc-ink-faint sm:table-cell">{row.team}</td>
                  <td className="n hidden text-arc-ink-faint sm:table-cell">{row.bye}</td>
                  <td className="n hidden text-arc-ink-faint md:table-cell">{row.tier}</td>
                  <td className="hidden sm:table-cell">
                    {row.keeper ? (
                      <Chip tone="down">
                        Kept — {managerName(managers, row.keeper.manager)}
                        {row.keeper.salary !== null ? ` ${money(row.keeper.salary)}` : ''}
                      </Chip>
                    ) : (
                      <Chip tone="up">Available</Chip>
                    )}
                  </td>
                </tr>,
              ]
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="text-arc-ink-faint italic">
                  Nothing matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="border-t border-arc-line px-4 py-3.5 text-[12px] leading-relaxed text-arc-ink-faint sm:px-5">
          Source:{' '}
          <a
            className="text-arc-green underline underline-offset-2"
            href={draftPool.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {draftPool.source}
          </a>{' '}
          — {draftPool.season} draft, {draftPool.scoring.toLowerCase()}, {draftPool.experts}{' '}
          experts, source updated {draftPool.sourceUpdated}, retrieved {draftPool.retrieved}.
          Rookies are excluded by league preference (no NFL history in the record). Availability
          is computed against this site's keeper lists and updates as they change.
        </p>
      </Panel>
    </div>
  )
}
