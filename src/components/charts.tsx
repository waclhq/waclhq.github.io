import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { animationsDisabled } from '../lib/motion'

/*
 * The site's charts, drawn by hand in SVG.
 *
 * They used to come from Recharts, which cost every room with a chart a
 * 340KB chunk and close to half a second of main-thread time on a phone —
 * for line charts. What is actually needed is small: an x axis of seasons, a
 * y axis of numbers, horizontal grid, two-pixel lines with a monotone curve,
 * an optional area fill, reference lines, and a crosshair with a tooltip.
 * That is what this is, on the slate's own tokens, honouring the same rules
 * as the rest of the room: one axis, recessive grid, text in ink tokens, a
 * legend whenever there are two series, and an entrance that is a clip
 * reveal — never a layout property, absent under reduced motion.
 */

export const SERIES = 'var(--color-arc-blue)'
const AXIS = 'var(--color-arc-ink-soft)'
const GRID = 'color-mix(in srgb, var(--color-arc-line) 70%, transparent)'
const RING = 'var(--color-arc-panel)'
const MONO = 'IBM Plex Mono, ui-monospace, monospace'

export interface Series {
  key: string
  /** One value per x position; null breaks the line unless connectNulls. */
  values: (number | null)[]
  color: string
  width?: number
  dash?: string
  opacity?: number
  connectNulls?: boolean
  /** Fills under the line, fading to nothing. */
  area?: boolean
}

export interface RefLine {
  y: number
  label?: string
  color?: string
}

export interface Mark {
  /** Index into xs. */
  at: number
  label: string
  color: string
  /** Where the label hangs; defaults to the side with more room. */
  side?: 'left' | 'right'
}

export interface PlotProps {
  xs: (number | string)[]
  series: Series[]
  height?: number
  yDomain: [number, number]
  yTicks: number[]
  yFormat?: (value: number) => string
  refLines?: RefLine[]
  marks?: Mark[]
  /** What the tooltip says at an x position; null hides it. */
  tooltip: (index: number) => ReactNode
  /** Colour of the crosshair; defaults to the first series. */
  cursorColor?: string
  /** Room on the right for a reference label. */
  padRight?: number
  className?: string
}

const PAD = { top: 10, right: 12, bottom: 24, left: 44 }

/** Width of the host, live. */
function useWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/**
 * A monotone cubic through the points (Fritsch–Carlson), so the curve never
 * overshoots between seasons the way a Catmull-Rom would. Runs are split on
 * nulls unless the series connects across them.
 */
