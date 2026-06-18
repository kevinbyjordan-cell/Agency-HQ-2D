const SVG_NS = 'http://www.w3.org/2000/svg'

const TYPE_COLORS = {
  orchestrator: '#6C5CE7',
  copywriter: '#E0A33E',
  'pesquisador-local': '#3F7CB8',
  'pesquisador-de-nicho': '#3F7CB8',
  'arquiteto-de-projeto': '#1D9E75',
  'auditor-seo': '#D85A30',
}

function bodyColor(agent) {
  if (agent.isVisitor) return '#5DCAA5'
  return TYPE_COLORS[agent.type] ?? '#7C8AA0'
}

function makeBody(agent) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'agent__svg')
  svg.setAttribute('viewBox', '0 0 48 64')
  svg.setAttribute('width', '48')
  svg.setAttribute('height', '64')
  svg.innerHTML =
    (agent.isVisitor ? '<circle cx="24" cy="52" r="16" fill="none" stroke="#E0A33E" stroke-width="2"/>' : '') +
    `<rect x="16" y="24" width="16" height="22" rx="8" fill="${bodyColor(agent)}"/>` +
    '<circle cx="24" cy="18" r="9" fill="#F1CBA1"/>' +
    '<circle cx="21" cy="18" r="1.4" fill="#3A2A1F"/><circle cx="27" cy="18" r="1.4" fill="#3A2A1F"/>'
  return svg
}

function renderAgent(agent) {
  const el = document.createElement('div')
  el.className = `agent agent--${agent.status}` + (agent.isVisitor ? ' agent--visitor' : '')
  el.dataset.agentId = agent.id
  el.dataset.type = agent.type
  if (agent.speech) {
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = agent.speech
    el.appendChild(bubble)
  }
  el.appendChild(makeBody(agent))
  const label = document.createElement('div')
  label.className = 'agent__label'
  label.textContent = agent.label
  el.appendChild(label)
  const act = document.createElement('div')
  act.className = 'agent__activity'
  act.textContent = agent.activity || (agent.status === 'idle' ? 'ocioso' : '')
  el.appendChild(act)
  return el
}

export function renderDept(state) {
  const dept = document.createElement('div')
  dept.className = 'dept' + (state.status === 'idle' ? ' dept--idle' : '')
  dept.dataset.sessionId = state.sessionId ?? ''
  dept.dataset.project = state.project ?? ''

  const plate = document.createElement('div')
  plate.className = 'dept__plate'
  const light = document.createElement('span')
  light.className = 'dept__light dept__light--' + (state.status === 'idle' ? 'idle' : 'active')
  const title = document.createElement('span')
  title.className = 'dept__title'
  title.textContent = state.project || 'Sessão'
  plate.append(light, title)
  dept.appendChild(plate)

  const floor = document.createElement('div')
  floor.className = 'dept__floor'
  const plant = document.createElement('div')
  plant.className = 'plant'
  floor.appendChild(plant)
  for (const agent of state.agents) floor.appendChild(renderAgent(agent))
  const desk = document.createElement('div')
  desk.className = 'dept__desk'
  floor.appendChild(desk)
  dept.appendChild(floor)

  return dept
}

export function renderLobby() {
  const lobby = document.createElement('div')
  lobby.className = 'lobby'
  const sign = document.createElement('div')
  sign.className = 'lobby__sign'
  sign.textContent = 'Agency HQ'
  const reception = document.createElement('div')
  reception.className = 'lobby__reception'
  const p1 = document.createElement('div')
  p1.className = 'plant'
  const p2 = document.createElement('div')
  p2.className = 'plant'
  lobby.append(sign, reception, p1, p2)
  return lobby
}

export function renderBuilding(building, root) {
  root.innerHTML = ''
  const water = document.createElement('div')
  water.className = 'water'
  const floor = document.createElement('div')
  floor.className = 'hq-floor'

  const rooms = (building && building.rooms) || []
  if (rooms.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'building__empty'
    empty.textContent = 'Nenhuma sessão ativa agora.'
    floor.appendChild(empty)
  } else {
    const els = rooms.map(renderDept)
    els.splice(Math.floor(els.length / 2), 0, renderLobby())
    for (const el of els) floor.appendChild(el)
  }

  water.appendChild(floor)
  root.appendChild(water)
}
