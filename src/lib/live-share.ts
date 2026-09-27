/*
 * Share cards for the group chat: a 1080×1350 image drawn on a canvas in the
 * site's own palette and faces, then handed to the phone's share sheet (or
 * downloaded where there is none). Colours come from the theme tokens on
 * :root at draw time, so a palette change carries through.
 */

export interface CardSide {
  label: string
  sub?: string
  value: string
  color: string
}

export interface CardSpec {
  /** Small caps line at the top, e.g. "WEEK 3 · BENCH OF SHAME". */
  eyebrow: string
  /** The headline, display face. */
  title: string
  /** One big number or phrase, leaning. */
  big?: string
  bigColor?: string
  /** A sentence under it, in the Lab's voice. */
  sub?: string
  /** Two-sided scoreboard instead of a single big number. */
  sides?: [CardSide, CardSide]
  /** A win-odds bar under the sides: share for the left side, 0..1. */
  odds?: number
  /** Up to five supporting lines. */
  lines?: string[]
  accent?: string
  file: string
}

const W = 1080
const H = 1350

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Resolve var(--x) strings (manager colours arrive that way) to real colours. */
function resolve(color: string | undefined, fallback: string): string {
  if (!color) return fallback
  const m = color.match(/var\((--[a-z0-9-]+)\)/i)
  return m ? token(m[1], fallback) : color
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function fit(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number, maxWidth: number): number {
  let px = start
  ctx.font = font(px)
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 4
    ctx.font = font(px)
  }
  return px
}

export async function renderCard(spec: CardSpec): Promise<Blob> {
  await Promise.all([
    document.fonts.load('italic 700 120px "Barlow Condensed"'),
    document.fonts.load('600 40px "Inter"'),
    document.fonts.load('400 40px "Inter"'),
  ]).catch(() => undefined)

  const bg = token('--color-arc-bg-deep', 'black')
  const panel = token('--color-arc-panel', bg)
  const ink = token('--color-arc-ink', 'white')
  const soft = token('--color-arc-ink-soft', ink)
  const faint = token('--color-arc-ink-faint', soft)
  const line = token('--color-arc-line', faint)
  const green = token('--color-arc-green', ink)
  const accent = resolve(spec.accent, green)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Ground: the room's graphite with a dot matrix and two corner glows.
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'transparent')
    ctx.globalAlpha = 0.22
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }
  glow(0, 0, 700, accent)
  glow(W, H, 800, resolve(spec.sides?.[1]?.color, token('--color-arc-purple', accent)))
  ctx.fillStyle = line
  ctx.globalAlpha = 0.35
  for (let y = 24; y < H; y += 36) for (let x = 24; x < W; x += 36) ctx.fillRect(x, y, 2, 2)
  ctx.globalAlpha = 1

  // Card panel.
  const pad = 70
  ctx.fillStyle = panel
  ctx.globalAlpha = 0.92
  ctx.beginPath()
  ctx.roundRect(pad - 20, 150, W - (pad - 20) * 2, H - 300, 36)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.stroke()

  // Masthead.
  ctx.fillStyle = accent
  ctx.font = 'italic 700 46px "Barlow Condensed", sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('WACL LEAGUE HQ · LIVE', pad, 105)

  let y = 240
  ctx.fillStyle = soft
  ctx.font = '600 30px "Inter", sans-serif'
  ctx.fillText(spec.eyebrow.toUpperCase(), pad + 10, y)
  y += 30

  ctx.fillStyle = ink
  const titleFont = (px: number) => `italic 700 ${px}px "Barlow Condensed", sans-serif`
  ctx.font = titleFont(96)
  for (const row of wrap(ctx, spec.title.toUpperCase(), W - pad * 2 - 20).slice(0, 3)) {
    y += 96
    ctx.fillText(row, pad + 10, y)
  }
  y += 30

  if (spec.sides) {
    const colW = (W - pad * 2 - 40) / 2
    spec.sides.forEach((side, i) => {
      const x = pad + 10 + i * (colW + 20)
      const c = resolve(side.color, ink)
      ctx.fillStyle = c
      ctx.fillRect(x, y + 20, 8, 250)
      ctx.fillStyle = ink
      const px = fit(ctx, side.label, (p) => `600 ${p}px "Inter", sans-serif`, 44, colW - 30)
      ctx.font = `600 ${px}px "Inter", sans-serif`
      ctx.fillText(side.label, x + 26, y + 70)
      if (side.sub) {
        ctx.fillStyle = faint
        ctx.font = '400 30px "Inter", sans-serif'
        ctx.fillText(side.sub, x + 26, y + 112)
      }
      ctx.fillStyle = c
      ctx.font = 'italic 700 150px "Barlow Condensed", sans-serif'
      ctx.fillText(side.value, x + 22, y + 255)
    })
    y += 300
    if (typeof spec.odds === 'number') {
      const barX = pad + 10
      const barW = W - pad * 2 - 20
      ctx.fillStyle = resolve(spec.sides[1].color, faint)
      ctx.beginPath()
      ctx.roundRect(barX, y, barW, 26, 13)
      ctx.fill()
      ctx.fillStyle = resolve(spec.sides[0].color, ink)
      ctx.beginPath()
      ctx.roundRect(barX, y, Math.max(26, barW * spec.odds), 26, 13)
      ctx.fill()
      ctx.fillStyle = soft
      ctx.font = '600 30px "Inter", sans-serif'
      ctx.fillText(`${Math.round(spec.odds * 100)}%`, barX, y + 70)
      ctx.textAlign = 'right'
      ctx.fillText(`${100 - Math.round(spec.odds * 100)}%`, barX + barW, y + 70)
      ctx.textAlign = 'left'
      y += 110
    }
  } else if (spec.big) {
    ctx.fillStyle = resolve(spec.bigColor, accent)
    const px = fit(ctx, spec.big, (p) => `italic 700 ${p}px "Barlow Condensed", sans-serif`, 260, W - pad * 2 - 20)
    y += px * 0.95
    ctx.fillText(spec.big, pad + 4, y)
    y += 40
  }

  if (spec.sub) {
    ctx.fillStyle = ink
    ctx.font = '400 40px "Inter", sans-serif'
    for (const row of wrap(ctx, spec.sub, W - pad * 2 - 20).slice(0, 4)) {
      y += 54
      ctx.fillText(row, pad + 10, y)
    }
    y += 20
  }

  if (spec.lines?.length) {
    ctx.font = '400 32px "Inter", sans-serif'
    for (const row of spec.lines.slice(0, 6)) {
      y += 50
      if (y > H - 190) break
      ctx.fillStyle = soft
      ctx.fillText(row, pad + 10, y)
    }
  }

  // Footer.
  ctx.fillStyle = faint
  ctx.font = '600 28px "Inter", sans-serif'
  ctx.fillText('waclhq.github.io  ·  Live', pad, H - 80)
  ctx.textAlign = 'right'
  ctx.fillText('Scored from ESPN · Yahoo is official', W - pad, H - 80)
  ctx.textAlign = 'left'

  return new Promise((ok, fail) => canvas.toBlob((blob) => (blob ? ok(blob) : fail(new Error('Could not draw the card'))), 'image/png'))
}

/** The share sheet with the image attached where the device can; a download everywhere else. */
export async function shareCard(spec: CardSpec, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderCard(spec)
  const file = new File([blob], `${spec.file}.png`, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'WACL Live' })
      return 'shared'
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}
