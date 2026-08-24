import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLeague } from '../lib/data'
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

export default function Shell({ children }: { children: ReactNode }) {
  const { data, commissioner } = useLeague()
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
        className={compact ? 'btn min-h-[36px] px-2.5 py-1' : 'btn shrink-0 px-3'}
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

  // Broadcast-style replay wipe on every page change (not the first load).
  const [wipe, setWipe] = useState(0)
  const firstNav = useRef(true)
  useEffect(() => {
    setMenuOpen(false)
    if (firstNav.current) {
      firstNav.current = false
      return
    }
    if (!animationsDisabled()) setWipe((count) => count + 1)
  }, [location.pathname])

  const closeMenu = () => {
    if (animationsDisabled()) {
      setMenuOpen(false)
      return
    }
    setMenuClosing(true)
    window.setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 230)
  }

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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

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
                  className="pulse flex h-5 min-w-[20px] items-center justify-center border-2 border-arc-line px-1 text-[11px]"
                  style={{ background: 'var(--color-arc-yellow)', color: 'var(--color-arc-ink)' }}
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
    <div className="min-h-dvh pb-20 lg:grid lg:grid-cols-[228px_1fr] lg:pb-10">
      <Backdrop enabled={!animationsDisabled()} />
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b-[3px] border-arc-line bg-arc-panel px-3 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 lg:hidden">
        <div className="flex min-w-0 items-center gap-3" onClick={onLogoTap}>
          <div className="relative -my-1 shrink-0">
            <Crest size={38} glow={false} />
          </div>
          <span className="arcade truncate text-[12px] text-arc-ink-soft">
            {current?.label ?? 'Ledger'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {musicButton(true)}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="btn min-h-[36px] px-2.5 py-1"
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
                            className="pulse flex h-4 min-w-[18px] items-center justify-center px-1 text-[10px]"
                            style={{ background: 'var(--color-arc-yellow)', color: 'var(--color-arc-ink)' }}
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
                    className="arcade truncate text-[10px] tracking-[0.08em] uppercase"
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
            <span className="arcade text-[10px] tracking-[0.08em] text-arc-ink-soft uppercase">
              More
            </span>
            {pending.length > 0 && (
              <span
                aria-hidden
                className="pulse absolute top-2 right-[26%] h-2 w-2 rounded-full"
                style={{ background: 'var(--color-arc-red)' }}
              />
            )}
          </span>
        </button>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden border-r-[3px] border-arc-line bg-arc-bg-deep lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="border-b-[3px] border-arc-line bg-arc-bg-deep px-4 py-5 text-center">
          <div className="relative inline-block" onClick={onLogoTap}>
            <Crest size={140} />
            <Sparkles count={5} />
          </div>
          <div className="arcade mt-2 text-[10px] text-arc-yellow">EST. 2004</div>
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
      <footer className="arcade fixed inset-x-0 bottom-0 z-30 hidden items-center lg:flex justify-between gap-3 border-t-[3px] border-arc-line bg-arc-bg-deep px-3 py-2 text-[11px] text-arc-ink-soft">
        <span className="flex min-w-0 items-center gap-2.5">
          <span style={{ color: 'var(--color-arc-yellow)' }}>
            {commissioner ? '2 CREDITS' : '1 CREDIT'}
          </span>
          <span className="hidden sm:inline">
            {data?.managers.filter((manager) => manager.active).length ?? 0}P
          </span>
          {pending.length > 0 && (
            <span style={{ color: 'var(--color-arc-red)' }}>{pending.length} PENDING</span>
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

      {wipe > 0 && <ReplayWipe key={wipe} />}
      {godMode && <GodMode onDone={() => setGodMode(false)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {panelOpen && <CommissionerPanel onClose={() => setPanelOpen(false)} />}
    </div>
  )
}
