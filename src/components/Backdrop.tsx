import { useEffect, useRef, useState } from 'react'
import { animationsDisabled } from '../lib/motion'

/**
 * The room the site lives in: deep water under a lit board.
 *
 * This used to be a WebGL shader — five octaves of noise, three times over,
 * for every pixel of the viewport, thirty times a second, with a GL context
 * and its driver allocations resident for the life of the app. It looked
 * wonderful and it cost a phone more than the league is worth.
 *
 * The same room, drawn a different way. The light field is computed ONCE, at
 * a twelfth of an inch of resolution — a few thousand cells, not a million
 * pixels — and every frame after that is a walk through it: the field drifts,
 * the colour centres wander on their own long orbits, and the browser's own
 * bilinear upscale from a postage stamp to the full screen is the softness we
 * used to pay a blur for. No GL context, no shader program, no per-pixel
 * transcendentals; about forty thousand additions a frame, ten times a
 * second, into a canvas smaller than a favicon.
 *
 * Everything the room knew, it still knows: it keeps stadium hours (dusk
 * warms it, after eleven the house lights come down), it tints toward the
 * colour of whoever's seat is picked, it stands down while the page is
 * scrolling or hidden, and with animations off it paints one still frame and
 * never runs again.
 */

/** Cells in the light field. ~16k of them, in the viewport's proportions —
 *  still a fiftieth of the pixels the shader touched, and sharp enough that
 *  the veins have edges. */
const CELLS = 16000
/** How often the field is redrawn. It moves like weather; ten is plenty. */
const FRAME_MS = 100
/** Frames to skip after a scroll ends, so a flick keeps the whole thread. */
const SCROLL_QUIET_MS = 140

/** The three fixed colours of the room, and the fourth the seat provides. */
const GREEN = [0.33, 0.83, 0.22]
const AMBER = [1.0, 0.71, 0.21]
const TEAL = [0.17, 0.85, 0.82]

/** Value noise on a lattice, smoothed — the cheapest field that reads organic. */
function noiseField(width: number, height: number, scale: number, seed: number): Float32Array {
  const cols = Math.ceil(width / scale) + 2
  const rows = Math.ceil(height / scale) + 2
  const lattice = new Float32Array(cols * rows)
  // A small deterministic PRNG: the room looks the same on every device, and
  // nobody has to wonder whether they are seeing the same thing as everyone
  // else in the group chat.
  let state = seed >>> 0
  for (let i = 0; i < lattice.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    lattice[i] = state / 4294967296
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const fy = y / scale
    const y0 = fy | 0
    const ty = fy - y0
    const wy = ty * ty * (3 - 2 * ty)
    for (let x = 0; x < width; x += 1) {
      const fx = x / scale
      const x0 = fx | 0
      const tx = fx - x0
      const wx = tx * tx * (3 - 2 * tx)
      const a = lattice[y0 * cols + x0]
      const b = lattice[y0 * cols + x0 + 1]
      const c = lattice[(y0 + 1) * cols + x0]
      const d = lattice[(y0 + 1) * cols + x0 + 1]
      out[y * width + x] = (a + (b - a) * wx) * (1 - wy) + (c + (d - c) * wx) * wy
    }
  }
  return out
}

/**
 * The light itself: four octaves of noise, folded into caustics.
 *
 * This runs once per layout, not once per frame, which is what makes the
 * detail affordable — four octaves over thirty thousand cells costs about a
 * millisecond, and then the room lives off it for as long as the tab is open.
 * The fold is where the look comes from: taking the distance to the nearest
 * ridge of a rising field, and raising it to a power, turns smooth noise into
 * thin bright filaments over dark water. That is what light does through a
 * rippled surface, and it is what the shader was doing the expensive way.
 */
