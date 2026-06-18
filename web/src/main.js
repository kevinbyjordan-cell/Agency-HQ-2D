import { connect } from './ws.js'
import { render } from './render.js'

const stage = document.getElementById('stage')
connect((state) => render(state, stage))
