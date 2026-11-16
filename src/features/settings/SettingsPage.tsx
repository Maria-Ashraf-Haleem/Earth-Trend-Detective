import { DataNote, KeyValue, PageHeader, SectionHead, Tag } from '@/components/common/Primitives'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { useQueryClient } from '@tanstack/react-query'
import { useReadiness } from '@/hooks/useEnvironment'
import { LiveDataState } from '@/components/common/LiveDataState'
import {
  effectiveApiBaseUrl, endpointWarning, isUsingEndpointOverride,
  isValidEndpointUrl, setApiBaseUrlOverride,
} from '@/services/api/endpoint'
import { environmentKeys } from '@/hooks/useEnvironment'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { downloadTextFile } from '@/utils/format'
import {
  Check,
  Database,
  Download,
  Moon,
  PlugZap,
  RotateCcw,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ThemeMode } from '@/types'

const THEME_OPTIONS: { id: ThemeMode; label: string; detail: string; icon: typeof Sun }[] = [
  { id: 'dark', label: 'Forest night', detail: 'Deep canopy ground with paper type and indigo signal.', icon: Moon },
  { id: 'light', label: 'Paper field', detail: 'Warm survey paper for bright rooms and print review.', icon: Sun },
]

export function SettingsPage() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const draft = useLabStore((s) => s.draft)
  const experiments = useLabStore((s) => s.experiments)
  const compareIds = useLabStore((s) => s.compareIds)
  const resetDraft = useLabStore((s) => s.resetDraft)
  const resetWorkspace = useLabStore((s) => s.resetWorkspace)
  const setToast = useLabStore((s) => s.setToast)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const readiness = useReadiness()

  const completed = useMemo(() => experiments.filter((item) => item.source === 'api' && item.liveResult).length, [experiments])

  const exportWorkspace = () => {
    const payload = {
      schema: 'earthtrend-lab.workspace/v2',
      exportedAt: new Date().toISOString(),
      demoMode: config.demoMode,
      persistenceKey: config.persistenceKey,
      preferences: { theme },
      draft,
      compareIds,
      experiments,
      notice:
        'Local copies of observed-data API responses and configuration. Descriptive results are not predictions; computation IDs are ephemeral.',
    }
    downloadTextFile(
      `earthtrend-lab-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
      JSON.stringify(payload, null, 2),
    )
    setToast('Workspace JSON exported')
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader
        eyebrow="09 / Settings"
        title={
          <>
            Workspace <em className="text-[var(--accent)]">controls.</em>
          </>
        }
        lede="Preferences and local data for this browser."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">Observed-data API</Tag>
            <Tag tone="neutral">{experiments.length} stored runs</Tag>
            <Tag tone="accent">{theme === 'dark' ? 'Forest night' : 'Paper field'}</Tag>
          </div>
        }
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-10">
          {/* Appearance */}
          <section aria-labelledby="appearance">
            <SectionHead
              id="appearance"
              title="Appearance"
              lede="Both themes use the same tokens; charts, maps and the shell follow."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {THEME_OPTIONS.map((option) => {
                const active = theme === option.id
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTheme(option.id)}
                    className={`group border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[12.5px] font-medium">
                        <Icon size={14} className={active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} />
                        {option.label}
                      </span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center border ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--action-ink)]'
                            : 'border-[var(--line-strong)]'
                        }`}
                      >
                        {active ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                    </span>
                    <ThemePreview tone={option.id} />
                    <span className="mt-2 block text-[10.5px] leading-relaxed text-[var(--muted)]">{option.detail}</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Data service endpoint */}
          <EndpointSection />

          {/* Workspace data */}
          <section aria-labelledby="workspace-data">
            <SectionHead
              id="workspace-data"
              title="Workspace data"
              lede="Reset controls are local and immediate. Export before resetting if you want a record."
            />
            <div className="mt-4 overflow-hidden border-y border-[var(--line-strong)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
                <div>
                  <p className="text-[12.5px] font-medium">Export workspace</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Full JSON: preferences, draft protocol, experiments and comparison selection.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={exportWorkspace}>
                  <Download size={13} /> Export JSON
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4">
                <div>
                  <p className="text-[12.5px] font-medium">Reset study configuration</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Returns the Analyze draft to its defaults. Saved local analyses stay untouched.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetDraft()
                    setToast('Analysis draft reset')
                  }}
                >
                  <RotateCcw size={13} /> Reset draft
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-4">
                <div>
                  <p className="text-[12.5px] font-medium">Clear local analysis workspace</p>
                  <p className="mt-0.5 max-w-[52ch] text-[11px] leading-relaxed text-[var(--muted)]">
                    Removes local saved analyses and draft selection from this browser. No database observations
                    or server history are changed. This cannot be undone.
                  </p>
                </div>
                {confirmingReset ? (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        resetWorkspace()
                        setConfirmingReset(false)
                      }}
                    >
                      <TriangleAlert size={13} /> Clear local data
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(true)}>
                    <RotateCcw size={13} /> Clear workspace
                  </Button>
                )}
              </div>
            </div>
          </section>

          <DataNote label="Data storage">
            Resetting or exporting local copies does not change server data. Analysis values come from the API.
            Local storage is per browser profile; clearing site data removes local saved readouts and preferences.
          </DataNote>
        </div>

        {/* Rail */}
        <aside className="space-y-8 lg:sticky lg:top-[calc(var(--shell-offset,146px)+20px)]">
          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center justify-between">
              <p className="kicker text-[var(--ink)]">Runtime</p>
            </div>
            <dl className="mt-3">
              <KeyValue label="API base URL" value={<span className="text-[10.5px]">{effectiveApiBaseUrl()}</span>} />
              <KeyValue label="Analysis mode" value="Observed-data API" />
              <KeyValue label="Persistence key" value={<span className="text-[10px]">{config.persistenceKey}</span>} />
              <KeyValue label="Stored runs" value={`${experiments.length} (${completed} completed)`} />
              <KeyValue label="Theme" value={theme === 'dark' ? 'Forest night' : 'Paper field'} />
            </dl>
          </div>

          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-[var(--faint)]" />
              <p className="kicker text-[var(--ink)]">Where data lives</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Saved analysis responses and draft selection are persisted in this browser. Catalogs and observations
              are retrieved from the configured API. No account or operator key is required for certified reads.
            </p>
            <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
              <StatusRow label="Browser storage" state="Active" tone="ok" />
              <StatusRow
                label="FastAPI service"
                state={readiness.isPending ? 'Checking readiness…' : readiness.data?.status === 'ready' ? 'Database and certified data ready' : 'Unavailable'}
                tone={readiness.data?.status === 'ready' ? 'ok' : 'off'}
              />
              <StatusRow label="Telemetry" state="None" tone="off" />
            </div>
            <div className="mt-3"><LiveDataState error={readiness.error} onRetry={() => { void readiness.refetch() }} /></div>
          </div>

          <div className="border-y border-[var(--line-strong)] bg-[var(--surface-2)] p-4">
            <p className="kicker text-[var(--ink)]">API configuration</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
              The build-time default comes from the environment; a hosted endpoint can also be set at runtime above.
              Responses are runtime validated. Never put database credentials or an operator import key in browser
              environment variables.
            </p>
            <pre className="mt-3 overflow-x-auto border border-[var(--line)] bg-[var(--bg)] p-2.5 font-mono text-[10px] leading-relaxed text-[var(--ink-soft)]">
{`VITE_DEMO_MODE=false
VITE_API_BASE_URL=https://your-hosted-api.example.com`}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Runtime override for the environmental data service endpoint. */
function EndpointSection() {
  const queryClient = useQueryClient()
  const setToast = useLabStore((s) => s.setToast)
  const [overrideActive, setOverrideActive] = useState(isUsingEndpointOverride())
  const [value, setValue] = useState(() => effectiveApiBaseUrl())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)

  useEffect(() => {
    setValue(effectiveApiBaseUrl())
    setOverrideActive(isUsingEndpointOverride())
  }, [])

  const warning = useMemo(() => (value.trim() === effectiveApiBaseUrl() ? null : endpointWarning(value)), [value])
  const dirty = value.trim() !== effectiveApiBaseUrl()
  const valid = isValidEndpointUrl(value)

  const testEndpoint = async () => {
    setTesting(true)
    setTestResult(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const target = `${value.trim().replace(/\/+$/, '')}/api/v1/health/readiness`
      const response = await fetch(target, { signal: controller.signal, headers: { Accept: 'application/json' } })
      if (!response.ok) {
        setTestResult({ ok: false, detail: `The service answered with HTTP ${response.status}; readiness did not confirm.` })
      } else {
        const payload = (await response.json()) as { status?: string }
        setTestResult({
          ok: payload.status === 'ready',
          detail: payload.status === 'ready'
            ? 'Readiness confirmed: database and certified data available at this endpoint.'
            : `Service reachable but readiness reported "${payload.status ?? 'unknown'}".`,
        })
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      setTestResult({
        ok: false,
        detail: aborted ? 'No response within 8 seconds.' : 'Could not connect to the service at this endpoint.',
      })
    } finally {
      clearTimeout(timeout)
      setTesting(false)
    }
  }

  const saveEndpoint = () => {
    const next = value.trim().replace(/\/+$/, '')
    setApiBaseUrlOverride(next === config.apiBaseUrl ? null : next)
    // Every catalog and analysis query is keyed to the old endpoint's data;
    // clear once so the whole workspace refetches from the new service.
    void queryClient.invalidateQueries({ queryKey: ['environment'] })
    queryClient.removeQueries({ queryKey: environmentKeys.readiness })
    setOverrideActive(isUsingEndpointOverride())
    setTestResult(null)
    setToast(isUsingEndpointOverride() ? `API endpoint set to ${next}` : 'API endpoint reset to the build default')
  }

  const resetEndpoint = () => {
    setApiBaseUrlOverride(null)
    setValue(config.apiBaseUrl)
    void queryClient.invalidateQueries({ queryKey: ['environment'] })
    setOverrideActive(false)
    setTestResult(null)
    setToast('API endpoint reset to the build default')
  }

  return (
    <section aria-labelledby="api-endpoint">
      <SectionHead
        id="api-endpoint"
        title="Data service endpoint"
        lede="Where observed-data requests go. Static deployments can be repointed here without rebuilding."
      />
      <div className="mt-4 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium">Active endpoint</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted)]">{effectiveApiBaseUrl()}</p>
          </div>
          <Tag tone={overrideActive ? 'warn' : 'neutral'}>
            {overrideActive ? 'Runtime override' : 'Build default'}
          </Tag>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            inputMode="url"
            spellCheck={false}
            value={value}
            onChange={(event) => { setValue(event.target.value); setTestResult(null) }}
            placeholder="https://your-deployed-api.example.com"
            aria-label="Data service endpoint URL"
            className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-[11.5px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
          />
          <Button variant="secondary" size="sm" onClick={() => void testEndpoint()} disabled={!valid || testing}>
            <PlugZap size={13} /> {testing ? 'Testing…' : 'Test connection'}
          </Button>
          <Button size="sm" onClick={saveEndpoint} disabled={!valid || !dirty}>
            <Check size={13} /> Save endpoint
          </Button>
        </div>
        {warning ? <p className="mt-2 text-[11px] leading-relaxed text-[var(--warn)]">{warning}</p> : null}
        {testResult ? (
          <p className={`mt-2 text-[11px] leading-relaxed ${testResult.ok ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>
            {testResult.detail}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
          The endpoint must be a hosted FastAPI service exposing <span className="font-mono">/api/v1/health/readiness</span>.
          GitHub Pages serves the frontend only; it cannot run the backend. The override is stored in this browser only
          and never sends credentials.
        </p>
        {overrideActive ? (
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <Button variant="ghost" size="sm" onClick={resetEndpoint}>
              <RotateCcw size={13} /> Reset to build default ({config.apiBaseUrl})
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ThemePreview({ tone }: { tone: ThemeMode }) {
  const dark = tone === 'dark'
  const bg = dark ? '#0a1310' : '#f1ede1'
  const surface = dark ? '#0f1b15' : '#f7f3e7'
  const ink = dark ? '#eee9d8' : '#10251c'
  const accent = dark ? '#afcba6' : '#1f5138'
  const violet = dark ? '#b0a2ce' : '#3e2e5c'
  const line = dark ? 'rgba(238,233,216,0.18)' : 'rgba(16,37,28,0.18)'
  return (
    <span
      className={`mt-3 flex h-[76px] items-stretch gap-2 overflow-hidden border p-2 ${
        dark ? 'border-white/15' : 'border-[var(--line-strong)]'
      }`}
      style={{ background: bg }}
      aria-hidden
    >
      <span className="flex w-[36%] flex-col justify-between border p-1.5" style={{ borderColor: line, background: surface }}>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5" style={{ background: violet }} />
          <span className="h-[2px] w-7" style={{ background: ink, opacity: 0.7 }} />
        </span>
        <span className="space-y-1">
          <span className="block h-[2px] w-full" style={{ background: line }} />
          <span className="block h-[2px] w-3/4" style={{ background: line }} />
          <span className="block h-[2px] w-1/2" style={{ background: line }} />
        </span>
      </span>
      <span className="flex flex-1 flex-col justify-between border p-1" style={{ borderColor: line, background: surface }}>
        <span className="flex items-end gap-1">
          <span className="block h-5 w-2" style={{ background: accent }} />
          <span className="block h-8 w-2" style={{ background: ink, opacity: 0.85 }} />
          <span className="block h-4 w-2" style={{ background: violet }} />
          <span className="block h-9 w-2" style={{ background: accent, opacity: 0.55 }} />
        </span>
        <span className="block h-[2px] w-full" style={{ background: line }} />
      </span>
    </span>
  )
}

function StatusRow({ label, state, tone }: { label: string; state: string; tone: 'ok' | 'off' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-[var(--faint)]">{label}</span>
      <span className="label flex items-center gap-1.5 tracking-wide">
        <span className={`h-1.5 w-1.5 rounded-full ${tone === 'ok' ? 'bg-[var(--ok)]' : 'bg-[var(--faint)]'}`} />
        <span className={tone === 'ok' ? 'text-[var(--ok)]' : 'text-[var(--muted)]'}>{state}</span>
      </span>
    </div>
  )
}
