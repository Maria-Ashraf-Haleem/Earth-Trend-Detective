import { Database, FileText, ShieldCheck } from 'lucide-react'
import { DataNote, KeyValue, PageHeader, SectionHead, Tag } from '@/components/common/Primitives'
import { LiveDataState, environmentalUnit } from '@/components/common/LiveDataState'
import { config } from '@/config'
import { useCatalog } from '@/hooks/useEnvironment'

const PIPELINE = [
  { title: 'Preserve', detail: 'Read the existing fused MODIS Terra/Aqua and GHSL source product. Original source values, cell IDs, dates and provenance are retained; this application does not reacquire satellite imagery.' },
  { title: 'Validate', detail: 'The backend parser checks source types, coordinates, calendar consistency and nullable sensor QA. A version is published only after current-policy source/SQL reconciliation.' },
  { title: 'Query', detail: 'Measurements ending in _c already contain Celsius. SQL values are not multiplied by the raw MODIS scale factor or converted from Kelvin again.' },
  { title: 'Aggregate', detail: 'Average native acquisitions within each cell/month, then average contributing cell means equally. Previous-month context is collapsed at its source-month grain; inconsistent attachments are rejected.' },
  { title: 'Describe', detail: 'Fit ordinary least squares against elapsed years (days / 365.2425) for eligible monthly values. Confidence intervals and p-values use Student-t inference under the documented assumptions.' },
  { title: 'Report', detail: 'Return actual support, missingness, version, method and warnings. Analysis GET requests do not persist history; the computation identifier is ephemeral.' },
]
const LIMITS = [
  'Land surface temperature is not air temperature; vegetation indices are not temperature measurements.',
  'Missing observations and unknown Aqua QA are never replaced with zero or false. The absent Aqua retrieval on 2022-04-07 remains missing.',
  'Previous-month context refers to the source calendar month. Repeated attachments are not independent daily observations.',
  'GHSL is a 2020 snapshot, attached only in 2021+ source rows. It cannot describe historical urban growth or become a trend series.',
  'OLS inference is exploratory; seasonality, serial correlation, multiple comparisons and changing spatial support are not corrected.',
  'No trained prediction model, tourism measurements, air-temperature service or causal tourism-effect estimate is implemented.',
]
const CONTRACT = [
  ['/api/v1/regions', 'Actual region metadata; centroid extent is not an administrative boundary'],
  ['/api/v1/regions/{region_id}/cells', 'Paginated cell centers and actual cell IDs'],
  ['/api/v1/datasets', 'Published version, date coverage and certification status'],
  ['/api/v1/indicators', 'Fourteen source measurements, units and temporal support'],
  ['/api/v1/variables', 'Eight source-specific LST compatibility variables'],
  ['/api/v1/observations', 'Bounded filtered source rows with nullable measurements'],
  ['/api/v1/dashboard/summary', 'Actual observation/cell totals and available period'],
  ['/api/v1/dashboard/environmental-overview', 'Row-weighted attached-source means, separate from trends'],
  ['/api/v1/dashboard/data-coverage', 'Present/missing source-row counts for all indicators'],
  ['/api/v1/analysis/trends', 'Monthly series, support and descriptive OLS/null statistics'],
  ['/api/v1/analysis/trends/{region_id}', 'Region-specific descriptive trend'],
  ['/api/v1/analysis/compare', 'Two disjoint period summaries and descriptive change'],
]

