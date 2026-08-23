import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import ManagerTag from '../components/ManagerTag'
import { Fold, PageHeader } from '../components/ui'
import { managerName, useLeagueData } from '../lib/data'
import { num } from '../lib/format'
import { almanac, type AlmanacEntry } from '../lib/analytics'

/**
 * The record book. Every sentence is computed — champions' actual rosters and
 * their real fantasy production, the season's biggest trade, the luck ledger —
 * with prose pools conditioned on how the season actually went, so a wire-to-
 * wire steamroll and a backdoor title don't read like the same year.
 */
export default function Almanac() {
  const data = useLeagueData()
  const { managers } = data
  const entries = useMemo(() => almanac(data), [data])

  const name = (id: string | null | undefined) => managerName(managers, id)
  const pick = <T,>(pool: T[], seed: number) => pool[seed % pool.length]

  const prose = (entry: AlmanacEntry): string => {
    const champ = name(entry.champion)
    const ru = name(entry.runnerUp)
    const record = `${entry.champWins}–${entry.champLosses}`
    const games = entry.champWins + entry.champLosses
    const winPct = games ? entry.champWins / games : 0
    const seed = entry.year
    const parts: string[] = []

    // ---- opener, conditioned on how the title was actually won ----
    if (winPct >= 0.78) {
      parts.push(
        pick(
          [
            `${entry.year} belonged to ${champ} from wire to wire — ${record}, with the rest of the league playing for second by Halloween.`,
            `${champ} turned ${entry.year} into a procession: ${record}, and the engraver could have started on the trophy in November.`,
            `There are seasons that feel close in the retelling. ${entry.year} is not one of them — ${champ} went ${record} and never looked back.`,
          ],
          seed,
        ),
      )
    } else if (winPct >= 0.6) {
      parts.push(
        pick(
          [
            `${champ} took ${entry.year} the professional way: ${record}, steady scoring, and the right week to peak.`,
            `The ${entry.year} crown went to ${champ} at ${record} — never the loudest team in the room, always the one still standing.`,
            `${champ} closed out ${entry.year} at ${record} and won the weeks that mattered, which is the only column the trophy reads.`,
          ],
          seed,
        ),
      )
    } else {
      parts.push(
        pick(
          [
            `Nobody circled ${champ} in ${entry.year} — ${record} in the regular season — and then the playoffs started and none of that mattered.`,
            `${champ} won ${entry.year} the burglar's way: a ${record} regular season, a hot December, and a trophy that record-watchers still grumble about.`,
            `The ${entry.year} title is proof you only have to be good in the last three weeks: ${champ}, ${record}, champion anyway.`,
          ],
          seed,
        ),
      )
    }

    // ---- the engine: real roster, real points ----
    if (entry.champStars.length >= 2) {
      const [a, b, c] = entry.champStars
      const starText = c
        ? `${a.player} (${num(a.points, 0)} pts), ${b.player} (${num(b.points, 0)}) and ${c.player} (${num(c.points, 0)})`
        : `${a.player} (${num(a.points, 0)} pts) and ${b.player} (${num(b.points, 0)})`
      parts.push(
        pick(
          [
            `The engine room: ${starText}.`,
            `The roster did the talking — ${starText}.`,
            `Built on ${starText}, and it showed every Sunday.`,
          ],
          seed + 1,
        ),
      )
    }

    // ---- the beaten finalist ----
    if (entry.runnerUpStar) {
      parts.push(
        pick(
          [
            `${ru} brought ${entry.runnerUpStar.player} (${num(entry.runnerUpStar.points, 0)} pts) to the final and still left with silver.`,
            `Not even ${entry.runnerUpStar.player}'s ${num(entry.runnerUpStar.points, 0)} points could drag ${ru} past the line.`,
            `Second place went to ${ru}, whose ${entry.runnerUpStar.player} deserved better than the runner-up photo.`,
          ],
          seed + 2,
        ),
      )
    } else if (entry.runnerUp) {
      parts.push(`${ru} finished second, which the record book notes and nobody frames.`)
    }

    // ---- season texture: points vs rings, the luck ledger ----
    if (entry.topScorer && entry.topScorer.manager !== entry.champion) {
      parts.push(
        pick(
          [
            `The heaviest scoring actually belonged to ${name(entry.topScorer.manager)} at ${num(entry.topScorer.avg, 1)} a week — points and rings remain different currencies.`,
            `${name(entry.topScorer.manager)} out-scored everyone (${num(entry.topScorer.avg, 1)}/wk) and has only this sentence to show for it.`,
          ],
          seed + 3,
        ),
      )
    }
    if (entry.unluckiest && entry.unluckiest.luck < -2.2) {
      parts.push(
        `Spare a thought for ${name(entry.unluckiest.manager)}, shorted ${num(Math.abs(entry.unluckiest.luck), 1)} wins by the schedule — the quiet tragedy of the year.`,
      )
    } else if (entry.luckiest && entry.luckiest.luck > 2.2) {
      parts.push(
        `${name(entry.luckiest.manager)} banked ${num(entry.luckiest.luck, 1)} more wins than the points earned, and sent the schedule a thank-you card.`,
      )
    }

    // ---- the market ----
    if (entry.bigTrade) {
      parts.push(
        `Biggest swing of the season: ${name(entry.bigTrade.seller)} sent ${entry.bigTrade.players} to ${name(entry.bigTrade.buyer)} for $${entry.bigTrade.total} in future auction money.`,
      )
    } else if (entry.wireLine) {
      parts.push(`From the trade wire that year: “${entry.wireLine}.”`)
    }

    return parts.join(' ')
  }

  return (
    <>
      <PageHeader
        eyebrow="The official record, machine-written"
        title="The Almanac"
        lede="Twenty-two seasons, one entry per year, folded to the verdict — tap a season to read its full story. Rosters, points, trades and luck are computed from the record; the prose just delivers the verdicts."
      />

      <div className="space-y-3">
        {entries.map((entry, index) => (
          <Fold
            key={entry.year}
            delay={Math.min(index * 30, 300)}
            defaultOpen={index === 0}
            summary={
              <>
                <span className="arcade w-14 shrink-0 text-[17px] text-arc-ink">
                  {entry.year}
                </span>
                <span className="pointer-events-none min-w-0">
                  <ManagerTag id={entry.champion} link={false} size={24} />
                </span>
                <span className="hidden truncate text-[12px] text-arc-ink-faint sm:inline">
                  def. {name(entry.runnerUp)}
                </span>
                {!entry.keeperEra && (
                  <span className="hidden text-[10px] tracking-[0.1em] text-arc-ink-faint uppercase md:inline">
                    pre-keeper
                  </span>
                )}
              </>
            }
          >
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:gap-6">
              <div className="shrink-0 sm:w-40">
                <div className="arcade text-[26px] text-arc-ink">{entry.year}</div>
                <div className="mt-2">
                  <ManagerTag id={entry.champion} size={30} />
                </div>
                <div className="arcade mt-2 text-[10px] text-arc-yellow">CHAMPION</div>
                {entry.champStars.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {entry.champStars.map((star) => (
                      <div key={star.player} className="text-[11.5px] leading-tight">
                        <span className="text-arc-ink-soft">{star.player}</span>{' '}
                        <span className="tnum text-arc-ink-faint">
                          {star.position} · {num(star.points, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!entry.keeperEra && (
                  <div className="mt-2 text-[11px] text-arc-ink-faint">pre-keeper era</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] leading-relaxed text-arc-ink-soft">{prose(entry)}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-arc-ink-faint">
                  <span>
                    2nd:{' '}
                    <Link
                      to={`/managers/${entry.runnerUp}`}
                      className="text-arc-ink-soft hover:underline"
                    >
                      {name(entry.runnerUp)}
                    </Link>
                  </span>
                  {entry.third && (
                    <span>
                      3rd:{' '}
                      <Link
                        to={`/managers/${entry.third}`}
                        className="text-arc-ink-soft hover:underline"
                      >
                        {name(entry.third)}
                      </Link>
                    </span>
                  )}
                  {entry.topScorer && (
                    <span>
                      Top scorer: {name(entry.topScorer.manager)} ({num(entry.topScorer.avg, 1)}
                      /wk)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Fold>
        ))}
      </div>
    </>
  )
}
