import { useEffect, useState } from 'react'
import { useLeagueData } from '../lib/data'
import { profileRoast } from '../lib/profile-roast'
import { play } from '../lib/sfx'
import type { ManagerId } from '../lib/types'
import { Panel } from './ui'

/** The button that starts it. Lives in the profile header beside the card. */
export function RoastButton({ active = false, onClick }: { active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn"
      aria-pressed={active}
      onClick={() => {
        if (!active) play('whistle')
        onClick()
      }}
    >
      🔥 Roast
    </button>
  )
}

/**
 * The Roast. Data-backed burns; every reroll is a different assembly.
 *
 * Uncontrolled (no `seed` prop) it renders its own button and swaps to the
 * panel when pressed. Controlled (`seed` + `onSeed`) the caller owns the
 * state, which lets the button sit in the header while the panel opens
 * further down the page.
 */
export default function RoastPanel({
  id,
  seed: controlled,
  onSeed,
}: {
  id: ManagerId
  seed?: number | null
  onSeed?: (seed: number | null) => void
}) {
  const data = useLeagueData()
  const [own, setOwn] = useState<number | null>(null)
  const seed = controlled === undefined ? own : controlled
  const setSeed = (next: number | null) => {
    if (controlled === undefined) setOwn(next)
    onSeed?.(next)
  }

  // A new manager gets a fresh start — never the previous person's reroll.
  useEffect(() => {
    setOwn(null)
  }, [id])

  if (seed === null) {
    return <RoastButton onClick={() => setSeed(1)} />
  }

  const lines = profileRoast(data, id, seed)
  return (
    <Panel
      title="the roast"
      subtitle="Every line is backed by a number in this site. That's why it hurts."
      action={
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              play('trombone')
              setSeed(seed + 1)
            }}
          >
            Again
          </button>
          <button type="button" className="btn" onClick={() => setSeed(null)}>
            Mercy
          </button>
        </div>
      }
    >
      {/* Keyed on the seed so each reroll re-deals the lines top to bottom. */}
      <div key={seed} className="space-y-3 px-5 py-5" aria-live="polite">
        {lines.map((line, index) => (
          <p
            key={index}
            className={`pf-roast-line text-[14.5px] leading-relaxed ${
              index === 0 || index === lines.length - 1 ? 'text-arc-ink-soft' : 'text-arc-ink'
            }`}
            style={{ ['--i' as string]: index }}
          >
            {line}
          </p>
        ))}
      </div>
    </Panel>
  )
}
