import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { renderDashboard } from './dashboard.js'
import { initCamera } from './camera.js'
import { renderMemory } from './memory.js'
import { renderMarkdown } from './markdown.js'
import { renderSessions } from './sessions.js'
import { icon } from './icons.js'
import { renderActivity } from './activity.js'

const NAV = [
  { tab: 'office', label: 'Office', ico: 'office', emoji: '🏢', title: 'Office', sub: 'Os agentes da operação trabalhando ao vivo' },
  { tab: 'dashboard', label: 'Dashboard', ico: 'dashboard', emoji: '📊', title: 'Dashboard', sub: 'Visão geral da operação de IA' },
  { tab: 'memory', label: 'Memory', ico: 'memory', emoji: '🧠', title: 'Memory', sub: 'Memória e conhecimento da operação' },
  { tab: 'sessions', label: 'Sessions', ico: 'sessions', emoji: '💬', title: 'Sessions', sub: 'Histórico de sessões e transcripts' },
  { tab: 'activity', label: 'Activity', ico: 'activity', emoji: '⚡', title: 'Activity', sub: 'Fluxo de ações dos agentes e mapa de calor' },
]

const VIEW_INNER = {
  office: '<div class="viewport"><div class="camera"><div class="building"></div></div></div>',
  dashboard: '<div class="dashboard"></div>',
  memory: '<div class="memory"></div>',
  sessions: '<div class="sessions"></div>',
  activity: '<div class="activity"></div>',
}

const navItem = (n, active) =>
  '<button class="nav__item' + (active ? ' nav__item--active' : '') + '" data-tab="' + n.tab + '">' +
  '<span class="nav__icon">' + icon(n.ico) + '</span><span class="nav__label">' + n.label + '</span></button>'

const viewSection = (n, active) =>
  '<section class="mc__view page page--' + n.tab + (active ? '' : ' mc__view--hidden') + '" data-view="' + n.tab + '">' +
  '<div class="page__head"><h1 class="page__title">' + n.emoji + ' ' + n.title + '</h1>' +
  '<p class="page__sub">' + n.sub + '</p></div>' +
  '<div class="page__body">' + VIEW_INNER[n.tab] + '</div></section>'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="app">' +
  '<header class="topbar">' +
  '<div class="topbar__brand"><span class="topbar__logo">🏢</span><span>Agency HQ</span><span class="topbar__ver">v0.1</span></div>' +
  '<div class="topbar__search">' + icon('search', 'topbar__searchico') + '<input placeholder="Buscar…" aria-label="Buscar" /></div>' +
  '<div class="topbar__right"><button class="topbar__btn" title="Notificações" aria-label="Notificações">' + icon('bell') + '</button>' +
  '<span class="topbar__avatar">K</span></div>' +
  '</header>' +
  '<div class="app__body">' +
  '<nav class="sidebar">' + NAV.map((n, i) => navItem(n, i === 0)).join('') + '</nav>' +
  '<main class="content">' + NAV.map((n, i) => viewSection(n, i === 0)).join('') + '</main>' +
  '</div>' +
  '</div>'

const buildingEl = stage.querySelector('.building')
const dashboardEl = stage.querySelector('.dashboard')
const memoryEl = stage.querySelector('.memory')
const sessionsEl = stage.querySelector('.sessions')
const activityEl = stage.querySelector('.activity')
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

let activityState = { activities: [], stats: { total: 0, successful: 0, errors: 0 } }

async function loadActivity() {
  try {
    const res = await fetch('/api/activity')
    const data = await res.json()
    activityState = { activities: data.activities || [], stats: data.stats || { total: 0, successful: 0, errors: 0 } }
  } catch {
    activityState = { activities: [], stats: { total: 0, successful: 0, errors: 0 } }
  }
  if (tab === 'activity') renderActivity(activityState, activityEl)
}

function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else if (tab === 'dashboard') renderDashboard(latest.dashboard, dashboardEl)
  else if (tab === 'memory') renderMemory(memoryState, memoryEl)
  else if (tab === 'sessions') renderSessions(sessionsState, sessionsEl)
  else if (tab === 'activity') renderActivity(activityState, activityEl)
}

for (const btn of stage.querySelectorAll('.nav__item')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.nav__item')) b.classList.toggle('nav__item--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    if (tab === 'memory') loadMemoryIndex()
    else if (tab === 'sessions') loadSessionsIndex()
    else if (tab === 'activity') loadActivity()
    else renderActive()
  })
}

connect((msg) => {
  latest = msg
  // Only the WS-driven views need a live redraw; re-rendering data views here would
  // rebuild their DOM (and reset scroll) every tick for data they don't consume.
  if (tab === 'office' || tab === 'dashboard') renderActive()
})
