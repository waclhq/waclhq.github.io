import { useEffect, useRef } from 'react'
import { useLeague } from '../lib/data'
import { MANAGER_COLOR } from '../lib/identity'
import { animationsDisabled } from '../lib/motion'

/**
 * King of the Heap — the league, animated.
 *
 * Eleven pixel players sprint in from the wings and dive onto a growing
 * dogpile; the pile squirms; the champion arrives last, scrambles up the
 * bodies in three hops, plants at the summit, and hoists a golden trophy to a
 * confetti burst. In idle mode the finished tableau breathes: the pile
 * twitches, the champion sways, the trophy glints — and the pile is only as
 * tall as the league's open cash: everyone square, a low heap; half the dues
 * outstanding, the full dogpile.
 *
 * Deterministic timeline on one canvas — no Math.random, no libraries. The
 * loop runs only while the canvas is on screen and the tab is visible, and
 * under reduced motion it paints the assembled still once and stops.
 */

interface Props {
  mode: 'boot' | 'idle'
  championColor?: string
  width?: number
  height?: number
  className?: string
  /**
   * How much of the pile to build, 0–1. Omitted, idle mode reads it from the
   * league's open cash for the current season; boot mode always builds all.
   */
  pile?: number
}

/* ---- pixel poses: J jersey · S skin · D dark · W shoe ---------------- */

const RUN_A = [
  '..DDD...',
  '..SSS...',
  '.JJJJJ..',
  'S.JJJ.S.',
  '..JJJ...',
  '..DDD...',
  '..D.D...',
  '..D..D..',
  '..W..W..',
]
const RUN_B = [
  '..DDD...',
  '..SSS...',
  '.JJJJJ..',
  '.SJJJS..',
  '..JJJ...',
  '..DDD...',
  '..DD....',
  '.D..D...',
  '.W..W...',
]
const CLIMB = [
  '.S...S..',
  '.J...J..',
  '.JDDDJ..',
  '..SSS...',
  '..JJJ...',
  '..JJJ...',
  '..DD....',
  '.D..D...',
  '.W..W...',
]
const VICTORY = [
  'S.....S.',
  'J.....J.',
  'J.DDD.J.',
  'J.SSS.J.',
  '.JJJJJ..',
  '..JJJ...',
  '..DDD...',
  '..D.D...',
  '..W.W...',
]
const TROPHY = [
  'G.GGG.G',
  'GGGGGGG',
  '.GLGGG.',
  '..GGG..',
  '...G...',
  '..GGG..',
  '.GGGGG.',
]

const SKIN = '#e8b98c'
const DARK = '#241d38'
const SHOE = '#efeafb'
const GOLD = '#ffd84d'
const GLINT = '#fffbe8'

function drawSprite(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  x: number,
  y: number,
  cell: number,
  jersey: string,
  options: { flip?: boolean; rot?: number } = {},
) {
  const w = grid[0].length * cell
  const h = grid.length * cell
  ctx.save()
  ctx.translate(x, y)
  if (options.rot) ctx.rotate(options.rot)
  if (options.flip) ctx.scale(-1, 1)
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col]
      if (ch === '.') continue
      ctx.fillStyle =
        ch === 'J' ? jersey : ch === 'S' ? SKIN : ch === 'D' ? DARK : ch === 'W' ? SHOE
          : ch === 'G' ? GOLD : GLINT
      ctx.fillRect(col * cell - w / 2, row * cell - h, cell, cell)
    }
  }
  ctx.restore()
}

/* ---- choreography ----------------------------------------------------- */

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
/** deterministic jitter in [-1, 1] */
const jitter = (i: number, salt: number) => Math.sin(i * 127.1 + salt * 311.7) % 1

interface PileActor {
  color: string
  side: 1 | -1
  spawnT: number
  runT: number
  diveT: number
  slotX: number
  slotY: number
  lieRot: number
}

/** Rows of bodies, bottom up, for a given share of open cash. */
function pileRows(share: number): number[] {
  if (share <= 0) return [3, 2]
  if (share < 0.34) return [4, 3]
  if (share < 0.67) return [4, 3, 2]
  return [4, 3, 2, 1]
}

/**
 * Open cash as a share of everything billed this season, netted per manager
 * the way the Ledger's "cash open" tile nets it. Null before data lands.
 */
function useOpenCashShare(): number | null {
  const { data } = useLeague()
  if (!data) return null
  const season = data.league.currentSeason
  const entries = data.cash.entries.filter((entry) => entry.season === season)
  if (entries.length === 0) return 0
  const billed = entries.reduce((sum, entry) => sum + Math.abs(entry.amount), 0)
  const net = new Map<string, number>()
  for (const entry of entries) {
    if (entry.settled) continue
    net.set(entry.manager, (net.get(entry.manager) ?? 0) + entry.amount)
  }
  const open = [...net.values()].reduce((sum, value) => sum + Math.abs(value), 0)
  return billed > 0 ? Math.min(1, open / billed) : 0
}

