import { useEffect, useState } from 'react'
import type { LiveScoreboard } from './types'

/**
 * This week's matchups, as the scores job last published them.
 *
 * They live on the repo's orphan `live` branch, not in public/data, so a
 * Sunday's worth of ten-minute updates never touches main or triggers a
 * deploy. The site reads the branch from raw.githubusercontent, which caches
 * for five minutes and ignores query strings, so that is the floor on
 * freshness; the job itself runs every ten. Call it a quarter of an hour
 * behind Yahoo, and say so on the panel.
 *
 * The branch does not exist until the job has run once with credentials, and
 * every read tolerates that: null means "no scoreboard", never an error.
 */
const RAW = 'https://raw.githubusercontent.com/waclhq/waclhq.github.io/live/scores.json'

/** Poll faster while a game is on; settle down when nothing is moving. */
const LIVE_MS = 2 * 60_000
const IDLE_MS = 10 * 60_000

export async function readScores(): Promise<LiveScoreboard | null> {
  try {
    const response = await fetch(RAW, { cache: 'no-store' })
    if (!response.ok) return null
    const board = (await response.json()) as LiveScoreboard
    return Array.isArray(board?.matchups) ? board : null
  } catch {
    return null
  }
}

export function isLive(board: LiveScoreboard | null): boolean {
  return Boolean(board?.matchups.some((matchup) => matchup.status === 'midevent'))
}

/**
 * Loads after first paint and keeps itself current while the tab is visible.
 * A hidden tab stops asking; coming back asks at once.
 */
export function useScoreboard(): LiveScoreboard | null {
  const [board, setBoard] = useState<LiveScoreboard | null>(null)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    let latest: LiveScoreboard | null = null

    const load = async () => {
      const next = await readScores()
      if (!alive) return
      latest = next
      setBoard(next)
    }
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!document.hidden) await load()
        if (alive) schedule()
      }, isLive(latest) ? LIVE_MS : IDLE_MS)
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
