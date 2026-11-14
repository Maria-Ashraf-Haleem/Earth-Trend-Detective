declare module 'plotly.js-dist-min' {
  const Plotly: unknown
  export default Plotly
}

declare module 'plotly.js/dist/plotly-basic.min.js' {
  const Plotly: unknown
  export default Plotly
}

declare module 'react-plotly.js' {
  import type { ComponentType } from 'react'
  const Plot: ComponentType<{
    data: Record<string, unknown>[]
    layout?: Record<string, unknown>
    config?: Record<string, unknown>
    style?: React.CSSProperties
    onClick?: (event: { points?: { x?: string | number }[] }) => void
  }>
  export default Plot
}
