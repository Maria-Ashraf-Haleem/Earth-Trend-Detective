import type { Dataset, Region, Variable } from '@/types'

export const HURGHADA_BOUNDS = {
  west: 32.6,
  south: 26.65,
  east: 34.0,
  north: 27.6,
}

export const hurghadaRegion: Region = {
  id: 'hurghada',
  name: 'Hurghada & Red Sea Corridor',
  country: 'Egypt',
  description:
    'Multi-zone Red Sea tourism and ecological corridor (265 satellite grid cells) spanning Urban Resorts & El Gouna, Natural Red Sea Coast & Islands, Red Sea Mountains & Wadis, and Deep Inland Desert Safari.',
  centroid: [27.175, 33.425],
  bounds: HURGHADA_BOUNDS,
  boundary: {
    type: 'Polygon',
    coordinates: [
      [
        [32.62, 26.67],
        [33.98, 26.67],
        [33.98, 27.58],
        [32.62, 27.58],
        [32.62, 26.67],
      ],
    ],
  },
}

export const regions: Region[] = [
  hurghadaRegion,
  {
    id: 'urban-resorts',
    name: 'El Gouna & Urban Resorts Coast',
    country: 'Egypt',
    description: 'High-density tourism resorts (GHSL built surface > 14,395 m²) exhibiting strong NDVI landscaping growth (+0.0079/decade) that buffers nighttime warming by 41%.',
    centroid: [27.375, 33.625],
    bounds: { west: 33.58, south: 27.1, east: 33.85, north: 27.42 },
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [33.58, 27.1],
          [33.85, 27.1],
          [33.85, 27.42],
          [33.58, 27.42],
          [33.58, 27.1],
        ],
      ],
    },
  },
]

export const datasets: Dataset[] = [
  {
    id: 'mod11a2-061',
    name: 'NASA MODIS (Terra MOD11A2/MOD21C3 & Aqua MYD11A2/MYD21C3) + MOD13Q1 NDVI + GHSL',
    shortName: 'NASA MODIS & GHSL Fusion',
    provider: 'NASA LP DAAC / EOSDIS',
    version: 'V6.1 (133 Granules Processed)',
    spatialResolution: '1 km – 5.6 km Grid',
    temporalResolution: '8-day & Monthly (264 Months)',
    availableBands: ['LST_Day_C_raw', 'LST_Night_C_raw', 'DTR_C', 'NDVI_raw', 'EVI_raw', 'GHSL_Built_m2'],
    studyPeriod: { start: '2003-01-01', end: '2024-12-31' },
    documentationUrl: 'https://lpdaac.usgs.gov/products/mod11a2v061/',
    notes: [
      'Processed from 133 official NASA EOSDIS CSV granules (~9 GB raw observations) spanning 2003–2024.',
      'Combines Terra (10:30 overpass) & Aqua (13:30 overpass) LST with MOD13Q1 vegetation recovery and GHSL built-up surface.',
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
    description: 'NASA MODIS daytime land surface temperature (2003–2024) across Hurghada coastal resorts, wadis, and desert safari zones.',
    scaleFactor: 0.02,
    nativeUnit: '°C',
  },
  {
    id: 'lst-night',
    name: 'Nighttime land surface temperature',
    shortName: 'Nighttime LST',
    unit: '°C',
    datasetId: 'mod11a2-061',
    observationWindow: 'nighttime',
    description: 'NASA MODIS nighttime land surface temperature capturing nocturnal heat retention, resort cooling demand, and coastal warming.',
    scaleFactor: 0.02,
    nativeUnit: '°C',
  },
]

// Real 2003-2024 Monthly Climatology (°C) extracted from NASA MODIS over Hurghada Coast
export const DAY_CLIMATE = [27.48, 30.79, 34.97, 39.34, 43.05, 45.72, 46.97, 46.03, 43.09, 38.79, 33.34, 28.51]
export const NIGHT_CLIMATE = [11.22, 12.72, 15.45, 19.01, 22.92, 26.68, 28.13, 28.13, 25.82, 21.83, 17.11, 12.87]