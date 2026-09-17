import { Legend, Plot, TipRows, roundedScale } from '../charts'

/*
 * The profile's two career charts, on the shared SVG kit and the slate
 * tokens: the manager's own colour carries their line, points against sits
 * in faint ink and dashed so the pair is never told apart by colour alone,
 * and axes read at body-copy contrast.
 */
const AXIS = 'var(--color-arc-ink-soft)'
const AGAINST = 'var(--color-arc-ink-faint)'

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
    <Plot
      xs={data.map((d) => d.year)}
      height={height}
      yDomain={[0, 1]}
      yTicks={[0, 0.25, 0.5, 0.75, 1]}
      yFormat={(v) => `${Math.round(v * 100)}`}
      refLines={[{ y: 0.5, label: '.500', color: AXIS }]}
      series={[{ key: 'form', values: data.map((d) => d.value), color, width: 2.5 }]}
      tooltip={(i) =>
        data[i].value === null ? null : (
          <TipRows label={data[i].year} rows={[{ value: `${((data[i].value ?? 0) * 100).toFixed(1)}%` }]} />
        )
      }
    />
  )
}

/**
 * Points for and against by season. The manager's line is theirs; against
 * is faint and dashed; the peak and trough years from the record book are
 * marked, each label hung on the side with room.
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
  const { domain, ticks } = roundedScale(data.flatMap((d) => [d.for, d.against]))
  const marks = [
    { year: peak, label: 'peak', color: 'var(--color-arc-green)' },
    { year: trough, label: 'trough', color: 'var(--color-arc-red)' },
  ]
    .map((mark) => ({ ...mark, at: data.findIndex((row) => row.year === mark.year) }))
    .filter((mark) => mark.year && mark.at >= 0)
    .map(({ at, label, color: markColor }) => ({ at, label, color: markColor }))
  return (
    <div>
      <Legend
        items={[
          { label: 'Points for', color },
          { label: 'Points against', color: AGAINST, dash: true },
        ]}
      />
      <Plot
        xs={data.map((d) => d.year)}
        height={height}
        yDomain={domain}
        yTicks={ticks}
        marks={marks}
        cursorColor={color}
        series={[
          { key: 'against', values: data.map((d) => d.against), color: AGAINST, width: 1.5, dash: '4 3' },
          { key: 'for', values: data.map((d) => d.for), color, width: 2.5 },
        ]}
        tooltip={(i) => {
          const rows = [
            data[i].for !== null ? { value: `${data[i].for?.toFixed(1)} pts/gm`, name: 'Points for', color } : null,
            data[i].against !== null
              ? { value: `${data[i].against?.toFixed(1)} pts/gm`, name: 'Points against', color: AGAINST }
              : null,
          ].filter((row): row is NonNullable<typeof row> => row !== null)
          return rows.length ? <TipRows label={data[i].year} rows={rows} /> : null
        }}
      />
    </div>
  )
}
