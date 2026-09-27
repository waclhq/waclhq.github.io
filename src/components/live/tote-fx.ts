import { subscribe } from '../../lib/ticker'

/**
 * The tote board's one-shot effects, drawn outside React: a football that
 * spirals from an NFL game in the strip into a matchup card, and a burst of
 * confetti in the scorer's colour where it lands. Both are fixed-position
 * elements that remove themselves; the confetti draws from the shared clock
 * in lib/ticker and runs about a second. Callers check animationsDisabled().
 */

const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth

/** Fly a football from `from` (a game in the strip, if it's on screen) into `to`, then call `land`. */
export function flyFootball(from: Element | null, to: Element, land: () => void) {
  const target = to.getBoundingClientRect()
  if (!onScreen(target)) return
  const source = from?.getBoundingClientRect()
  const start = source && onScreen(source) ? { x: source.left + source.width / 2, y: source.top + source.height / 2 } : { x: innerWidth / 2, y: -30 }
  const end = { x: target.left + target.width * 0.78, y: target.top + target.height / 2 }
  // The top of the arc: above both ends, pulled toward the middle.
  const peak = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - Math.max(80, Math.abs(end.y - start.y) * 0.35) }

  const ball = document.createElement('div')
  ball.className = 'lv-fly-ball'
  ball.innerHTML =
    '<svg viewBox="0 0 20 12" width="26" height="16" aria-hidden="true"><ellipse cx="10" cy="6" rx="9" ry="5.2"/><path d="M6 6h8M8 4.4v3.2M10 4.4v3.2M12 4.4v3.2"/></svg>'
  document.body.appendChild(ball)
  const at = (p: { x: number; y: number }, turn: number, scale: number) =>
    `translate(${p.x - 13}px, ${p.y - 8}px) rotate(${turn}deg) scale(${scale})`
  const mid = (t: number) => ({
    x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * peak.x + t ** 2 * end.x,
    y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * peak.y + t ** 2 * end.y,
  })
  // A quadratic arc sampled into keyframes; the ball spirals and swells toward you at the top.
  const frames = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
    transform: at(mid(t), -30 + t * 900, 1 + Math.sin(t * Math.PI) * 0.6),
    offset: t,
  }))
  const flight = ball.animate(frames, { duration: 850, easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' })
  flight.onfinish = () => {
    ball.remove()
    land()
  }
  flight.oncancel = () => ball.remove()
}

/** A one-second burst of confetti over `el`, in `color` and white. */
export function confetti(el: Element, color: string) {
  const r = el.getBoundingClientRect()
  if (!onScreen(r)) return
  const pad = 60
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = r.width + pad * 2
  const h = r.height + pad * 2
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.className = 'lv-confetti'
  Object.assign(canvas.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${w}px`, height: `${h}px` })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }
  ctx.scale(dpr, dpr)
  const white = getComputedStyle(document.documentElement).getPropertyValue('--color-arc-ink').trim() || 'white'
  const ox = pad + r.width * 0.78
  const oy = pad + r.height / 2
  const bits = Array.from({ length: 44 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
    const v = 3 + Math.random() * 5
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 3 + Math.random() * 4, spin: Math.random() * 6, c: i % 3 ? color : white }
  })
  let first = 0
  const stop = subscribe((clock) => {
    if (!first) first = clock
    const t = clock - first
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = Math.max(0, 1 - t / 1.1)
    for (const b of bits) {
      b.vy += 0.28
      b.vx *= 0.985
      b.x += b.vx
      b.y += b.vy
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.spin + t * 8)
      ctx.fillStyle = b.c
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
      ctx.restore()
    }
    if (t > 1.1) {
      stop()
      canvas.remove()
    }
  })
}