function lightField(width: number, height: number): Float32Array {
  const base = Math.max(6, width / 9)
  const octaves = [
    { field: noiseField(width, height, base, 0x51f3a1), weight: 0.5 },
    { field: noiseField(width, height, base / 2.1, 0x9e37b1), weight: 0.26 },
    { field: noiseField(width, height, base / 4.3, 0x2b7d55), weight: 0.15 },
    { field: noiseField(width, height, base / 8.7, 0xc41d7f), weight: 0.09 },
  ]
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i += 1) {
    let v = 0
    for (let o = 0; o < octaves.length; o += 1) v += octaves[o].field[i] * octaves[o].weight
    // Ridges: the field folded back on itself, sharpened into filaments.
    const ridge = 1 - Math.abs(2 * ((v * 3.6) % 1) - 1)
    const vein = ridge * ridge * ridge * ridge
    // A finer fold scatters speckle across the water between them.
    const grain = 1 - Math.abs(2 * ((v * 11.5) % 1) - 1)
    const speck = grain * grain * grain * grain * grain * grain
    // Mostly the smooth field, with the filaments laid over it: pools of
    // light with structure inside them, rather than a net across the screen.
    out[i] = vein * 0.46 + speck * 0.07 + v * 0.47
  }
  return out
}

export default function Backdrop({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      setFailed(true)
      return
    }

    const still = animationsDisabled() || !enabled
    let width = 0
    let height = 0
    let field: Float32Array = new Float32Array(0)
    let image: ImageData | null = null

    const layout = () => {
      const ratio = window.innerHeight / Math.max(1, window.innerWidth)
      const next = Math.max(40, Math.round(Math.sqrt(CELLS / ratio)))
      const nextHeight = Math.max(40, Math.round(next * ratio))
      if (next === width && nextHeight === height) return
      width = next
      height = nextHeight
      canvas.width = width
      canvas.height = height
      // The field is drawn twice as wide as the canvas so the drift has
      // somewhere to go: an hour of travel with no seam and no recompute.
      field = lightField(width * 2, height)
      image = context.createImageData(width, height)
    }

    /** The room's palette, read from the Shell's stamps once a second. */
    let sampledAt = -Infinity
    let hours = 0
    let seat: number[] | null = null
    const sample = (now: number) => {
      if (now - sampledAt < 1000) return
      sampledAt = now
      const stamp = document.documentElement.dataset.hours
      hours = stamp === 'late' ? 2 : stamp === 'dusk' ? 1 : 0
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--me-color').trim()
      const hex = /^#([0-9a-f]{6})$/i.exec(raw)
      seat = hex
        ? [
            parseInt(hex[1].slice(0, 2), 16) / 255,
            parseInt(hex[1].slice(2, 4), 16) / 255,
            parseInt(hex[1].slice(4, 6), 16) / 255,
          ]
        : null
    }

    const paint = (seconds: number) => {
      if (!image) return
      const data = image.data
      // Where the field is being read from, and how hard the light burns.
      const drift = (seconds * 1.1) % width
      const shift = drift | 0
      const dusk = hours === 1
      const late = hours === 2
      const lift = late ? 0.5 : dusk ? 0.72 : 0.86
      const floorR = late ? 0.036 : 0.043
      const floorG = late ? 0.045 : 0.055
      const floorB = late ? 0.062 : 0.071

      // Colour centres on slow, coprime orbits, in cell coordinates.
      const centres: { x: number; y: number; c: number[]; k: number }[] = [
        {
          x: (0.5 + 0.4 * Math.sin(seconds * 0.05)) * width,
          y: (0.5 + 0.4 * Math.cos(seconds * 0.062)) * height,
          c: GREEN,
          k: 2.1,
        },
        {
          x: (0.5 + 0.42 * Math.cos(seconds * 0.037 + 2)) * width,
          y: (0.5 + 0.42 * Math.sin(seconds * 0.045 + 2)) * height,
          c: dusk || late ? [1, 0.62, 0.16] : AMBER,
          k: 2.3,
        },
        {
          x: (0.5 + 0.4 * Math.sin(seconds * 0.028 + 4)) * width,
          y: (0.5 + 0.4 * Math.cos(seconds * 0.031 + 4)) * height,
          c: TEAL,
          k: late ? 3.0 : 2.5,
        },
      ]
      if (seat) {
        centres.push({
          x: (0.5 + 0.45 * Math.cos(seconds * 0.021 + 1)) * width,
          y: (0.5 + 0.45 * Math.sin(seconds * 0.024 + 1)) * height,
          c: seat,
          k: 2.6,
        })
      }
      // Normalise the falloff to the canvas so the room looks the same on a
      // phone and a widescreen.
      const span = 1 / (width * width + height * height)
      const inverseHeight = 1 / height

      let at = 0
      for (let y = 0; y < height; y += 1) {
        const row = y * width * 2
        for (let x = 0; x < width; x += 1) {
          const vein = field[row + ((x + shift) % (width * 2))]
          // The field lights: a warm lift along the bottom edge, the way a
          // stadium glows under its own roof line.
          const horizon = y * inverseHeight
          let r = floorR + horizon * 0.028
          let g = floorG + horizon * 0.022
          let b = floorB + horizon * 0.012
          for (let i = 0; i < centres.length; i += 1) {
            const centre = centres[i]
            const dx = x - centre.x
            const dy = y - centre.y
            // A rational falloff stands in for the exponential the shader
            // used: the same soft pool of light, without the transcendental.
            const reach = 1 / (1 + centre.k * centre.k * (dx * dx + dy * dy) * span * 4)
            const amount = reach * (0.05 + 1.05 * vein) * lift
            // Where a bright vein crosses the heart of a pool, the colour
            // burns rather than washes: the hot core the glass used to have.
            const core = reach * reach * reach * vein * vein * 0.75 * lift
            r += centre.c[0] * amount + centre.c[0] * core
            g += centre.c[1] * amount + centre.c[1] * core
            b += centre.c[2] * amount + centre.c[2] * core
          }
          data[at] = r > 1 ? 255 : r * 255
          data[at + 1] = g > 1 ? 255 : g * 255
          data[at + 2] = b > 1 ? 255 : b * 255
          data[at + 3] = 255
          at += 4
        }
      }
      context.putImageData(image, 0, 0)
    }

    layout()
    sample(performance.now())
    paint(0)
    if (still) {
      const onResize = () => {
        layout()
        paint(0)
      }
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    // ---- the moving version ------------------------------------------------
    let raf = 0
    let lastPaint = -Infinity
    let quietUntil = 0
    let onScreen = true
    const standDown = () => {
      quietUntil = performance.now() + SCROLL_QUIET_MS
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || !onScreen) return
      // A flick is the one moment a phone has nothing to spare, and a room
      // that holds still for the length of a scroll is one nobody notices
      // holding still.
      if (now < quietUntil) return
      if (now - lastPaint < FRAME_MS) return
      lastPaint = now
      layout()
      sample(now)
      paint(now / 1000)
    }

    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
    })
    seen.observe(canvas)
    window.addEventListener('scroll', standDown, { passive: true })
    window.addEventListener('touchmove', standDown, { passive: true })
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      seen.disconnect()
      window.removeEventListener('scroll', standDown)
      window.removeEventListener('touchmove', standDown)
    }
  }, [enabled])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {failed ? (
        <>
          <div className="aurora-blob aurora-a" />
          <div className="aurora-blob aurora-b" />
          <div className="aurora-blob aurora-c" />
        </>
      ) : (
        <canvas ref={canvasRef} className="room-canvas absolute inset-0 h-full w-full" />
      )}
      {/* The readability veil: heaviest up top where titles and ledes sit on
          bare background, lighter mid-screen so the room still glows. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(11,14,18,0.58) 0%, rgba(11,14,18,0.22) 34%, rgba(11,14,18,0.28) 70%, rgba(11,14,18,0.42) 100%)',
        }}
      />
    </div>
  )
}
