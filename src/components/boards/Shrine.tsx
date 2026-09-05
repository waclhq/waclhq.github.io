import { useEffect, useRef } from 'react'
import ManagerTag from '../ManagerTag'
import { Panel } from '../ui'
import type { CareerLuck, GoatRow, TortureRow } from '../../lib/analytics'
import { shrineFacts, spell } from '../../lib/boards-facts'
import { managerName, useLeagueData } from '../../lib/data'
import { num } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import type { Season } from '../../lib/types'

/**
 * The shrine. Wired to goat[0], so the flattery is always, technically,
 * science — and every sentence is derived from the table it sits under, so
 * the arithmetic can never contradict the prose.
 */
export default function Shrine({
  goat,
  seasons,
  torture,
  luck,
}: {
  goat: GoatRow[]
  seasons: Season[]
  torture: TortureRow[]
  luck: CareerLuck[]
}) {
  const { managers } = useLeagueData()
  const facts = shrineFacts(goat, seasons)
  if (!facts) return null
  const shrine = goat[0]
  const name = managerName(managers, shrine.manager)
  const grind = torture.find((row) => row.manager === shrine.manager)
  const fortune = luck.find((row) => row.manager === shrine.manager)
  const second = facts.runnerUp
  const color = managerColor(shrine.manager)

  return (
    <Panel
      title="the g.o.a.t. — a peer-reviewed appraisal"
      subtitle="Commissioned by no one. Disputed by many. Settled by arithmetic."
    >
      <div className="px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <ManagerTag id={shrine.manager} size={34} showName={false} />
            <span className="display" style={{ color }}>
              {name}
            </span>
          </div>
          <Flex color={color} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="label">GOAT points</div>
            <div className="tnum mt-1 text-[22px] text-arc-green">+{num(shrine.sumZ, 2)}</div>
          </div>
          <div>
            <div className="label">Rings</div>
            <div className="tnum mt-1 text-[22px] text-arc-yellow">{shrine.titles}</div>
          </div>
          <div>
            <div className="label">Playoff trips</div>
            <div className="tnum mt-1 text-[22px] text-arc-ink">
              {grind?.playoffAppearances ?? '—'}/{grind?.seasonsPlayed ?? '—'}
            </div>
          </div>
          <div>
            <div className="label">Peak season</div>
            <div className="tnum mt-1 text-[22px] text-arc-ink">{shrine.bestSeason.year}</div>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-arc-ink-soft">
          <p>
            The committee was asked a simple question — who is the greatest manager in league
            history — and the committee, being made entirely of arithmetic, is incapable of
            flattery. It answered <b className="text-arc-ink">{name}</b>: {num(shrine.sumZ, 2)}{' '}
            career GOAT points, {facts.clubLine}, {facts.runLine}. Dominance is easy for a
            summer. He has been doing it since {facts.firstYear}.
          </p>
          <p>
            The jewellery case holds{' '}
            <b className="text-arc-ink">
              {shrine.titles} {shrine.titles === 1 ? 'ring' : 'rings'}
            </b>{' '}
            — {facts.ringsLine} — won against entirely different generations of opponents, each
            of whom arrived confident and left with a story about the year they almost beat him.{' '}
            {grind?.playoffAppearances ?? 0} playoff trips in {grind?.seasonsPlayed ?? 0} seasons
            means the postseason does not so much invite him as assume him.
          </p>
          {second && (
            <p>
              The margin over second place is {num(facts.gap, 2)} GOAT points, which sounds
              modest until you remember the units: whole careers in this league sum to less than
              one. Somewhere below, {managerName(managers, second.manager)} has spent{' '}
              {spell(second.seasons)} seasons accumulating {num(second.sumZ, 2)} — almost being
              the operative word, the cruellest word, and the committee&apos;s favourite word.
            </p>
          )}
          {fortune && fortune.totalLuck > 5 && (
            <p>
              Critics will note +{num(fortune.totalLuck, 1)} career wins of luck. The committee
              has reviewed this objection and finds that fortune, like everyone else in this
              league, simply respects the résumé. Findings are final. Appeals may be filed with
              the trade queue, where they will be considered carefully and rejected.
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

/**
 * The GOAT himself, in motion — but only when the panel is on screen and FX
 * are on, and never a black rectangle: a lit card sits behind the tape, so
 * a reduced-motion phone (which never loads the 2.7MB file) and a slow
 * connection both see something worth the space.
 */
function Flex({ color }: { color: string }) {
  const still = animationsDisabled()
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const node = video.current
    if (!node || still) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) node.play().catch(() => undefined)
        else node.pause()
      },
      { threshold: 0.25 },
    )
    observer.observe(node)
    const onVisibility = () => {
      if (document.hidden) node.pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [still])

  return (
    <div
      className="relative aspect-video w-44 overflow-hidden rounded-lg border border-arc-line sm:w-52"
      style={{ ['--c' as string]: color }}
    >
      <div className="shrine-still" aria-hidden={!still}>
        <div>
          <div className="display text-[26px] leading-none" style={{ color }}>
            G.O.A.T.
          </div>
          <div className="label mt-1 text-[10px]">
            {still ? 'the flex plays with fx on' : 'the flex, on tape'}
          </div>
        </div>
      </div>
      {!still && (
        <video
          ref={video}
          className="relative h-full w-full object-cover"
          src={`${import.meta.env.BASE_URL}media/goat-flex.mp4`}
          muted
          loop
          playsInline
          preload="none"
          aria-label="The GOAT, flexing"
        />
      )}
    </div>
  )
}
