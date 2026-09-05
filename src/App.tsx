import { Component, Suspense, lazy, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Boot, { shouldBoot } from './components/Boot'
import Shell from './components/Shell'
import { clearOverlay, useLeague } from './lib/data'
import { musicOn, start as startMusic } from './lib/music'
import { managerColor } from './lib/identity'
import Dashboard from './pages/Dashboard'
import Bets from './pages/Bets'
import Standings from './pages/Standings'
import Managers from './pages/Managers'

// The four rooms people open most ship in the entry; the rest (and Recharts
// with them) load on first visit, so the Ledger is on screen sooner.
const Draft = lazy(() => import('./pages/Draft'))
const Finances = lazy(() => import('./pages/Finances'))
const Guide = lazy(() => import('./pages/Guide'))
const Keepers = lazy(() => import('./pages/Keepers'))
const Lab = lazy(() => import('./pages/Lab'))
const Almanac = lazy(() => import('./pages/Almanac'))
const ManagerDetail = lazy(() => import('./pages/ManagerDetail'))
const PlayerDetail = lazy(() => import('./pages/PlayerDetail'))
const Records = lazy(() => import('./pages/Records'))
const Rules = lazy(() => import('./pages/Rules'))
const Trades = lazy(() => import('./pages/Trades'))

/** Unknown routes land on the Ledger, which says which door was missing. */
function Missing() {
  const location = useLocation()
  return <Navigate to="/" replace state={{ missing: location.pathname }} />
}

function RoomLoading() {
  return (
    <div className="px-1 py-10 text-[12.5px] text-arc-ink-soft" role="status">
      <span className="cursor">opening</span>
    </div>
  )
}

/**
 * One bad row must not blank the league. Anything a page throws lands here
 * with a reload, and — because a broken local save could keep it broken on
 * every reload — a way to drop the unsynced local changes.
 */
class RoomBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('page crashed:', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="win mx-auto mt-6 max-w-lg p-5" role="alert">
        <div className="label text-arc-red">this page broke</div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-arc-ink-soft">
          Something on this page threw an error. A reload usually clears it. If it keeps
          happening right after a save, clear the local changes — the copy on GitHub is safe.
        </p>
        <pre className="mt-3 overflow-x-auto border border-arc-line bg-arc-bg p-3 text-[11px] text-arc-ink-faint">
          {this.state.error.message}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearOverlay()
              window.location.reload()
            }}
          >
            Clear local changes
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const { data, loading, error, reload } = useLeague()
  const [booting, setBooting] = useState(shouldBoot)

  // Arm the music autostart at the root, not in the Shell: the Shell doesn't
  // mount until the boot screen ends, and the tap that skips the boot is most
  // visitors' first gesture — it must count, or "on" sits silent until the
  // next interaction. Both listeners disarm together; the preference is
  // re-checked at fire time so a toggle-off in between is respected.
  useEffect(() => {
    if (!musicOn()) return
    const kick = () => {
      disarm()
      if (musicOn()) void startMusic()
    }
    const disarm = () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return disarm
  }, [])

  if (booting)
    return (
      <Boot
        onDone={() => setBooting(false)}
        championColor={data ? managerColor(data.seasons[0]?.champion) : undefined}
      />
    )

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-[15px] font-semibold text-arc-green">
            wacl<span className="text-arc-ink-faint">://</span>terminal
          </div>
          <div className="cursor mt-3 text-[12.5px] text-arc-ink-soft">reading /data</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <div className="win w-full max-w-lg p-5" role="alert">
          <div className="label text-arc-red">couldn't open the book</div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-arc-ink-soft">
            The league's data didn't load. That is almost always the connection — try again in
            a moment.
          </p>
          <p className="mt-2 text-[11.5px] text-arc-ink-faint">{error ?? 'League data is missing.'}</p>
          <div className="mt-4">
            <button type="button" className="btn" onClick={() => void reload()}>
              Try again
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-3 overflow-x-auto border border-arc-line bg-arc-bg p-3 text-[11.5px] text-arc-ink-faint">
              $ npm run seed -- &quot;path/to/workbook.xlsx&quot;
            </pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <Shell>
      <RoomBoundary>
        <Suspense fallback={<RoomLoading />}>
          <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/keepers" element={<Keepers />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/bets" element={<Bets />} />
        <Route path="/standings" element={<Standings />} />
        <Route path="/managers" element={<Managers />} />
        <Route path="/managers/:id" element={<ManagerDetail />} />
        <Route path="/players/:name" element={<PlayerDetail />} />
        <Route path="/records" element={<Records />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/almanac" element={<Almanac />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="*" element={<Missing />} />
          </Routes>
        </Suspense>
      </RoomBoundary>
    </Shell>
  )
}
