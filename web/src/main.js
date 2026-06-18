import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { renderDashboard } from './dashboard.js'
import { initCamera } from './camera.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="mc">' +
  '<aside class="mc__nav">' +
  '<div class="mc__brand">Agency HQ</div>' +
  '<button class="mc__tab mc__tab--active" data-tab="office">Office</button>' +
  '<button class="mc__tab" data-tab="dashboard">Dashboard</button>' +
  '</aside>' +
  '<main class="mc__content">' +
  '<section class="mc__view" data-view="office"><div class="viewport"><div class="camera"><div class="building"></div></div></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="dashboard"><div class="dashboard"></div></section>' +
  '</main>' +
  '</div>'

const buildingEl = stage.querySelector('.building')
const dashboardEl = stage.querySelector('.dashboard')
const viewport = stage.querySelector('.viewport')
const camera = stage.querySelector('.camera')
initCamera(viewport, camera)

let latest = { building: { rooms: [] }, dashboard: null }
let tab = 'office'

function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else renderDashboard(latest.dashboard, dashboardEl)
}

for (const btn of stage.querySelectorAll('.mc__tab')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.mc__tab')) b.classList.toggle('mc__tab--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    renderActive()
  })
}

connect((msg) => {
  latest = msg
  renderActive()
})
