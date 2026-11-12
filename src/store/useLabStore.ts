import { config, RUN_STEPS } from '@/config'
import { defaultConfiguration, runAnalysis } from '@/services/mock/analyze'
import { earthtrendApi } from '@/services/api/earthtrend'
import type { Experiment, ExperimentConfiguration, ObservationWindow } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function seedRun(
  id: string,
  createdAt: string,
  patch: Partial<ExperimentConfiguration>,
): Experiment {
  const configuration = { ...defaultConfiguration(), ...patch }
  return {
    id,
    configuration,
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    runStartedAt: createdAt,
    runCompletedAt: createdAt,
    progressStep: 'Complete',
    progressIndex: RUN_STEPS.length,
    results: runAnalysis(id, configuration),
    isDemo: true,
  }
}

function seedExperiments(): Experiment[] {
  return [
    seedRun('demo-hurghada-day-0326', '2026-03-12T09:20:00.000Z', {
      name: 'Hurghada daytime LST, full record',
      observationWindow: 'daytime',
      variableId: 'lst-day',
      startDate: '2003-01-01',
      endDate: '2024-12-31',
      aggregation: 'monthly',
      qualityFilter: 'good',
    }),
    seedRun('demo-hurghada-night-0326', '2026-03-10T14:05:00.000Z', {
      name: 'Hurghada nighttime LST, full record',
      observationWindow: 'nighttime',
      variableId: 'lst-night',
      startDate: '2003-01-01',
      endDate: '2024-12-31',
      aggregation: 'monthly',
      qualityFilter: 'good',
    }),
    seedRun('demo-hurghada-day-decadal', '2026-03-07T11:40:00.000Z', {
      name: 'Hurghada daytime, decadal check',
      observationWindow: 'daytime',
      variableId: 'lst-day',
      startDate: '2014-01-01',
      endDate: '2024-12-31',
      aggregation: 'annual',
      qualityFilter: 'best',
    }),
  ]
}

function cloneExperiment(experiment: Experiment, name: string): Experiment {
  const now = new Date().toISOString()
  return {
    ...experiment,
    id: crypto.randomUUID(),
    configuration: { ...experiment.configuration, name },
    createdAt: now,
    updatedAt: now,
    status: experiment.results ? 'completed' : 'draft',
    isDemo: true,
  }
}

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
  runDraft: () => Promise<string>
  saveActive: () => void
  openExperiment: (id: string) => void
  duplicateExperiment: (id: string) => void
  deleteExperiment: (id: string) => void
  resetWorkspace: () => void
  active: () => Experiment | undefined
}

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      draft: defaultConfiguration(),
      experiments: seedExperiments(),
      activeId: 'demo-hurghada-day-0326',
      compareIds: ['demo-hurghada-day-0326', 'demo-hurghada-night-0326'],
      selectedAnomalyId: null,
      explorerWindow: 'daytime',
      explorerAggregation: 'monthly',
      mapLayer: 'mean_temperature',
      toast: null,
      setDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
      resetDraft: () => set({ draft: defaultConfiguration(), toast: 'Study configuration reset' }),
      setExplorerWindow: (explorerWindow) =>
        set({
          explorerWindow,
          draft: {
            ...get().draft,
            observationWindow: explorerWindow,
            variableId: explorerWindow === 'daytime' ? 'lst-day' : 'lst-night',
          },
        }),
      setExplorerAggregation: (explorerAggregation) =>
        set({ explorerAggregation, draft: { ...get().draft, aggregation: explorerAggregation } }),
      setMapLayer: (mapLayer) => set({ mapLayer }),
      setSelectedAnomaly: (selectedAnomalyId) => set({ selectedAnomalyId }),
      setCompareIds: (compareIds) => set({ compareIds }),
      toggleCompare: (id) => {
        const current = get().compareIds
        set({ compareIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] })
      },
      setToast: (toast) => set({ toast }),
      active: () => get().experiments.find((item) => item.id === get().activeId),
      openExperiment: (id) => {
        const experiment = get().experiments.find((item) => item.id === id)
        if (!experiment) return
        set({
          activeId: id,
          draft: experiment.configuration,
          explorerWindow: experiment.configuration.observationWindow,
          selectedAnomalyId: null,
        })
      },
      duplicateExperiment: (id) => {
        const experiment = get().experiments.find((item) => item.id === id)
        if (!experiment) return
        const copy = cloneExperiment(experiment, `${experiment.configuration.name}, copy`)
        set({ experiments: [copy, ...get().experiments], toast: 'Experiment duplicated' })
      },
      deleteExperiment: (id) => {
        const remaining = get().experiments.filter((item) => item.id !== id)
        set({
          experiments: remaining,
          compareIds: get().compareIds.filter((item) => item !== id),
          activeId: get().activeId === id ? (remaining[0]?.id ?? null) : get().activeId,
          toast: 'Experiment deleted',
        })
      },
      resetWorkspace: () => {
        set({
          experiments: seedExperiments(),
          draft: defaultConfiguration(),
          activeId: 'demo-hurghada-day-0326',
          compareIds: ['demo-hurghada-day-0326', 'demo-hurghada-night-0326'],
          selectedAnomalyId: null,
          toast: 'Demo workspace restored',
        })
      },
      saveActive: () => {
        const active = get().active()
        if (!active) {
          set({ toast: 'Run an experiment before saving' })
          return
        }
        set({
          experiments: get().experiments.map((item) =>
            item.id === active.id ? { ...item, updatedAt: new Date().toISOString() } : item,
          ),
          toast: 'Experiment saved to this browser',
        })
      },
      runDraft: async () => {
        const created = await earthtrendApi.createExperiment(get().draft)
        created.status = 'running'
        created.runStartedAt = new Date().toISOString()
        set({ experiments: [created, ...get().experiments], activeId: created.id, selectedAnomalyId: null })

        for (let index = 0; index < RUN_STEPS.length; index += 1) {
          await earthtrendApi.delay(560)
          set({
            experiments: get().experiments.map((item) =>
              item.id === created.id
                ? {
                    ...item,
                    progressIndex: index,
                    progressStep: RUN_STEPS[index].label,
                    updatedAt: new Date().toISOString(),
                  }
                : item,
            ),
          })
        }

        await earthtrendApi.delay(420)
        const results = earthtrendApi.analyzeDemo(created.id, created.configuration)
        const completedAt = new Date().toISOString()
        set({
          experiments: get().experiments.map((item) =>
            item.id === created.id
              ? {
                  ...item,
                  status: 'completed',
                  results,
                  progressIndex: RUN_STEPS.length,
                  progressStep: 'Complete',
                  runCompletedAt: completedAt,
                  updatedAt: completedAt,
                }
              : item,
          ),
          toast: 'Illustrative analysis complete',
        })
        return created.id
      },
    }),
    {
      name: `${config.persistenceKey}.lab`,
      partialize: (state) => ({
        experiments: state.experiments,
        draft: state.draft,
        activeId: state.activeId,
        compareIds: state.compareIds,
        explorerWindow: state.explorerWindow,
        explorerAggregation: state.explorerAggregation,
      }),
    },
  ),
)
