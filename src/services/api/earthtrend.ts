/** Current environmental integration plus truthful legacy HTTP compatibility. */
import { request } from './client.ts'
import { experimentConfigSchema } from './schemas.ts'
import { environmentApi } from './environment.ts'
import type { AnalysisResults, Experiment, ExperimentConfiguration, ResearchSession, SpatialLayer } from '@/types'
export { environmentApi } from './environment.ts'
export { getErrorMessage } from './client.ts'

// Legacy experiment/session endpoints are explicitly 501 on this backend.
// They have no demo branch or simulated successful result.
export const earthtrendApi = {
  getVariables: environmentApi.getVariables,
  getRegions: environmentApi.getRegions,
  getDatasets: environmentApi.getDatasets,
  createExperiment: (input: ExperimentConfiguration): Promise<Experiment> => request('/api/v1/experiments', {
    method: 'POST', body: JSON.stringify(experimentConfigSchema.parse(input)),
  }),
  getExperiment: (id: string): Promise<Experiment> => request(`/api/v1/experiments/${encodeURIComponent(id)}`),
  runExperiment: (id: string): Promise<Experiment> => request(`/api/v1/experiments/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  getStatus: (id: string): Promise<{ status: Experiment['status']; step: string | null }> => request(`/api/v1/experiments/${encodeURIComponent(id)}/status`),
  getResults: (id: string): Promise<AnalysisResults> => request(`/api/v1/experiments/${encodeURIComponent(id)}/results`),
  getMap: (id: string): Promise<SpatialLayer[]> => request(`/api/v1/experiments/${encodeURIComponent(id)}/map`),
  getInsights: (id: string): Promise<AnalysisResults['insight']> => request(`/api/v1/experiments/${encodeURIComponent(id)}/insights`, { method: 'POST' }),
  createSession: (): Promise<ResearchSession> => request('/api/v1/sessions', { method: 'POST' }),
  listSessions: (): Promise<ResearchSession[]> => request('/api/v1/sessions'),
  exportExperiment: (id: string, format: 'csv' | 'json'): Promise<Blob> => request(`/api/v1/experiments/${encodeURIComponent(id)}/export?format=${format}`, { responseType: 'blob' }),
}
