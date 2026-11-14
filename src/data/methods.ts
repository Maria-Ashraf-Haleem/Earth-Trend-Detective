export const TREND_METHODS = [
  {
    id: 'mann_kendall' as const,
    name: 'Mann–Kendall',
    short: 'Non-parametric monotonic trend test.',
    detail: 'Evaluates whether a series tends to increase or decrease without assuming normality.',
  },
  {
    id: 'sens_slope' as const,
    name: 'Sen’s slope',
    short: 'Robust linear rate of change.',
    detail: 'Median of pairwise slopes. Reported in °C per year on the MODIS & GHSL SERIES.',
  },
  {
    id: 'seasonal_mann_kendall' as const,
    name: 'Seasonal Mann–Kendall',
    short: 'Trend test that respects month seasonality.',
    detail: 'Applies Mann–Kendall within months, then summarizes. Useful when the seasonal cycle is strong.',
  },
  {
    id: 'linear_regression' as const,
    name: 'Linear regression',
    short: 'Ordinary least-squares slope.',
    detail: 'Shown as a comparison line only. Sensitive to outliers relative to Sen’s slope.',
  },
]

export const ANOMALY_METHODS = [
  {
    id: 'stl' as const,
    name: 'STL decomposition',
    short: 'Separates trend, seasonal, and remainder.',
    detail: 'In demo mode, seasonality is monthly climatology plus a linear trend remainder.',
  },
  {
    id: 'robust_zscore' as const,
    name: 'Robust Z-score',
    short: 'Flags large residuals using MAD.',
    detail: 'Anomaly if |0.6745 × residual / MAD| ≥ 2.5 on the illustrative remainder.',
  },
  {
    id: 'isolation_forest' as const,
    name: 'Isolation Forest',
    short: 'Optional multivariate outlier model.',
    detail: 'Not executed in the frontend demo. Reserved for the FastAPI service.',
  },
]
