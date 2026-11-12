import { NAV_ITEMS } from '@/components/layout/nav'
import { Modal } from '@/components/ui/dialog'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { exportExperimentCsv } from '@/utils/export'
import type { LucideIcon } from 'lucide-react'
import { Download, FlaskConical, Moon, Search, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Entry {
  id: string
  label: string
  detail: string
  group: 'Navigate' | 'Experiments' | 'Actions'
  icon: LucideIcon
  run: () => void
}

export function CommandPalette() {
  const open = useAppStore((s) => s.commandOpen)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const experiments = useLabStore((s) => s.experiments)
  const openExperiment = useLabStore((s) => s.openExperiment)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = NAV_ITEMS.map((item) => ({
      id: `nav-${item.to}`,
      label: item.label,
      detail: `${item.detail}, ${item.to}`,
      group: 'Navigate',
      icon: item.icon,
      run: () => navigate(item.to),
    }))
    const runs: Entry[] = experiments.slice(0, 6).map((item) => ({
      id: `run-${item.id}`,
      label: item.configuration.name,
      detail: `${item.results ? 'Open readout' : 'Open configuration'}, ${item.status}`,
      group: 'Experiments',
      icon: FlaskConical,
      run: () => {
        openExperiment(item.id)
        navigate(item.results ? `/results/${item.id}` : '/lab')
      },
    }))
    const actions: Entry[] = [
      {
        id: 'action-theme',
        label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
        detail: 'Appearance',
        group: 'Actions',
        icon: theme === 'light' ? Moon : Sun,
        run: toggleTheme,
      },
      {
        id: 'action-lab',
        label: 'Start a new analysis',
        detail: 'Analyze, Data → Method → Review',
        group: 'Actions',
        icon: FlaskConical,
        run: () => navigate('/lab'),
      },
    ]
    const active = experiments.find((item) => item.id === useLabStore.getState().activeId)
    if (active?.results) {
      actions.push({
        id: 'action-export',
        label: 'Export current series as CSV',
        detail: active.configuration.name,
        group: 'Actions',
        icon: Download,
        run: () => exportExperimentCsv(active),
      })
    }
    return [...nav, ...runs, ...actions]
  }, [experiments, navigate, openExperiment, theme, toggleTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => `${entry.label} ${entry.detail} ${entry.group}`.toLowerCase().includes(q))
  }, [entries, query])

  const execute = (entry: Entry) => {
    entry.run()
    setCommandOpen(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={setCommandOpen}
      title="Command deck"
      description="Jump to a mission area, reopen a run, or trigger an action."
      width="620px"
    >
      <div className="flex items-center gap-2.5 border border-[var(--line-strong)] bg-[var(--bg)] px-3">
        <Search size={14} className="shrink-0 text-[var(--faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor((current) => Math.min(current + 1, filtered.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor((current) => Math.max(current - 1, 0))
            }
            if (event.key === 'Enter' && filtered[cursor]) {
              event.preventDefault()
              execute(filtered[cursor])
            }
          }}
          placeholder="Search screens, experiments, actions…"
          aria-label="Search commands"
          className="h-11 w-full bg-transparent text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
        <kbd className="shrink-0 border border-[var(--line)] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.1em] text-[var(--faint)]">
          ESC
        </kbd>
      </div>
      <ul className="mt-1 max-h-[50vh] overflow-y-auto" role="listbox" aria-label="Commands">
        {filtered.length === 0 ? (
          <li className="border-b border-[var(--line)] px-3 py-8 text-center text-[12px] text-[var(--muted)]">
            No command matches “{query}”.
          </li>
        ) : (
          filtered.map((entry, index) => {
            const showGroup = index === 0 || filtered[index - 1].group !== entry.group
            return (
              <li key={entry.id}>
                {showGroup ? (
                  <p className="label border-b border-[var(--line)] px-2 pt-4 pb-1.5 text-[var(--faint)]">
                    {entry.group}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={cursor === index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => execute(entry)}
                  className={`flex w-full items-center gap-3 border-b border-[var(--line)] px-2.5 py-2 text-left transition-colors ${
                    cursor === index ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="w-5 shrink-0 font-mono text-[8.5px] text-[var(--faint)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <entry.icon size={14} className={cursor === index ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-[var(--ink)]">{entry.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[9px] tracking-[0.04em] text-[var(--faint)]">
                      {entry.detail}
                    </span>
                  </span>
                  {cursor === index ? (
                    <kbd className="border border-[var(--line)] px-1 py-0.5 font-mono text-[8.5px] text-[var(--faint)]">
                      ↵
                    </kbd>
                  ) : null}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </Modal>
  )
}
