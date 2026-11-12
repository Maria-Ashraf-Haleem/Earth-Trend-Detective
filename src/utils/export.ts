import { downloadTextFile } from '@/utils/format'
import type { Experiment } from '@/types'

export function exportExperimentJson(experiment: Experiment) {
  downloadTextFile(
    `${slug(experiment.configuration.name)}.json`,
    'application/json',
    JSON.stringify(
      {
        disclaimer: 'Illustrative frontend export. Not NASA Earth observation products.',
        experiment,
      },
      null,
      2,
    ),
  )
}

export function exportExperimentCsv(experiment: Experiment) {
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
