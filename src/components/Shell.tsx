import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useLeague } from '../lib/data'
import { managerColor } from '../lib/identity'
import { setMe, useMe } from '../lib/me'
import { useDialog } from '../lib/dialog'
import type { Manager } from '../lib/types'
import PixelMugshot from './PixelMugshot'
import { usePendingTrades } from '../lib/derive'
import CommandPalette from './CommandPalette'
import GodMode from './GodMode'
import Crest from './Crest'
import { Sparkles } from './effects'
import Backdrop from './Backdrop'
import CommissionerPanel from './CommissionerPanel'
import { ReplayWipe } from './effects'
import { animationsDisabled, motionForcedOn, setMotionForcedOn, systemPrefersReduced } from '../lib/motion'
import { play, setSfxOn, sfxOn } from '../lib/sfx'
import { meterLevels, musicOn, setMusicOn } from '../lib/music'

// iPhones and iPads mute web audio while the ring/silent switch is silent —
// worth a nudge right next to the music toggle, but only where it applies.
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// Each destination owns a colour, so the nav reads as a row of cabinet buttons.
const NAV = [
  { to: '/', label: 'Ledger', color: 'var(--color-arc-blue)', end: true, hint: 'The desk' },
  { to: '/trades', label: 'Trades', color: 'var(--color-arc-red)', hint: 'Queue & history' },
  { to: '/keepers', label: 'Keepers', color: 'var(--color-arc-lime)', hint: 'Contracts by team' },
  { to: '/draft', label: 'Draft', color: 'var(--color-arc-green)', hint: 'Budgets & war room' },
  { to: '/finances', label: 'Finances', color: 'var(--color-arc-orange)', hint: 'Dues & cash' },
  { to: '/bets', label: 'The Book', color: 'var(--color-arc-pink)', hint: 'Side bets, live' },
  { to: '/standings', label: 'Standings', color: 'var(--color-arc-purple)', hint: 'Final tables' },
  { to: '/managers', label: 'Managers', color: 'var(--color-arc-cyan)', hint: 'Career records' },
  { to: '/records', label: 'Records', color: 'var(--color-arc-pink)', hint: 'The leaderboards' },
  { to: '/lab', label: 'The Lab', color: 'var(--color-arc-navy)', hint: 'Stats & roasts' },
  { to: '/almanac', label: 'Almanac', color: 'var(--color-arc-brown)', hint: 'Year by year' },
  { to: '/rules', label: 'Rules', color: 'var(--color-arc-teal)', hint: 'The constitution' },
  { to: '/guide', label: 'Manual', color: 'var(--color-arc-yellow)', hint: 'Commissioner how-to' },
]

/** The four destinations that earn a permanent thumb-reach slot. */
const TABS = ['/', '/bets', '/standings', '/records']

/**
 * Three equalizer bars that dance to the theme actually playing — the UI
 * listening to its own music. rAF-driven off meterLevels(); renders flat
 * bars when the transport is idle and never runs under reduced motion.
 */
