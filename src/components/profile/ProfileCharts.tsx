import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { animationsDisabled } from '../../lib/motion'

/*
 * The profile's two career charts, drawn from the slate tokens. SVG
 * presentation attributes take var() and color-mix(), so the palette here is
 * the same palette as everything else on the page: the manager's own colour
 * carries their line, points against sits in soft ink, and axes read at
 * body-copy contrast rather than the old violet 3:1.
 */
const AXIS = 'var(--color-arc-ink-soft)'
const GRID = 'color-mix(in srgb, var(--color-arc-line) 70%, transparent)'
const AGAINST = 'var(--color-arc-ink-faint)'
const PANEL = 'var(--color-arc-panel)'

const axisProps = {
  stroke: AXIS,
  tickLine: false,
  axisLine: { stroke: GRID },
  tick: { fill: AXIS, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
} as const

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
    <div className="border border-arc-line bg-arc-bg px-3 py-2 [box-shadow:var(--shadow-hard-sm)]">
      <div className="label">{label}</div>
      {payload.map((entry, index) =>
        entry.value === null ? null : (
          <div key={index} className="mt-1 flex items-center gap-2">
            {payload.length > 1 && (
              <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: entry.color }} />
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

/** Rolling win percentage, in the manager's colour, with the .500 line. */
export function FormChart({
  data,
  color,
  height = 220,
}: {
  data: { year: number; value: number | null }[]
  color: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 34, bottom: 0, left: -14 }}>
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
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={<TooltipBox format={(value) => `${(value * 100).toFixed(1)}%`} />}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: PANEL, strokeWidth: 2 }}
          connectNulls={false}
          animationDuration={900}
          isAnimationActive={!animationsDisabled()}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Points for and against by season. The manager's line is theirs; against
 * is soft ink; the peak and trough years from the record book are marked.
 */
export function ScoringChart({
  data,
  color,
  peak,
  trough,
  height = 240,
}: {
  data: { year: number; for: number | null; against: number | null }[]
  color: string
  peak?: number | null
  trough?: number | null
  height?: number
}) {
  const marks = [
    { year: peak, label: 'peak', stroke: 'var(--color-arc-green)' },
    { year: trough, label: 'trough', stroke: 'var(--color-arc-red)' },
  ].filter((mark) => mark.year && data.some((row) => row.year === mark.year))
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 px-1">
        {[
          { label: 'Points for', color },
          { label: 'Points against', color: AGAINST },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-2 text-[11px] text-arc-ink-soft">
            <span aria-hidden className="h-2 w-4" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps} domain={roundedDomain} tickCount={6} allowDecimals={false} width={44} />
          {marks.map((mark) => (
            <ReferenceLine
              key={mark.label}
              x={mark.year as number}
              stroke={mark.stroke}
              strokeDasharray="2 4"
              label={{
                value: mark.label,
                fill: mark.stroke,
                fontSize: 10,
                fontFamily: 'IBM Plex Mono, monospace',
                position: 'insideTopLeft',
              }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<TooltipBox format={(value) => value.toFixed(1)} suffix=" pts/gm" />}
          />
          <Line
            type="monotone"
            dataKey="against"
            name="Points against"
            stroke={AGAINST}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4, fill: AGAINST, stroke: PANEL, strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={900}
            isAnimationActive={!animationsDisabled()}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="for"
            name="Points for"
            stroke={color}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: PANEL, strokeWidth: 2 }}
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
