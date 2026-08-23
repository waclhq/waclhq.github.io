import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor, managerInitials } from '../lib/identity'
import { Confetti, PixelPlayer } from './effects'

/**
 * High-score table. Twenty-two title seasons, each tagged with which title it
 * was for that manager, so a dynasty reads as a run rather than a list.
 */
export default function ChampionsWall() {
  const { seasons, managers } = useLeagueData()

  const rows = useMemo(() => {
    const running = new Map<string, number>()
    return [...seasons]
      .sort((a, b) => a.year - b.year)
      .map((season) => {
        const count = (running.get(season.champion) ?? 0) + 1
        running.set(season.champion, count)
        return { season, nth: count }
      })
      .reverse()
  }, [seasons])

  return (
    <div className="p-3">
      {rows.map(({ season, nth }, index) => {
        const manager = managers.find((candidate) => candidate.id === season.champion)
        const color = managerColor(season.champion)
        return (
          <Link
            key={season.year}
            to={`/managers/${season.champion}`}
            className="hover-wiggle relative mb-2 flex items-center gap-3 overflow-hidden border-[3px] border-arc-line bg-arc-panel px-3 py-2 no-underline shadow-hard-sm last:mb-0"
          >
            {index === 0 && <Confetti />}
            <span className="arcade w-11 shrink-0 text-[11px] text-arc-ink-soft">
              {season.year}
            </span>
            <span
              className="badge"
              style={{ background: color, width: 30, height: 30, fontSize: 10 }}
              aria-hidden
            >
              {managerInitials(manager, season.champion)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="arcade block truncate text-[12px]" style={{ color }}>
                {managerName(managers, season.champion)}
              </span>
              <span className="block truncate text-[13px] text-arc-ink-soft">
                beat {managerName(managers, season.runnerUp)}
              </span>
            </span>
            {nth > 1 && (
              <span
                className="arcade shrink-0 border-2 border-arc-line px-1.5 py-1 text-[8px]"
                style={{ background: 'var(--color-arc-yellow)' }}
                title={`Title number ${nth} for this manager`}
              >
                ×{nth}
              </span>
            )}
            <span
              className="glint flex shrink-0 items-center gap-1"
              style={{ ['--glint-delay' as string]: `${(index % 6) * 1.4}s` }}
              aria-hidden
            >
              {index === 0 && <PixelPlayer size={28} color={color} />}
              <span className="text-[16px]">{index === 0 ? '👑' : '🏆'}</span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
