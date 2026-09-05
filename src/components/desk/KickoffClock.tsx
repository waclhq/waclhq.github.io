import type { CSSProperties } from 'react'
import { nflKickoff, seasonClock, untilKickoff, type SeasonClock } from '../../lib/season'
import { FlapLine, FlapPair } from './Flap'
import { useMinuteClock } from './hooks'

/**
 * The kickoff clock. A split-flap board above the Ledger's title that reads
 * what the season clock says: a countdown to Thursday night before kickoff,
 * the week and a seventeen-notch bar once the season is under way, and its
 * own lines for the playoffs and the offseason. Ticks once a minute; only the
 * cards that change flip.
 */

const REGULAR_WEEKS = 14
const TOTAL_WEEKS = 17
/** Mirrors the Thursday-night offset untilKickoff() applies. */
const KICKOFF_OFFSET_MS = 20.25 * 3_600_000

function kickoffMoment(clock: SeasonClock, now: Date): Date {
  const thisYear = new Date(clock.kickoff.getTime() + KICKOFF_OFFSET_MS)
  if (thisYear.getTime() > now.getTime()) return thisYear
  return new Date(nflKickoff(clock.season + 1).getTime() + KICKOFF_OFFSET_MS)
}

function dayLabel(date: Date, withYear = false): string {
  return date
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    })
    .replace(/,/g, '')
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

function WeekBar({ week, offset }: { week: number; offset: number }) {
  return (
    <div className="desk-weekrow" style={{ '--i': offset } as CSSProperties} aria-hidden>
      <ol className="desk-weeks">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
          const n = i + 1
          const state = n < week ? 'is-past' : n === week ? 'is-now' : ''
          return (
            <li
              key={n}
              className={`desk-week ${state} ${n > REGULAR_WEEKS ? 'is-playoff' : ''}`}
            />
          )
        })}
      </ol>
      <div className="desk-weeks-cap">
        <span className="label">Wk 1</span>
        <span className="label">Playoffs</span>
      </div>
    </div>
  )
}

export default function KickoffClock({ season }: { season: number }) {
  const now = useMinuteClock()
  const clock = seasonClock(season, now)
  const target = kickoffMoment(clock, now)
  const left = untilKickoff({ ...clock, kickoff: new Date(target.getTime() - KICKOFF_OFFSET_MS) }, now)
  const week = clock.week ?? 0
  const countdown = clock.phase !== 'in-season' && clock.phase !== 'playoffs'

  const line = clock.eyebrow
  let right: string
  let summary: string
  switch (clock.phase) {
    case 'in-season':
      right = `Regular season · Wk ${week} of ${REGULAR_WEEKS}`
      summary = `${season} season, week ${week} of ${TOTAL_WEEKS}.`
      break
    case 'playoffs':
      right = `Playoffs · Wk ${week} of ${TOTAL_WEEKS}`
      summary = `${season} playoffs, week ${week} of ${TOTAL_WEEKS}.`
      break
    case 'offseason':
      right = `Next kickoff · ${dayLabel(target, target.getFullYear() !== now.getFullYear())}`
      summary = `${season} offseason. ${plural(left.days, 'day')}, ${plural(left.hours, 'hour')} and ${plural(left.minutes, 'minute')} to the next kickoff.`
      break
    default:
      right = `Kickoff · ${dayLabel(target)} · ${timeLabel(target)}`
      summary = `${line}. ${plural(left.days, 'day')}, ${plural(left.hours, 'hour')} and ${plural(left.minutes, 'minute')} to Thursday night, ${dayLabel(target)}.`
  }

  const lineLength = line.replace(/ /g, '').length

  return (
    <div className="desk-board" role="timer" aria-label={summary}>
      <div className="desk-board-cap" aria-hidden>
        <span className="desk-lamp" />
        <span className="label">{dayLabel(now)}</span>
        <span className="label desk-board-cap-r">{right}</span>
      </div>
      <FlapLine text={line} size="sm" />
      {countdown ? (
        <div className="desk-count" aria-hidden>
          <FlapPair value={left.days} caption="days" offset={lineLength} digits={left.days > 99 ? 3 : 2} />
          <span className="desk-colon" />
          <FlapPair value={left.hours} caption="hrs" offset={lineLength + 3} />
          <span className="desk-colon" />
          <FlapPair value={left.minutes} caption="min" offset={lineLength + 5} />
        </div>
      ) : (
        <WeekBar week={week} offset={lineLength} />
      )}
    </div>
  )
}
