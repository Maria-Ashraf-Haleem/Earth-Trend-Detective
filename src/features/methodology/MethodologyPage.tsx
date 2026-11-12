// avoid-ai-design-ignore-file: CP2 "robust" is used only as the statistical term of art
import { DataNote, PageHeader, SectionHead, Tag } from '@/components/common/Primitives'
import { DemoMark } from '@/components/common/Field'
import { datasets, hurghadaRegion } from '@/data/mock/catalog'
import { ANOMALY_METHODS, TREND_METHODS } from '@/data/methods'
import { LIMITATIONS } from '@/data/mock/insights'
import { ArrowUpRight, Database, FileText, ShieldCheck } from 'lucide-react'

const PIPELINE = [
  {
    title: 'Acquire',
    detail:
      'MODIS/Terra MOD11A2 8-day composites intersecting the study polygon are selected for the requested window. The demo builds an equivalent-length monthly series in the browser.',
  },
  {
    title: 'Screen',
    detail:
      'QC bits decide which retrievals survive. The demo simulates all / good / best policies and reports retained, rejected and missing slots so the sample loss stays visible.',
  },
  {
    title: 'Convert',
    detail:
      'Native digital numbers are multiplied by 0.02 to recover Kelvin, then converted to Celsius (K − 273.15). Values are land-masked before aggregation.',
  },
  {
    title: 'Aggregate',
    detail:
      'Valid 8-day slots are averaged into monthly, seasonal (DJF, MAM, JJA, SON) or annual support. The raw monthly series is always retained for re-aggregation.',
  },
  {
    title: 'Estimate',
    detail:
      'Mann–Kendall and Sen’s slope describe monotonic change. STL decomposition and a robust Z-score isolate unusual residuals. Isolation Forest is reserved for the backend.',
  },
  {
    title: 'Interpret',
    detail:
      'Findings are assembled with an evidence rail and an explicit limitations block. No interpretation is shown without the sample size, p-value and quality context beside it.',
  },
]

const CONTRACT = [
  { method: 'GET', path: '/api/v1/datasets', returns: 'Dataset catalogue, bands, version, documentation URL' },
  { method: 'GET', path: '/api/v1/regions', returns: 'Study extents, centroid, GeoJSON boundary' },
  { method: 'GET', path: '/api/v1/variables', returns: 'Variable metadata, native unit, scale factor' },
  { method: 'POST', path: '/api/v1/experiments', returns: 'Created experiment with queued status' },
  { method: 'POST', path: '/api/v1/experiments/{id}/run', returns: 'Run acknowledgement and job id' },
  { method: 'GET', path: '/api/v1/experiments/{id}/status', returns: 'Status plus current pipeline step label' },
  { method: 'GET', path: '/api/v1/experiments/{id}/results', returns: 'Trend, series, anomalies, quality, spatial layers' },
  { method: 'GET', path: '/api/v1/experiments/{id}/map', returns: 'Spatial layers with per-cell values' },
  { method: 'POST', path: '/api/v1/experiments/{id}/insights', returns: 'Evidence-linked interpretation payload' },
]

