// Access is guarded so read-only client tests can run directly in Node as well as Vite.
const env = import.meta.env ?? {} as Partial<ImportMetaEnv>
export const config = {
  demoMode: env.VITE_DEMO_MODE === 'true',
  apiBaseUrl: env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000',
  persistenceKey: 'earthtrend-live.v1',
} as const

// These are actual service stages; no simulated progress or unsupported statistics.
export const RUN_STEPS = [
  { label: 'Requesting observed data', detail: 'Loading the selected certified dataset and historical interval.' },
  { label: 'Aggregating observations', detail: 'The service computes source-month and cell support from SQL data.' },
  { label: 'Preparing descriptive results', detail: 'Rendering the returned monthly values and exploratory OLS statistics.' },
] as const
export const RUN_STEP_LABELS = RUN_STEPS.map((step) => step.label)
