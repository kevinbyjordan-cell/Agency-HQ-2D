import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { renderDashboard } from './dashboard.js'
import { initCamera } from './camera.js'
import { renderMemory } from './memory.js'
import { renderMarkdown } from './markdown.js'
import { renderSessions } from './sessions.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="mc">' +
  '<aside class="mc__nav">' +
  '<div class="mc__brand">Agency HQ</div>' +
  '<button class="mc__tab mc__tab--active" data-tab="office">Office</button>' +
  '<button class="mc__tab" data-tab="dashboard">Dashboard</button>' +
  '<button class="mc__tab" data-tab="memory">Memory</button>' +
  '<button class="mc__tab" data-tab="sessions">Sessions</button>' +
  '</aside>' +
  '<main class="mc__content">' +
  '<section class="mc__view" data-view="office"><div class="viewport"><div class="camera"><div class="building"></div></div></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="dashboard"><div class="dashboard"></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="memory"><div class="memory"></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="sessions"><div class="sessions"></div></section>' +
  '</main>' +
  '</div>'

const buildingEl = stage.querySelector('.building')
const dashboardEl = stage.querySelector('.dashboard')
const memoryEl = stage.querySelector('.memory')
const sessionsEl = stage.querySelector('.sessions')
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

let sessionsState = { sessions: [], selected: null }

async function loadSessionsIndex() {
  try {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    sessionsState = { sessions: data.sessions || [], selected: sessionsState.selected }
  } catch {
    sessionsState = { sessions: [], selected: null }
  }
  if (tab === 'sessions') renderSessions(sessionsState, sessionsEl)
}

async function openSession(id) {
  const s = sessionsState.sessions.find((x) => x.id === id)
  sessionsState.selected = { id, meta: s || { id }, bubbles: [] }
  renderSessions(sessionsState, sessionsEl)
  try {
    const res = await fetch('/api/sessions/transcript?id=' + encodeURIComponent(id))
    const data = await res.json()
    sessionsState.selected = { id, meta: data.meta || s || { id }, bubbles: data.bubbles || [] }
  } catch {
    sessionsState.selected = { id, meta: s || { id }, bubbles: [] }
  }
  renderSessions(sessionsState, sessionsEl)
}

sessionsEl.addEventListener('click', (ev) => {
  const item = ev.target.closest('[data-sess-id]')
  if (item) openSession(item.getAttribute('data-sess-id'))
})

function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else if (tab === 'dashboard') renderDashboard(latest.dashboard, dashboardEl)
  else if (tab === 'memory') renderMemory(memoryState, memoryEl)
  else if (tab === 'sessions') renderSessions(sessionsState, sessionsEl)
}

for (const btn of stage.querySelectorAll('.mc__tab')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.mc__tab')) b.classList.toggle('mc__tab--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    if (tab === 'memory') loadMemoryIndex()
    else if (tab === 'sessions') loadSessionsIndex()
    else renderActive()
  })
}

connect((msg) => {
  latest = msg
  // Only the WS-driven views need a live redraw; re-rendering Memory here would
  // rebuild its DOM (and reset scroll) every tick for data it doesn't consume.
  if (tab === 'office' || tab === 'dashboard') renderActive()
})
