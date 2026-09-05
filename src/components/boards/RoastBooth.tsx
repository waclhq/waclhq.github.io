import { useEffect, useMemo, useRef, useState } from 'react'
import ManagerTag from '../ManagerTag'
import { Panel, useRevealed } from '../ui'
import { roastLines, type Roast } from '../../lib/boards-roast'
import { managerName, useLeagueData } from '../../lib/data'
import { managerColor } from '../../lib/identity'
import { useMe } from '../../lib/me'
import { animationsDisabled } from '../../lib/motion'
import { play } from '../../lib/sfx'
import type { ManagerId } from '../../lib/types'

/**
 * The Roast Booth. Pick a seat — yours is picked for you if you have one,
 * else the reigning champion's — and the teleprompter reads the record book
 * at them, one character at a time. "Again" rotates through a deeper pool
 * of facts, so the quiet seats get roasted too.
 */
export default function RoastBooth({
  id,
  subjects,
  reigning,
}: {
  id?: string
  subjects: ManagerId[]
  reigning: ManagerId | null
}) {
  const data = useLeagueData()
  const me = useMe()
  const [picked, setPicked] = useState<ManagerId | null>(null)
  const subject = picked ?? (me && subjects.includes(me) ? me : reigning ?? subjects[0])
  const [seed, setSeed] = useState(1)
  const [take, setTake] = useState(0)
  const roast = useMemo(() => (subject ? roastLines(data, subject, seed) : null), [data, subject, seed])

  // Your own seat leads the strip; the rest keep league order.
  const strip = useMemo(
    () => (me && subjects.includes(me) ? [me, ...subjects.filter((s) => s !== me)] : subjects),
    [subjects, me],
  )

  const choose = (next: ManagerId) => {
    if (next === subject) return
    setPicked(next)
    setSeed(1)
    setTake((t) => t + 1)
  }
  const again = () => {
    play('trombone')
    setSeed((s) => s + 1)
    setTake((t) => t + 1)
  }

  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!roast) return
    const text = [roast.opener, ...roast.lines, roast.closer].join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the text is on screen to select */
    }
  }

  if (!subject || !roast) return null

  return (
    <Panel
      id={id}
      title="the roast booth"
      subtitle="Every line cites a number on this site, which is why it lands. Pick a seat; the prompter does the rest."
      action={
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={again}>
            Again
          </button>
          <button type="button" className="btn" onClick={copy} aria-live="polite">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      }
    >
      <div className="scroll-x flex gap-1 border-b border-arc-line px-3 py-2" role="group" aria-label="Who gets roasted">
        {strip.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className="seat-pick shrink-0"
            aria-pressed={candidate === subject}
            aria-label={managerName(data.managers, candidate)}
            style={{ ['--c' as string]: managerColor(candidate) }}
            onClick={() => choose(candidate)}
          >
            <ManagerTag id={candidate} size={26} showName={candidate === subject} link={false} />
          </button>
        ))}
      </div>
      <div className="px-5 py-5">
        <Teleprompter key={`${subject}-${take}`} roast={roast} color={managerColor(subject)} />
        <div className="mt-4 text-[11.5px] text-arc-ink-faint">
          {roast.poolSize} facts on file for this seat. Tap the text to skip to the end.
        </div>
      </div>
    </Panel>
  )
}

/**
 * Types the roast out with a caret, one shot, starting when seen. Under
 * reduced motion the whole thing is simply there. Tap to finish at once.
 * Assistive tech gets the full text; the typing copy is decorative.
 */
function Teleprompter({ roast, color }: { roast: Roast; color: string }) {
  const host = useRef<HTMLDivElement>(null)
  const seen = useRevealed(host)
  const paragraphs = useMemo(() => [roast.opener, ...roast.lines, roast.closer], [roast])
  // Each paragraph ends with a pause, modelled as a few silent characters.
  const PAUSE = 14
  const total = paragraphs.reduce((sum, p) => sum + p.length + PAUSE, 0)
  const [count, setCount] = useState(() => (animationsDisabled() ? total : 0))
  const done = count >= total

  useEffect(() => {
    if (animationsDisabled()) {
      setCount(total)
      return
    }
    if (!seen || done) return
    const speed = 11 // ms per character
    const start = performance.now()
    const from = count
    let frame = 0
    const tick = (now: number) => {
      if (document.hidden) {
        setCount(total)
        return
      }
      const next = Math.min(total, from + Math.floor((now - start) / speed))
      setCount(next)
      if (next < total) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // `from` is intentionally read once per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, total, done])

  // Keep the caret for a beat after the last character, then go still.
  const [caret, setCaret] = useState(true)
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setCaret(false), 1800)
    return () => window.clearTimeout(timer)
  }, [done])

  let budget = count
  const visible = paragraphs.map((text) => {
    const shown = text.slice(0, Math.max(0, Math.min(text.length, budget)))
    budget -= text.length + PAUSE
    return shown
  })
  const activeIndex = visible.findIndex((shown, index) => shown.length < paragraphs[index].length)
  const caretAt = done ? paragraphs.length - 1 : activeIndex

  return (
    <div
      ref={host}
      className="prompter"
      onClick={() => setCount(total)}
      style={{ ['--c' as string]: color }}
    >
      <div className="sr-only">{paragraphs.join(' ')}</div>
      <div aria-hidden>
        {visible.map((shown, index) =>
          shown.length === 0 && index !== caretAt ? null : (
            <p key={index} className={index === 0 ? 'text-arc-ink' : undefined}>
              {shown}
              {caret && !animationsDisabled() && index === caretAt && <span className="prompter-caret" />}
            </p>
          ),
        )}
      </div>
    </div>
  )
}
