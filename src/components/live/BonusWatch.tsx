import type { CSSProperties } from 'react'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import type { LivePointsMilestone, ManagerId } from '../../lib/types'

/**
 * The league pays one-time bonuses at 300 passing, 100 rushing and 100
 * receiving yards. This watches live players closing in on one, with the
 * yards still needed, and lists the bonuses already banked.
 */
export default function BonusWatch({
  chases,
  milestones,
  me,
}: {
  chases: LivePointsMilestone[]
  milestones: LivePointsMilestone[]
  me: ManagerId | null
}) {
  const { managers } = useLeagueData()
  if (!chases.length && !milestones.length) {
    return <p className="lv-empty">Nobody is within sight of a yardage bonus yet. It pays 2 at 300 passing, 3 at 100 rushing and 2 at 100 receiving.</p>
  }
  return (
    <div className="lv-bonus">
      {chases.length > 0 && (
        <ul className="lv-chase" aria-label="Closing in on a bonus">
          {chases.map((c) => {
            const at = c.at ?? 100
            const need = Math.max(0, at - c.have)
            return (
              <li
                key={`${c.player}-${c.stat}`}
                className={`${c.manager === me && me ? 'is-mine' : ''} ${c.starter ? '' : 'is-bench'}`}
                style={{ '--c': managerColor(c.manager), '--got': Math.min(1, c.have / at) } as CSSProperties}
              >
                <div className="lv-chase-top">
                  <span className="lv-chase-name">{c.player}</span>
                  <span className="lv-chase-need tnum">
                    {need} to go · <b>+{c.pts}</b>
                  </span>
                </div>
                <div className="lv-chase-bar" aria-hidden>
                  <i />
                </div>
                <div className="lv-chase-foot">
                  <span>
                    {c.have}/{at} {c.label.replace(/^\d+\s/, '')}
                  </span>
                  <span>
                    {managerName(managers, c.manager)}
                    {c.starter ? '' : ' · bench'}
                    {c.clock ? ` · ${c.clock}` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {milestones.length > 0 && (
        <div className="lv-banked">
          <div className="label">Banked</div>
          <div className="lv-banked-list">
            {milestones.map((m) => (
              <span
                key={`${m.player}-${m.stat}`}
                className={`lv-tag ${m.starter ? '' : 'is-bench'}`}
                style={{ '--c': managerColor(m.manager) } as CSSProperties}
              >
                <b className="tnum">+{m.pts}</b> {m.player} · {m.label} · {managerName(managers, m.manager)}
                {m.starter ? '' : ' (bench)'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
