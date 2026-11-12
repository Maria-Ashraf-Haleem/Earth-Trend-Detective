import { AppShell } from '@/components/layout/AppShell'
import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'

const OverviewPage = lazy(() => import('@/features/overview/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ExplorerPage = lazy(() => import('@/features/explorer/ExplorerPage').then((m) => ({ default: m.ExplorerPage })))
const ResearchLabPage = lazy(() =>
  import('@/features/research-lab/ResearchLabPage').then((m) => ({ default: m.ResearchLabPage })),
)
const ResultsPage = lazy(() => import('@/features/results/ResultsPage').then((m) => ({ default: m.ResultsPage })))
const AiInsightsPage = lazy(() =>
  import('@/features/ai-insights/AiInsightsPage').then((m) => ({ default: m.AiInsightsPage })),
)
const ExperimentsPage = lazy(() =>
  import('@/features/experiments/ExperimentsPage').then((m) => ({ default: m.ExperimentsPage })),
)
const ComparePage = lazy(() => import('@/features/comparison/ComparePage').then((m) => ({ default: m.ComparePage })))
const MethodologyPage = lazy(() =>
  import('@/features/methodology/MethodologyPage').then((m) => ({ default: m.MethodologyPage })),
)
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function Fallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex items-center gap-3 border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse-dot bg-[var(--violet)]" aria-hidden />
        <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--muted)]">Acquiring plate</p>
      </div>
    </div>
  )
}

function wrap(node: ReactNode) {
  return <Suspense fallback={<Fallback />}>{node}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: wrap(<OverviewPage />) },
      { path: 'explorer', element: wrap(<ExplorerPage />) },
      { path: 'lab', element: wrap(<ResearchLabPage />) },
      { path: 'results', element: wrap(<ResultsPage />) },
      { path: 'results/:experimentId', element: wrap(<ResultsPage />) },
      { path: 'insights', element: wrap(<AiInsightsPage />) },
      { path: 'experiments', element: wrap(<ExperimentsPage />) },
      { path: 'compare', element: wrap(<ComparePage />) },
      { path: 'methodology', element: wrap(<MethodologyPage />) },
      { path: 'settings', element: wrap(<SettingsPage />) },
    ],
  },
])
