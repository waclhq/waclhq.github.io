import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import ManagerTag from '../ManagerTag'
import { Empty, Panel, useFlipList, useRevealed } from '../ui'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import type { ManagerId } from '../../lib/types'

/*
 * The leaderboard, as one anatomy for Records and the Lab.
 *
 * Ten seconds of scanning should say who is king: medals on the top three,
 * the leader's row washed in their own colour, the headline number drawn
 * over a bar so magnitude is seen rather than computed, the top five by
 * default with the full field behind one tap — and, if you have picked your
 * seat and sit outside the fold, your own row pinned under the line.
 *
 * The reveal is one-shot and staggered: as the board enters view a soft
 * light sweeps across the podium, the medals settle under it, the bars fill
 * from zero. Under reduced motion every one of those is simply present.
 */

/** How the bar behind the headline figure is scaled. */
export type BarScale = 'up' | 'down' | 'signed'
/** How the headline figure is coloured. */
export type Tone = 'good' | 'bad' | 'signed' | 'plain'

export interface BoardColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** The board's headline figure: coloured by tone, drawn over a bar. */
  highlight?: boolean
  /** Numeric accessor behind the highlight bar. */
  value?: (row: T) => number
  /**
   * 'up': the highest value gets the longest bar (default).
   * 'down': the lowest does — for boards ranked from the bottom.
   * 'signed': length is magnitude; colour follows the sign.
   */
  bar?: BarScale
  tone?: Tone
  /** Extra classes on both th and td, e.g. `hidden sm:table-cell`. */
  className?: string
  align?: 'left' | 'right'
}

export interface BoardProps<T> {
  id?: string
  title: string
  subtitle?: string
  delay?: number
  action?: ReactNode
  rows: T[]
  columns: BoardColumn<T>[]
  keyOf: (row: T) => string
  /** The manager a row belongs to; drives the badge, the wash and the row link. */
  managerOf?: (row: T) => ManagerId
  /** Custom identity cell (players, seasons); defaults to the manager tag. */
  primary?: (row: T) => ReactNode
  primaryHeader?: ReactNode
  /** Rows shown before the fold; 0 shows everything. */
  fold?: number
  /** Rate boards: rows failing this sort below the qualified field, flagged. */
  qualifies?: (row: T) => boolean
  unqualifiedNote?: (row: T) => ReactNode
  /** Rows outside the current era (single-game books) print faint. */
  muted?: (row: T) => boolean
  /** Optional grouping: rank restarts and a seam row is printed per group. */
  groupOf?: (row: T) => string
  /** Where a row's tap goes; defaults to the manager's page. */
  hrefOf?: (row: T) => string | null
  empty?: ReactNode
  footer?: ReactNode
}

/* ---------------------------------------------------------------- helpers */

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Bars map across the field actually on screen, with a 0.15 floor so the
 * last row still reads as a bar: adjacent ranks then differ by tens of
 * pixels instead of one or two.
 */