function pathFor(points: ({ x: number; y: number } | null)[], connect: boolean): string {
  const runs: { x: number; y: number }[][] = []
  let run: { x: number; y: number }[] = []
  for (const point of points) {
    if (point) run.push(point)
    else if (!connect && run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)

  let d = ''
  for (const pts of runs) {
    const n = pts.length
    if (n === 0) continue
    if (n === 1) {
      d += `M${pts[0].x},${pts[0].y}`
      continue
    }
    const dx: number[] = []
    const dy: number[] = []
    const m: number[] = []
    for (let i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1].x - pts[i].x)
      dy.push(pts[i + 1].y - pts[i].y)
      m.push(dy[i] / (dx[i] || 1))
    }
    const t: number[] = [m[0]]
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
    t.push(m[n - 2])
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        t[i] = 0
        t[i + 1] = 0
        continue
      }
      const a = t[i] / m[i]
      const b = t[i + 1] / m[i]
      const s = a * a + b * b
      if (s > 9) {
        const k = 3 / Math.sqrt(s)
        t[i] = k * a * m[i]
        t[i + 1] = k * b * m[i]
      }
    }
    d += `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i]
      d += `C${pts[i].x + h / 3},${pts[i].y + (t[i] * h) / 3},${pts[i + 1].x - h / 3},${pts[i + 1].y - (t[i + 1] * h) / 3},${pts[i + 1].x},${pts[i + 1].y}`
    }
  }
  return d
}

/** Which x labels to print: first, last, and as many between as fit at 40px apart. */
function xTickIndexes(count: number, plotWidth: number): number[] {
  if (count <= 1) return [0]
  const fit = Math.max(2, Math.floor(plotWidth / 40))
  const every = Math.max(1, Math.ceil((count - 1) / (fit - 1)))
  const out: number[] = []
  for (let i = 0; i < count - 1; i += every) if (count - 1 - i >= every / 2) out.push(i)
  out.push(count - 1)
  return out
}

export function Plot({
  xs,
  series,
  height = 220,
  yDomain,
  yTicks,
  yFormat = (value) => String(value),
  refLines = [],
  marks = [],
  tooltip,
  cursorColor,
  padRight = PAD.right,
  className = '',
}: PlotProps) {
  const host = useRef<HTMLDivElement>(null)
  const width = useWidth(host)
  const [active, setActive] = useState<number | null>(null)
  const [still] = useState(() => animationsDisabled())
  const gradientId = useMemo(() => `area-${Math.random().toString(36).slice(2, 8)}`, [])

  const plotW = Math.max(0, width - PAD.left - padRight)
  const plotH = Math.max(0, height - PAD.top - PAD.bottom)
  const n = xs.length
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const [y0, y1] = yDomain
  const y = (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH

  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : { x: x(i), y: y(v) }))
        const line = pathFor(pts, Boolean(s.connectNulls))
        let area = ''
        if (s.area && line) {
          const first = pts.findIndex(Boolean)
          const last = pts.length - 1 - [...pts].reverse().findIndex(Boolean)
          if (first >= 0) area = `${line}L${x(last)},${PAD.top + plotH}L${x(first)},${PAD.top + plotH}Z`
        }
        return { key: s.key, line, area }
      }),
    // width/height changes rebuild the scales, which is what these depend on
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, y0, y1, n],
  )

  // Nearest x to the pointer; the whole plot is the hit target.
  const locate = (event: ReactPointerEvent<SVGRectElement>) => {
    if (n === 0 || plotW <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left
    const i = Math.round((px / rect.width) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  // Tooltip on the side with room, clear of the pointer.
  const tip = active !== null ? tooltip(active) : null
  const tipLeft = active !== null && x(active) > PAD.left + plotW * 0.6
  const ticks = xTickIndexes(n, plotW)

  useEffect(() => {
    if (active !== null && active >= n) setActive(null)
  }, [n, active])

  return (
    <div ref={host} className={`relative w-full select-none ${className}`} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img">
          {series.some((s) => s.area) && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.find((s) => s.area)?.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={series.find((s) => s.area)?.color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}

          {/* grid + y axis */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} stroke={GRID} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.35em" textAnchor="end" fill={AXIS} fontSize={11} fontFamily={MONO}>
                {yFormat(tick)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={GRID} />

          {/* x axis */}
          {ticks.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fill={AXIS} fontSize={11} fontFamily={MONO}>
              {xs[i]}
            </text>
          ))}

          {/* reference lines, labelled inside the plot so a phone keeps the words */}
          {refLines.map((ref, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(ref.y)} y2={y(ref.y)} stroke={ref.color ?? AXIS} strokeDasharray="3 4" />
              {ref.label && (
                <text x={PAD.left + plotW - 2} y={y(ref.y) - 5} textAnchor="end" fill={ref.color ?? AXIS} fontSize={11} fontFamily={MONO}>
                  {ref.label}
                </text>
              )}
            </g>
          ))}

          {/* vertical marks (peak / trough), label on the side with room */}
          {marks.map((mark) => {
            const side = mark.side ?? (mark.at > (n - 1) / 2 ? 'left' : 'right')
            return (
              <g key={`${mark.label}-${mark.at}`}>
                <line x1={x(mark.at)} x2={x(mark.at)} y1={PAD.top} y2={PAD.top + plotH} stroke={mark.color} strokeDasharray="2 4" />
                <text
                  x={x(mark.at) + (side === 'right' ? 6 : -6)}
                  y={PAD.top + 10}
                  textAnchor={side === 'right' ? 'start' : 'end'}
                  fill={mark.color}
                  fontSize={11}
                  fontFamily={MONO}
                >
                  {mark.label}
                </text>
              </g>
            )
          })}

          {/* series */}
          <g className={still ? undefined : 'chart-reveal'}>
            {paths.map((p, i) => {
              const s = series[i]
              return (
                <g key={p.key} opacity={s.opacity ?? 1}>
                  {p.area && <path d={p.area} fill={`url(#${gradientId})`} />}
                  <path
                    d={p.line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width ?? 2}
                    strokeDasharray={s.dash}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )
            })}
          </g>

          {/* crosshair + active dots */}
          {active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={cursorColor ?? series[0]?.color ?? AXIS}
                strokeDasharray="3 3"
              />
              {series.map((s) => {
                const v = s.values[active]
                if (v === null || v === undefined || !Number.isFinite(v) || (s.opacity ?? 1) < 0.5) return null
                return <circle key={s.key} cx={x(active)} cy={y(v)} r={4} fill={s.color} stroke={RING} strokeWidth={2} />
              })}
            </g>
          )}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            style={{ touchAction: 'pan-y' }}
            onPointerMove={locate}
            onPointerDown={locate}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}
      {active !== null && tip && width > 0 && (
        <div
          className="chart-tip pointer-events-none absolute top-2 border border-arc-line bg-arc-bg px-3 py-2 text-[12px] [box-shadow:var(--shadow-hard-sm)]"
          style={tipLeft ? { right: width - x(active) + 12 } : { left: x(active) + 12 }}
        >
          {tip}
        </div>
      )}
    </div>
  )
}

