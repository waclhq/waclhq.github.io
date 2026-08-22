import { useEffect, useRef } from 'react'
import { animationsDisabled } from '../lib/motion'

/**
 * A card actually on fire.
 *
 * Not tongues on a timer — a fire simulation. A coarse heat grid wraps the
 * card; every cell along the card's edge is a burner, and each frame the heat
 * climbs one row, losing a random amount and drifting sideways on a wind that
 * swings slowly. That single rule is what produces fire: tongues that merge,
 * split, gutter and flare, never twice the same. It is the PSX Doom fire,
 * bent from a bottom row into a rectangular ring of burners.
 *
 * Heat inside the card is wiped every frame, so nothing accumulates behind an
 * opaque slip and erupts out of the top — what you see is flame licking up
 * the outside of all four edges.
 *
 * The grid is one cell per three CSS pixels and the canvas is left at grid
 * resolution: the browser's own bilinear upscale is the soft edge, so a frame
 * costs one putImageData of about twenty thousand cells. It runs at 36fps,
 * stops when the card scrolls out of view or the tab is hidden, and never
 * starts at all under reduced motion.
 */

/** CSS pixels per heat cell. Coarse on purpose — fire has no fine detail. */
const CELL = 2
/** Room for the flames to climb outside the card, in CSS pixels. */
const MARGIN = { top: 56, side: 28, bottom: 32 }
/** Simulation rate. Fire reads fine below 60 and halves the work. */
const STEP_MS = 1000 / 36
/** Heat lost per row climbed, at most. Lower burns taller. */
const DECAY = 21
/** Thickness of the burner band hugging the card, in cells. */
const BURNER = 3
/** Visible gap under the slip before its burner, in cells: fire needs somewhere
 *  to be seen before the card hides it. */
const UNDER = 6
/**
 * A burner only lights where the travelling noise clears its gate, so stretches
 * of edge gutter out while others roar. The sides gate higher — a vertical edge
 * lit end to end reads as a bar, not a flame.
 */
const GATE = 0.34
const SIDE_GATE = 0.4
/** How sharply heat climbs once a burner is lit. */
const SHARP = 1.6
/** Heat a barely-lit burner carries. */
const FLOOR = 40
/** Cells over which the flame thins out at the canvas edge, so a panel that
 *  clips the canvas never cuts fire off on a straight line. */
const FADE = 7

/**
 * Heat 0-255 to RGBA. Dull ember at the tips through orange and amber to
 * near-white at the burners, with alpha rising fastest at the bottom of the
 * range so the flame fades out rather than ending on an edge.
 */
function buildPalette(): Uint32Array {
  const stops: [number, [number, number, number]][] = [
    [0.0, [16, 2, 0]],
    [0.16, [122, 13, 5]],
    [0.36, [216, 30, 5]],
    [0.55, [255, 82, 82]],
    [0.72, [255, 159, 26]],
    [0.86, [255, 200, 70]],
    [1.0, [255, 246, 214]],
  ]
  const palette = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255
    let a = stops[0]
    let b = stops[stops.length - 1]
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s]
        b = stops[s + 1]
        break
      }
    }
    const span = b[0] - a[0] || 1
    const k = (t - a[0]) / span
    const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k)
    const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k)
    const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * k)
    // Alpha climbs steeply out of nothing, so the flame has a soft top rather
    // than a visible cut, and holds solid once the cell is properly alight.
    const alpha = Math.round(255 * Math.min(1, (t * 1.9) ** 1.35))
    palette[i] = (alpha << 24) | (bl << 16) | (g << 8) | r
  }
  palette[0] = 0
  return palette
}

const PALETTE = buildPalette()

/** Cheap band-limited noise: enough irrational sines to never visibly repeat. */
function wobble(x: number, t: number): number {
  return (
    0.5 +
    0.5 *
      (0.58 * Math.sin(x * 0.31 + t * 1.7) +
        0.29 * Math.sin(x * 0.127 - t * 1.13 + 1.7) +
        0.13 * Math.sin(x * 0.83 + t * 2.37 + 4.1))
  )
}

