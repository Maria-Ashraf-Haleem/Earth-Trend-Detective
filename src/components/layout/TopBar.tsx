import { BrandLockup } from '@/components/layout/Brand'
import { MORE_NAV, PATH_INDEX, PATH_LABELS, PRIMARY_NAV } from '@/components/layout/nav'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { config } from '@/config'
import { useCatalog } from '@/hooks/useEnvironment'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/format'
import { ChevronDown, Command, Moon, Plus, Search, Sun, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

export function TopBar({ menuButton }: { menuButton?: ReactNode }) {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const draft = useLabStore((s) => s.draft)
  const experiments = useLabStore((s) => s.experiments)
  const [sessionOpen, setSessionOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const catalog = useCatalog()

  const region = catalog.regions.find((item) => item.id === draft.regionId) ?? catalog.regions[0]
  const variable = catalog.indicators.find((item) => item.id === draft.variableId)
  const published = catalog.datasets.some((item) => item.dataVerified)
  const section = useMemo(() => {
    if (location.pathname.startsWith('/results')) return 'Results'
    return PATH_LABELS[location.pathname] ?? 'Workspace'
  }, [location.pathname])
  const sectionIndex = location.pathname.startsWith('/results') ? '04' : (PATH_INDEX[location.pathname] ?? '—')

  useEffect(() => setMoreOpen(false), [location.pathname])

  useEffect(() => {
    if (!moreOpen) return
    const onDown = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  return (
    <header className="relative z-20 border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-2 px-4 md:px-8">
        {menuButton ? <div className="flex items-center lg:hidden">{menuButton}</div> : null}

        <Link to="/" className="flex shrink-0 items-center" aria-label="EarthTrend Lab, overview">
          <BrandLockup />
        </Link>

        <nav aria-label="Primary" className="ml-6 hidden items-center gap-0.5 lg:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                )
              }
            >
              {item.short}
            </NavLink>
          ))}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((open) => !open)}
              className={cn(
                'flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium transition-colors duration-150',
                moreOpen || MORE_NAV.some((item) => item.to === location.pathname)
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
              )}
            >
              More
              <ChevronDown size={13} strokeWidth={2} className={cn('transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="animate-rise absolute top-[calc(100%+8px)] left-0 z-50 w-60 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]"
              >
                {MORE_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-[9px] px-2.5 py-2 transition-colors',
                        isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--ink)] hover:bg-[var(--surface-2)]',
                      )
                    }
                  >
                    <item.icon size={15} strokeWidth={1.8} className="shrink-0 opacity-70" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{item.label}</span>
                      <span className="block text-[11px] text-[var(--faint)]">{item.detail}</span>
                    </span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="mr-1 hidden items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--muted)] xl:inline-flex"
            title="Observed source data from the certified environmental API. Descriptive results are not predictions."
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                catalog.error || !published ? 'bg-[var(--warn)]' : 'bg-[var(--ok)]',
              )}
              aria-hidden
            />
            {catalog.error ? 'API unavailable' : catalog.isPending ? 'Connecting…' : published ? 'Certified observations' : 'No published data'}
          </span>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 items-center gap-2 rounded-full bg-[var(--surface-2)] pr-1.5 pl-3 text-[12.5px] text-[var(--muted)] transition-colors duration-150 hover:text-[var(--ink)]"
            aria-label="Open command palette"
          >
            <Search size={15} strokeWidth={1.8} />
            <span className="hidden sm:inline">Search</span>
            <span className="hidden items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--faint)] md:inline-flex">
              <Command size={8} />K
            </span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
          </button>
          <Button size="sm" asChild className="ml-1 hidden sm:inline-flex">
            <Link to="/lab">
              <Plus size={14} strokeWidth={2.2} /> New analysis
            </Link>
          </Button>
          <button
            type="button"
            onClick={() => setSessionOpen(true)}
            className="ml-1 flex items-center gap-2 rounded-full p-0.5 pr-2.5 transition-colors duration-150 hover:bg-[var(--surface-2)]"
            aria-label="Open session details"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
              ET
            </span>
            <span className="hidden text-[12.5px] font-medium text-[var(--muted)] lg:inline">Guest</span>
          </button>
        </div>
      </div>

      <Modal
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        title="Local research session"
        description={`${section} ${sectionIndex !== '—' ? `· ${sectionIndex}` : ''} — frontend-only workspace, no account required.`}
      >
        <div className="grid gap-5">
          <div className="flex items-center gap-3 rounded-[var(--r-card)] bg-[var(--surface-2)] p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-[var(--shadow-card)]">
              <UserRound size={17} strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-[var(--ink)]">Guest investigator</p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                Local session · {region?.name ?? 'Region pending'}{region?.country ? `, ${region.country}` : ''}
              </p>
            </div>
          </div>
          <dl className="text-[12.5px]">
            <div className="flex justify-between border-b border-[var(--line)] py-2.5">
              <dt className="text-[var(--muted)]">Saved experiments</dt>
              <dd className="num">{experiments.length}</dd>
            </div>
            <div className="flex justify-between border-b border-[var(--line)] py-2.5">
              <dt className="text-[var(--muted)]">Latest activity</dt>
              <dd className="num">{experiments[0] ? formatDate(experiments[0].updatedAt) : '—'}</dd>
            </div>
            <div className="flex justify-between border-b border-[var(--line)] py-2.5">
              <dt className="text-[var(--muted)]">Channel</dt>
              <dd>
                {variable?.name ?? 'Choose an indicator'}{variable ? ` · ${variable.unit}` : ''}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Data mode</dt>
              <dd className="text-[11.5px]">{catalog.error ? 'API unavailable' : catalog.isPending ? 'Connecting to API' : published ? 'Certified observed data' : 'No published data'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" onClick={() => setSessionOpen(false)}>
              <Link to="/settings">Workspace settings</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" onClick={() => setSessionOpen(false)}>
              <Link to="/experiments">Review library</Link>
            </Button>
          </div>
          <p className="border-t border-[var(--line)] pt-3 text-[11.5px] leading-relaxed text-[var(--faint)]">
            API endpoint: <span className="font-medium">{config.apiBaseUrl}</span>. Analyses read historical
            environmental observations; saved readouts are local browser copies, not server experiments.
          </p>
        </div>
      </Modal>
    </header>
  )
}
