import type { Dataset, Region, Variable } from '@/types'

export const HURGHADA_BOUNDS = {
  west: 33.62,
  south: 26.98,
  east: 33.98,
  north: 27.42,
}

export const hurghadaRegion: Region = {
  id: 'hurghada',
  name: 'Hurghada',
  country: 'Egypt',
  description:
    'Red Sea coastal city and tourism corridor. The study extent covers the urban shoreline, adjacent desert, and nearshore land used in the featured case study.',
  centroid: [27.2579, 33.8116],
  bounds: HURGHADA_BOUNDS,
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [33.68, 27.05],
        [33.93, 27.05],
        [33.96, 27.18],
        [33.94, 27.32],
        [33.86, 27.4],
        [33.72, 27.38],
        [33.64, 27.24],
        [33.66, 27.12],
        [33.68, 27.05],
      ],
    ],
  },
}

export const regions: Region[] = [
  hurghadaRegion,
  {
    id: 'safaga',
    name: 'Safaga',
    country: 'Egypt',
    description: 'Secondary Red Sea comparison extent south of Hurghada. Illustrative only.',
    centroid: [26.749, 33.938],
    bounds: { west: 33.8, south: 26.62, east: 34.05, north: 26.9 },
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [33.84, 26.66],
          [34.02, 26.66],
          [34.03, 26.86],
          [33.86, 26.88],
          [33.84, 26.66],
        ],
      ],
    },
  },
]

export const datasets: Dataset[] = [
  {
    id: 'mod11a2-061',
    name: 'MODIS/Terra Land Surface Temperature and Emissivity 8-Day L3 Global 1 km',
    shortName: 'MODIS MOD11A2',
    provider: 'NASA LP DAAC',
    version: 'V6.1',
    spatialResolution: '≈ 1 km',
    temporalResolution: '8-day composite',
    availableBands: ['LST_Day_1km', 'LST_Night_1km', 'QC_Day', 'QC_Night', 'Emis_31', 'Emis_32'],
    studyPeriod: { start: '2003-01-01', end: '2024-12-31' },
    documentationUrl: 'https://lpdaac.usgs.gov/products/mod11a2v061/',
    notes: [
      'Values in this application are illustrative until a backend is connected.',
      'MOD11A2 is an 8-day composite, not a daily snapshot.',
    ],
  },
]

export const variables: Variable[] = [
  {
    id: 'lst-day',
    name: 'Daytime land surface temperature',
    shortName: 'Daytime LST',
    unit: '°C',
    datasetId: 'mod11a2-061',
    observationWindow: 'daytime',
    description: 'Terra MODIS daytime LST converted from Kelvin after the documented scale factor.',
    scaleFactor: 0.02,
    nativeUnit: 'K',
  },
  {
    id: 'lst-night',
    name: 'Nighttime land surface temperature',
    shortName: 'Nighttime LST',
    unit: '°C',
    datasetId: 'mod11a2-061',
    observationWindow: 'nighttime',
    description: 'Terra MODIS nighttime LST converted from Kelvin after the documented scale factor.',
    scaleFactor: 0.02,
    nativeUnit: 'K',
  },
]

export const DAY_CLIMATE = [22.4, 23.1, 26.8, 31.6, 36.8, 40.9, 43.7, 43.4, 39.8, 34.2, 28.1, 24.0]
export const NIGHT_CLIMATE = [12.8, 13.6, 16.4, 20.2, 24.4, 27.6, 29.8, 29.5, 26.9, 22.8, 17.9, 14.2]