/** Snap a numeric range to round tens with a little air, and ticks about six deep. */
export function roundedScale(values: (number | null | undefined)[], step = 10): { domain: [number, number]; ticks: number[] } {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return { domain: [0, step * 5], ticks: [0, step, step * 2, step * 3, step * 4, step * 5] }
  const lo = Math.floor((Math.min(...nums) - 5) / step) * step
  const hi = Math.ceil((Math.max(...nums) + 5) / step) * step
  const span = hi - lo
  const every = span / step > 7 ? step * Math.ceil(span / step / 6) : step
  const ticks: number[] = []
  for (let t = lo; t <= hi; t += every) ticks.push(t)
  return { domain: [lo, hi], ticks }
}

/** One legend row for two or more series. */
export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 px-1">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2 text-[11px] text-arc-ink-soft">
          <span
            aria-hidden
            className="h-0.5 w-4"
            style={
              item.dash
                ? { backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)` }
                : { background: item.color }
            }
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/** The tooltip's inner rows: a label, then values with their series colour when there are several. */
export function TipRows({
  label,
  rows,
}: {
  label: ReactNode
  rows: { value: string; name?: string; color?: string }[]
}) {
  return (
    <>
      <div className="label">{label}</div>
      {rows.map((row, i) => (
        <div key={i} className="mt-1 flex items-center gap-2">
          {rows.length > 1 && row.color && <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: row.color }} />}
          <span className="tnum text-[14px] text-arc-ink">{row.value}</span>
          {rows.length > 1 && row.name && <span className="text-[11px] text-arc-ink-faint">{row.name}</span>}
        </div>
      ))}
    </>
  )
}

/** League-wide scoring average per season — era context for every other number. */
export function ScoringChart({ data, height = 220 }: { data: { year: number; avg: number }[]; height?: number }) {
  const { domain, ticks } = roundedScale(data.map((d) => d.avg))
  return (
    <div className="chart-frame">
      <Plot
        xs={data.map((d) => d.year)}
        height={height}
        yDomain={domain}
        yTicks={ticks}
        series={[{ key: 'avg', values: data.map((d) => d.avg), color: SERIES, area: true }]}
        tooltip={(i) => <TipRows label={data[i].year} rows={[{ value: `${data[i].avg.toFixed(1)} pts/gm` }]} />}
      />
    </div>
  )
}
