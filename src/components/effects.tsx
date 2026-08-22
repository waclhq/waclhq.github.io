/**
 * Football flourishes. CSS/SVG only — no animation libraries. Ambient effects
 * are disabled under prefers-reduced-motion by the rules in index.css (unless
 * the FX switch overrides); action-triggered moments are gated in JS where
 * they fire.
 */

import { useEffect } from 'react'
import HeapScene from './HeapScene'

/**
 * Pixel-art football on a 24-grid — enough rows for the pointed-ellipse
 * silhouette to actually read as a football. Rects only: curves under
 * crispEdges render as a ragged blob.
 */
export function Football({ size = 18, className = '' }: { size?: number; className?: string }) {
  // [y, x, width] rows
  const outline: [number, number, number][] = [
    [6, 9, 6], [7, 7, 10], [8, 5, 14], [9, 4, 16], [10, 3, 18], [11, 2, 20],
    [12, 2, 20], [13, 3, 18], [14, 4, 16], [15, 5, 14], [16, 7, 10], [17, 9, 6],
  ]
  const body: [number, number, number, string][] = [
    [7, 8, 8, '#a9714b'],
    [8, 6, 12, '#c98d5f'],
    [9, 5, 14, '#c98d5f'],
    [10, 4, 16, '#a9714b'],
    [11, 3, 18, '#a9714b'],
    [12, 3, 18, '#a9714b'],
    [13, 4, 16, '#a9714b'],
    [14, 5, 14, '#7d4e2e'],
    [15, 6, 12, '#7d4e2e'],
    [16, 8, 8, '#7d4e2e'],
  ]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {outline.map(([y, x, w]) => (
        <rect key={`o${y}`} x={x} y={y} width={w} height={1} fill="#2b1a10" />
      ))}
      {body.map(([y, x, w, fill]) => (
        <rect key={`b${y}`} x={x} y={y} width={w} height={1} fill={fill} />
      ))}
      {/* tip stripes */}
      <rect x="5" y="9" width="1" height="6" fill="#f4efe2" />
      <rect x="18" y="9" width="1" height="6" fill="#f4efe2" />
      {/* lace with cross-stitches */}
      <rect x="8" y="11" width="8" height="1" fill="#f4efe2" />
      <rect x="9" y="10" width="1" height="3" fill="#f4efe2" />
      <rect x="11" y="10" width="1" height="3" fill="#f4efe2" />
      <rect x="13" y="10" width="1" height="3" fill="#f4efe2" />
      <rect x="15" y="10" width="1" height="3" fill="#f4efe2" />
    </svg>
  )
}

/**
 * Confetti burst. Deterministic offsets so it never re-renders differently,
 * and only a dozen nodes so it stays cheap.
 */
export function Confetti({ count = 14 }: { count?: number }) {
  const colors = [
    'var(--color-arc-cyan)',
    'var(--color-arc-yellow)',
    'var(--color-arc-pink)',
    'var(--color-arc-lime)',
    'var(--color-arc-orange)',
    'var(--color-arc-purple)',
  ]
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }, (_, index) => {
        // Golden-ratio spacing spreads the pieces without random().
        const left = ((index * 61.8) % 100).toFixed(1)
        const delay = ((index * 137) % 1800) / 1000
        const drift = index % 2 === 0 ? '6px' : '-8px'
        return (
          <span
            key={index}
            className="confetti"
            style={{
              left: `${left}%`,
              background: colors[index % colors.length],
              animationDelay: `${delay}s`,
              ['--drift' as string]: drift,
            }}
          />
        )
      })}
    </span>
  )
}

/** Slowly scrolling yard lines, for use behind a hero figure. */
export function FieldStripes() {
  return <span className="field-stripes" aria-hidden />
}

/**
 * A field-goal attempt across the container. A parabola is linear X plus
 * quadratic Y, so travel and height animate on separate nested elements —
 * the X leg runs linear while the Y leg decelerates up and accelerates
 * down. Innermost, the ball tumbles end over end.
 */
export function SpiralingBall({ size = 26 }: { size?: number }) {
  return (
    <span className="punt-x" aria-hidden>
      <span className="punt-y inline-block">
        <span className="punt-rot inline-block">
          <Football size={size} />
        </span>
      </span>
    </span>
  )
}


/** Pixel goalposts. Yellow, like every stadium since forever. */
export function Goalpost({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
      shapeRendering="crispEdges"
    >
      <rect x="7" y="9" width="2" height="7" fill="#ffd84d" />
      <rect x="2" y="8" width="12" height="2" fill="#ffd84d" />
      <rect x="2" y="1" width="2" height="7" fill="#ffd84d" />
      <rect x="12" y="1" width="2" height="7" fill="#ffd84d" />
      <rect x="6" y="15" width="4" height="1" fill="#c98d5f" />
    </svg>
  )
}

/**
 * Two-frame touchdown dance. The jersey is currentColor, so the reigning
 * champion dances in their own team colour.
 */
