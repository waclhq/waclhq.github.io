/**
 * A championship pennant in the manager's colour, the year stitched on it.
 * Hoists on entrance (one-shot, transform only); hangs still under reduced
 * motion.
 */
export function Pennant({ year, color, index = 0 }: { year: number; color: string; index?: number }) {
  return (
    <span
      className="pf-pennant"
      style={{ ['--c' as string]: color, ['--i' as string]: index }}
      title={`${year} champion`}
    >
      <svg viewBox="0 0 64 30" width="64" height="30" aria-hidden focusable="false">
        <path d="M1 1h62L46 15l17 14H1z" fill={color} />
        <path
          d="M1 1h62L46 15l17 14H1z"
          fill="none"
          stroke="color-mix(in srgb, var(--color-arc-bg-deep) 55%, transparent)"
          strokeWidth="1.5"
        />
        <rect
          x="1"
          y="1"
          width="3"
          height="28"
          fill="color-mix(in srgb, var(--color-arc-bg-deep) 45%, transparent)"
        />
        <text
          x="24"
          y="20"
          textAnchor="middle"
          fontFamily="Barlow Condensed, Inter, sans-serif"
          fontWeight="800"
          fontStyle="italic"
          fontSize="15"
          fill="var(--color-arc-bg-deep)"
        >
          {year}
        </text>
      </svg>
      <span className="sr-only">{year} champion</span>
    </span>
  )
}
