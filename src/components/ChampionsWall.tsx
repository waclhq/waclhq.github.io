import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ManagerTag from './ManagerTag'
import { managerName, useLeagueData } from '../lib/data'
import { managerColor } from '../lib/identity'
import { titleLedger } from '../lib/rafters-history'

/**
 * The wall of champions, in the book's own table idiom: year, champion, who
 * they beat, and which title it was for them — so a dynasty reads as a run
 * (TITLE 4) rather than a list. The year is a door into the rafters.
 *
 * Shows the recent run by default with the full wall one tap away, so on a
 * phone the panel is a table, not a scroll trap.
 */
export default function ChampionsWall({ limit }: { limit?: number }) {
  const { seasons, managers } = useLeagueData()
  const [all, setAll] = useState(false)
  // Beside the trade flow on a wide screen the panel has room for a decade;
  // on a phone six rows keep the page scrolling as one surface.
  const [shownByDefault] = useState(() => {
    if (limit !== undefined) return limit
    try {
      return window.matchMedia('(min-width: 1024px)').matches ? 11 : 6
    } catch {
      return 6
    }
  })

  const rows = useMemo(() => [...titleLedger(seasons)].reverse(), [seasons])
  const shown = all ? rows : rows.slice(0, shownByDefault)

  return (
    <div className="champ-wall">
      <table className="out">
        <thead>
          <tr>
            <th className="n">Year</th>
            <th>Champion</th>
            <th className="hidden sm:table-cell">Final</th>
            <th className="n">Title</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => {
            const color = managerColor(row.champion)
            return (
              <tr
                key={row.year}
                className={index === 0 ? 'lead' : undefined}
                style={
                  index === 0
                    ? {
                        backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 10%, transparent), transparent 60%)`,
                        boxShadow: `inset 2px 0 0 ${color}`,
                      }
                    : undefined
                }
              >
                <td className="n">
                  <Link
                    to={`/almanac?year=${row.year}`}
                    className="champ-year"
                    title={`Read the ${row.year} season`}
                  >
                    {row.year}
                  </Link>
                </td>
                <td>
                  <ManagerTag id={row.champion} size={26} />
                </td>
                <td className="hidden text-arc-ink-soft sm:table-cell">
                  beat {managerName(managers, row.runnerUp)}
                </td>
                <td className="n">
                  {row.nth > 1 ? (
                    <span
                      className="tag"
                      style={{ background: 'var(--color-arc-yellow)', color: 'var(--color-arc-bg)' }}
                      title={`Title number ${row.nth} for this manager`}
                    >
                      Title {row.nth}
                    </span>
                  ) : (
                    <span className="text-[12px] text-arc-ink-faint">first</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > shownByDefault && (
        <button
          type="button"
          className="block min-h-[44px] w-full border-t border-arc-line px-4 py-2.5 text-left text-[12px] tracking-[0.08em] text-arc-ink-faint uppercase transition-colors hover:text-arc-green"
          onClick={() => setAll((current) => !current)}
          aria-expanded={all}
        >
          {all ? '− Recent champions only' : `+ All ${rows.length} seasons`}
        </button>
      )}
    </div>
  )
}
