import createPlotlyComponent from 'react-plotly.js/factory'
import Plotly from 'plotly.js/dist/plotly-basic.min.js'

// The existing locked Plotly peer supplies the official basic bundle. All
// workspace charts use Cartesian scatter lines/markers, supported by this bundle.
// Loading the full default bundle also loaded unused WebGL, map and 3D engines.
export default createPlotlyComponent(Plotly)
