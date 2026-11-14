import { Toast } from '@/components/common/EmptyState'
import { BrandLockup } from '@/components/layout/Brand'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { NAV_GROUPS } from '@/components/layout/nav'
import { TopBar } from '@/components/layout/TopBar'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { cn } from '@/utils/cn'
import { ArrowUpRight, Menu, Plus, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

const SHELL_OFFSET = '64px'

function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-[1480px] gap-10 px-4 py-12 md:grid-cols-[1.7fr_1fr_1fr] md:px-8">
        <div>
          <BrandLockup />
          <p className="mt-4 max-w-[36ch] text-[13px] leading-relaxed text-[var(--muted)]">
            A quiet workspace for reading satellite-era surface records, one study at a time.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" aria-hidden />
            Historical source observations
          </span>
        </div>
        <div>
          <p className="label">Workspace</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            {[
              { to: '/explorer', label: 'Explore the field' },
              { to: '/lab', label: 'Design an analysis' },
              { to: '/results', label: 'Read a result' },
              { to: '/methodology', label: 'Data & method' },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex items-center gap-1 text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {item.label}
                  <ArrowUpRight size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label">Provenance</p>
          <p className="mt-3 max-w-[38ch] text-[12.5px] leading-relaxed text-[var(--muted)]">
            Source-preserving environmental observations and descriptive analysis. Historical results are not future forecasts.
          </p>
          <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--faint)]">
            MODIS Terra / Aqua and GHSL source products
            <br />
            Cell centers and published source extent
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11.5px] text-[var(--faint)] md:px-8">
          <p>© 2026 EarthTrend Lab</p>
          <p>Not affiliated with NASA</p>
        </div>
      </div>
    </footer>
  )
}

export function AppShell() {
  const theme = useAppStore((s) => s.theme)
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen)
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const toast = useLabStore((s) => s.toast)
  const setToast = useLabStore((s) => s.setToast)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useAppStore.getState().setCommandOpen(true)
      }
      if (event.key === 'Escape') useAppStore.getState().setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3400)
    return () => window.clearTimeout(timer)
  }, [toast, setToast])

  useEffect(() => {
    setMobileNavOpen(false)
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.hash, setMobileNavOpen])

  useEffect(() => {
    if (!location.hash) return
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return

    let attempts = 0
    let timer: number | undefined

    const scrollToTarget = () => {
      const target = document.getElementById(id)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (attempts < 15) {
        attempts += 1
        timer = window.setTimeout(scrollToTarget, 80)
      }
    }

    timer = window.setTimeout(scrollToTarget, 40)
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [location.pathname, location.hash])

  return (
    <div className="min-h-screen" style={{ ['--shell-offset' as string]: SHELL_OFFSET }}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-[10px] focus:border focus:border-[var(--line)] focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-pop)]"
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-30">
        <TopBar
          menuButton={
            <button
              type="button"
              className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={18} strokeWidth={1.8} />
            </button>
          }
        />
      </div>

      <main id="main">
        <Outlet />
      </main>

      <SiteFooter />

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav
            className="animate-rise absolute inset-y-0 left-0 flex w-[min(340px,88vw)] flex-col rounded-r-[22px] bg-[var(--surface)] shadow-[var(--shadow-pop)]"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <BrandLockup compact />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                aria-label="Close navigation"
              >
                <X size={17} />
              </button>
            </div>
            <div className="px-4">
              <Link
                to="/lab"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--action)] text-[13px] font-medium text-[var(--action-ink)] transition-colors duration-150 hover:bg-[var(--action-hover)]"
              >
                <Plus size={15} /> New analysis
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.id} className="mb-6">
                  <p className="label px-2 pb-2">{group.label}</p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) =>
                            cn(
                              'flex min-h-10 items-center gap-3 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors',
                              isActive
                                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                                : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
                            )
                          }
                        >
                          <item.icon size={16} strokeWidth={1.8} />
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--line)] p-4">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--surface-2)] p-1">
                {(['explorer', 'researcher'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={cn(
                      'rounded-full py-1.5 text-[11.5px] font-medium capitalize transition-colors',
                      mode === item
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(16,24,40,0.10)]'
                        : 'text-[var(--muted)]',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
                Observed environmental data. Predictions and tourism models are unavailable.
              </p>
            </div>
          </nav>
        </div>
      ) : null}
      <CommandPalette />
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}
