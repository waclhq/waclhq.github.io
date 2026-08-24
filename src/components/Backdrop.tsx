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
const ROW = 20
const FRAME_MS = 90 // ~11fps — the rain is weather, not a game

interface Column {
  x: number
  /** Head position in whole rows — glyphs sit in fixed cells; the lit window slides. */
  head: number
  /** Rows per frame; < 1 so a step lands every few frames. */
  speed: number
  progress: number
  live: boolean
  trail: number
  amber: boolean
  /** The glyph living in each row cell. Stable — mutates rarely, not per frame. */
  cells: string[]
}

export default function Backdrop({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0]
    let columns: Column[] = []
    let totalRows = 0
    const size = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      totalRows = Math.ceil(window.innerHeight / ROW) + 2
      columns = Array.from({ length: Math.ceil(window.innerWidth / COL_SPACING) }, (_, i) => ({
        x: i * COL_SPACING + 12,
        head: (Math.random() * totalRows) | 0,
        speed: 0.18 + Math.random() * 0.22,
        progress: 0,
        // Most columns idle at any moment — the rain reads as weather, not wall.
        live: Math.random() < 0.4,
        trail: 5 + ((Math.random() * 8) | 0),
        amber: Math.random() < 0.1,
        cells: Array.from({ length: totalRows }, glyph),
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
      ctx.font = '700 15px "IBM Plex Mono", monospace'
      for (const col of columns) {
        if (!col.live) {
          if (Math.random() < 0.004) col.live = true
          continue
        }
        // The head advances a whole row every few frames; glyphs never slide.
        col.progress += col.speed
        if (col.progress >= 1) {
          col.progress -= 1
          col.head += 1
          col.cells[col.head % totalRows] = glyph()
        }
        // One digit in the trail flickers occasionally — a tick, not a boil.
        if (Math.random() < 0.06) {
          const k = (Math.random() * col.trail) | 0
          col.cells[(col.head - k + totalRows * 4) % totalRows] = glyph()
        }
        if (col.head - col.trail > totalRows) {
          col.head = -1
          col.live = Math.random() < 0.6
          col.amber = Math.random() < 0.1
        }
        for (let k = 0; k < col.trail; k++) {
          const row = col.head - k
          if (row < 0 || row >= totalRows) continue
          const alpha = (1 - k / col.trail) * (k === 0 ? 0.42 : 0.28)
          ctx.fillStyle = col.amber
            ? `rgba(255,182,54,${alpha})`
            : `rgba(83,211,55,${alpha})`
          ctx.fillText(col.cells[row % totalRows], col.x, row * ROW)
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
