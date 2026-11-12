import { z } from 'zod'

export const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  description: z.string(),
  centroid: z.tuple([z.number(), z.number()]),
  bounds: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }),
  boundary: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()))),
  }),
})

export const experimentConfigSchema = z.object({
  name: z.string().min(1),
  regionId: z.string(),
  datasetId: z.string(),
  variableId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  aggregation: z.enum(['monthly', 'seasonal', 'annual']),
  observationWindow: z.enum(['daytime', 'nighttime']),
  qualityFilter: z.enum(['all', 'good', 'best']),
  minValidRatio: z.number().min(0).max(1),
  missingDataHandling: z.enum(['pairwise', 'interpolate', 'drop_month']),
  trendMethods: z.array(z.enum(['mann_kendall', 'sens_slope', 'seasonal_mann_kendall', 'linear_regression'])),
  anomalyMethods: z.array(z.enum(['stl', 'robust_zscore', 'isolation_forest'])),
})

export type ExperimentConfigInput = z.infer<typeof experimentConfigSchema>