export function MethodologyPage() {
  const dataset = datasets[0]
  const guideUrl = 'https://lpdaac.usgs.gov/documents/1199/MOD11_User_Guide_V61.pdf'

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader
        eyebrow="08 / Data & method"
        title={
          <>
            What the numbers are — <em className="text-[var(--muted)]">and are not.</em>
          </>
        }
        lede="A transparent record of the instrument, the processing chain and the statistics behind this workspace. In demo mode every value is generated in the browser from an illustrative Hurghada series; nothing here is a NASA observation."
        actions={
          <>
            <ButtonLink href={dataset.documentationUrl} label="Product page" />
            <ButtonLink href={guideUrl} label="User guide" />
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DemoMark />
            <Tag tone="accent">{dataset.shortName}</Tag>
            <Tag tone="neutral">{dataset.version}</Tag>
            <Tag tone="neutral">Synthetic record</Tag>
          </div>
        }
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-10">
          <DataNote label="Read first">
            The charts are internally consistent with the demo statistics, but they are synthetic. Do not cite them as
            MODIS retrievals, do not present them as measured warming, and do not use them for planning decisions.
          </DataNote>

          {/* Dataset dossier */}
          <section aria-labelledby="dossier">
            <SectionHead id="dossier" title="Dataset dossier" lede="The product this interface is designed around." />
            <div className="mt-4 overflow-hidden border-y border-[var(--line-strong)] bg-[var(--surface)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] p-5">
                <div className="max-w-[52ch]">
                  <p className="kicker">Primary record</p>
                  <h3 className="display mt-1.5 text-[28px] leading-none">{dataset.shortName}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">{dataset.name}</p>
                </div>
                <Tag tone="accent">{dataset.version}</Tag>
              </div>

              <dl className="grid px-5 sm:grid-cols-2">
                <Fact label="Provider" value={dataset.provider} />
                <Fact label="Spatial resolution" value={dataset.spatialResolution} />
                <Fact label="Temporal resolution" value={dataset.temporalResolution} />
                <Fact
                  label="Study period"
                  value={`${dataset.studyPeriod.start.slice(0, 4)} – ${dataset.studyPeriod.end.slice(0, 4)}`}
                />
                <Fact label="Study extent" value={`${hurghadaRegion.name}, ${hurghadaRegion.country}`} />
                <Fact label="Analysis unit" value="Land-masked grid cell / month" />
              </dl>

              <div className="border-t border-[var(--line)] px-5 py-4">
                <p className="kicker">Available bands</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dataset.availableBands.map((band) => (
                    <span
                      key={band}
                      className="rounded-[var(--r-inner)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[9.5px] text-[var(--ink-soft)]"
                    >
                      {band}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-[var(--line)] px-5 py-4 text-[10.5px] leading-relaxed text-[var(--faint)]">
                <FileText size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <p>
                  MOD11A2 is an 8-day composite, not a daily snapshot. The demo honours that cadence by treating each
                  month as a sequence of valid slots rather than pretending to have daily observations.
                </p>
              </div>
            </div>
          </section>

          {/* Pipeline */}
          <section aria-labelledby="pipeline">
            <SectionHead
              id="pipeline"
              title="Processing chain"
              lede="The sequence the FastAPI service must reproduce, and the demo approximates."
            />
            <ol className="mt-4 overflow-hidden border-y border-[var(--line-strong)]">
              {PIPELINE.map((step, index) => (
                <li
                  key={step.title}
                  className="grid gap-2 border-b border-[var(--line)] px-4 py-4 transition-colors last:border-0 hover:bg-[var(--surface-2)] sm:grid-cols-[46px_140px_minmax(0,1fr)] sm:gap-4 md:px-5"
                >
                  <span className="label text-[var(--accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-[13px] font-semibold">{step.title}</h3>
                  <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{step.detail}</p>
                </li>
              ))}
            </ol>
            <div className="mt-5 grid border-t border-[var(--line-strong)] sm:grid-cols-3">
              {[
                { label: 'Pairwise', detail: 'Use months with valid slots in both compared periods.' },
                { label: 'Interpolate', detail: 'Fill short gaps linearly; flag the filled points.' },
                { label: 'Drop month', detail: 'Remove incomplete months from the annual support.' },
              ].map((policy, index) => (
                <div
                  key={policy.label}
                  className={`py-3 sm:px-4 ${index > 0 ? 'border-t border-[var(--line)] sm:border-t-0 sm:border-l' : 'sm:pl-0'}`}
                >
                  <p className="kicker">Missing data</p>
                  <p className="mt-1 text-[12px] font-medium">{policy.label}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--muted)]">{policy.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Statistics */}
          <section aria-labelledby="statistics">
            <SectionHead
              id="statistics"
              title="Statistical methods"
              lede="Estimates are reported with uncertainty and a visible test decision."
            />

            <div className="mt-5 grid gap-8 md:grid-cols-2">
              <div className="border-t border-[var(--line-strong)] pt-4">
                <p className="kicker text-[var(--accent)]">Trend</p>
                <div className="mt-3 space-y-4">
                  {TREND_METHODS.map((method) => (
                    <div key={method.id}>
                      <h3 className="text-[12.5px] font-semibold">{method.name}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{method.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-[var(--line-strong)] pt-4">
                <p className="kicker text-[var(--violet)]">Anomaly &amp; decomposition</p>
                <div className="mt-3 space-y-4">
                  {ANOMALY_METHODS.map((method) => (
                    <div key={method.id}>
                      <h3 className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
                        {method.name}
                        {method.id === 'isolation_forest' ? <Tag tone="violet">Backend only</Tag> : null}
                      </h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{method.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 border-y border-[var(--line-strong)] bg-[var(--surface-2)] p-4">
              <p className="kicker text-[var(--ink)]">Estimators used in the demo</p>
              <div className="mt-2 grid gap-2 font-mono text-[10.5px] leading-relaxed text-[var(--ink-soft)] sm:grid-cols-2">
                <p>Sen’s slope: β = median[(xⱼ − xᵢ) / (j − i)] for all i &lt; j</p>
                <p>Mann–Kendall: S = Σ sgn(xⱼ − xᵢ), normal-approximated Z</p>
                <p>Robust score: 0.6745 × residual / MAD, flagged at |z| ≥ 2.5</p>
                <p>Significance: two-sided α = 0.05 on the illustrative sample</p>
              </div>
            </div>
          </section>

          {/* Limitations */}
          <section aria-labelledby="limitations">
            <SectionHead
              id="limitations"
              title="Interpretation guardrails"
              lede="These constraints travel with every finding in the workspace."
            />
            <ol className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {LIMITATIONS.map((item) => (
                <li key={item} className="flex gap-3 border-t border-[var(--line)] pt-3">
                  <span className="mt-[8px] block h-px w-3 shrink-0 bg-[var(--line-strong)]" aria-hidden />
                  <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{item}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Backend contract */}
          <section aria-labelledby="contract">
            <SectionHead
              id="contract"
              title="Backend contract"
              lede="With demo mode off, the interface calls these routes and expects the shapes in src/types."
            />
            <div className="mt-4 overflow-x-auto border-y border-[var(--line-strong)]">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="label px-4 py-2.5 text-[var(--faint)]">Method</th>
                    <th className="label px-4 py-2.5 text-[var(--faint)]">Path</th>
                    <th className="label px-4 py-2.5 text-[var(--faint)]">Expected payload</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTRACT.map((row) => (
                    // avoid-ai-design-ignore: SD4m HTTP method and path are literal API identifiers
                    <tr key={row.path} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
                      <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--accent)]">{row.method}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--ink)]">{row.path}</td>
                      <td className="px-4 py-2.5 text-[10.5px] text-[var(--muted)]">{row.returns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--faint)]">
              Set <span className="font-mono">VITE_DEMO_MODE=false</span> and{' '}
              <span className="font-mono">VITE_API_BASE_URL</span> to point the client at a live service. Requests are
              validated with Zod before they leave the browser.
            </p>
          </section>
        </div>

        {/* Rail */}
        <aside className="space-y-8 lg:sticky lg:top-[calc(var(--shell-offset,146px)+20px)]">
          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-[var(--ok)]" />
              <p className="kicker text-[var(--ink)]">Record status</p>
            </div>
            <p className="mt-2 font-display text-[19px]">Illustrative demo</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
              No granule download, no atmospheric correction, no published retrieval. The pipeline is represented
              faithfully; the numbers are not.
            </p>
            <div className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
              <RailRow label="Dataset" value={dataset.shortName} />
              <RailRow label="Version" value={dataset.version} />
              <RailRow label="Currency" value="Edited 2026" />
              <RailRow label="Data origin" value="Synthetic" />
              <RailRow label="Cite as" value="Not citable" />
            </div>
          </div>

          <div className="border-l-2 border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] py-3 pr-3 pl-4">
            <p className="kicker text-[var(--warn)]">What would change</p>
            <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-[var(--muted)]">
              <li>Real granules would replace the synthetic monthly series.</li>
              <li>QC and land-mask rules would come from the product’s bit fields.</li>
              <li>Trend estimates would be computed server-side with audited code.</li>
              <li>Citation and provenance metadata would be attached to every export.</li>
            </ul>
          </div>

          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center gap-2">
              <Database size={13} className="text-[var(--faint)]" />
              <p className="kicker text-[var(--ink)]">Official references</p>
            </div>
            <div className="mt-2">
              <ReferenceLink href={dataset.documentationUrl} label="NASA LP DAAC, MOD11A2 V6.1" />
              <ReferenceLink href={guideUrl} label="MOD11 User Guide V6.1 (PDF)" />
              <ReferenceLink href="https://www.earthdata.nasa.gov/" label="NASA Earthdata" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ButtonLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-10 items-center gap-1.5 rounded-[var(--r-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[12px] font-medium text-[var(--ink)] transition-[border-color,color] duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {label} <ArrowUpRight size={12} />
    </a>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--line)] py-3 sm:odd:pr-4 sm:even:border-l sm:even:pl-4">
      <dt className="label text-[var(--faint)]">{label}</dt>
      <dd className="mt-1 text-[12px] text-[var(--ink)]">{value}</dd>
    </div>
  )
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] text-[var(--faint)]">{label}</span>
      <span className="text-right text-[10px] text-[var(--ink-soft)]">{value}</span>
    </div>
  )
}

function ReferenceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-start justify-between gap-2 border-b border-[var(--line)] py-2 text-[11px] leading-snug text-[var(--muted)] transition-colors last:border-0 last:pb-0 hover:text-[var(--ink)]"
    >
      {label}
      <ArrowUpRight size={12} className="mt-0.5 shrink-0" />
    </a>
  )
}