export default function HeapScene({
  mode,
  championColor,
  width = 380,
  height = 240,
  className = '',
  pile,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const champRef = useRef(championColor)
  champRef.current = championColor
  const openShare = useOpenCashShare()
  const share = mode === 'boot' ? 1 : (pile ?? openShare ?? 0.5)
  const rowsKey = pileRows(share).join('/')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const CELL = Math.max(2, Math.round(width / 130))
    const bodyH = 9 * CELL
    const cx = width / 2
    const ground = height - 14

    // Pyramid slots, bottom row first; the champion stands on top.
    const rows = mode === 'boot' ? [4, 3, 2] : rowsKey.split('/').map(Number)
    const rowGap = bodyH * 0.62
    const slots: { x: number; y: number }[] = []
    for (const [row, count] of rows.entries()) {
      for (let k = 0; k < count; k++) {
        slots.push({
          x: cx + (k - (count - 1) / 2) * bodyH * 1.15,
          y: ground - row * rowGap,
        })
      }
    }
    const summit = { x: cx, y: ground - rows.length * rowGap - 2 }

    const colors = Object.values(MANAGER_COLOR).slice(0, 12)
    const pileActors: PileActor[] = slots.map((slot, i) => ({
      color: colors[i % colors.length],
      side: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      spawnT: mode === 'boot' ? 0.1 + i * 0.17 : -10,
      runT: 0.55,
      diveT: 0.3,
      slotX: slot.x,
      slotY: slot.y,
      lieRot: (Math.PI / 2) * (i % 2 ? 1 : -1) + jitter(i, 1) * 0.35,
    }))

    const champSpawn = mode === 'boot' ? 0.1 + pileActors.length * 0.17 + 0.25 : -10
    // Climb path: pile edge, then a hop per row, to the summit.
    const climbPath = [{ x: cx + bodyH * 1.6, y: ground }]
    for (let row = 1; row < rows.length; row++) {
      climbPath.push({
        x: cx + bodyH * (1.6 - (row / rows.length) * 1.2),
        y: ground - row * rowGap,
      })
    }
    climbPath.push(summit)
    const hopT = 0.3
    const trophyT = champSpawn + 0.55 + (climbPath.length - 1) * hopT + 0.15

    // Confetti burst at the trophy moment; deterministic fan of particles.
    const confetti = Array.from({ length: 26 }, (_, i) => {
      const angle = -Math.PI / 2 + (i / 26 - 0.5) * 2.4
      const speed = 60 + (i % 5) * 22
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        color: colors[i % colors.length],
        delay: (i % 7) * 0.03,
      }
    })

    const start = performance.now()
    let frame = 0
    let running = false
    let onScreen = true
    // Reduced motion: one still of the finished tableau, no loop.
    const still = animationsDisabled()

    const paint = (now: number, live: boolean) => {
      // idle mode starts fully assembled, two seconds past the trophy
      const t = (now - start) / 1000 + (mode === 'idle' ? trophyT + 2 : 0)
      ctx.clearRect(0, 0, width, height)

      // turf line
      ctx.fillStyle = 'rgba(42,214,138,0.35)'
      ctx.fillRect(0, ground + 2, width, 2)
      ctx.fillStyle = 'rgba(42,214,138,0.14)'
      ctx.fillRect(0, ground + 4, width, height - ground - 4)

      // spotlight cone behind the summit once the pile is forming
      const lightIn = clamp01((t - 1) / 1.2)
      if (lightIn > 0) {
        const grad = ctx.createRadialGradient(cx, ground - rowGap, 8, cx, ground - rowGap, width * 0.45)
        grad.addColorStop(0, `rgba(255,216,77,${0.1 * lightIn})`)
        grad.addColorStop(1, 'rgba(255,216,77,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      }

      // ---- the pile ----
      pileActors.forEach((actor, i) => {
        const local = t - actor.spawnT
        if (local < 0) return
        const startX = actor.side > 0 ? -20 : width + 20

        if (local < actor.runT) {
          // sprint in
          const p = easeOut(local / actor.runT)
          const x = startX + (actor.slotX + actor.side * 34 - startX) * p
          const grid = Math.floor(local * 10) % 2 ? RUN_A : RUN_B
          drawSprite(ctx, grid, x, ground, CELL, actor.color, { flip: actor.side < 0 })
        } else if (local < actor.runT + actor.diveT) {
          // dive onto the slot: parabola + tumble
          const p = (local - actor.runT) / actor.diveT
          const fromX = actor.slotX + actor.side * 34
          const x = fromX + (actor.slotX - fromX) * p
          const y = ground - Math.sin(p * Math.PI) * 16 - (ground - actor.slotY) * p
          drawSprite(ctx, RUN_A, x, y, CELL, actor.color, {
            rot: actor.lieRot * easeOut(p) * (actor.side > 0 ? 1 : -1) * Math.sign(actor.lieRot || 1),
          })
        } else {
          // settled: damped impact wobble, then occasional squirm
          const settled = local - actor.runT - actor.diveT
          const wobble = live ? Math.sin(settled * 18) * 0.2 * Math.exp(-settled * 3) : 0
          const squirmPhase = live ? Math.sin(t * 1.7 + i * 2.4) : 0
          const squirm = squirmPhase > 0.93 ? Math.sin(t * 30) * 0.08 : 0
          drawSprite(ctx, squirmPhase > 0.965 ? RUN_B : RUN_A, actor.slotX, actor.slotY, CELL, actor.color, {
            rot: actor.lieRot + wobble + squirm,
          })
        }
      })

      // ---- the champion ----
      const champColor = champRef.current ?? GOLD
      const champLocal = t - champSpawn
      if (champLocal >= 0) {
        const runDur = 0.55
        if (champLocal < runDur) {
          const p = easeOut(champLocal / runDur)
          const x = width + 20 + (climbPath[0].x - (width + 20)) * p
          const grid = Math.floor(champLocal * 10) % 2 ? RUN_A : RUN_B
          drawSprite(ctx, grid, x, ground, CELL, champColor, { flip: true })
        } else {
          const climbLocal = champLocal - runDur
          const hop = Math.min(Math.floor(climbLocal / hopT), climbPath.length - 1)
          if (hop < climbPath.length - 1) {
            const p = clamp01((climbLocal - hop * hopT) / hopT)
            const from = climbPath[hop]
            const to = climbPath[hop + 1]
            const x = from.x + (to.x - from.x) * p
            const y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 14
            drawSprite(ctx, CLIMB, x, y, CELL, champColor, { flip: true })
          } else {
            // summit: sway, hoist, shine
            const sway = live ? Math.sin(t * 1.4) * 0.05 : 0
            drawSprite(ctx, VICTORY, summit.x, summit.y, CELL, champColor, { rot: sway })
            const hoist = clamp01((t - trophyT) / 0.25)
            if (hoist > 0) {
              const pop = 1 + Math.sin(clamp01((t - trophyT) / 0.35) * Math.PI) * 0.25
              ctx.save()
              ctx.translate(summit.x + sway * 20, summit.y - 9 * CELL - 6 - hoist * 6)
              ctx.scale(pop, pop)
              drawSprite(ctx, TROPHY, 0, 0, CELL, GOLD)
              ctx.restore()
              // glint: a sweeping sparkle every couple of seconds
              const glint = (t * 0.55) % 1
              if (live && glint < 0.12) {
                ctx.fillStyle = GLINT
                const gx = summit.x - 8 + glint * 130
                ctx.fillRect(gx, summit.y - 9 * CELL - 16, CELL, CELL)
              }
            }
          }
        }
      }

      // ---- trophy moment: flash ring + confetti ----
      const boom = t - trophyT
      if (boom > 0 && boom < 0.5) {
        const p = boom / 0.5
        ctx.strokeStyle = `rgba(255,216,77,${(1 - p) * 0.8})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(summit.x, summit.y - bodyH, 10 + p * 90, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (boom > 0) {
        for (const particle of confetti) {
          const life = boom - particle.delay
          if (life < 0 || life > 1.6) continue
          const px = summit.x + particle.vx * life
          const py = summit.y - bodyH - 10 + particle.vy * life + 90 * life * life
          ctx.fillStyle = particle.color
          ctx.globalAlpha = clamp01(1.6 - life)
          ctx.fillRect(px, py, 3, 3)
        }
        ctx.globalAlpha = 1
      }
    }

    if (still) {
      paint(start, false)
      return
    }

    const step = (now: number) => {
      paint(now, true)
      frame = requestAnimationFrame(step)
    }
    // Frames are only spent while someone could see them: off-screen (the
    // Ledger scrolled past the strip) or in a background tab, the loop rests.
    const sync = () => {
      const should = onScreen && !document.hidden
      if (should && !running) {
        running = true
        frame = requestAnimationFrame(step)
      } else if (!should && running) {
        running = false
        cancelAnimationFrame(frame)
      }
    }
    const observer =
      mode === 'idle' && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting
            sync()
          })
        : null
    observer?.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      running = false
      cancelAnimationFrame(frame)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [mode, width, height, rowsKey])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width, height, imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}

/** Boot needs to know when to close: total choreography length in seconds. */
export const HEAP_BOOT_SECONDS = 5.4
