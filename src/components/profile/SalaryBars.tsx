import { useRef } from 'react'
import { money } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import type { PlayerStint } from '../../lib/profile-player'
import { useRevealed } from '../ui'

/**
 * A player's salary by season as a small bar chart, each bar in the colour
 * of the manager who carried him that year — so the chart says who paid
 * what, not just how much. Bars grow when first seen (transform only) and
 * stand at full height under reduced motion.
 */
export function SalaryBars({
  stints,
  peakYear,
}: {
  /** Chronological, oldest first. */
  stints: PlayerStint[]
  peakYear: number | null
}) {
  const frame = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(frame)
  const costs = stints.map((stint) => stint.cost ?? 0)
  const max = Math.max(1, ...costs)
  const dense = stints.length > 12

  return (
    <div ref={frame} className={`pf-sal ${revealed ? 'on' : ''}`} role="img" aria-label={
      `Salary by season: ${stints.map((stint) => `${stint.year} ${money(stint.cost)}`).join(', ')}`
    }>
      <div className="pf-sal-bars">
        {stints.map((stint, index) => {
          const cost = stint.cost ?? 0
          const ratio = cost / max
          const peak = stint.year === peakYear
          const labelled = !dense || peak || index === 0 || index === stints.length - 1
          return (
            <div key={`${stint.year}-${stint.team}`} className={`pf-sal-col ${peak ? 'is-peak' : ''}`}>
              <span className={`pf-sal-val tnum ${labelled ? '' : 'is-quiet'}`}>{money(stint.cost)}</span>
              <span className="pf-sal-track">
                <span
                  className="pf-sal-bar"
                  style={{
                    ['--h' as string]: Math.max(ratio, 0.04),
                    ['--d' as string]: `${index * 45}ms`,
                    background: managerColor(stint.manager),
                  }}
                />
              </span>
              <span className={`pf-sal-year tnum ${dense && index % 2 ? 'is-quiet' : ''}`}>
                ’{String(stint.year).slice(-2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
