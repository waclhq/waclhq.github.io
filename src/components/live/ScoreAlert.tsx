import { useEffect, useRef, useState } from 'react'
import { Confetti } from '../effects'
import { animationsDisabled } from '../../lib/motion'
import { KIND_LABEL, signed, swingFor } from '../../lib/live-view'
import type { LivePointsPlay, ManagerId } from '../../lib/types'

/**
 * When a refresh brings a play that moved your starters, say so: a
 * touchdown for you gets the full slam (only with motion allowed), anything
 * else a toast that leaves on its own. Nothing fires for plays that were
 * already on the page when it opened.
 */
export default function ScoreAlert({ plays, me }: { plays: LivePointsPlay[]; me: ManagerId | null }) {
  const seen = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<LivePointsPlay[]>([])
  const [slam, setSlam] = useState<LivePointsPlay | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(plays.map((play) => play.id))
      return
    }
    const arrived = plays.filter((play) => !seen.current!.has(play.id))
    for (const play of arrived) seen.current.add(play.id)
    const mine = arrived.filter((play) => swingFor(play, me) !== 0).reverse()
    if (!mine.length) return
    const td = mine.find((play) => play.kind === 'td' && swingFor(play, me) > 0)
    if (td && !animationsDisabled()) setSlam(td)
    setQueue((current) => [...current, ...mine].slice(-4))
  }, [plays, me])

  useEffect(() => {
    if (!queue.length) return
    const timer = window.setTimeout(() => setQueue((current) => current.slice(1)), 6500)
    return () => window.clearTimeout(timer)
  }, [queue])

  useEffect(() => {
    if (!slam) return
    const timer = window.setTimeout(() => setSlam(null), 2400)
    return () => window.clearTimeout(timer)
  }, [slam])

  return (
    <>
      {slam && (
        <div className="moment pointer-events-none fixed inset-0 z-[95] flex items-center justify-center" role="status">
          <Confetti count={24} />
          <div className="text-center">
            <div className="arcade slam lv-slam">TOUCHDOWN!</div>
            <div className="arcade slam mt-3 text-[13px] text-arc-ink-soft" style={{ animationDelay: '0.18s' }}>
              {slam.hits.find((hit) => hit.manager === me)?.player} · {signed(swingFor(slam, me))} for you
            </div>
          </div>
        </div>
      )}
      <div className="lv-toasts" aria-live="polite">
        {queue.map((play) => {
          const swing = swingFor(play, me)
          const hit = play.hits.find((h) => h.manager === me && h.starter)
          return (
            <div key={play.id} className={`lv-toast ${swing >= 0 ? 'is-plus' : 'is-minus'}`}>
              <span className="lv-toast-kind">{KIND_LABEL[play.kind]}</span>
              <span className="lv-toast-text">
                {hit?.player} · {play.game} {play.when}
              </span>
              <b className="tnum">{signed(swing)}</b>
            </div>
          )
        })}
      </div>
    </>
  )
}
