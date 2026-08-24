import { useEffect, useRef } from 'react'

/**
 * The room the site lives in: aurora colour fields drifting on a minutes-long
 * cycle (pure CSS, see index.css) under a sparse rain of odds digits in
 * money-green with the occasional amber stray (canvas, ~20fps).
 *
 * The aurora blobs render even when animations are off — motionless, they're
 * just ambient glow, and the CSS guard freezes their drift. The rain only
 * exists while FX are on: `enabled` gates the canvas entirely, matching how
 * the helmet field behaved before it.
 */

const GLYPHS = '0123456789+−$·:'
const COL_SPACING = 44
const ROW = 18
const FRAME_MS = 50 // ~20fps — rain doesn't need more

interface Column {
  x: number
  y: number
  speed: number
  live: boolean
  trail: number
  amber: boolean
}

export default function Backdrop({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let columns: Column[] = []
    const size = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      columns = Array.from({ length: Math.ceil(window.innerWidth / COL_SPACING) }, (_, i) => ({
        x: i * COL_SPACING + 12,
        y: Math.random() * window.innerHeight,
        speed: 0.35 + Math.random() * 0.75,
        // Most columns idle at any moment — the rain reads as weather, not wall.
        live: Math.random() < 0.4,
        trail: 4 + ((Math.random() * 7) | 0),
        amber: Math.random() < 0.1,
      }))
    }
    size()
    window.addEventListener('resize', size)

    let raf = 0
    let last = 0
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick)
      if (time - last < FRAME_MS) return
      last = time
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = '700 14px "IBM Plex Mono", monospace'
      for (const col of columns) {
        if (!col.live) {
          if (Math.random() < 0.0015) col.live = true
          continue
        }
        col.y += col.speed * 8
        if (col.y - col.trail * ROW > canvas.height) {
          col.y = -ROW
          col.live = Math.random() < 0.6
          col.amber = Math.random() < 0.1
        }
        for (let k = 0; k < col.trail; k++) {
          // Production alpha: half the audition brightness. Texture, not show.
          const alpha = (1 - k / col.trail) * 0.16
          ctx.fillStyle = col.amber
            ? `rgba(255,182,54,${alpha})`
            : `rgba(83,211,55,${alpha})`
          ctx.fillText(
            GLYPHS[(Math.random() * GLYPHS.length) | 0],
            col.x,
            col.y - k * ROW,
          )
        }
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
    }
  }, [enabled])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
      {enabled && <canvas ref={canvasRef} className="absolute inset-0" />}
    </div>
  )
}
