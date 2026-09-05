import { useState } from 'react'
import { achievements } from '../lib/achievements'
import { useLeagueData } from '../lib/data'
import { managerColor, managerInitials } from '../lib/identity'
import { bookCareerTable, eraOptions, managerSeasons } from '../lib/stats'
import type { ManagerId } from '../lib/types'

/**
 * Renders a manager's card to a canvas and downloads it as a PNG — built for
 * the group chat. Painted from the slate tokens read off the document at
 * render time, so the card is always the same room as the site. All drawing
 * is local; nothing leaves the browser.
 */

const TOKEN_FALLBACK: Record<string, string> = {
  '--color-arc-bg': '#0b0e12',
  '--color-arc-bg-deep': '#07090c',
  '--color-arc-panel': '#12161c',
  '--color-arc-raised': '#1a2028',
  '--color-arc-ink': '#eef1f6',
  '--color-arc-ink-soft': '#aeb7c8',
  '--color-arc-ink-faint': '#8b95a7',
  '--color-arc-line': '#27303c',
  '--color-arc-yellow': '#ffb636',
  '--color-arc-green': '#53d337',
  '--color-arc-red': '#ff5252',
}

function readTokens(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const out: Record<string, string> = {}
  for (const name of Object.keys(TOKEN_FALLBACK)) {
    const value = style.getPropertyValue(name).trim()
    out[name] = value || TOKEN_FALLBACK[name]
  }
  return out
}

