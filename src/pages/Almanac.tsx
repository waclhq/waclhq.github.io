import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ManagerTag from '../components/ManagerTag'
import { PageHeader } from '../components/ui'
import Rafters from '../components/rafters/Rafters'
import Race from '../components/rafters/Race'
import { InlineManager, SeasonFold } from '../components/rafters/SeasonFold'
import { managerName, useLeagueData } from '../lib/data'
import { num } from '../lib/format'
import { animationsDisabled } from '../lib/motion'
import { capitalize, firstSentence, numberWord, titleLedger } from '../lib/rafters-history'
import { playerSlug } from '../lib/search'
import { almanac, type AlmanacEntry } from '../lib/analytics'
import type { Manager } from '../lib/types'

/**
 * The record book. Every sentence is computed — champions' actual rosters and
 * their real fantasy production, the season's biggest trade, the luck ledger —
 * with prose pools conditioned on how the season actually went, so a wire-to-
 * wire steamroll and a backdoor title don't read like the same year.
 */
function prose(entry: AlmanacEntry, managers: Manager[]): string {
  const name = (id: string | null | undefined) => managerName(managers, id)
  const pick = <T,>(pool: T[], seed: number) => pool[seed % pool.length]
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

export default function Almanac() {
  const data = useLeagueData()
  const { managers, seasons } = data
  const entries = useMemo(() => almanac(data), [data])
  const banners = useMemo(() => titleLedger(seasons), [seasons])
  const stories = useMemo(
    () => new Map(entries.map((entry) => [entry.year, prose(entry, managers)])),
    [entries, managers],
  )
  const verdicts = useMemo(
    () => new Map([...stories].map(([year, story]) => [year, firstSentence(story)])),
    [stories],
  )
  const name = (id: string | null | undefined) => managerName(managers, id)
  const count = entries.length
  const latest = entries[0]?.year ?? null

  // ?year= names the open season, so a link to 2011 lands on 2011. Local
  // state lets a reader close the open one without the URL arguing.
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('year'))
  const paramYear = entries.some((entry) => entry.year === requested) ? requested : null
  const [openYear, setOpenYear] = useState<number | null>(paramYear ?? latest)
  const landed = useRef(false)

  useEffect(() => {
    if (paramYear !== null) setOpenYear(paramYear)
  }, [paramYear])

  const scrollTo = (id: string) => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: animationsDisabled() ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  // A deep link opens on its season, not on the rafters.
  useEffect(() => {
    if (landed.current) return
    landed.current = true
    if (paramYear !== null) scrollTo(String(paramYear))
  }, [paramYear])

  const choose = (year: number | null, scroll = false) => {
    setOpenYear(year)
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (year === null) next.delete('year')
        else next.set('year', String(year))
        return next
      },
      { replace: true },
    )
    if (scroll && year !== null) scrollTo(String(year))
  }

  const decades = useMemo(() => {
    const seen = new Map<number, number>()
    for (const entry of entries) {
      const decade = Math.floor(entry.year / 10) * 10
      if (!seen.has(decade)) seen.set(decade, entry.year)
    }
    return [...seen].map(([decade, first]) => ({ label: `${decade}s`, first }))
  }, [entries])

  const seasonsWord = capitalize(numberWord(count))

  return (
    <>
      <PageHeader
        eyebrow="The official record, machine-written"
        title="The Almanac"
        lede={`${seasonsWord} seasons hang in the rafters. Tap a banner or a year to read its story: rosters, points, trades and luck are computed from the record, and the prose only delivers the verdicts.`}
      />

      <Rafters banners={banners} current={openYear} onPick={(year) => choose(year, true)} />

      <div className="mt-6">
        <Race verdicts={verdicts} />
      </div>

      <nav
        aria-label="Seasons"
        className="section-rail sticky top-[calc(env(safe-area-inset-top,0px)+56px)] z-30 -mx-4 mt-8 mb-4 px-4 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-9 lg:px-9"
      >
        <div className="flex items-center gap-1.5 py-2">
          <span className="label mr-1 hidden sm:inline">Seasons</span>
          {decades.map((decade) => (
            <button
              key={decade.label}
              type="button"
              className="fold-jump"
              onClick={() => scrollTo(String(decade.first))}
            >
              {decade.label}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            className="fold-jump fold-jump-quiet"
            onClick={() => {
              document.querySelector('.rafters')?.scrollIntoView({
                behavior: animationsDisabled() ? 'auto' : 'smooth',
                block: 'start',
              })
            }}
          >
            ↑ Rafters
          </button>
        </div>
      </nav>

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const open = entry.year === openYear
          const banner = banners.find((candidate) => candidate.year === entry.year)
          return (
            <SeasonFold
              key={entry.year}
              id={String(entry.year)}
              delay={Math.min(index * 30, 300)}
              open={open}
              onToggle={() => choose(open ? null : entry.year)}
              summary={
                <>
                  <span className="fold-year w-14 shrink-0">{entry.year}</span>
                  <span className="pointer-events-none min-w-0">
                    <ManagerTag id={entry.champion} link={false} size={24} />
                  </span>
                  <span className="truncate text-[12px] text-arc-ink-faint">
                    def. {name(entry.runnerUp)}
                  </span>
                  <span className="tnum ml-auto shrink-0 text-[12px] text-arc-ink-soft">
                    {entry.champWins}–{entry.champLosses}
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
                  <div className="fold-year-big">{entry.year}</div>
                  <div className="mt-2">
                    <ManagerTag id={entry.champion} size={30} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="arcade text-[10px] text-arc-yellow">CHAMPION</span>
                    {banner && banner.nth > 1 && (
                      <span className="tag fold-title-tag">Title {banner.nth}</span>
                    )}
                  </div>
                  {entry.champStars.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {entry.champStars.map((star) => (
                        <div key={star.player} className="text-[11.5px] leading-tight">
                          <Link
                            to={`/players/${playerSlug(star.player)}`}
                            className="inline-player"
                          >
                            {star.player}
                          </Link>{' '}
                          <span className="tnum text-arc-ink-faint">
                            {star.position} · {num(star.points, 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!entry.keeperEra && (
                    <div className="mt-2 text-[11px] leading-snug text-arc-ink-faint">
                      pre-keeper era · points as scored that year
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] leading-relaxed text-arc-ink-soft">
                    {stories.get(entry.year)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-arc-ink-faint">
                    {entry.runnerUp && (
                      <span>
                        2nd: <InlineManager id={entry.runnerUp} name={name(entry.runnerUp)} />
                      </span>
                    )}
                    {entry.third && (
                      <span>
                        3rd: <InlineManager id={entry.third} name={name(entry.third)} />
                      </span>
                    )}
                    {entry.topScorer && (
                      <span>
                        Top scorer:{' '}
                        <span className="text-arc-ink-soft">{name(entry.topScorer.manager)}</span>{' '}
                        ({num(entry.topScorer.avg, 1)}/wk)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SeasonFold>
          )
        })}
      </div>
    </>
  )
}
