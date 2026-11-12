import { config } from '@/config'
import { catalog, defaultConfiguration, runAnalysis } from '@/services/mock/analyze'
import { request } from '@/services/api/client'
import { experimentConfigSchema } from '@/services/api/schemas'
import type {
  AnalysisResults,
  Dataset,
  Experiment,
  ExperimentConfiguration,
  Region,
  ResearchSession,
  SpatialLayer,
  Variable,
} from '@/types'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const earthtrendApi = {
  async getVariables(): Promise<Variable[]> {
    if (config.demoMode) return catalog().variables
    return request('/api/v1/variables')
  },
  async getRegions(): Promise<Region[]> {
    if (config.demoMode) return catalog().regions
    return request('/api/v1/regions')
  },
  async getDatasets(): Promise<Dataset[]> {
    if (config.demoMode) return catalog().datasets
    return request('/api/v1/datasets')
  },
  async createExperiment(input: ExperimentConfiguration): Promise<Experiment> {
    const configuration = experimentConfigSchema.parse(input)
    if (config.demoMode) {
      const now = new Date().toISOString()
      return {
        id: crypto.randomUUID(),
        configuration,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        runStartedAt: null,
        runCompletedAt: null,
        progressStep: null,
        progressIndex: -1,
        results: null,
        isDemo: true,
      }
    }
    return request('/api/v1/experiments', {
      method: 'POST',
      body: JSON.stringify(configuration),
    })
  },
  async getExperiment(id: string): Promise<Experiment> {
    return request(`/api/v1/experiments/${id}`)
  },
  async runExperiment(id: string): Promise<Experiment> {
    return request(`/api/v1/experiments/${id}/run`, { method: 'POST' })
  },
  async getStatus(id: string): Promise<{ status: Experiment['status']; step: string | null }> {
    return request(`/api/v1/experiments/${id}/status`)
  },
  async getResults(id: string): Promise<AnalysisResults> {
    return request(`/api/v1/experiments/${id}/results`)
  },
  async getMap(id: string): Promise<SpatialLayer[]> {
    return request(`/api/v1/experiments/${id}/map`)
  },
  async getInsights(id: string): Promise<AnalysisResults['insight']> {
    return request(`/api/v1/experiments/${id}/insights`, { method: 'POST' })
  },
  async createSession(): Promise<ResearchSession> {
    if (config.demoMode) {
      const now = new Date().toISOString()
      return { id: 'local-session', label: 'Local demo session', createdAt: now, lastActiveAt: now }
    }
    return request('/api/v1/sessions', { method: 'POST' })
  },
  async listSessions(): Promise<ResearchSession[]> {
    if (config.demoMode) return [await this.createSession()]
    return request('/api/v1/sessions')
  },
  async exportExperiment(id: string, format: 'csv' | 'json'): Promise<Blob> {
    return request(`/api/v1/experiments/${id}/export?format=${format}`)
  },
  defaultConfiguration,
  analyzeDemo: runAnalysis,
  delay,
}
