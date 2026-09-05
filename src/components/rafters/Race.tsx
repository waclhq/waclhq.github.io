import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import ManagerTag from '../ManagerTag'
import { useFlipList } from '../ui'
import { useLeagueData } from '../../lib/data'
import { num } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import { animationsDisabled } from '../../lib/motion'
import { KEEPER_ERA_START } from '../../lib/stats'
import {
  RACE_METRICS,
  capitalize,
  numberWord,
  raceFrames,
  roman,
  type RaceMetric,
  type RaceRow,
} from '../../lib/rafters-history'

const SECOND = 1000

/**
 * Twenty-two seasons in twenty-two seconds. Press play and the league's
 * history replays one season a second: the year rolls, the cumulative table
 * re-sorts (FLIP, rows keyed by manager), the champion's row flashes in their
 * colour and their title count ticks up, and the ticker prints that season's
 * verdict. Deterministic; pauses off-screen and in background tabs. Under
 * reduced motion it is a year selector over the same table.
 */
export default function Race({ verdicts }: { verdicts: Map<number, string> }) {
  const { seasons } = useLeagueData()
  const still = useMemo(() => animationsDisabled(), [])
  const [metric, setMetric] = useState<RaceMetric>('titles')
  const frames = useMemo(() => raceFrames(seasons, metric), [seasons, metric])
  const last = frames.length - 1
  const [step, setStep] = useState(last)
  const [playing, setPlaying] = useState(false)
  const autoPaused = useRef(false)
  const root = useRef<HTMLElement>(null)
  const body = useRef<HTMLTableSectionElement>(null)
  useFlipList(body)

  const frame = frames[Math.min(step, last)]
  const count = frames.length
  const seconds = numberWord(count)

  // One season a second, and stop on the last one.
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setStep((current) => {
        if (current >= last) {
          window.clearInterval(id)
          return current
        }
        return current + 1
      })
    }, SECOND)
    return () => window.clearInterval(id)
  }, [playing, last])
  useEffect(() => {
    if (playing && step >= last) setPlaying(false)
  }, [playing, step, last])

  // Nobody watching, nothing moving: pause when the tab hides or the panel
  // scrolls away, and pick up again when it is back in view.
  useEffect(() => {
    const node = root.current
    if (!node) return
    let visible = true
    let hidden = document.hidden
    const settle = () => {
      const away = !visible || hidden
      if (away) {
        setPlaying((current) => {
          if (current) autoPaused.current = true
          return false
        })
      } else if (autoPaused.current) {
        autoPaused.current = false
        setPlaying(true)
      }
    }
    const onVisibility = () => {
      hidden = document.hidden
      settle()
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        settle()
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const play = useCallback(() => {
    autoPaused.current = false
    if (step >= last) setStep(0)
    setPlaying(true)
  }, [step, last])
  const pause = useCallback(() => {
    autoPaused.current = false
    setPlaying(false)
  }, [])
  const jump = useCallback(
    (to: number) => {
      autoPaused.current = false
      setPlaying(false)
      setStep(Math.max(0, Math.min(last, to)))
    },
    [last],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const onField = target.tagName === 'INPUT'
    if (event.key === 'ArrowLeft' && !onField) {
      event.preventDefault()
      jump(step - 1)
    } else if (event.key === 'ArrowRight' && !onField) {
      event.preventDefault()
      jump(step + 1)
    } else if (event.key === 'Home' && !onField) {
      event.preventDefault()
      jump(0)
    } else if (event.key === 'End' && !onField) {
      event.preventDefault()
      jump(last)
    } else if (event.key === ' ' && !still && target.tagName !== 'BUTTON' && !onField) {
      event.preventDefault()
      if (playing) pause()
      else play()
    }
  }

  const metricMeta = RACE_METRICS.find((option) => option.id === metric)!
  const secondary: RaceMetric = metric === 'titles' ? 'wins' : 'titles'
  const secondaryMeta = RACE_METRICS.find((option) => option.id === secondary)!
  const extras = (['wins', 'pointsFor'] as RaceMetric[]).filter(
    (id) => id !== metric && id !== secondary,
  )

  const cell = (row: RaceRow, id: RaceMetric) =>
    id === 'pointsFor' ? num(row.pointsFor, 0) : id === 'wins' ? `${row.wins}–${row.losses}` : row.titles

  const title = `${capitalize(seconds)} seasons in ${seconds} seconds`
  const verdict = verdicts.get(frame.year) ?? ''
  const keeperIndex = frames.findIndex((entry) => entry.year >= KEEPER_ERA_START)
  const atEnd = step >= last
  const champTitles = frame.rows.find((row) => row.manager === frame.champion)?.titles ?? 1

  return (
    <section
      ref={root}
      className="win race pop-in"
      style={{ animationDelay: '120ms' }}
      aria-labelledby="race-title"
      onKeyDown={onKeyDown}
    >
      <header className="win-head flex-wrap">
        <div className="min-w-0">
          <h2 id="race-title" className="label">
            {title}
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-arc-ink-soft">
            {still
              ? 'The running table after every season. Pick a year and the league stands as it stood that January.'
              : 'Press play and the league replays a season a second: the table re-sorts, the champion lights up, the count goes up.'}
          </p>
        </div>
        <div className="race-seg" role="group" aria-label="Metric">
          {RACE_METRICS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={metric === option.id}
              onClick={() => setMetric(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="race-body">
        <div className="race-stage">
          <div className="label">After the season</div>
          <div className="race-year" aria-hidden>
            {String(frame.year)
              .split('')
              .map((digit, index) => (
                <span key={`${index}-${digit}`} className="race-digit">
                  {digit}
                </span>
              ))}
          </div>
          <div className="sr-only" aria-live={playing ? 'off' : 'polite'}>
            After {frame.year}
          </div>

          <div className="race-champ" style={{ '--champ': managerColor(frame.champion) } as CSSProperties}>
            <ManagerTag id={frame.champion} size={26} />
            <span className="tnum text-arc-ink-soft">
              {frame.champWins}–{frame.champLosses}
            </span>
            <span className="tag race-champ-tag">Title {roman(champTitles)}</span>
          </div>

          <p className="race-verdict" role="status" aria-live={playing ? 'off' : 'polite'}>
            <span key={frame.year} className="race-verdict-line">
              {verdict}
            </span>
          </p>

          <div className="race-transport">
            <button
              type="button"
              className="btn race-step"
              aria-label="Previous season"
              disabled={step <= 0}
              onClick={() => jump(step - 1)}
            >
              ‹
            </button>
            {!still && (
              <button
                type="button"
                className={`btn race-play ${playing ? '' : 'btn-primary'}`}
                aria-pressed={playing}
                onClick={() => (playing ? pause() : play())}
              >
                {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
              </button>
            )}
            <button
              type="button"
              className="btn race-step"
              aria-label="Next season"
              disabled={atEnd}
              onClick={() => jump(step + 1)}
            >
              ›
            </button>
            <span className="race-clock tnum" aria-hidden>
              {step + 1}
              <span className="text-arc-ink-faint"> / {count}</span>
            </span>
          </div>

          <div className="race-scrub">
            <input
              type="range"
              min={0}
              max={last}
              step={1}
              value={step}
              aria-label="Season"
              aria-valuetext={`After ${frame.year}`}
              onChange={(event) => jump(Number(event.target.value))}
            />
            <div className="race-ticks" aria-hidden>
              {frames.map((entry, index) => (
                <span
                  key={entry.year}
                  className={`race-tick ${index === step ? 'is-at' : ''} ${
                    index === keeperIndex ? 'is-era' : ''
                  }`}
                />
              ))}
            </div>
            <div className="race-tick-labels" aria-hidden>
              <span>{frames[0]?.year}</span>
              {keeperIndex > 0 && (
                <span
                  className="race-era-label"
                  style={{ left: `${(keeperIndex / last) * 100}%` }}
                >
                  keeper era
                </span>
              )}
              <span>{frames[last]?.year}</span>
            </div>
          </div>

          {/* The tape: every title as a swatch in its owner's colour, so a
              dynasty reads as a run before the table says so. */}
          <div className="race-tape" aria-hidden>
            {frames.map((entry, index) => (
              <span
                key={entry.year}
                className={`race-swatch ${index === step ? 'is-at' : ''} ${index > step ? 'is-ahead' : ''}`}
                style={{ '--c': managerColor(entry.champion) } as CSSProperties}
              />
            ))}
          </div>
          <div className="race-tape-caption">
            {(() => {
              const leader = frame.rows[0]
              const tied = frame.rows.filter((row) => row[metric] === leader[metric]).length
              const lead =
                metric === 'titles'
                  ? `${leader.titles} title${leader.titles === 1 ? '' : 's'}`
                  : metric === 'wins'
                    ? `${leader.wins} wins`
                    : `${num(leader.pointsFor, 0)} points`
              return (
                <>
                  Leads after {frame.year}:{' '}
                  <span className="text-arc-ink">
                    <ManagerTag id={leader.manager} size={16} />
                  </span>{' '}
                  with {lead}
                  {tied > 1 ? `, tied ${tied} ways` : ''}.
                </>
              )
            })()}
          </div>
        </div>

        <div className="race-table">
          <table className="out race-out">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Manager</th>
                <th className="n">{metricMeta.column}</th>
                <th className="n">{secondaryMeta.column}</th>
                {extras.map((id) => (
                  <th key={id} className="n hidden sm:table-cell">
                    {RACE_METRICS.find((option) => option.id === id)!.column}
                  </th>
                ))}
                <th className="n hidden sm:table-cell">Seasons</th>
              </tr>
            </thead>
            <tbody ref={body}>
              {frame.rows.map((row, index) => {
                const podium = ['pod-1', 'pod-2', 'pod-3'][index]
                return (
                  <tr
                    key={row.manager}
                    data-flip={row.manager}
                    className={`race-row ${row.champion ? 'is-champ' : ''} ${index === 0 ? 'lead' : ''}`}
                    data-pulse={row.champion ? frame.year % 2 : undefined}
                    style={{ '--champ': managerColor(row.manager) } as CSSProperties}
                  >
                    <td className={`n w-8 ${podium ?? 'text-arc-ink-faint'}`}>{index + 1}</td>
                    <td>
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <ManagerTag id={row.manager} size={22} />
                        {row.champion && <span className="race-champ-pip">Champ</span>}
                      </span>
                    </td>
                    <td className="n text-arc-green">
                      {metric === 'titles' ? (
                        <span key={row.titles} className="race-count">
                          {row.titles}
                        </span>
                      ) : (
                        cell(row, metric)
                      )}
                    </td>
                    <td className="n text-arc-ink-soft">
                      {secondary === 'titles' ? (
                        <span key={row.titles} className="race-count">
                          {row.titles}
                        </span>
                      ) : (
                        cell(row, secondary)
                      )}
                    </td>
                    {extras.map((id) => (
                      <td key={id} className="n hidden text-arc-ink-soft sm:table-cell">
                        {cell(row, id)}
                      </td>
                    ))}
                    <td className="n hidden text-arc-ink-faint sm:table-cell">{row.seasons}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
