import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { initCamera } from './camera.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="viewport"><div class="camera"><div class="building"></div></div></div>'

const viewport = stage.querySelector('.viewport')
const camera = stage.querySelector('.camera')
const building = stage.querySelector('.building')

initCamera(viewport, camera)
connect((b) => renderBuilding(b, building))
