import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ordinal, record } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import type { CareerLine } from '../../lib/stats'
import type { Manager, ManagerId } from '../../lib/types'
import PixelMugshot from '../PixelMugshot'
import { Pennant } from './Pennant'
import { useTilt } from './useTilt'
import { viewTransitionsOn } from './viewTransitions'

export interface Neighbour {
  id: ManagerId
  name: string
}

/**
 * The profile header as a holographic player card. The portrait sits at the
 * left inside a frame that carries the manager's colour as light; the name,
 * team, record, pennants and one-sentence story sit beside it; on a pointer
 * device the whole card tilts toward the cursor with a foil sheen sweeping
 * across it. Touch and reduced motion get the same card, flat.
 */
export function HoloHeader({
  manager,
  career,
  story,
  titleYears,
  prev,
  next,
  position,
  isMe,
  actions,
}: {
  manager: Manager
  career: CareerLine
  story: string
  titleYears: number[]
  prev: Neighbour | null
  next: Neighbour | null
  position: { index: number; total: number }
  isMe: boolean
  actions?: ReactNode
}) {
  const id = manager.id
  const color = managerColor(id)
  const tilt = useTilt()
  const vt = viewTransitionsOn()
  const alias =
    manager.displayName !== manager.surname ? ` · ${manager.surname} in the stat books` : ''

  return (
    <div className="pf-head mb-7">
      <nav className="pf-trail" aria-label="Breadcrumb">
        <div className="pf-trail-path">
          <Link to="/managers" className="pf-trail-link" viewTransition={vt}>
            Managers
          </Link>
          <span aria-hidden className="pf-trail-sep">
            ›
          </span>
          <span aria-current="page" className="pf-trail-here">
            {manager.displayName}
          </span>
          {position.index >= 0 && (
            <span className="pf-trail-pos tnum">
              {position.index + 1} of {position.total}
            </span>
          )}
        </div>
        <div className="pf-steps" role="group" aria-label="Flip between managers">
          {prev && (
            <Link
              to={`/managers/${prev.id}`}
              viewTransition={vt}
              className="pf-step"
              aria-label={`Previous manager: ${prev.name}`}
              title={`${prev.name} (←)`}
              style={{ ['--c' as string]: managerColor(prev.id) }}
            >
              <span aria-hidden>‹</span>
              <span className="pf-step-name">{prev.name}</span>
            </Link>
          )}
          {next && (
            <Link
              to={`/managers/${next.id}`}
              viewTransition={vt}
              className="pf-step"
              aria-label={`Next manager: ${next.name}`}
              title={`${next.name} (→)`}
              style={{ ['--c' as string]: managerColor(next.id) }}
            >
              <span className="pf-step-name">{next.name}</span>
              <span aria-hidden>›</span>
            </Link>
          )}
        </div>
      </nav>

      <section
        className="pf-holo"
        style={{ ['--c' as string]: color }}
        aria-labelledby="pf-title"
        {...tilt}
      >
        <span className="pf-holo-rule" aria-hidden />
        <div className="pf-holo-body">
          <div className="pf-mug-wrap pf-rise" style={{ ['--i' as string]: 0 }}>
            <span className="pf-mug-glow" aria-hidden />
            <span className="pf-mug">
              <PixelMugshot seed={id} scale={6} />
            </span>
            {isMe && (
              <span className="pf-desk arcade" role="status">
                This is your desk
              </span>
            )}
          </div>
          <div className="pf-holo-text">
            <div className="label pf-rise" style={{ ['--i' as string]: 1 }}>
              {manager.active ? (
                <>
                  <span className="pf-live-dot" aria-hidden />
                  Active · <span style={{ color }}>{manager.team}</span>
                </>
              ) : (
                'Former manager'
              )}
            </div>
            <h1
              id="pf-title"
              className="display cursor neon-soft pf-title pf-rise"
              style={{ viewTransitionName: 'page-title', ['--i' as string]: 2 }}
            >
              {manager.displayName}
            </h1>
            <p className="pf-holo-line pf-rise" style={{ ['--i' as string]: 3 }}>
              <span className="tnum">{career.seasonsPlayed}</span> seasons ·{' '}
              <span className="tnum text-arc-ink">{record(career.wins, career.losses)}</span> regular
              season · best finish{' '}
              <span className={career.bestFinish === 1 ? 'text-arc-yellow' : 'text-arc-ink'}>
                {career.bestFinish ? ordinal(career.bestFinish) : '—'}
              </span>
              {alias}
            </p>
            {titleYears.length > 0 && (
              <ul className="pf-pennants" aria-label={`${titleYears.length} championships`}>
                {titleYears.map((year, index) => (
                  <li key={year}>
                    <Pennant year={year} color={color} index={index} />
                  </li>
                ))}
              </ul>
            )}
            <p className="pf-story pf-rise" style={{ ['--i' as string]: 5 }}>
              {story}
            </p>
          </div>
        </div>
        {actions && <div className="pf-holo-foot">{actions}</div>}
        <span className="pf-holo-sheen" aria-hidden />
      </section>
    </div>
  )
}
