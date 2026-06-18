import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { renderDashboard } from './dashboard.js'
import { initCamera } from './camera.js'
import { renderMemory } from './memory.js'
import { renderMarkdown } from './markdown.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="mc">' +
  '<aside class="mc__nav">' +
  '<div class="mc__brand">Agency HQ</div>' +
  '<button class="mc__tab mc__tab--active" data-tab="office">Office</button>' +
  '<button class="mc__tab" data-tab="dashboard">Dashboard</button>' +
  '<button class="mc__tab" data-tab="memory">Memory</button>' +
  '</aside>' +
  '<main class="mc__content">' +
  '<section class="mc__view" data-view="office"><div class="viewport"><div class="camera"><div class="building"></div></div></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="dashboard"><div class="dashboard"></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="memory"><div class="memory"></div></section>' +
  '</main>' +
  '</div>'

const buildingEl = stage.querySelector('.building')
const dashboardEl = stage.querySelector('.dashboard')
const memoryEl = stage.querySelector('.memory')
const viewport = stage.querySelector('.viewport')
const camera = stage.querySelector('.camera')
initCamera(viewport, camera)

let latest = { building: { rooms: [] }, dashboard: null }
let tab = 'office'
let memoryState = { files: [], selected: null }

async function loadMemoryIndex() {
  try {
    const res = await fetch('/api/memory')
    const data = await res.json()
    memoryState = { files: data.files || [], selected: memoryState.selected }
  } catch {
    memoryState = { files: [], selected: null }
  }
  if (tab === 'memory') renderMemory(memoryState, memoryEl)
}

async function openMemoryFile(id) {
  const file = memoryState.files.find((f) => f.id === id)
  memoryState.selected = { id, name: file ? file.name : id, html: '<p>Carregando…</p>' }
  renderMemory(memoryState, memoryEl)
  try {
    const res = await fetch('/api/memory/content?id=' + encodeURIComponent(id))
    const data = await res.json()
    memoryState.selected = { id, name: data.file ? data.file.name : (file ? file.name : id), html: renderMarkdown(data.content || '') }
  } catch {
    memoryState.selected = { id, name: file ? file.name : id, html: '<p>Erro ao carregar.</p>' }
  }
  renderMemory(memoryState, memoryEl)
}

memoryEl.addEventListener('click', (ev) => {
  const item = ev.target.closest('[data-mem-id]')
  if (item) openMemoryFile(item.getAttribute('data-mem-id'))
})

function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else if (tab === 'dashboard') renderDashboard(latest.dashboard, dashboardEl)
  else if (tab === 'memory') renderMemory(memoryState, memoryEl)
}

for (const btn of stage.querySelectorAll('.mc__tab')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.mc__tab')) b.classList.toggle('mc__tab--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    if (tab === 'memory') loadMemoryIndex()
    else renderActive()
  })
}

connect((msg) => {
  latest = msg
  renderActive()
})
