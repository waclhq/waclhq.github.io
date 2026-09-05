import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeagueData } from '../lib/data'
import { buildResults, type ResultKind } from '../lib/search'
import { useDialog } from '../lib/dialog'

const KIND_LABEL: Record<ResultKind, string> = {
  page: 'go',
  manager: 'mgr',
  player: 'player',
  trade: 'trade',
}

const KIND_TONE: Record<ResultKind, string> = {
  page: 'text-arc-ink-faint',
  manager: 'text-arc-cyan',
  player: 'text-arc-green',
  trade: 'text-arc-orange',
}

/**
 * Cmd/Ctrl-K palette over pages, managers, every player the league has rostered,
 * and the trade log. Keyboard-first on desktop, full-screen on a phone.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const data = useLeagueData()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  useDialog(host, onClose, { initialFocus: inputRef })

  const results = useMemo(() => buildResults(data, query), [data, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActive(0)
  }, [query])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = results[active]
      if (choice) {
        navigate(choice.to)
        onClose()
      }
    } else if (event.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      ref={host}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-arc-bg-deep/85 px-3 pt-[8vh] backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="win rise-in flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-arc-line px-4 py-3">
          <span className="text-arc-green">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search managers, players, trades…"
            className="min-h-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-arc-ink outline-none placeholder:text-arc-ink-faint"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
          />
          <kbd className="hidden sm:inline-flex">esc</kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-arc-ink-faint">
              No matches for “{query}”.
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.kind}-${result.id}`}
                type="button"
                data-index={index}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  navigate(result.to)
                  onClose()
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === active ? 'bg-white/[0.045]' : ''
                }`}
              >
                <span
                  className={`w-14 shrink-0 text-[10px] tracking-widest uppercase ${KIND_TONE[result.kind]}`}
                >
                  {KIND_LABEL[result.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-arc-ink">{result.title}</span>
                  <span className="block truncate text-[11px] text-arc-ink-faint">
                    {result.subtitle}
                  </span>
                </span>
                {index === active && (
                  <kbd className="hidden shrink-0 sm:inline-flex">↵</kbd>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-arc-line px-4 py-2 text-[10px] text-arc-ink-faint">
          <span>{results.length} results</span>
          <span className="hidden items-center gap-2 sm:flex">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            to navigate
          </span>
        </div>
      </div>
    </div>
  )
}
