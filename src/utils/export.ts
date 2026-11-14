import { downloadTextFile } from '@/utils/format'
import type { Experiment } from '@/types'

export function exportExperimentJson(experiment: Experiment) {
  downloadTextFile(
    `${slug(experiment.configuration.name)}.json`,
    'application/json',
    JSON.stringify(
      {
        disclaimer: experiment.source === 'api' ? 'Browser copy of a real descriptive API response; not a forecast or raw satellite product.' : 'Explicit legacy demo export; not observed data.',
        experiment,
      },
      null,
      2,
    ),
  )
}

export function exportExperimentCsv(experiment: Experiment) {
  if (experiment.source === 'api' && experiment.liveResult) {
    const result = experiment.liveResult
    const rows = [
      `# Real descriptive API response; version ${result.dataset_version_id}; indicator ${result.indicator}; unit ${result.unit}`,
      '# Missing values are blank. Counts describe source support, not independent daily samples.',
      'date,value,observed_cells,contributing_cells,source_rows',
      ...result.series.map(point => [point.date, point.value ?? '', point.observed_cells,
        point.contributing_cells, point.source_rows].join(',')),
    ]
    downloadTextFile(`${slug(experiment.configuration.name)}.csv`, 'text/csv;charset=utf-8', rows.join('\n'))
    return
  }
  const series = experiment.results?.series ?? []
  const rows = [
    '# Illustrative frontend export. Not NASA Earth observation products.',
    'date,value,expected,trend,seasonal,qualityFlag,isAnomaly',
    ...series.map((point) =>
      [
        point.date,
        point.value ?? '',
        point.expected ?? '',
        point.trend ?? '',
        point.seasonal ?? '',
        point.qualityFlag,
        point.isAnomaly ? '1' : '0',
      ].join(','),
    ),
  ]
  downloadTextFile(`${slug(experiment.configuration.name)}.csv`, 'text/csv;charset=utf-8', rows.join('\n'))
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'experiment'
}
