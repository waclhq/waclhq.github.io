import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { animationsDisabled } from '../lib/motion'

/*
  Chart palette, on tokens so it follows the slate:
    single series  → the signature blue
    two series     → blue for the manager's own points, red for the points
                     scored against them; the pair was validated for
                     lightness band, chroma floor and CVD separation
  Grid and axes stay recessive but legible (ink-soft is 7:1 on the panel);
  every chart on this site sits beside the table that holds the same
  numbers, so the data is never colour-only. SVG presentation attributes
  accept var(), which is what keeps the palette swappable.
*/
export const SERIES = 'var(--color-arc-blue)'
export const SERIES_ALT = 'var(--color-arc-red)'

const AXIS = 'var(--color-arc-ink-soft)'
const GRID = 'color-mix(in srgb, var(--color-arc-line) 70%, transparent)'
const DOT_RING = 'var(--color-arc-panel)'

const axisProps = {
  stroke: GRID,
  tickLine: false,
  axisLine: { stroke: GRID },
  tick: { fill: AXIS, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
} as const

/** Snap the axis to round numbers so ticks read 80/100/120, not 74.94/136.67. */
const roundedDomain: [(min: number) => number, (max: number) => number] = [
  (min) => Math.floor((min - 5) / 10) * 10,
  (max) => Math.ceil((max + 5) / 10) * 10,
]

export function TooltipBox({
  active,
  payload,
  label,
  format,
  suffix,
}: {
  active?: boolean
  payload?: { value: number | null; name?: string; color?: string }[]
  label?: string | number
  format: (value: number) => string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="border border-arc-line bg-arc-bg px-3 py-2 [box-shadow:var(--shadow-hard-sm)]">
      <div className="label">{label}</div>
      {payload.map((entry, index) =>
        entry.value === null ? null : (
          <div key={index} className="mt-1 flex items-center gap-2">
            {payload.length > 1 && (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0"
                style={{ background: entry.color }}
              />
            )}
            <span className="tnum text-[14px] text-arc-ink">
              {format(entry.value)}
              {suffix}
            </span>
            {payload.length > 1 && entry.name && (
              <span className="text-[11px] text-arc-ink-faint">{entry.name}</span>
            )}
          </div>
        ),
      )}
    </div>
  )
}

/** Rolling win percentage over time. One series, with the .500 line for reference. */
export function WinPctChart({
  data,
  height = 220,
}: {
  data: { year: number; value: number | null }[]
  height?: number
}) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis
            {...axisProps}
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(value: number) => `${Math.round(value * 100)}`}
            width={44}
          />
          {/* The coin-flip line, labelled inside the plot so the label survives
              the right margin on a phone. */}
          <ReferenceLine
            y={0.5}
            stroke={AXIS}
            strokeDasharray="3 4"
            label={{
              value: '.500',
              fill: AXIS,
              fontSize: 10,
              fontFamily: 'IBM Plex Mono, monospace',
              position: 'insideTopRight',
              dy: -4,
            }}
          />
          <Tooltip
            cursor={{ stroke: SERIES, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<TooltipBox format={(value) => `${(value * 100).toFixed(1)}%`} />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={SERIES}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: SERIES, stroke: DOT_RING, strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={900}
            isAnimationActive={!animationsDisabled()}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** League-wide scoring average per season — era context for every other number. */
export function ScoringChart({
  data,
  height = 220,
}: {
  data: { year: number; avg: number }[]
  height?: number
}) {
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="scoringFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis
            {...axisProps}
            domain={roundedDomain}
            tickCount={6}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: SERIES, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<TooltipBox format={(value) => value.toFixed(1)} suffix=" pts/gm" />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Area
            type="monotone"
            dataKey="avg"
            stroke={SERIES}
            strokeWidth={2}
            fill="url(#scoringFill)"
            activeDot={{ r: 4, fill: SERIES, stroke: DOT_RING, strokeWidth: 2 }}
            animationDuration={1000}
            isAnimationActive={!animationsDisabled()}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Points for vs. points against across a career. Two series, so it gets a legend. */
export function ForAgainstChart({
  data,
  height = 240,
}: {
  data: { year: number; for: number | null; against: number | null }[]
  height?: number
}) {
  return (
    <div className="chart-frame">
      <div className="mb-2 flex flex-wrap gap-4 px-1">
        {[
          { label: 'Points for', color: SERIES },
          { label: 'Points against', color: SERIES_ALT },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-2 text-[11px] text-arc-ink-soft">
            <span aria-hidden className="h-2 w-4" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis
            {...axisProps}
            domain={roundedDomain}
            tickCount={6}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: SERIES, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<TooltipBox format={(value) => value.toFixed(1)} suffix=" pts/gm" />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Line
            type="monotone"
            dataKey="for"
            name="Points for"
            stroke={SERIES}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: SERIES, stroke: DOT_RING, strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={900}
            isAnimationActive={!animationsDisabled()}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="against"
            name="Points against"
            stroke={SERIES_ALT}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: SERIES_ALT, stroke: DOT_RING, strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={900}
            isAnimationActive={!animationsDisabled()}
            animationBegin={160}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
