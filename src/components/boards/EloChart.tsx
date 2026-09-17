import { useEffect, useMemo, useRef, useState } from 'react'
import { Plot } from '../charts'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import type { ManagerId } from '../../lib/types'

/*
 * Empires, as a constellation. Twelve lines are spaghetti until one of them
 * is yours: tapping a legend chip isolates that manager (the rest dim to a
 * whisper), the seat-holder and the reigning champion are lit by default,
 * and the tooltip reads as a standings snapshot — leader first, five deep on
 * a phone so it never hides the plot it describes. Colour follows the
 * manager, as it does everywhere on the site; the chips and the ranked
 * tooltip carry identity for anyone the colours don't separate.
 */

type Row = { year: number } & Record<ManagerId, number | undefined>

export default function EloChart({
  rows,
  ids,
  defaultFocus,
  height = 340,
}: {
  rows: Row[]
  ids: ManagerId[]
  /** Who is lit before anyone taps: the seat-holder, the reigning champion. */
  defaultFocus: ManagerId[]
  height?: number
}) {
  const { managers } = useLeagueData()
  const [focus, setFocus] = useState<Set<ManagerId>>(() => new Set(defaultFocus))
  // A seat picked after mount lights up too, without clobbering taps.
  const defaultKey = defaultFocus.join('|')
  const chosen = useRef(false)
  useEffect(() => {
    chosen.current = false
    setFocus(new Set(defaultKey ? defaultKey.split('|') : []))
  }, [defaultKey])

  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const sync = () => setPhone(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // Domain trimmed to the data, snapped to 25s, ticks every 50.
  const { domain, ticks } = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const row of rows) {
      for (const id of ids) {
        const value = row[id]
        if (typeof value !== 'number') continue
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
    }
    if (!Number.isFinite(min)) return { domain: [1400, 1600] as [number, number], ticks: [1400, 1500, 1600] }
    const lo = Math.floor((min - 5) / 25) * 25
    const hi = Math.ceil((max + 5) / 25) * 25
    const out: number[] = []
    for (let t = Math.ceil(lo / 50) * 50; t <= hi; t += 50) out.push(t)
    return { domain: [lo, hi] as [number, number], ticks: out }
  }, [rows, ids])

  const focusing = focus.size > 0
  const toggle = (id: ManagerId) =>
    setFocus((current) => {
      // The pre-lit pair (your seat, the reigning champion) is a suggestion,
      // not a selection: the first deliberate tap isolates that line instead
      // of adding a second one. Tapping the only lit chip still puts it out.
      if (!chosen.current) {
        chosen.current = true
        if (!(current.size === 1 && current.has(id))) return new Set([id])
      }
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Focused lines draw last so they sit on top of the dimmed field.
  const series = useMemo(() => {
    const ordered = [...ids.filter((id) => !focus.has(id)), ...ids.filter((id) => focus.has(id))]
    return ordered.map((id) => {
      const lit = !focusing || focus.has(id)
      return {
        key: id,
        values: rows.map((row) => (typeof row[id] === 'number' ? (row[id] as number) : null)),
        color: managerColor(id),
        width: focusing && lit ? 3 : lit ? 2 : 1.25,
        opacity: lit ? 1 : 0.15,
        connectNulls: true,
      }
    })
  }, [ids, focus, focusing, rows])

  const limit = phone ? 5 : 12

  return (
    <div>
      <div className="chart-frame px-2 pt-5">
        <Plot
          xs={rows.map((row) => row.year)}
          height={height}
          yDomain={domain}
          yTicks={ticks}
          series={series}
          cursorColor="var(--color-arc-ink-faint)"
          tooltip={(i) => {
            const standing = ids
              .map((id) => ({ id, value: rows[i][id] }))
              .filter((entry): entry is { id: ManagerId; value: number } => typeof entry.value === 'number')
              .sort((a, b) => b.value - a.value)
            if (!standing.length) return null
            const shown = standing.slice(0, limit)
            return (
              <>
                <div className="label">{rows[i].year}</div>
                {shown.map((entry, rank) => {
                  const lit = !focusing || focus.has(entry.id)
                  return (
                    <div key={entry.id} className="mt-1 flex items-center gap-2">
                      <span className="tnum w-4 text-right text-arc-ink-faint">{rank + 1}</span>
                      <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: managerColor(entry.id) }} />
                      <span className={`min-w-0 flex-1 truncate ${lit ? 'text-arc-ink' : 'text-arc-ink-faint'}`}>
                        {managerName(managers, entry.id)}
                      </span>
                      <span className={`tnum ${lit ? 'text-arc-ink' : 'text-arc-ink-faint'}`}>{entry.value}</span>
                    </div>
                  )
                })}
                {standing.length > shown.length && (
                  <div className="mt-1 text-[11px] text-arc-ink-faint">and {standing.length - shown.length} more</div>
                )}
              </>
            )
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 px-3 pb-4" role="group" aria-label="Isolate a manager">
        {ids.map((id) => {
          const pressed = focus.has(id)
          return (
            <button
              key={id}
              type="button"
              className="legend-chip"
              aria-pressed={pressed}
              data-dim={focusing && !pressed ? 'true' : undefined}
              style={{ ['--c' as string]: managerColor(id) }}
              onClick={() => toggle(id)}
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: managerColor(id) }} />
              {managerName(managers, id)}
            </button>
          )
        })}
        {focusing && (
          <button
            type="button"
            className="legend-chip"
            onClick={() => setFocus(new Set())}
            style={{ ['--c' as string]: 'var(--color-arc-ink-faint)' }}
          >
            Show all
          </button>
        )}
      </div>
    </div>
  )
}