export function MethodologyPage() {
  const catalog = useCatalog()
  const dataset = catalog.datasets.find((item) => item.dataVerified)
  const docs = `${config.apiBaseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '')}/docs`
  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader eyebrow="08 / Data & method" title={<>What the numbers are <em className="text-[var(--muted)]">and what they support.</em></>} lede="The actual source, SQL aggregation and descriptive methods used by the connected service. No statistics are generated to fill empty charts." actions={<a href={docs} target="_blank" rel="noreferrer" className="label inline-flex items-center gap-2 text-[var(--accent)]"><FileText size={14} /> API documentation</a>} meta={<div className="flex flex-wrap gap-2"><Tag tone={dataset ? 'ok' : 'warn'}>{dataset ? `Certified version ${dataset.datasetVersionId}` : 'Published dataset pending'}</Tag><Tag>Historical observations</Tag><Tag>Descriptive OLS</Tag></div>} />
      <div className="mt-6"><LiveDataState loading={catalog.isPending} error={catalog.error} onRetry={() => { void catalog.refetch() }} /></div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-10">
          <DataNote label="Read first">The published record ends in 2024. A descriptive trend is not a future forecast; statistical association does not establish causation. Server-side experiment/session execution, anomaly models and AI-generated tourism insights are unavailable.</DataNote>
          <section><SectionHead title="Dataset dossier" lede="Metadata comes from the published dataset catalog." />{dataset ? <div className="mt-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5"><p className="kicker">{dataset.shortName}</p><h2 className="display mt-2 text-[25px]">{dataset.name}</h2><dl className="mt-4"><KeyValue label="Provider" value={dataset.provider} /><KeyValue label="Period" value={`${dataset.studyPeriod?.start ?? 'Unavailable'} → ${dataset.studyPeriod?.end ?? 'Unavailable'}`} /><KeyValue label="Spatial support" value={dataset.spatialResolution} /><KeyValue label="Temporal support" value={dataset.temporalResolution} /><KeyValue label="Verification" value={dataset.dataVerified ? 'Current-policy reconciled' : 'Unverified'} /></dl><div className="mt-4 flex flex-wrap gap-2">{dataset.availableBands.map((band) => <span key={band} className="rounded-[var(--r-inner)] border border-[var(--line)] px-2 py-1 font-mono text-[10px]">{band}</span>)}</div></div> : <p className="mt-4 text-[13px] text-[var(--muted)]">No certified dataset metadata is available.</p>}</section>
          <section><SectionHead title="Processing chain" lede="Source-preserving backend steps used for the actual readout." /><ol className="mt-4 overflow-hidden border-y border-[var(--line-strong)]">{PIPELINE.map((step, index) => <li key={step.title} className="grid gap-2 border-b border-[var(--line)] px-4 py-4 last:border-0 sm:grid-cols-[40px_110px_1fr]"><span className="label text-[var(--accent)]">{String(index + 1).padStart(2, '0')}</span><h3 className="text-[13px] font-semibold">{step.title}</h3><p className="text-[12px] leading-relaxed text-[var(--muted)]">{step.detail}</p></li>)}</ol></section>
          <section><SectionHead title="Statistical methods" lede="Only methods implemented by the backend are presented as available." /><div className="mt-4 grid gap-5 md:grid-cols-2"><Method title="Descriptive OLS" body="Historical slope per elapsed year, actual Student-t confidence interval/p-value where estimable, and observed versus missing monthly support. Unsupported statistics remain null." /><Method title="Period comparison" body="Two disjoint date periods use the same pinned certified version. Celsius and index percentage changes are not meaningful and remain unavailable. Monthly context requires disjoint source months." /><Method title="Missing data" body="No interpolation or zero filling is performed. Empty selected calendar slots remain null, and observed/contributing cells expose changing support." /><Method title="Unavailable methods" body="Mann-Kendall, Sen slopes, seasonal decomposition, anomaly models, spatial per-cell trends and predictions are not supplied by this API." /></div></section>
          <section><SectionHead title="Interpretation guardrails" lede="These constraints apply to every result and map." /><ol className="mt-4 grid gap-4 sm:grid-cols-2">{LIMITS.map((item) => <li key={item} className="border-t border-[var(--line)] pt-3 text-[12px] leading-relaxed text-[var(--muted)]">{item}</li>)}</ol></section>
          <section><SectionHead title="Connected backend contract" lede="GET routes used for observed-data integration; responses are runtime validated." /><div className="mt-4 overflow-x-auto border-y border-[var(--line-strong)]"><table className="w-full min-w-[590px] text-left text-[11px]"><thead><tr className="border-b border-[var(--line)]"><th className="p-3">Route</th><th className="p-3">Response purpose</th></tr></thead><tbody>{CONTRACT.map(([route, detail]) => <tr key={route} className="border-b border-[var(--line)] last:border-0"><td className="p-3 font-mono">GET {route}</td><td className="p-3 text-[var(--muted)]">{detail}</td></tr>)}</tbody></table></div></section>
        </div>
        <aside className="space-y-7 lg:sticky lg:top-[90px]"><div className="border-t border-[var(--line-strong)] pt-4"><p className="kicker flex items-center gap-2"><ShieldCheck size={14} /> Record status</p><p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">Only a current-policy certified dataset is used for public analysis. No browser credential or operator key is needed.</p></div><div className="border-t border-[var(--line-strong)] pt-4"><p className="kicker flex items-center gap-2"><Database size={14} /> Source indicators</p><div className="mt-3 space-y-3">{catalog.indicators.map((indicator) => <p key={indicator.id} className="text-[11px] leading-relaxed text-[var(--muted)]">{indicator.name}<span className="block text-[var(--faint)]">{environmentalUnit(indicator.unit)} · {indicator.temporal_support.replaceAll('_', ' ')}</span></p>)}</div></div></aside>
      </div>
    </div>
  )
}

function Method({ title, body }: { title: string; body: string }) { return <div className="border-t border-[var(--line-strong)] pt-4"><h3 className="text-[13px] font-semibold">{title}</h3><p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">{body}</p></div> }