export function PixelPlayer({ size = 26, color }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ color }}
      aria-hidden
      shapeRendering="crispEdges"
    >
      {/* frame A — arms straight up, the touchdown signal */}
      <g className="sprite-a">
        <rect x="6" y="0" width="4" height="3" fill="#efeafb" />
        <rect x="7" y="2" width="2" height="1" fill="#221a3a" />
        <rect x="5" y="4" width="6" height="4" fill="currentColor" />
        <rect x="3" y="0" width="2" height="4" fill="currentColor" />
        <rect x="11" y="0" width="2" height="4" fill="currentColor" />
        <rect x="6" y="8" width="4" height="3" fill="#221a3a" />
        <rect x="5" y="11" width="2" height="4" fill="#efeafb" />
        <rect x="9" y="11" width="2" height="4" fill="#efeafb" />
      </g>
      {/* frame B — arms wide, legs split */}
      <g className="sprite-b">
        <rect x="6" y="1" width="4" height="3" fill="#efeafb" />
        <rect x="7" y="3" width="2" height="1" fill="#221a3a" />
        <rect x="5" y="5" width="6" height="4" fill="currentColor" />
        <rect x="1" y="4" width="4" height="2" fill="currentColor" />
        <rect x="11" y="4" width="4" height="2" fill="currentColor" />
        <rect x="6" y="9" width="4" height="2" fill="#221a3a" />
        <rect x="3" y="11" width="2" height="4" fill="#efeafb" />
        <rect x="11" y="11" width="2" height="4" fill="#efeafb" />
      </g>
    </svg>
  )
}

/** Broadcast replay wipe, fired on route changes. Plays once per mount. */
export function ReplayWipe() {
  return <span className="wipe-stripes" aria-hidden />
}

export type MomentKind = 'td' | 'flag' | 'review'

const MOMENT: Record<MomentKind, { text: string; sub: string; color: string }> = {
  td: { text: 'TOUCHDOWN!', sub: 'trade approved', color: 'var(--color-arc-green)' },
  flag: { text: 'FLAG ON THE PLAY', sub: 'trade rejected', color: 'var(--color-arc-yellow)' },
  review: { text: 'UNDER REVIEW', sub: '24-hour market check opened', color: 'var(--color-arc-cyan)' },
}

/**
 * Full-screen ruling moment. Fires only from a commissioner action, never
 * ambiently, and only when animations are enabled — the caller gates it.
 */
export function PlayMoment({ kind, onDone }: { kind: MomentKind; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2100)
    return () => clearTimeout(timer)
  }, [onDone])

  const m = MOMENT[kind]
  return (
    <div
      className="moment pointer-events-none fixed inset-0 z-[95] flex items-center justify-center"
      role="status"
      aria-label={`${m.text} — ${m.sub}`}
    >
      {kind === 'td' && <Confetti count={24} />}
      {kind === 'flag' && (
        <span className="flag-drop absolute left-1/2 top-0" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 16 16" shapeRendering="crispEdges">
            <rect x="2" y="2" width="12" height="12" fill="#ffd84d" />
            <rect x="6" y="6" width="4" height="4" fill="#c9a227" />
          </svg>
        </span>
      )}
      {kind === 'review' && <span className="wipe-stripes opacity-30" aria-hidden />}
      <div className="text-center">
        <div
          className="arcade slam text-[clamp(22px,7vw,52px)]"
          style={{ color: m.color, textShadow: '3px 3px 0 #04030a, 0 0 34px ' + m.color }}
        >
          {m.text}
        </div>
        <div
          className="arcade slam mt-3 text-[13px] text-arc-ink-soft"
          style={{ animationDelay: '0.18s' }}
        >
          {m.sub}
        </div>
      </div>
    </div>
  )
}


/**
 * The kick gets its own stage — a strip of field with goalposts at full
 * brightness and a clear flight lane, instead of being smeared over text.
 */
export function FieldGoalStrip({ championColor }: { championColor?: string }) {
  return (
    <div className="relative mt-5 h-28 overflow-hidden" aria-hidden>
      <span className="boot-field absolute inset-x-0 bottom-0 h-9" />
      <span className="absolute right-2 bottom-1">
        <Goalpost size={72} />
      </span>
      {/* the reigning champ holds the heap while the kick sails overhead */}
      <span className="absolute bottom-0 left-2">
        <HeapScene mode="idle" championColor={championColor} width={180} height={106} />
      </span>
      <SpiralingBall size={40} />
    </div>
  )
}


/** Twinkling stars over a wordmark. Deterministic spread, staggered phases. */
export function Sparkles({ count = 8 }: { count?: number }) {
  const glyphs = ['✦', '✧', '+']
  const colors = ['var(--color-arc-yellow)', 'var(--color-arc-cyan)', '#fffbe8']
  return (
    <span className="pointer-events-none absolute -inset-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="sparkle"
          style={{
            left: `${(i * 61.8 + 8) % 104}%`,
            top: `${(i * 37.7 + 6) % 92}%`,
            fontSize: `${9 + ((i * 5) % 9)}px`,
            color: colors[i % colors.length],
            animationDelay: `${((i * 431) % 1900) / 1000}s`,
          }}
        >
          {glyphs[i % glyphs.length]}
        </span>
      ))}
    </span>
  )
}
