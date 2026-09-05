import { useEffect, useRef } from 'react'
import { useStill } from './receipts/useStill'

/**
 * The losing half of a settled bet slip, consumed by fire.
 *
 * A burn front starts at the bottom edge and climbs, each column at its own
 * noisy pace, the way paper actually takes: a bright ragged line of flame at
 * the front, char left behind it, embers winking in the char near the heat.
 * The char stays when the front clears the top — the loser remains scorched
 * until the board refreshes them into the settled pile.
 *
 * One canvas at a third resolution, upscaled by the browser; runs about 1.6
 * seconds at 30fps and never mounts under reduced motion (the caller checks,
 * and so does the effect).
 */

const CELL = 3
const FPS = 30
/** Seconds for the average column front to cross the half. */
const CLIMB_S = 1.15

export default function BurnAway({ color = '#12161c' }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const still = useStill()

  useEffect(() => {
    if (still) return
    const canvas = canvasRef.current
    if (!canvas || !canvas.parentElement) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.parentElement.getBoundingClientRect()
    const cols = Math.max(8, Math.ceil(rect.width / CELL))
    const rows = Math.max(8, Math.ceil(rect.height / CELL))
    canvas.width = cols
    canvas.height = rows

    // Per-column climb speed, in rows per frame, with neighbours correlated
    // so the front is ragged but connected.
    const speed = new Float32Array(cols)
    let last = 1
    for (let x = 0; x < cols; x += 1) {
      last = Math.max(0.5, Math.min(1.8, last + (Math.random() - 0.5) * 0.5))
      speed[x] = (rows / (CLIMB_S * FPS)) * last
    }
    const front = new Float32Array(cols).fill(rows + 2)

    let frame = 0
    let timer = 0
    const step = () => {
      ctx.clearRect(0, 0, cols, rows)
      for (let x = 0; x < cols; x += 1) {
        front[x] -= speed[x] * (0.75 + Math.random() * 0.5)
        const f = front[x]

        // char below the front — opaque near the burn, easing off behind it
        const charTop = Math.max(0, Math.ceil(f))
        if (charTop < rows) {
          ctx.fillStyle = 'rgba(10, 7, 5, 0.94)'
          ctx.fillRect(x, charTop, 1, rows - charTop)
          // embers wink in the fresh char
          if (Math.random() < 0.2 && charTop + 2 < rows) {
            ctx.fillStyle = Math.random() < 0.5 ? '#ff5230' : '#ff9f1a'
            ctx.fillRect(x, charTop + ((Math.random() * 3) | 0), 1, 1)
          }
        }

        // the flame line itself, riding the front
        if (f > -4 && f < rows) {
          const flicker = 0.6 + Math.random() * 0.4
          ctx.fillStyle = `rgba(255, 246, 214, ${flicker})`
          ctx.fillRect(x, Math.max(0, f - 1), 1, 1)
          ctx.fillStyle = `rgba(255, 159, 26, ${flicker * 0.9})`
          ctx.fillRect(x, Math.max(0, f - 2 - Math.random() * 2), 1, 2)
          ctx.fillStyle = `rgba(216, 48, 5, ${flicker * 0.5})`
          ctx.fillRect(x, Math.max(0, f - 5 - Math.random() * 3), 1, 3)
        }
      }
      frame += 1
      // hold the char a beat after every column has cleared the top
      if (frame < (CLIMB_S + 0.9) * FPS) {
        timer = window.setTimeout(step, 1000 / FPS)
      } else {
        // settle to plain char, no more embers
        ctx.fillStyle = 'rgba(10, 7, 5, 0.94)'
        ctx.fillRect(0, 0, cols, rows)
      }
    }
    step()
    return () => {
      window.clearTimeout(timer)
      ctx.clearRect(0, 0, cols, rows)
    }
  }, [color, still])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ imageRendering: 'auto' }}
    />
  )
}
