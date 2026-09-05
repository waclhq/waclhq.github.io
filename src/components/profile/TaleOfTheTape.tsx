import { useEffect, useMemo, useRef, useState } from 'react'
import type { CareerLuck } from '../../lib/analytics'
import type { HeadToHead } from '../../lib/bets'
import { num, pct, record } from '../../lib/format'
import { managerColor } from '../../lib/identity'
import type { CareerLine } from '../../lib/stats'
import type { Manager, ManagerId } from '../../lib/types'
import { Panel, useRevealed } from '../ui'
import { Face } from './ManagerLink'

type Better = 'high' | 'low' | 'none'

interface TapeRow {
  key: string
  label: string
  a: number | null
  b: number | null
  fa: string
  fb: string
  better: Better
}

const dash = '—'

function rows(
  a: CareerLine,
  b: CareerLine,
  luckA: CareerLuck | undefined,
  luckB: CareerLuck | undefined,
  book: HeadToHead | null,
): TapeRow[] {
  const bracket = (line: CareerLine) => {
    const games = line.playoffWins + line.playoffLosses
    return games ? line.playoffWins / games : null
  }
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`
  const out: TapeRow[] = [
    { key: 'titles', label: 'Titles', a: a.titles, b: b.titles, fa: String(a.titles), fb: String(b.titles), better: 'high' },
    { key: 'win', label: 'Win %', a: a.winPct, b: b.winPct, fa: pct(a.winPct), fb: pct(b.winPct), better: 'high' },
    {
      key: 'rate',
      label: 'Playoff rate',
      a: a.playoffRate,
      b: b.playoffRate,
      fa: pct(a.playoffRate, 0),
      fb: pct(b.playoffRate, 0),
      better: 'high',
    },
    {
      key: 'bracket',
      label: 'Bracket',
      a: bracket(a),
      b: bracket(b),
      fa: a.playoffWins + a.playoffLosses ? record(a.playoffWins, a.playoffLosses) : dash,
      fb: b.playoffWins + b.playoffLosses ? record(b.playoffWins, b.playoffLosses) : dash,
      better: 'high',
    },
    { key: 'pf', label: 'PF/gm', a: a.avgPointsFor, b: b.avgPointsFor, fa: num(a.avgPointsFor), fb: num(b.avgPointsFor), better: 'high' },
    {
      key: 'pa',
      label: 'PA/gm',
      a: a.avgPointsAgainst,
      b: b.avgPointsAgainst,
      fa: num(a.avgPointsAgainst),
      fb: num(b.avgPointsAgainst),
      better: 'low',
    },
    {
      key: 'best',
      label: 'Best year',
      a: a.bestSeason?.avg ?? null,
      b: b.bestSeason?.avg ?? null,
      fa: a.bestSeason ? `${num(a.bestSeason.avg)} · ${a.bestSeason.year}` : dash,
      fb: b.bestSeason ? `${num(b.bestSeason.avg)} · ${b.bestSeason.year}` : dash,
      better: 'high',
    },
    { key: 'top3', label: 'Top three', a: a.topThree, b: b.topThree, fa: String(a.topThree), fb: String(b.topThree), better: 'high' },
  ]
  if (luckA && luckB) {
    out.push({
      key: 'luck',
      label: 'Schedule luck',
      a: luckA.totalLuck,
      b: luckB.totalLuck,
      fa: signed(luckA.totalLuck),
      fb: signed(luckB.totalLuck),
      better: 'none',
    })
  }
  if (book) {
    const aWins = book.a === a.manager ? book.aWins : book.bWins
    const bWins = book.a === a.manager ? book.bWins : book.aWins
    out.push({
      key: 'book',
      label: 'In the Book',
      a: aWins,
      b: bWins,
      fa: String(aWins),
      fb: String(bWins),
      better: 'high',
    })
  }
  return out
}

function widths(row: TapeRow): [number, number] {
  if (row.a === null || row.b === null) return [row.a === null ? 0 : 0.6, row.b === null ? 0 : 0.6]
  if (row.better === 'none') {
    const span = Math.max(Math.abs(row.a), Math.abs(row.b)) || 1
    return [Math.abs(row.a) / span, Math.abs(row.b) / span]
  }
  const [x, y] = row.better === 'low' ? [1 / Math.max(row.a, 1e-9), 1 / Math.max(row.b, 1e-9)] : [row.a, row.b]
  const top = Math.max(x, y)
  if (top <= 0) return [0, 0]
  return [x / top, y / top]
}

function winner(row: TapeRow): 'a' | 'b' | null {
  if (row.a === null || row.b === null || row.better === 'none' || row.a === row.b) return null
  const aBetter = row.better === 'high' ? row.a > row.b : row.a < row.b
  return aBetter ? 'a' : 'b'
}

/**
 * Two careers side by side, every bar filling from the centre toward the
 * better side in that manager's colour, with a verdict underneath. The
 * opponent defaults to whoever is reading (if it is someone else), otherwise
 * to the reigning champion; the face row switches it.
 */
export function TaleOfTheTape({
  id,
  table,
  managers,
  luck,
  defaultOpponent,
  h2h,
  delay = 0,
}: {
  id: ManagerId
  table: CareerLine[]
  managers: Manager[]
  luck: CareerLuck[]
  defaultOpponent: ManagerId
  h2h: HeadToHead[]
  delay?: number
}) {
  const [opponent, setOpponent] = useState<ManagerId>(defaultOpponent)
  useEffect(() => setOpponent(defaultOpponent), [defaultOpponent, id])

  const frame = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(frame)

  const a = table.find((line) => line.manager === id)
  const b = table.find((line) => line.manager === opponent)
  const nameOf = (who: ManagerId) => managers.find((m) => m.id === who)?.displayName ?? who

  const choices = useMemo(() => {
    const order = new Map(table.map((line, index) => [line.manager, index]))
    return managers
      .filter((m) => m.id !== id && order.has(m.id))
      .sort((x, y) => Number(y.active) - Number(x.active) || (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0))
  }, [managers, table, id])

  const tape = useMemo(() => {
    if (!a || !b) return []
    const pair =
      h2h.find((row) => (row.a === id && row.b === opponent) || (row.a === opponent && row.b === id)) ?? null
    return rows(
      a,
      b,
      luck.find((row) => row.manager === id),
      luck.find((row) => row.manager === opponent),
      pair,
    )
  }, [a, b, luck, h2h, id, opponent])

  if (!a || !b) return null
  const colorA = managerColor(id)
  const colorB = managerColor(opponent)
  const nameA = nameOf(id)
  const nameB = nameOf(opponent)

  const scored = tape.filter((row) => winner(row) !== null)
  const tallyA = scored.filter((row) => winner(row) === 'a').length
  const tallyB = scored.length - tallyA
  const holds = (side: 'a' | 'b') =>
    tape
      .filter((row) => winner(row) === side)
      .slice(0, 2)
      .map((row) => row.label.toLowerCase())
      .join(' and ')

  let verdict: string
  if (tallyA === tallyB) {
    verdict = `${tallyA}–${tallyB} on the tape. Settle it on the field.`
  } else {
    const [lead, trail, tLead, tTrail] = tallyA > tallyB ? [nameA, nameB, tallyA, tallyB] : [nameB, nameA, tallyB, tallyA]
    const side = tallyA > tallyB ? 'b' : 'a'
    verdict =
      tLead - tTrail >= 3
        ? `${lead} takes ${tLead} of ${scored.length}. This one is not close.`
        : `${lead} edges it ${tLead}–${tTrail}${holds(side) ? `; ${trail} keeps ${holds(side)}` : ''}.`
  }

  return (
    <Panel
      title="Tale of the tape"
      subtitle="Career numbers side by side; each bar fills from the centre toward the better side."
      delay={delay}
    >
      <div ref={frame} className={`pf-tape ${revealed ? 'on' : ''}`}>
        <div className="pf-tape-pick" role="radiogroup" aria-label="Opponent">
          {choices.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === opponent}
              className={`pf-pick ${m.id === opponent ? 'is-on' : ''}`}
              style={{ ['--c' as string]: managerColor(m.id) }}
              onClick={() => setOpponent(m.id)}
              title={m.displayName}
            >
              <Face id={m.id} size={36} ring={m.id === opponent} />
              <span className="pf-pick-name">{m.displayName}</span>
            </button>
          ))}
        </div>

        <div className="pf-tape-heads">
          <div className="pf-tape-head" style={{ ['--c' as string]: colorA }}>
            <Face id={id} size={44} />
            <span className="arcade pf-tape-name">{nameA}</span>
          </div>
          <span className="pf-tape-vs arcade" aria-hidden>
            vs
          </span>
          <div className="pf-tape-head is-b" style={{ ['--c' as string]: colorB }}>
            <span className="arcade pf-tape-name">{nameB}</span>
            <Face id={opponent} size={44} />
          </div>
        </div>

        <dl className="pf-tape-rows">
          {tape.map((row, index) => {
            const [wa, wb] = widths(row)
            const won = winner(row)
            return (
              <div key={row.key} className="pf-tape-row" style={{ ['--d' as string]: `${index * 55}ms` }}>
                <dt className="pf-tape-label">{row.label}</dt>
                <dd className={`pf-tape-val is-a ${won === 'a' ? 'is-win' : ''}`}>
                  {row.fa}
                  {won === 'a' && <span className="sr-only"> (better)</span>}
                </dd>
                <dd className="pf-tape-track" aria-hidden>
                  <span
                    className={`pf-tape-bar is-a ${won === 'b' ? 'is-dim' : ''}`}
                    style={{ ['--w' as string]: wa, background: colorA }}
                  />
                  <span className="pf-tape-mid" />
                  <span
                    className={`pf-tape-bar is-b ${won === 'a' ? 'is-dim' : ''}`}
                    style={{ ['--w' as string]: wb, background: colorB }}
                  />
                </dd>
                <dd className={`pf-tape-val is-b ${won === 'b' ? 'is-win' : ''}`}>
                  {row.fb}
                  {won === 'b' && <span className="sr-only"> (better)</span>}
                </dd>
              </div>
            )
          })}
        </dl>

        <p className="pf-verdict" role="status">
          <span className="label">Verdict</span>
          <span>{verdict}</span>
        </p>
      </div>
    </Panel>
  )
}