/** Hex colour with an alpha, for washes and glows. Non-hex passes through. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const done = (ok: boolean) => resolve(ok ? image : null)
    image.onload = () => done(true)
    image.onerror = () => done(false)
    image.src = src
    setTimeout(() => done(image.complete && image.naturalWidth > 0), 2500)
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default function TradingCard({ id }: { id: ManagerId }) {
  const data = useLeagueData()
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const manager = data.managers.find((candidate) => candidate.id === id)
      const line = bookCareerTable(data.seasons, eraOptions(data.seasons)[0], data.careerAverages).find(
        (row) => row.manager === id,
      )
      if (!manager || !line) return
      const t = readTokens()
      const color = managerColor(id)
      const history = managerSeasons(data.seasons, id)
        .slice(0, 14)
        .reverse()
        .map((row) =>
          row.team.wins + row.team.losses ? row.team.wins / (row.team.wins + row.team.losses) : 0,
        )

      const [portrait] = await Promise.all([
        loadImage(`${import.meta.env.BASE_URL}media/portraits/${id}.png`),
        document.fonts.load('italic 800 44px "Barlow Condensed"'),
        document.fonts.load('700 16px "Barlow Condensed"'),
        document.fonts.load('600 22px "Inter"'),
      ]).catch(() => [null])

      const W = 640
      const H = 900
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      const display = (weight: number, size: number, italic = false) =>
        `${italic ? 'italic ' : ''}${weight} ${size}px "Barlow Condensed", "Inter", sans-serif`
      const body = (weight: number, size: number) => `${weight} ${size}px "Inter", system-ui, sans-serif`
      const spaced = (em: string) => {
        if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = em
      }

      // ---- card stock: slate, lit from the top-left in the manager's colour ----
      ctx.fillStyle = t['--color-arc-bg-deep']
      ctx.fillRect(0, 0, W, H)
      const stock = ctx.createLinearGradient(0, 0, 0, H)
      stock.addColorStop(0, t['--color-arc-raised'])
      stock.addColorStop(0.55, t['--color-arc-panel'])
      stock.addColorStop(1, t['--color-arc-bg'])
      ctx.fillStyle = stock
      ctx.fillRect(10, 10, W - 20, H - 20)
      const wash = ctx.createRadialGradient(60, 120, 10, 60, 120, 620)
      wash.addColorStop(0, withAlpha(color, 0.22))
      wash.addColorStop(0.5, withAlpha(color, 0.06))
      wash.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = wash
      ctx.fillRect(10, 10, W - 20, H - 20)
      // foil bands — the commissioner-series sheen
      ctx.save()
      ctx.beginPath()
      ctx.rect(10, 10, W - 20, H - 20)
      ctx.clip()
      for (let i = 0; i < 7; i++) {
        const foil = ctx.createLinearGradient(0, 0, W, H)
        const at = 0.12 + i * 0.12
        foil.addColorStop(Math.max(0, at - 0.03), 'rgba(255,255,255,0)')
        foil.addColorStop(at, `rgba(255,255,255,${i % 2 ? 0.045 : 0.03})`)
        foil.addColorStop(Math.min(1, at + 0.03), 'rgba(255,255,255,0)')
        ctx.fillStyle = foil
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
      // frame
      ctx.strokeStyle = color
      ctx.lineWidth = 12
      ctx.strokeRect(6, 6, W - 12, H - 12)
      ctx.strokeStyle = t['--color-arc-line']
      ctx.lineWidth = 2
      ctx.strokeRect(18, 18, W - 36, H - 36)

      // ---- header band ----
      ctx.fillStyle = color
      ctx.fillRect(20, 20, W - 40, 92)
      ctx.fillStyle = t['--color-arc-bg-deep']
      ctx.font = display(800, 44, true)
      spaced('0.02em')
      ctx.fillText(manager.displayName.toUpperCase(), 44, 74)
      ctx.font = display(700, 15)
      spaced('0.16em')
      ctx.fillText('WACL · EST. 2004', 46, 98)
      ctx.textAlign = 'right'
      ctx.fillText(manager.active ? `${data.league.currentSeason} SEASON` : 'FORMER MANAGER', W - 46, 98)
      ctx.textAlign = 'left'
      spaced('0em')

      // ---- portrait in a lit frame ----
      const size = 196
      const px = W / 2 - size / 2
      const py = 140
      const glow = ctx.createRadialGradient(W / 2, py + size / 2, size * 0.3, W / 2, py + size / 2, size * 0.95)
      glow.addColorStop(0, withAlpha(color, 0.42))
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(px - 120, py - 100, size + 240, size + 200)
      roundedRect(ctx, px, py, size, size, 14)
      ctx.fillStyle = t['--color-arc-bg-deep']
      ctx.fill()
      ctx.save()
      roundedRect(ctx, px, py, size, size, 14)
      ctx.clip()
      if (portrait) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(portrait, px, py, size, size)
      } else {
        ctx.fillStyle = color
        ctx.fillRect(px, py, size, size)
        ctx.fillStyle = t['--color-arc-bg-deep']
        ctx.font = display(800, 82, true)
        ctx.textAlign = 'center'
        ctx.fillText(managerInitials(manager, id), W / 2, py + size / 2 + 30)
        ctx.textAlign = 'left'
      }
      ctx.restore()
      roundedRect(ctx, px, py, size, size, 14)
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.stroke()

      // ---- team name ----
      ctx.fillStyle = t['--color-arc-ink-soft']
      ctx.font = body(600, 20)
      ctx.textAlign = 'center'
      ctx.fillText(manager.team ?? 'Former manager', W / 2, py + size + 44)
      ctx.textAlign = 'left'

      // ---- stat rows: label in the board face, value in Inter, tabular ----
      const bracket = line.playoffWins + line.playoffLosses
      const stats: [string, string, string?][] = [
        ['TITLES', line.titles ? '★'.repeat(line.titles) : '—', line.titles ? t['--color-arc-yellow'] : undefined],
        ['RECORD', `${line.wins}–${line.losses}`],
        ['WIN %', `${(line.winPct * 100).toFixed(1)}%`],
        ['BRACKET', bracket ? `${line.playoffWins}–${line.playoffLosses}` : '—'],
        ['PF / GM', line.avgPointsFor ? line.avgPointsFor.toFixed(1) : '—'],
        ['BEST YEAR', line.bestSeason ? `${line.bestSeason.avg.toFixed(1)} · ${line.bestSeason.year}` : '—'],
      ]
      let y = 448
      for (const [label, value, tone] of stats) {
        ctx.fillStyle = t['--color-arc-ink-faint']
        ctx.font = display(700, 15)
        spaced('0.14em')
        ctx.fillText(label, 60, y)
        spaced('0em')
        ctx.fillStyle = tone ?? t['--color-arc-ink']
        ctx.font = body(600, 22)
        ctx.textAlign = 'right'
        ctx.fillText(value, W - 60, y)
        ctx.textAlign = 'left'
        ctx.strokeStyle = t['--color-arc-line']
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(60, y + 14)
        ctx.lineTo(W - 60, y + 14)
        ctx.stroke()
        y += 44
      }

      // ---- badges, above the form line ----
      const myBadges = (achievements(data).get(id) ?? []).slice(0, 5)
      if (myBadges.length) {
        ctx.font = '26px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif'
        ctx.textAlign = 'center'
        const spread = 54
        myBadges.forEach((badge, i) => {
          const bx = W / 2 + (i - (myBadges.length - 1) / 2) * spread
          ctx.fillText(badge.emoji, bx, y + 22)
        })
        ctx.textAlign = 'left'
      }
      y += 48

      // ---- form: rolling win% by season, with the .500 line ----
      ctx.fillStyle = t['--color-arc-ink-faint']
      ctx.font = display(700, 15)
      spaced('0.14em')
      ctx.fillText('FORM', 60, y + 8)
      ctx.textAlign = 'right'
      ctx.fillText(`LAST ${history.length} SEASONS`, W - 60, y + 8)
      ctx.textAlign = 'left'
      spaced('0em')
      const chartX = 60
      const chartW = W - 120
      const chartY = y + 22
      const chartH = 60
      ctx.strokeStyle = t['--color-arc-ink-faint']
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(chartX, chartY + chartH / 2)
      ctx.lineTo(chartX + chartW, chartY + chartH / 2)
      ctx.stroke()
      ctx.setLineDash([])
      const under = ctx.createLinearGradient(0, chartY, 0, chartY + chartH)
      under.addColorStop(0, withAlpha(color, 0.28))
      under.addColorStop(1, 'rgba(0,0,0,0)')
      const point = (value: number, index: number): [number, number] => [
        chartX + (index / Math.max(history.length - 1, 1)) * chartW,
        chartY + (1 - value) * chartH,
      ]
      if (history.length > 1) {
        ctx.beginPath()
        history.forEach((value, index) => {
          const [x0, y0] = point(value, index)
          if (index === 0) ctx.moveTo(x0, y0)
          else ctx.lineTo(x0, y0)
        })
        ctx.lineTo(chartX + chartW, chartY + chartH)
        ctx.lineTo(chartX, chartY + chartH)
        ctx.closePath()
        ctx.fillStyle = under
        ctx.fill()
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 3.5
      ctx.lineJoin = 'round'
      ctx.beginPath()
      history.forEach((value, index) => {
        const [x0, y0] = point(value, index)
        if (index === 0) ctx.moveTo(x0, y0)
        else ctx.lineTo(x0, y0)
      })
      ctx.stroke()

      // ---- footer ----
      ctx.fillStyle = t['--color-arc-ink-faint']
      ctx.font = display(700, 13)
      spaced('0.18em')
      ctx.textAlign = 'center'
      ctx.fillText('WACL LEAGUE HQ · COMMISSIONER SERIES', W / 2, H - 40)
      ctx.textAlign = 'left'
      spaced('0em')

      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `wacl-card-${id}.png`
            link.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }
          resolve()
        }, 'image/png')
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="btn" disabled={busy} onClick={() => void generate()}>
      {busy ? 'Printing…' : '↓ Trading card'}
    </button>
  )
}