export default function FireFrame({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (animationsDisabled()) return
    const hostNode = host.current
    const canvasNode = canvas.current
    if (!hostNode || !canvasNode) return
    const ctx = canvasNode.getContext('2d', { alpha: true })
    if (!ctx) return

    let cols = 0
    let rows = 0
    let heat = new Uint8Array(0)
    let image: ImageData | null = null
    let pixels: Uint32Array | null = null
    let fadeX = new Float32Array(0)
    let fadeY = new Float32Array(0)
    // The card's own rectangle inside the grid — burners hug it, and anything
    // strictly inside is wiped each frame.
    let card = { left: 0, right: 0, top: 0, bottom: 0 }

    const layout = () => {
      const rect = hostNode.getBoundingClientRect()
      if (!rect.width || !rect.height) return false
      const width = rect.width + MARGIN.side * 2
      const height = rect.height + MARGIN.top + MARGIN.bottom
      const nextCols = Math.max(8, Math.ceil(width / CELL))
      const nextRows = Math.max(8, Math.ceil(height / CELL))
      if (nextCols === cols && nextRows === rows) return true
      cols = nextCols
      rows = nextRows
      heat = new Uint8Array(cols * rows)
      canvasNode.width = cols
      canvasNode.height = rows
      image = ctx.createImageData(cols, rows)
      pixels = new Uint32Array(image.data.buffer)
      fadeX = new Float32Array(cols)
      for (let x = 0; x < cols; x += 1) {
        fadeX[x] = Math.min(1, Math.min(x, cols - 1 - x) / FADE)
      }
      fadeY = new Float32Array(rows)
      for (let y = 0; y < rows; y += 1) fadeY[y] = Math.min(1, y / FADE)
      card = {
        left: Math.round(MARGIN.side / CELL),
        right: Math.round((MARGIN.side + rect.width) / CELL),
        top: Math.round(MARGIN.top / CELL),
        bottom: Math.round((MARGIN.top + rect.height) / CELL),
      }
      return true
    }

    /** One row of climb: every cell hands its heat up, minus a little, askew. */
    const climb = (time: number) => {
      // Top down: each row is read before the row beneath it overwrites it,
      // so heat advances exactly one row per frame. Bottom up would wipe the
      // burners with the empty rows below them before they were ever read.
      for (let y = 1; y < rows; y += 1) {
        // Wind swings slowly and differs with height, so the whole wreath
        // leans and recovers instead of shimmering in place.
        const wind = 1.15 * Math.sin(time * 0.55 + y * 0.035) + 0.5 * Math.sin(time * 1.31 - y * 0.11)
        const above = (y - 1) * cols
        const here = y * cols
        for (let x = 0; x < cols; x += 1) {
          const value = heat[here + x]
          if (value === 0) {
            heat[above + x] = 0
            continue
          }
          // Outside the slip's own columns the plume leans away from it, the
          // way flame peels off a surface instead of climbing it in a stripe.
          const outward = x < card.left ? -0.45 : x >= card.right ? 0.45 : 0
          const drift = Math.round(Math.random() * 1.3 - 0.65 + wind * 0.42 + outward)
          const target = x + drift
          if (target < 0 || target >= cols) continue
          const loss = (Math.random() * DECAY) | 0
          heat[above + target] = value > loss ? value - loss : 0
        }
      }
    }

    /** Wipe the slip's interior: fire never builds up behind the card. */
    const clearInterior = () => {
      for (let y = Math.max(0, card.top); y < Math.min(rows, card.bottom); y += 1) {
        heat.fill(0, y * cols + card.left, y * cols + card.right)
      }
    }

    /**
     * Light the burners: a band hugging the slip's outside edge, its heat
     * travelling in slow waves so some stretches roar while others gutter.
     * Heat is taken as a maximum, never an assignment, so a burner can only
     * add to a flame already climbing past it.
     */
    const light = (time: number) => {
      const hot = (index: number, gate: number) => {
        const n = wobble(index, time)
        if (n < gate) return 0
        return (FLOOR + ((n - gate) / (1 - gate)) ** SHARP * (255 - FLOOR)) | 0
      }
      const set = (y: number, x: number, value: number) => {
        if (value <= 0 || x < 0 || x >= cols || y < 0 || y >= rows) return
        const at = y * cols + x
        if (value > heat[at]) heat[at] = value
      }

      for (let x = card.left - 1; x <= card.right; x += 1) {
        for (let b = 0; b < BURNER; b += 1) {
          // straddling the top edge, and a few cells under the bottom one
          set(card.top - b, x, hot(x * CELL * 0.5, GATE))
          set(card.bottom + UNDER + b, x, hot(x * CELL * 0.5 + 40, GATE))
        }
      }
      for (let y = card.top; y < card.bottom + UNDER; y += 1) {
        for (let b = 1; b <= BURNER; b += 1) {
          set(y, card.left - b, hot(y * CELL * 0.43 + 90, SIDE_GATE))
          set(y, card.right - 1 + b, hot(y * CELL * 0.43 + 150, SIDE_GATE))
        }
      }
    }

    const paint = () => {
      if (!image || !pixels) return
      for (let y = 0; y < rows; y += 1) {
        const row = y * cols
        const fy = fadeY[y]
        for (let x = 0; x < cols; x += 1) {
          const value = heat[row + x]
          pixels[row + x] = value === 0 ? 0 : PALETTE[(value * fy * fadeX[x]) | 0]
        }
      }
      ctx.putImageData(image, 0, 0)
    }

    let frame = 0
    let last = 0
    let clock = 0
    let running = false

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < STEP_MS) return
      last = now
      clock += STEP_MS / 1000
      if (!layout()) return
      climb(clock)
      clearInterior()
      light(clock)
      paint()
    }

    const start = () => {
      if (running) return
      running = true
      last = 0
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (!running) return
      running = false
      cancelAnimationFrame(frame)
    }

    // Fire off screen is heat nobody sees — and on a phone, battery.
    const seen = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
      { rootMargin: '80px' },
    )
    seen.observe(hostNode)

    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    const resized = new ResizeObserver(() => layout())
    resized.observe(hostNode)

    return () => {
      stop()
      seen.disconnect()
      resized.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <span className="on-fire block" ref={host}>
      <canvas
        ref={canvas}
        className="fire-canvas"
        aria-hidden
        // A canvas is a replaced element: with left and right both set its
        // auto width would resolve to the bitmap's, not the box's, so the
        // stretch has to be spelled out.
        style={{
          top: -MARGIN.top,
          left: -MARGIN.side,
          width: `calc(100% + ${MARGIN.side * 2}px)`,
          height: `calc(100% + ${MARGIN.top + MARGIN.bottom}px)`,
        }}
      />
      <span className="fire-rim" aria-hidden />
      {children}
    </span>
  )
}
