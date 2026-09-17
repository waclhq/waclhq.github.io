import { useEffect, useRef, useState } from 'react'
import HeapScene, { HEAP_BOOT_SECONDS } from './HeapScene'
import Crest from './Crest'
import { Sparkles } from './effects'
import { animationsDisabled } from '../lib/motion'
import { play } from '../lib/sfx'

/**
 * Title screen: King of the Heap. Eleven players brawl onto a dogpile and the
 * reigning champion climbs it to hoist the trophy. Skippable by tap or any
 * key, absent entirely when animations are off — and rationed, because five
 * and a half seconds is a ceremony on arrival and a toll on return.
 *
 * The ration is kept in localStorage rather than per session: iOS discards a
 * home-screen app the moment it needs the memory, so every launch from the
 * icon was a brand new session and the desk was five seconds away every time.
 * An installed app should open like an app, so it gets the title screen once
 * a day; a browser visit, which is more often someone's first look at the
 * league, gets it once a day; a home-screen app, once a week.
 */
const BOOTED_KEY = 'wacl.bootedAt'
const HOURS = 3_600_000

function installed(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || 'standalone' in navigator
  } catch {
    return false
  }
}
/** The trophy is up by 3.6s; the screen never leaves before the payoff. */
const TROPHY_UP_MS = 3900

export default function Boot({
  onDone,
  championColor,
  ready = false,
}: {
  onDone: () => void
  championColor?: string
  /** The league data has landed: the screen may close once the trophy is up. */
  ready?: boolean
}) {
  const [closing, setClosing] = useState(false)
  const [trophyUp, setTrophyUp] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(BOOTED_KEY, String(Date.now()))
    } catch {
      /* private browsing: it will simply play again next load */
    }
    host.current?.focus({ preventScroll: true })
    // The full ceremony is the ceiling; a fast connection leaves at the trophy.
    const timer = setTimeout(() => setClosing(true), HEAP_BOOT_SECONDS * 1000)
    const payoff = setTimeout(() => setTrophyUp(true), TROPHY_UP_MS)
    // fanfare as the trophy goes up (only audible after a prior user gesture,
    // per browser autoplay rules — reloads and SPA navs qualify)
    const horn = setTimeout(() => play('fanfare'), 3600)
    return () => {
      clearTimeout(timer)
      clearTimeout(payoff)
      clearTimeout(horn)
    }
  }, [])

  useEffect(() => {
    if (ready && trophyUp) setClosing(true)
  }, [ready, trophyUp])

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(onDone, 280)
    return () => clearTimeout(timer)
  }, [closing, onDone])

  return (
    <div
      ref={host}
      tabIndex={0}
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-arc-bg px-4 outline-none transition-opacity duration-200 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault()
          onDone()
        }
      }}
      role="status"
      aria-label="Loading — tap to skip"
    >
      <div
        className="arcade pop-in absolute right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] text-[10px] text-arc-ink-faint"
        style={{ animationDelay: '0.7s' }}
        aria-hidden
      >
        TAP TO SKIP ›
      </div>
      <div className="w-full max-w-md text-center">
        {/* pop-in and the tilt must live on different elements: the entrance
            animation's fill retains transform:none and would erase the lean */}
        <div className="pop-in inline-block">
          <div className="relative">
            <Crest size={210} />
            <Sparkles count={10} />
          </div>
        </div>

        <div className="mx-auto mt-2 flex justify-center">
          <HeapScene mode="boot" championColor={championColor} width={380} height={230} />
        </div>

        {/* timed to land as the trophy goes up */}
        <div
          className="arcade text-[15px] text-arc-yellow"
          style={{
            animation:
              'pop-in 0.3s steps(3) 3.9s both, pulse-dot 1.2s steps(1) 4.2s infinite',
          }}
        >
          PRESS START
        </div>
        <div
          className="arcade pop-in mt-3 text-[10px] text-arc-ink-faint"
          style={{ animationDelay: '4.1s' }}
        >
          22 SEASONS · 12 PLAYERS · 1 HEAP
        </div>
      </div>
    </div>
  )
}

export function shouldBoot(): boolean {
  try {
    if (animationsDisabled()) return false
    const last = Number(localStorage.getItem(BOOTED_KEY) ?? 0)
    return Date.now() - last > (installed() ? 7 * 24 : 24) * HOURS
  } catch {
    return false
  }
}
