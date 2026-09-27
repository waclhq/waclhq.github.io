import { useEffect, useState } from 'react'
import type { LivePoints } from './types'

/**
 * This week's fantasy points, scored from ESPN's live box scores by the
 * live-points job and published to the repo's orphan `points` branch (not
 * public/data, so a Sunday of updates never touches main or triggers a
 * deploy). raw.githubusercontent caches for five minutes on top of the job's
 * ninety-second passes, so call it a few minutes behind and say so.
 *
 * Until the job has published once, and whenever the file is more than four
 * days old, this returns null and the panel stays hidden.
 */
const RAW = 'https://raw.githubusercontent.com/waclhq/waclhq.github.io/points/points.json'

const LIVE_MS = 2 * 60_000
const IDLE_MS = 10 * 60_000
const STALE_MS = 4 * 24 * 3600_000

export async function readPoints(): Promise<LivePoints | null> {
  try {
    const response = await fetch(RAW, { cache: 'no-store' })
    if (!response.ok) return null
    const board = (await response.json()) as LivePoints
    if (!Array.isArray(board?.teams) || board.teams.length === 0) return null
    if (Date.now() - new Date(board.updatedAt).getTime() > STALE_MS) return null
    return board
  } catch {
    return null
  }
}

export function pointsLive(board: LivePoints | null): boolean {
  return Boolean(board?.games.some((game) => game.state === 'in'))
}

/** Loads after first paint; polls faster while a game is on; a hidden tab stops asking. */
export function useLivePoints(): LivePoints | null {
  const [board, setBoard] = useState<LivePoints | null>(null)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    let latest: LivePoints | null = null

    const load = async () => {
      const next = await readPoints()
      if (!alive) return
      latest = next
      setBoard(next)
    }
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!document.hidden) await load()
        if (alive) schedule()
      }, pointsLive(latest) ? LIVE_MS : IDLE_MS)
    }
    const onVisible = () => {
      if (!document.hidden) void load()
    }

    void load().then(schedule)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return board
}
