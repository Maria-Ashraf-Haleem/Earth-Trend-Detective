export const config = {
  demoMode: import.meta.env.VITE_DEMO_MODE !== 'false',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  persistenceKey: 'earthtrend-lab.v2',
} as const

export const RUN_STEPS = [
  {
    label: 'Preparing dataset',
    detail: 'Resolving the region extent, dataset version and requested observation window.',
  },
  {
    label: 'Applying quality control',
    detail: 'Flagging uncertain and rejected retrievals against the selected QC policy.',
  },
  {
    label: 'Aggregating observations',
    detail: 'Building the monthly, seasonal or annual analysis series.',
  },
  {
    label: 'Running trend analysis',
    // avoid-ai-design-ignore: CP2 "robust" names the estimator's statistical property
    detail: 'Computing Mann–Kendall statistics and the robust Sen’s slope estimate.',
  },
  {
    label: 'Detecting anomalies',
    detail: 'Decomposing the series and scoring residuals for unusual observations.',
  },
  {
    label: 'Preparing results',
    detail: 'Assembling metrics, spatial fields and evidence-linked interpretation.',
  },
] as const

export const RUN_STEP_LABELS = RUN_STEPS.map((step) => step.label)