function MusicBars() {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  useEffect(() => {
    if (animationsDisabled()) return
    let frame = 0
    const tick = () => {
      const levels = meterLevels()
      for (let i = 0; i < 3; i += 1) {
        const bar = bars.current[i]
        if (bar) bar.style.transform = `scaleY(${(0.22 + levels[i] * 0.78).toFixed(3)})`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <span className="flex h-[13px] items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((band) => (
        <span
          key={band}
          ref={(node) => {
            bars.current[band] = node
          }}
          className="w-[3px] rounded-sm bg-current"
          style={{ height: '100%', transform: 'scaleY(0.22)', transformOrigin: 'bottom' }}
        />
      ))}
    </span>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <span className="tabular-nums">{now.toLocaleTimeString('en-US', { hour12: false })}</span>
}

/** The newer build a viewer has already waved away, for this tab. */
const SEEN_BUILD = 'wacl.seenBuild'

type SaveEvent = {
  phase: 'start' | 'ok' | 'error'
  file: string
  message: string
  error?: string
  retry?: () => void
}

/**
 * One strip, every page: what the last save did. Lives above the tab bar on
 * phones and above the credits footer on desktop, so the answer to "did that
 * work?" is always where the thumb already is. Fed by lib/data.ts save().
 */
function SaveStatus() {
  const [state, setState] = useState<SaveEvent | null>(null)
  useEffect(() => {
    let timer = 0
    const onSave = (event: Event) => {
      const detail = (event as CustomEvent<SaveEvent>).detail
      setState(detail)
      window.clearTimeout(timer)
      if (detail.phase === 'ok') timer = window.setTimeout(() => setState(null), 4200)
    }
    window.addEventListener('wacl:save', onSave)
    return () => {
      window.removeEventListener('wacl:save', onSave)
      window.clearTimeout(timer)
    }
  }, [])
  if (!state) return null
  const tone =
    state.phase === 'error'
      ? 'var(--color-arc-red)'
      : state.phase === 'ok'
        ? 'var(--color-arc-green)'
        : 'var(--color-arc-yellow)'
  return (
    <div
      role={state.phase === 'error' ? 'alert' : 'status'}
      className="line-in fixed inset-x-3 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-[45] flex items-center gap-3 rounded-lg border border-arc-line bg-arc-bg-deep/95 px-3.5 py-2.5 text-[12.5px] shadow-hard backdrop-blur-sm lg:inset-x-auto lg:right-6 lg:bottom-12 lg:max-w-md"
      style={{ borderLeft: `3px solid ${tone}` }}
    >
      <span aria-hidden className={state.phase === 'start' ? 'pulse' : ''} style={{ color: tone }}>
        {state.phase === 'error' ? '✗' : state.phase === 'ok' ? '✓' : '●'}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        {state.phase === 'start' && <span className="text-arc-ink-soft">Saving · {state.message}</span>}
        {state.phase === 'ok' && (
          <span>
            <b className="text-arc-green">Saved</b> <span className="text-arc-ink-soft">· {state.message}</span>
          </span>
        )}
        {state.phase === 'error' && <span>{state.error ?? 'The save did not go through.'}</span>}
      </span>
      {state.phase === 'error' && state.retry && (
        <button type="button" className="btn min-h-[40px] px-3 py-1 text-[12px]" onClick={state.retry}>
          Retry
        </button>
      )}
      {state.phase !== 'start' && (
        <button
          type="button"
          className="-my-2 -mr-2 grid h-10 w-10 shrink-0 place-items-center text-[18px] leading-none text-arc-ink-faint"
          aria-label="Dismiss"
          onClick={() => setState(null)}
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * Pick your seat: one tap says which of the twelve you are, and from then on
 * your rows light up in your colour on every table. A preference, not a
 * login — see lib/me.ts.
 */
function SeatPicker({ managers, compact = false }: { managers: Manager[]; compact?: boolean }) {
  const me = useMe()
  const [open, setOpen] = useState(false)
  const active = managers.filter((manager) => manager.active)
  const mine = active.find((manager) => manager.id === me)
  const color = mine ? managerColor(mine.id) : undefined
  return (
    <div className={compact ? 'px-4 py-3' : 'mx-3 mt-3'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="btn min-h-[40px] w-full justify-start gap-2.5 px-3 text-[12px] normal-case tracking-normal"
        style={mine ? { borderColor: color } : undefined}
      >
        {mine ? (
          <>
            <span className="seat-face" style={{ ['--c' as string]: color }}>
              <PixelMugshot seed={mine.id} scale={1} />
            </span>
            <span className="min-w-0 truncate">
              <span className="text-arc-ink-soft">Your seat · </span>
              <b style={{ color }}>{mine.displayName}</b>
            </span>
          </>
        ) : (
          <>
            <span aria-hidden className="text-arc-yellow">◉</span>
            <span className="min-w-0 truncate">
              Pick your seat
              <span className="text-arc-ink-faint"> · light up your rows</span>
            </span>
          </>
        )}
        <span aria-hidden className="ml-auto text-arc-ink-faint">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-1.5" role="listbox" aria-label="Your seat">
          {active.map((manager) => {
            const picked = manager.id === me
            const c = managerColor(manager.id)
            return (
              <button
                key={manager.id}
                type="button"
                role="option"
                aria-selected={picked}
                onClick={() => {
                  setMe(picked ? null : manager.id)
                  setOpen(false)
                  play(picked ? 'blip' : 'coin')
                }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] transition-colors"
                style={{
                  borderColor: picked ? c : 'var(--color-arc-line)',
                  background: picked ? `color-mix(in srgb, ${c} 18%, var(--color-arc-panel))` : 'var(--color-arc-panel)',
                }}
              >
                <span className="seat-face shrink-0" style={{ ['--c' as string]: picked ? c : 'transparent' }}>
                  <PixelMugshot seed={manager.id} scale={1} />
                </span>
                <span className="truncate" style={{ color: picked ? c : 'var(--color-arc-ink)' }}>
                  {manager.displayName}
                </span>
              </button>
            )
          })}
          {me && (
            <button
              type="button"
              onClick={() => {
                setMe(null)
                setOpen(false)
              }}
              className="col-span-3 min-h-[36px] rounded-md border border-arc-line text-[11px] text-arc-ink-faint hover:text-arc-ink"
            >
              Just visiting
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { data, commissioner } = useLeague()
  const me = useMe()
  const pending = usePendingTrades()
  const [panelOpen, setPanelOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The OS is requesting reduced motion; offer an in-app override so the
  // animations the commissioner asked for are one tap away.
  const [fxOn, setFxOn] = useState(motionForcedOn)
  const [sfx, setSfx] = useState(sfxOn)
  const [music, setMusic] = useState(musicOn)

  const toggleMusic = () => {
    const next = !music
    setMusicOn(next)
    setMusic(next)
  }

  const musicButton = (compact: boolean) => (
    <span className={compact ? 'flex items-center gap-1.5' : 'flex flex-col items-stretch gap-1'}>
      <button
        type="button"
        onClick={toggleMusic}
        className={compact ? 'btn min-h-[40px] px-2.5 py-1' : 'btn shrink-0 px-3'}
        style={
          music
            ? { background: 'var(--color-arc-pink)', borderColor: 'var(--color-arc-pink)', color: '#1a0512' }
            : undefined
        }
        title="The WACL Theme — original league music, 90-second loop"
        aria-pressed={music}
      >
        {music ? <MusicBars /> : '♪'} {music ? 'ON' : 'OFF'}
      </button>
      {music && IS_IOS && (
        <span className="max-w-[76px] text-[9px] leading-tight text-arc-yellow">
          Turn off silent mode
        </span>
      )}
    </span>
  )
  const [godMode, setGodMode] = useState(false)
  const reducedByOS = systemPrefersReduced()
  const location = useLocation()
  const navigationType = useNavigationType()

  // Route changes. Browsers with view transitions get the page sliding under
  // a still chrome (see ::view-transition rules in index.css); the rest keep
  // the broadcast replay wipe. Neither runs when animations are off.
  const viewTransitions =
    typeof document !== 'undefined' && 'startViewTransition' in document && !animationsDisabled()
  const navigate = useNavigate()

  /**
   * React Router only wires its own `viewTransition` prop through a data
   * router; under HashRouter the prop is quietly ignored, which left every
   * navigation a hard cut with the wipe suppressed on its behalf. So the
   * Shell drives the transition itself: one capture-phase handler for every
   * in-app link on the page, wrapping the route change in a snapshot so the
   * chrome holds still and the title morphs (see ::view-transition in
   * index.css). Anything the browser should own — a new tab, a modified
   * click, an anchor, an outside link — is left alone.
   */
  const onLinkCapture = (event: React.MouseEvent) => {
    if (!viewTransitions || event.defaultPrevented) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement | null)?.closest?.('a')
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const href = anchor.getAttribute('href')
    // HashRouter writes routes as "#/standings"; "#odds" is a section anchor.
    if (!href || !href.startsWith('#/')) return
    const to = href.slice(1)
    if (to === `${location.pathname}${location.search}${location.hash}`) return
    event.preventDefault()
    // The navigation is the point; the transition is decoration. Every way
    // this can fail — a browser that rejects the callback, flushSync landing
    // mid-render, a transition the browser abandons — ends with the page
    // changing anyway. A link that does nothing is not an acceptable failure.
    const go = () => navigate(to)
    try {
      const transition = document.startViewTransition(() => {
        try {
          flushSync(go)
        } catch {
          go()
        }
      })
      transition?.finished?.catch(() => undefined)
      transition?.ready?.catch(() => undefined)
      transition?.updateCallbackDone?.catch(() => undefined)
    } catch {
      go()
    }
  }
  const [wipe, setWipe] = useState(0)
  const firstNav = useRef(true)
  // Every page opens at its top (a back/forward pop keeps the browser's
  // restored position, and a hash deep link lands on its section). Layout
  // effect so the jump happens before the new page is painted or snapshotted.
  const lastPath = useRef(location.pathname)
  useLayoutEffect(() => {
    const changed = lastPath.current !== location.pathname
    lastPath.current = location.pathname
    if (firstNav.current || !changed) return
    // A same-page ?season= / ?bet= / ?sort= rewrite is not a navigation.
    if (navigationType !== 'POP' && !location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [location.pathname, location.hash, navigationType])
  useEffect(() => {
    setMenuOpen(false)
    if (firstNav.current) {
      firstNav.current = false
      return
    }
    if (!animationsDisabled() && !viewTransitions) setWipe((count) => count + 1)
  }, [location.pathname, viewTransitions])

  // Your seat, as a colour the stylesheet can use (rows, badges, names).
  useEffect(() => {
    document.documentElement.style.setProperty('--me-color', me ? managerColor(me) : 'transparent')
  }, [me])

  // Each room names the tab.
  useEffect(() => {
    // Detail pages (a manager, a player) name themselves.
    if (location.pathname.split('/').filter(Boolean).length > 1) return
    const room = NAV.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    )
    document.title = room && room.to !== '/' ? `${room.label} · WACL League HQ` : 'WACL League HQ'
  }, [location.pathname])

  // A newer build live? The installed home-screen copy caches the old shell
  // hard, so poll the build stamp — every ten minutes and whenever the app
  // comes back to the foreground — and offer a refresh instead of a mystery.
  // The build that is live when it is newer than ours, until it is waved off.
  const [stale, setStale] = useState<string | null>(null)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let hiddenAt = 0
    const check = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const { build } = (await response.json()) as { build?: string }
        if (!build || build === __BUILD_ID__) return
        let waved: string | null = null
        try {
          waved = sessionStorage.getItem(SEEN_BUILD)
        } catch {
          /* private browsing: the bar simply asks again */
        }
        if (waved !== build) setStale(build)
      } catch {
        /* offline — nothing to say */
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (Date.now() - hiddenAt > 90_000) void check()
    }
    const timer = window.setInterval(check, 10 * 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Stadium light: a soft lamp that follows the pointer across the panel it
  // is over (CSS .win::after reads --mx/--my). Pointer devices only, and
  // never when the person asked for stillness.
  useEffect(() => {
    if (animationsDisabled()) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let frame = 0
    let last: PointerEvent | null = null
    const move = (event: PointerEvent) => {
      last = event
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const target = last?.target instanceof Element ? last.target.closest<HTMLElement>('.win') : null
        if (!target || !last) return
        const rect = target.getBoundingClientRect()
        target.style.setProperty('--mx', `${last.clientX - rect.left}px`)
        target.style.setProperty('--my', `${last.clientY - rect.top}px`)
      })
    }
    document.addEventListener('pointermove', move, { passive: true })
    return () => {
      document.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [])

  const closeMenu = useCallback(() => {
    if (animationsDisabled()) {
      setMenuOpen(false)
      return
    }
    setMenuClosing(true)
    window.setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 230)
  }, [])
  const sheetRef = useRef<HTMLDivElement>(null)
  useDialog(sheetRef, closeMenu, { active: menuOpen })

  // The room keeps stadium hours: daytime graphite, warmer at dusk, and the
  // low-lit book after 11pm. Re-stamped every ten minutes so a long session
  // drifts with the evening.
  useEffect(() => {
    const stamp = () => {
      const hour = new Date().getHours()
      const mode = hour >= 23 || hour < 6 ? 'late' : hour >= 17 ? 'dusk' : 'day'
      document.documentElement.setAttribute('data-hours', mode)
    }
    stamp()
    const timer = window.setInterval(stamp, 10 * 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  // The Konami code summons god mode; five quick logo taps do too.
  useEffect(() => {
    const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']
    let progress = 0
    function onKonami(event: KeyboardEvent) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      progress = key === code[progress] ? progress + 1 : key === code[0] ? 1 : 0
      if (progress === code.length) {
        progress = 0
        setGodMode(true)
      }
    }
    window.addEventListener('keydown', onKonami)
    return () => window.removeEventListener('keydown', onKonami)
  }, [])

  const logoTaps = useRef<number[]>([])
  const onLogoTap = () => {
    const now = Date.now()
    logoTaps.current = [...logoTaps.current.filter((t) => now - t < 2600), now]
    if (logoTaps.current.length >= 5) {
      logoTaps.current = []
      setGodMode(true)
    }
  }

  // Cmd/Ctrl-K anywhere, and "/" when not already typing in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing =
        event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (event.key === '/' && !typing && !paletteOpen) {
        event.preventDefault()
        setPaletteOpen(true)
      } else if (event.key === 'Escape' && menuOpen) {
        closeMenu()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, menuOpen])

  const current = NAV.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )

  const navList = (
    <nav className="flex flex-col gap-2">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className="block no-underline"
          onClick={() => play('blip')}
        >
          {({ isActive }) => (
            <span
              className="arcade flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-arc-line px-3.5 py-2 text-[15px]"
              style={{
                background: isActive ? item.color : 'var(--color-arc-panel)',
                color: isActive ? 'var(--color-arc-panel)' : 'var(--color-arc-ink)',
                boxShadow: isActive ? 'none' : 'var(--shadow-hard-sm)',
                transform: isActive ? 'translate(2px, 2px)' : 'none',
                textShadow: isActive ? '1px 1px 0 rgba(0,0,0,0.4)' : 'none',
              }}
            >
              {item.label}
              {item.label === 'Trades' && pending.length > 0 && (
                <span
                  className="pulse flex h-5 min-w-[20px] items-center justify-center rounded-md border-2 border-arc-line px-1 text-[11px]"
                  style={{ background: 'var(--color-arc-yellow)', color: 'var(--color-arc-bg-deep)' }}
                >
                  {pending.length}
                </span>
              )}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh pb-20 lg:grid lg:grid-cols-[228px_1fr] lg:pb-10" onClickCapture={onLinkCapture}>
      <Backdrop enabled={!animationsDisabled()} />
      {/* Mobile top bar */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b-[3px] border-arc-line bg-arc-panel px-3 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 lg:hidden"
        style={{ viewTransitionName: 'chrome-top' }}
      >
        <div className="flex min-w-0 items-center gap-3" onClick={onLogoTap}>
          <Link
            to="/"
            className="relative -my-1 grid min-h-[40px] min-w-[40px] shrink-0 place-items-center"
            aria-label="Ledger"
          >
            <Crest size={38} glow={false} />
          </Link>
          <span className="arcade truncate text-[12px] text-arc-ink-soft">
            {current?.label ?? 'Ledger'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {musicButton(true)}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn min-h-[40px] px-2.5 py-1"
            aria-label="Search"
          >
            Find
          </button>
        </div>
      </div>

      {/* Mobile sheet: the whole map in the thumb zone, every destination in
          its own colour with a one-line scent. */}
      {menuOpen && (
        <div
          ref={sheetRef}
          className={`menu-scrim fixed inset-0 z-50 flex flex-col justify-end bg-arc-bg-deep/80 backdrop-blur-sm lg:hidden ${
            menuClosing ? 'menu-leaving' : ''
          }`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMenu()
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="sheet-up max-h-[82dvh] overflow-y-auto rounded-t-2xl border-t-[3px] border-x border-arc-line bg-arc-bg pb-[env(safe-area-inset-bottom)]">
            <div className="sticky top-0 z-10 border-b border-arc-line bg-arc-bg px-4 pt-2 pb-3">
              <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-arc-line" />
              <div className="flex items-center justify-between">
                <span className="label">Everything</span>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="px-1 text-[20px] leading-none text-arc-ink-faint"
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 py-3">
              {NAV.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className="menu-tile block no-underline"
                  style={{ ['--i' as string]: index }}
                  onClick={() => {
                    play('blip')
                    setMenuOpen(false)
                  }}
                >
                  {({ isActive }) => (
                    <span
                      className="relative flex min-h-[58px] flex-col justify-center overflow-hidden rounded-lg border border-arc-line px-3 py-2 transition-transform duration-100 active:scale-[0.97]"
                      style={{
                        background: isActive ? item.color : 'var(--color-arc-panel)',
                      }}
                    >
                      <span
                        aria-hidden
                        className="menu-tile-bar"
                        style={{ background: item.color, ['--i' as string]: index }}
                      />
                      <span
                        className="arcade flex items-center gap-2 text-[14px]"
                        style={{ color: isActive ? 'var(--color-arc-panel)' : 'var(--color-arc-ink)' }}
                      >
                        {item.label}
                        {item.label === 'Trades' && pending.length > 0 && (
                          <span
                            className="pulse flex h-4 min-w-[18px] items-center justify-center rounded-md px-1 text-[10px]"
                            style={{ background: 'var(--color-arc-yellow)', color: 'var(--color-arc-bg-deep)' }}
                          >
                            {pending.length}
                          </span>
                        )}
                      </span>
                      <span
                        className="text-[10.5px] leading-tight"
                        style={{
                          color: isActive ? 'rgba(7, 9, 12, 0.75)' : 'var(--color-arc-ink-faint)',
                        }}
                      >
                        {item.hint}
                      </span>
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
            <div className="sheet-foot border-t border-arc-line">
              {data && <SeatPicker managers={data.managers} compact />}
            </div>
            <div className="sheet-foot flex flex-wrap items-center gap-2.5 border-t border-arc-line px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  const next = !sfx
                  setSfxOn(next)
                  setSfx(next)
                  if (next) play('coin')
                }}
                className="arcade border-2 border-arc-line px-2 py-1 text-[11px] transition-colors"
                style={{
                  background: sfx ? 'var(--color-arc-cyan)' : 'transparent',
                  color: sfx ? '#04120b' : 'var(--color-arc-ink-faint)',
                }}
              >
                SFX {sfx ? 'ON' : 'OFF'}
              </button>
              {reducedByOS && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !fxOn
                    setMotionForcedOn(next)
                    setFxOn(next)
                  }}
                  className="arcade border-2 border-arc-line px-2 py-1 text-[11px] transition-colors"
                  style={{
                    background: fxOn ? 'var(--color-arc-green)' : 'transparent',
                    color: fxOn ? '#04120b' : 'var(--color-arc-orange)',
                  }}
                >
                  FX {fxOn ? 'ON' : 'OFF'}
                </button>
              )}
              <span className="arcade ml-auto text-[10px] text-arc-ink-faint">
                {data?.league.currentSeason} · EST. 2004
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setPanelOpen(true)
              }}
              className="sheet-foot arcade flex min-h-[48px] w-full items-center gap-2 border-t border-arc-line px-4 py-3 text-left text-[11px]"
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 border-2 border-arc-line"
                style={{
                  background: commissioner ? 'var(--color-arc-lime)' : 'var(--color-arc-ink-faint)',
                }}
              />
              {commissioner ? 'COMMISH ✓ SIGNED IN' : 'COMMISSIONER SIGN-IN'}
            </button>
          </div>
        </div>
      )}

      {/* Mobile tab bar: the core four in thumb reach, the map behind More. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t-[3px] border-arc-line bg-arc-bg-deep pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
        style={{ viewTransitionName: 'chrome-tabs' }}
      >
        {TABS.map((to) => {
          const item = NAV.find((candidate) => candidate.to === to)!
          return (
            <NavLink
              key={to}
              to={to}
              end={item.end}
              className="min-w-0 flex-1 no-underline"
              onClick={() => play('blip')}
            >
              {({ isActive }) => (
                <span className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1">
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 top-0 h-[3px] ${isActive ? 'tab-lit' : ''}`}
                    style={{ background: isActive ? item.color : 'transparent' }}
                  />
                  <span
                    className="arcade truncate text-[11px] tracking-[0.08em] uppercase"
                    style={{ color: isActive ? item.color : 'var(--color-arc-ink-soft)' }}
                  >
                    {item.label === 'The Book' ? 'Book' : item.label}
                  </span>
                </span>
              )}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="relative min-w-0 flex-1"
          aria-expanded={menuOpen}
          aria-label="All pages"
        >
          <span className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1">
            <span className="arcade text-[11px] tracking-[0.08em] text-arc-ink-soft uppercase">
              More
            </span>
            {pending.length > 0 && (
              <span
                aria-hidden
                className="pulse absolute top-2 right-[26%] h-2 w-2 rounded-full"
                style={{ background: 'var(--color-arc-yellow)' }}
              />
            )}
          </span>
        </button>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className="hidden border-r-[3px] border-arc-line bg-arc-bg-deep lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col"
        style={{ viewTransitionName: 'chrome-side' }}
      >
        <div className="border-b-[3px] border-arc-line bg-arc-bg-deep px-4 py-5 text-center">
          <div className="relative inline-block" onClick={onLogoTap}>
            <Link to="/" aria-label="Ledger" className="block">
              <Crest size={140} />
            </Link>
            <Sparkles count={5} />
          </div>
          <div className="arcade mt-2 text-[11px] text-arc-yellow">EST. 2004</div>
        </div>

        <div className="mx-3 mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn flex-1 justify-between"
          >
            <span>Find</span>
            <kbd>⌘K</kbd>
          </button>
          {musicButton(false)}
        </div>
        {data && <SeatPicker managers={data.managers} />}

        <div className="flex-1 overflow-y-auto p-3">{navList}</div>

        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="arcade flex min-h-[44px] items-center gap-2 border-t-[3px] border-arc-line px-4 py-3 text-left text-[11px] transition-colors hover:bg-arc-panel"
        >
          <span
            aria-hidden
            className={`inline-block h-2.5 w-2.5 border-2 border-arc-line ${commissioner ? 'pulse' : ''}`}
            style={{
              background: commissioner ? 'var(--color-arc-lime)' : 'var(--color-arc-ink-faint)',
            }}
          />
          {commissioner ? 'COMMISH ✓' : 'COMMISH SIGN-IN'}
        </button>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Credits bar, bottom of the cabinet */}
      <footer
        className="arcade fixed inset-x-0 bottom-0 z-30 hidden items-center lg:left-[228px] lg:flex justify-between gap-3 border-t-[3px] border-arc-line bg-arc-bg-deep px-3 py-2 text-[11px] text-arc-ink-soft"
        style={{ viewTransitionName: 'chrome-foot' }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span style={{ color: 'var(--color-arc-yellow)' }}>
            {commissioner ? '2 CREDITS' : '1 CREDIT'}
          </span>
          <span className="hidden sm:inline">
            {data?.managers.filter((manager) => manager.active).length ?? 0}P
          </span>
          {pending.length > 0 && (
            <span style={{ color: 'var(--color-arc-yellow)' }}>{pending.length} PENDING</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const next = !sfx
              setSfxOn(next)
              setSfx(next)
              if (next) play('coin')
            }}
            className="border-2 border-arc-line px-1.5 py-0.5 transition-colors"
            style={{
              background: sfx ? 'var(--color-arc-cyan)' : 'transparent',
              color: sfx ? '#04120b' : 'var(--color-arc-ink-faint)',
            }}
            title="8-bit sound effects"
          >
            SFX {sfx ? 'ON' : 'OFF'}
          </button>
          {reducedByOS && (
            <button
              type="button"
              onClick={() => {
                const next = !fxOn
                setMotionForcedOn(next)
                setFxOn(next)
              }}
              className="border-2 border-arc-line px-1.5 py-0.5 transition-colors"
              style={{
                background: fxOn ? 'var(--color-arc-green)' : 'transparent',
                color: fxOn ? '#04120b' : 'var(--color-arc-orange)',
              }}
              title="Your system requests reduced motion; this turns the site's animations on anyway"
            >
              FX {fxOn ? 'ON' : 'OFF'}
            </button>
          )}
          <span className="hidden sm:inline">{data?.league.currentSeason}</span>
          <Clock />
        </span>
      </footer>

      <SaveStatus />
      {stale && (
        <div
          role="status"
          className="line-in fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+64px)] z-[45] flex items-center gap-3 rounded-lg border border-arc-green/60 bg-arc-bg-deep/95 px-3.5 py-2.5 text-[12.5px] shadow-hard backdrop-blur-sm lg:top-4 lg:right-6 lg:left-auto lg:max-w-sm"
        >
          <span aria-hidden className="pulse text-arc-green">●</span>
          <span className="min-w-0 flex-1">
            <b className="text-arc-green">New version live.</b>{' '}
            <span className="text-arc-ink-soft">Refresh to get it.</span>
          </span>
          <button
            type="button"
            className="btn min-h-[40px] px-3 py-1 text-[12px]"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="-my-2 -mr-2 grid h-10 w-10 shrink-0 place-items-center text-[18px] leading-none text-arc-ink-faint"
            aria-label="Dismiss"
            onClick={() => {
              try {
                sessionStorage.setItem(SEEN_BUILD, stale)
              } catch {
                /* fine: it will ask again next visit */
              }
              setStale(null)
            }}
          >
            ×
          </button>
        </div>
      )}
      {wipe > 0 && <ReplayWipe key={wipe} />}
      {godMode && <GodMode onDone={() => setGodMode(false)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {panelOpen && <CommissionerPanel onClose={() => setPanelOpen(false)} />}
    </div>
  )
}
