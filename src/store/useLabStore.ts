import { config } from '@/config'
import { environmentApi, getErrorMessage } from '@/services/api/earthtrend'
import type { Experiment, ExperimentConfiguration, ObservationWindow } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export function defaultLiveConfiguration(): ExperimentConfiguration {
  return { name: 'Hurghada environmental analysis', regionId: '', datasetId: '', variableId: '',
    startDate: '2022-01-01', endDate: '2022-12-31', aggregation: 'monthly',
    observationWindow: 'daytime', qualityFilter: 'good', minValidRatio: 0.7,
    missingDataHandling: 'pairwise', trendMethods: ['linear_regression'], anomalyMethods: [] }
}
let activeRequest: AbortController | null = null
interface LabState {
  draft: ExperimentConfiguration
  experiments: Experiment[]
  activeId: string | null
  compareIds: string[]
  selectedAnomalyId: string | null
  explorerWindow: ObservationWindow
  explorerAggregation: ExperimentConfiguration['aggregation']
  mapLayer: 'mean_temperature' | 'trend'
  toast: string | null
  setDraft: (patch: Partial<ExperimentConfiguration>) => void
  resetDraft: () => void
  setExplorerWindow: (window: ObservationWindow) => void
  setExplorerAggregation: (aggregation: ExperimentConfiguration['aggregation']) => void
  setMapLayer: (layer: 'mean_temperature' | 'trend') => void
  setSelectedAnomaly: (id: string | null) => void
  setCompareIds: (ids: string[]) => void
  toggleCompare: (id: string) => void
  setToast: (message: string | null) => void
  runDraft: (context?: Experiment['context']) => Promise<string>
  cancelRun: () => void
  saveActive: () => void
  openExperiment: (id: string) => void
  duplicateExperiment: (id: string) => void
  deleteExperiment: (id: string) => void
  resetWorkspace: () => void
  active: () => Experiment | undefined
}
export const useLabStore = create<LabState>()(persist((set, get) => ({
  draft: defaultLiveConfiguration(), experiments: [], activeId: null, compareIds: [],
  selectedAnomalyId: null, explorerWindow: 'daytime', explorerAggregation: 'monthly',
  mapLayer: 'mean_temperature', toast: null,
  setDraft: patch => set({ draft: { ...get().draft, ...patch } }),
  resetDraft: () => set({ draft: defaultLiveConfiguration(), toast: 'Analysis configuration reset' }),
  setExplorerWindow: explorerWindow => set({ explorerWindow }),
  setExplorerAggregation: explorerAggregation => set({ explorerAggregation }),
  setMapLayer: mapLayer => set({ mapLayer }),
  setSelectedAnomaly: selectedAnomalyId => set({ selectedAnomalyId }),
  setCompareIds: compareIds => set({ compareIds }),
  toggleCompare: id => set({ compareIds: get().compareIds.includes(id)
    ? get().compareIds.filter(item => item !== id) : [...get().compareIds, id] }),
  setToast: toast => set({ toast }),
  active: () => get().experiments.find(item => item.id === get().activeId),
  openExperiment: id => {
    const record = get().experiments.find(item => item.id === id)
    if (record?.source === 'api') set({ activeId: id, draft: record.configuration, selectedAnomalyId: null })
  },
  duplicateExperiment: id => {
    const record = get().experiments.find(item => item.id === id)
    if (record) set({ draft: { ...record.configuration, name: `${record.configuration.name}, copy` },
      toast: 'Configuration copied. Run it to request a new real analysis.' })
  },
  deleteExperiment: id => set({ experiments: get().experiments.filter(item => item.id !== id),
    compareIds: get().compareIds.filter(item => item !== id),
    activeId: get().activeId === id ? null : get().activeId, toast: 'Local result removed from this browser' }),
  resetWorkspace: () => {
    activeRequest?.abort()
    set({ experiments: [], draft: defaultLiveConfiguration(), activeId: null, compareIds: [],
      selectedAnomalyId: null, toast: 'Local workspace cleared. Server data is unchanged.' })
  },
  saveActive: () => set({ toast: 'API response retained in this browser only; no server analysis was saved.' }),
  cancelRun: () => activeRequest?.abort(),
  runDraft: async context => {
    if (activeRequest) throw new Error('An analysis is already running. Wait or cancel it first.')
    const configuration = { ...get().draft }
    if (!configuration.regionId || !configuration.variableId || !configuration.datasetVersionId)
      throw new Error('Select a published dataset, region and indicator before analyzing.')
    if (!configuration.startDate || !configuration.endDate || configuration.startDate > configuration.endDate)
      throw new Error('Enter a valid historical date range.')
    if (configuration.aggregation !== 'monthly' || configuration.missingDataHandling !== 'pairwise'
      || configuration.anomalyMethods.length || configuration.trendMethods.join() !== 'linear_regression')
      throw new Error('Only monthly descriptive OLS with missing values preserved is available.')
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const record: Experiment = { id, configuration, status: 'running', createdAt: now,
      updatedAt: now, runStartedAt: now, runCompletedAt: null, progressStep: 'Waiting for SQL-backed analysis',
      progressIndex: 0, results: null, isDemo: false, source: 'api', context }
    set({ experiments: [record, ...get().experiments].slice(0, 10), activeId: id, selectedAnomalyId: null })
    const controller = new AbortController()
    activeRequest = controller
    try {
      const liveResult = await environmentApi.getTrend({ region_id: configuration.regionId,
        indicator: configuration.variableId, start_date: configuration.startDate,
        end_date: configuration.endDate, dataset_version_id: configuration.datasetVersionId,
        ...configuration.bounds,
        ...(configuration.cellId ? { cell_id: configuration.cellId } : {}) }, { signal: controller.signal })
      if (controller.signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError')
      const completedAt = new Date().toISOString()
      set({ experiments: get().experiments.map(item => item.id === id ? { ...item,
        liveResult, status: 'completed', progressStep: 'API response received', progressIndex: 1,
        runCompletedAt: completedAt, updatedAt: completedAt } : item),
        toast: liveResult.availability === 'unavailable' ? 'No observations in the selected range.' : 'Real environmental analysis received.' })
      return id
    } catch (error) {
      const message = controller.signal.aborted ? 'Analysis cancelled.' : getErrorMessage(error)
      set({ experiments: get().experiments.map(item => item.id === id ? { ...item, status: 'failed',
        error: message, progressStep: 'Request stopped', updatedAt: new Date().toISOString() } : item), toast: message })
      throw error
    } finally {
      if (activeRequest === controller) activeRequest = null
    }
  },
}), {
  // Old demo storage is intentionally left untouched and never hydrated as live data.
  name: `${config.persistenceKey}.analyses.v1`, version: 1,
  partialize: state => ({ draft: state.draft, activeId: state.activeId,
    experiments: state.experiments.filter(item => item.source === 'api' && item.status === 'completed' && item.liveResult).slice(0, 10) }),
}))