export function barRatio(values: number[], value: number, scale: BarScale = 'up'): number {
  if (!values.length) return 0
  if (scale === 'signed') {
    const peak = Math.max(...values.map((v) => Math.abs(v)))
    if (!peak) return 0
    return 0.15 + 0.85 * clamp01(Math.abs(value) / peak)
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  if (span <= 0) return 1
  const t = scale === 'down' ? (max - value) / span : (value - min) / span
  return 0.15 + 0.85 * clamp01(t)
}

const BAR_COLOR = {
  good: 'color-mix(in srgb, var(--color-arc-green) 18%, transparent)',
  bad: 'color-mix(in srgb, var(--color-arc-red) 16%, transparent)',
  plain: 'color-mix(in srgb, var(--color-arc-ink) 9%, transparent)',
}

/**
 * Bar drawn behind a cell's number: right-aligned figures, bar from the
 * right. Width rides background-size, which is animatable — pass ratio 0
 * until the panel is seen and the bar grows in (.barcell in index.css).
 */
export function cellBar(ratio: number, color: string = BAR_COLOR.good): CSSProperties {
  const width = clamp01(ratio) * 100
  return {
    backgroundImage: `linear-gradient(${color}, ${color})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right center',
    backgroundSize: `${width}% 100%`,
  }
}

/** The leader's row is lit by their own colour, not a generic highlight. */
export function leadWash(manager: ManagerId, on = true): CSSProperties {
  const color = managerColor(manager)
  return {
    backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${color} 11%, transparent), transparent 60%)`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${on ? 100 : 0}% 100%`,
    boxShadow: `inset 2px 0 0 ${color}`,
  }
}

/** Medal colours for the top three ranks; the field stays quiet. */
export function RankCell({ index, rank }: { index: number; rank?: number }) {
  const podium = ['pod-1', 'pod-2', 'pod-3'][index]
  return (
    <td className={`n tnum w-8 ${podium ?? 'text-arc-ink-faint'}`}>
      {podium ? (
        <span className="board-medal" style={{ ['--i' as string]: index }}>
          {rank ?? index + 1}
        </span>
      ) : (
        rank ?? index + 1
      )}
    </td>
  )
}

/** Top five by default, the full field behind one tap. */
export function useFold<T>(rows: T[], fold = 5): { all: boolean; shown: T[]; toggle: ReactNode } {
  const [all, setAll] = useState(false)
  const folded = fold > 0 && rows.length > fold && !all
  const shown = folded ? rows.slice(0, fold) : rows
  const toggle =
    fold > 0 && rows.length > fold ? (
      <button
        type="button"
        className="block min-h-[42px] w-full border-t border-arc-line px-4 text-left text-[12px] tracking-[0.08em] text-arc-ink-faint uppercase transition-colors hover:text-arc-green"
        onClick={() => setAll((current) => !current)}
        aria-expanded={all}
      >
        {all ? `× Top ${fold} only` : `+ Full table (${rows.length})`}
      </button>
    ) : null
  return { all, shown, toggle }
}

function toneText(tone: Tone, value: number | null): string {
  if (tone === 'signed') {
    if (value === null || value === 0) return 'text-arc-ink-soft'
    return value > 0 ? 'text-arc-green' : 'text-[var(--color-arc-red)]'
  }
  if (tone === 'good') return 'text-arc-green'
  if (tone === 'bad') return 'text-[var(--color-arc-red)]'
  return 'text-arc-ink'
}

function toneBar(tone: Tone, value: number | null): string {
  if (tone === 'signed') return value !== null && value < 0 ? BAR_COLOR.bad : BAR_COLOR.good
  if (tone === 'bad') return BAR_COLOR.bad
  if (tone === 'plain') return BAR_COLOR.plain
  return BAR_COLOR.good
}

/* ------------------------------------------------------------------ board */

interface Line<T> {
  row: T
  key: string
  /** Position within its group, zero-based — medals and wash key off this. */
  index: number
  group: string | null
  qualified: boolean
  pinned: boolean
}

export function Board<T>({
  id,
  title,
  subtitle,
  delay = 0,
  action,
  rows,
  columns,
  keyOf,
  managerOf,
  primary,
  primaryHeader = 'Manager',
  fold = 5,
  qualifies,
  unqualifiedNote,
  muted,
  groupOf,
  hrefOf,
  empty,
  footer,
}: BoardProps<T>) {
  const me = useMe()
  const navigate = useNavigate()

  // Qualified careers first, without touching any value; the short careers
  // stay on the board, flagged, under the line.
  const ordered = useMemo(() => {
    if (!qualifies) return rows
    return [...rows.filter((row) => qualifies(row)), ...rows.filter((row) => !qualifies(row))]
  }, [rows, qualifies])

  const { all, shown, toggle } = useFold(ordered, fold)

  const lines = useMemo(() => {
    const out: Line<T>[] = []
    const counters = new Map<string | null, number>()
    for (const row of shown) {
      const group = groupOf ? groupOf(row) : null
      const index = counters.get(group) ?? 0
      counters.set(group, index + 1)
      out.push({
        row,
        key: keyOf(row),
        index,
        group,
        qualified: qualifies ? qualifies(row) : true,
        pinned: false,
      })
    }
    // Your seat, pinned under the fold at its true rank.
    if (me && managerOf && !all && shown.length < ordered.length) {
      const at = ordered.findIndex((row) => managerOf(row) === me)
      if (at >= shown.length) {
        const row = ordered[at]
        out.push({
          row,
          key: keyOf(row),
          index: at,
          group: groupOf ? groupOf(row) : null,
          qualified: qualifies ? qualifies(row) : true,
          pinned: true,
        })
      }
    }
    return out
  }, [shown, ordered, all, me, managerOf, keyOf, groupOf, qualifies])

  const barColumn = columns.find((column) => column.highlight && column.value)
  const barValues = useMemo(
    () => (barColumn ? shown.map((row) => barColumn.value!(row)) : []),
    [shown, barColumn],
  )

  // The reveal: lit once the stage is seen; the podium band is measured
  // from the first three rows so the light sweeps exactly the medals.
  const stage = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLTableSectionElement>(null)
  const lit = useRevealed(stage)
  useFlipList(body)
  useLayoutEffect(() => {
    const host = stage.current
    const tbody = body.current
    if (!lit || !host || !tbody) return
    const table = tbody.closest('table')
    const podium = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr[data-flip]')).slice(0, 3)
    if (!table || !podium.length) return
    const first = podium[0]
    const last = podium[podium.length - 1]
    const top = table.offsetTop + first.offsetTop
    const bottom = table.offsetTop + last.offsetTop + last.offsetHeight
    host.style.setProperty('--pod-top', `${top}px`)
    host.style.setProperty('--pod-h', `${bottom - top}px`)
  }, [lit])

  const columnCount = columns.length + 2

  const rowHref = (row: T): string | null => {
    if (hrefOf) return hrefOf(row)
    if (managerOf) return `/managers/${managerOf(row)}`
    return null
  }
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    // The name is the link; the rest of the row is its hit area on a phone.
    if ((event.target as Element).closest('a, button')) return
    const href = rowHref(row)
    if (href) navigate(href)
  }

  if (!rows.length) {
    return (
      <Panel id={id} title={title} subtitle={subtitle} delay={delay} action={action}>
        <Empty>{empty ?? 'Nothing on the board for this era yet.'}</Empty>
      </Panel>
    )
  }

  let lastGroup: string | null | undefined
  return (
    <Panel id={id} title={title} subtitle={subtitle} delay={delay} action={action}>
      <div ref={stage} className="board-stage" data-lit={lit ? '' : undefined}>
        <span className="board-sweep" aria-hidden />
        <table className="out">
          <thead>
            <tr>
              <th className="n">#</th>
              <th>{primaryHeader}</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${column.align === 'left' ? '' : 'n'} ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={body}>
            {lines.map((line) => {
              const { row, index } = line
              const seam = groupOf && line.group !== lastGroup && !line.pinned
              lastGroup = line.group
              const manager = managerOf?.(row)
              const isLead = index === 0 && line.qualified && !line.pinned
              const dim = (muted?.(row) ?? false) || !line.qualified
              const href = rowHref(row)
              const rowClass = [
                isLead ? 'lead board-lead' : '',
                line.pinned ? 'board-you' : '',
                dim ? 'board-dim' : '',
                href ? 'cursor-pointer' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return [
                seam ? (
                  <tr key={`seam-${line.group}`} className="board-seam">
                    <td colSpan={columnCount}>
                      <span className="label">{line.group}</span>
                    </td>
                  </tr>
                ) : null,
                <tr
                  key={line.pinned ? `you-${line.key}` : line.key}
                  data-flip={line.pinned ? undefined : line.key}
                  className={rowClass || undefined}
                  style={isLead && manager ? leadWash(manager, lit) : undefined}
                  onClick={href ? (event) => onRowClick(event, row) : undefined}
                >
                  <RankCell index={line.pinned ? 99 : index} rank={index + 1} />
                  <td className="min-w-0">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                      {primary ? primary(row) : <ManagerTag id={manager} size={22} />}
                      {!line.qualified && unqualifiedNote && (
                        <span className="shrink-0 text-[11px] text-arc-ink-faint">
                          {unqualifiedNote(row)}
                        </span>
                      )}
                    </span>
                  </td>
                  {columns.map((column) => {
                    const isBar = column === barColumn
                    const value = column.value ? column.value(row) : null
                    const tone = column.tone ?? (column.highlight ? 'good' : 'plain')
                    const text = column.highlight ? toneText(tone, value) : 'text-arc-ink-soft'
                    return (
                      <td
                        key={column.key}
                        className={`${column.align === 'left' ? '' : 'n'} ${text} ${
                          isBar ? 'barcell' : ''
                        } ${column.className ?? ''}`}
                        style={
                          isBar && value !== null
                            ? {
                                ...cellBar(
                                  lit ? barRatio(barValues, value, column.bar ?? 'up') : 0,
                                  toneBar(tone, value),
                                ),
                                transitionDelay: `${140 + Math.min(index, 8) * 70}ms`,
                              }
                            : undefined
                        }
                      >
                        {column.render(row)}
                      </td>
                    )
                  })}
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
      {toggle}
      {footer}
    </Panel>
  )
}
