import { useEffect, useRef } from 'react'
import { animationsDisabled } from '../lib/motion'

/**
 * The G.O.A.T. himself, in heap-sprite pixel art: backwards tan cap, orange
 * tiger-striped jersey, number 1 on the chest, hitting a front double-biceps
 * with veins that throb on the beat. Same DNA as HeapScene — low-res canvas,
 * chunky pixels, stepped animation. Static single frame when FX are off, and
 * the loop rests whenever the sprite is off-screen or the tab is hidden.
 */

const W = 44
const H = 38

// palette
const SKIN = '#9c6644'
const SKIN_D = '#7d4e33'
const HAIR = '#241611'
const CAP = '#d2a24c'
const CAP_D = '#a97e35'
const JERSEY = '#ff7a1a'
const STRIPE = '#151312'
const WHITE = '#f5efe6'
const MOUTH = '#4a2a1a'
const VEIN = '#8a1f1f'
const SPARK = '#ffd84d'

export default function GoatAvatar({ scale = 4 }: { scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${W * scale}px`
    canvas.style.height = `${H * scale}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const px = (x: number, y: number, color: string, alpha = 1) => {
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
      ctx.globalAlpha = 1
    }
    const rect = (x0: number, y0: number, x1: number, y1: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    }
    const disc = (cx: number, cy: number, r: number, color: string) => {
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r + 0.5) px(cx + x, cy + y, color)
    }

    /** pulse ∈ {0,1}: relaxed vs squeezed, stepped like the heap sprites. */
    const draw = (pulse: number) => {
      ctx.clearRect(0, 0, W, H)
      const cx = 22

      // ---- arms first, so the torso overlaps the shoulder joints ----
      for (const side of [-1, 1] as const) {
        const sx = cx + side * 10 // shoulder
        // upper arm reaching outward
        rect(Math.min(sx, sx + side * 3), 17, Math.max(sx, sx + side * 3), 19, SKIN)
        // bicep ball — grows on the squeeze
        const bx = sx + side * 4
        disc(bx, 17, 3 + pulse, SKIN)
        // forearm rising to the fist
        rect(bx + side * 2 - (side < 0 ? 1 : 0), 10 - pulse, bx + side * 2 + (side > 0 ? 1 : 0), 17, SKIN)
        // fist
        rect(bx + side * 2 - 1, 8 - pulse, bx + side * 2 + 1, 10 - pulse, SKIN_D)
        // throbbing veins: two ticks across each bicep
        px(bx - 1, 16, VEIN, 0.35 + 0.55 * pulse)
        px(bx, 17, VEIN, 0.35 + 0.55 * pulse)
        px(bx + 1, 16, VEIN, 0.25 + 0.45 * pulse)
        // jersey sleeve cap over the shoulder
        rect(Math.min(sx - side, sx + side), 16, Math.max(sx - side, sx + side), 17, JERSEY)
        px(sx, 17, STRIPE)
      }

      // ---- torso ----
      rect(cx - 8, 16, cx + 8, 33, JERSEY)
      rect(cx - 9, 18, cx + 9, 26, JERSEY)
      // tiger stripes, alternating flanks
      for (const [x0, y0] of [
        [cx - 9, 19], [cx - 8, 23], [cx - 9, 27], [cx - 7, 31],
        [cx + 7, 20], [cx + 8, 24], [cx + 7, 28], [cx + 6, 32],
      ] as const) {
        px(x0, y0, STRIPE)
        px(x0 + 1, y0 + 1, STRIPE)
      }
      // chest number 1
      rect(cx, 20, cx, 26, WHITE)
      px(cx - 1, 21, WHITE)
      rect(cx - 1, 27, cx + 1, 27, WHITE)

      // ---- head ----
      rect(cx - 5, 7, cx + 5, 14, SKIN) // face
      px(cx - 6, 10, SKIN) // ears
      px(cx + 6, 10, SKIN)
      rect(cx - 5, 6, cx + 5, 7, HAIR) // hairline under the cap
      // backwards cap: dome + brim pointing back-right
      rect(cx - 6, 3, cx + 6, 5, CAP)
      rect(cx - 5, 2, cx + 5, 2, CAP)
      rect(cx + 6, 4, cx + 9, 5, CAP_D) // brim
      px(cx, 3, CAP_D) // button
      // face: brows, eyes, grin
      px(cx - 3, 8, HAIR)
      px(cx + 3, 8, HAIR)
      px(cx - 3, 9, MOUTH)
      px(cx + 3, 9, MOUTH)
      rect(cx - 2, 12, cx + 2, 12, MOUTH) // the smirk from the photo
      px(cx + 3, 11, MOUTH)
      // neck
      rect(cx - 2, 14, cx + 2, 15, SKIN)

      // ---- glory sparkles at the fists on the squeeze ----
      if (pulse) {
        px(cx - 16, 6, WHITE, 0.9)
        px(cx + 16, 5, WHITE, 0.9)
        px(cx - 18, 9, SPARK, 0.8)
        px(cx + 18, 8, SPARK, 0.8)
      }
    }

    if (animationsDisabled()) {
      draw(1) // hold the squeeze
      return
    }

    let frame = 0
    let alive = true
    let visible = true
    let handle = 0
    let last = 0
    const tick = (time: number) => {
      if (!alive || !visible || document.hidden) {
        handle = 0
        return
      }
      if (time - last > 420) {
        last = time
        frame += 1
        draw(frame % 2)
      }
      handle = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (alive && visible && !document.hidden && !handle) handle = requestAnimationFrame(tick)
    }
    draw(1)
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    watch.observe(canvas)
    document.addEventListener('visibilitychange', wake)
    wake()
    return () => {
      alive = false
      if (handle) cancelAnimationFrame(handle)
      watch.disconnect()
      document.removeEventListener('visibilitychange', wake)
    }
  }, [scale])

  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated' }}
      aria-label="Pixel-art avatar of the GOAT flexing"
      role="img"
    />
  )
}
