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
  Chart palette for the ink surface (#0F1512):
    single series  → arcade blue, contrast 3:1+ against the dark panel
    two series     → #5478E8 + #E85447, validated against the #171128 panel for
                     the lightness band, chroma floor, CVD separation, and the
                     normal-vision floor
  Grid and axes stay recessive; every chart on this site sits beside the table
  that holds the same numbers, so the data is never color-only.
*/
export const GOLD = '#5A83FF'
export const GOLD_MARK = '#5478E8'
export const PERIWINKLE = '#E85447'

const AXIS = '#6b6089'
const GRID = 'rgba(239, 234, 251, 0.09)'

const axisProps = {
  stroke: AXIS,
  tickLine: false,
  axisLine: { stroke: GRID },
  tick: { fill: AXIS, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
} as const

/** Snap the axis to round numbers so ticks read 80/100/120, not 74.94/136.67. */
const roundedDomain: [(min: number) => number, (max: number) => number] = [
  (min) => Math.floor((min - 5) / 10) * 10,
  (max) => Math.ceil((max + 5) / 10) * 10,
]

function TooltipBox({
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
    <div className="border border-arc-line bg-arc-bg px-3 py-2 shadow-lg">
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
        <ReferenceLine
          y={0.5}
          stroke={AXIS}
          strokeDasharray="3 4"
          label={{ value: '.500', fill: AXIS, fontSize: 10, position: 'right' }}
        />
        <Tooltip
          cursor={{ stroke: GOLD, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={
            <TooltipBox format={(value) => `${(value * 100).toFixed(1)}%`} />
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={GOLD}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: GOLD, stroke: '#171128', strokeWidth: 2 }}
          connectNulls={false}
          animationDuration={900}
          isAnimationActive={!animationsDisabled()}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
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
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="scoringFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
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
          cursor={{ stroke: GOLD, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={<TooltipBox format={(value) => value.toFixed(1)} suffix=" pts/gm" />}
        />
        <Area
          type="monotone"
          dataKey="avg"
          stroke={GOLD}
          strokeWidth={2}
          fill="url(#scoringFill)"
          activeDot={{ r: 4, fill: GOLD, stroke: '#171128', strokeWidth: 2 }}
          animationDuration={1000}
          isAnimationActive={!animationsDisabled()}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
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
    <div>
      <div className="mb-2 flex flex-wrap gap-4 px-1">
        {[
          { label: 'Points for', color: GOLD_MARK },
          { label: 'Points against', color: PERIWINKLE },
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
            cursor={{ stroke: GOLD, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<TooltipBox format={(value) => value.toFixed(1)} suffix=" pts/gm" />}
          />
          <Line
            type="monotone"
            dataKey="for"
            name="Points for"
            stroke={GOLD_MARK}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: GOLD_MARK, stroke: '#171128', strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={900}
          isAnimationActive={!animationsDisabled()}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="against"
            name="Points against"
            stroke={PERIWINKLE}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: PERIWINKLE, stroke: '#171128', strokeWidth: 2 }}
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
