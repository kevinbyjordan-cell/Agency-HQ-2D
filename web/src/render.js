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

export function renderRoom(state) {
  const room = document.createElement('div')
  room.className = 'room' + (state.status === 'idle' ? ' room--idle' : '')
  room.dataset.sessionId = state.sessionId ?? ''

  const name = document.createElement('div')
  name.className = 'room__name'
  name.textContent = state.project || 'Sessão'
  room.appendChild(name)

  const floor = document.createElement('div')
  floor.className = 'floor'
  for (const agent of state.agents) floor.appendChild(renderAgent(agent))
  room.appendChild(floor)

  return room
}

export function renderBuilding(building, root) {
  root.innerHTML = ''
  const rooms = (building && building.rooms) || []
  if (rooms.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'building__empty'
    empty.textContent = 'Nenhuma sessão ativa agora.'
    root.appendChild(empty)
    return
  }
  for (const state of rooms) root.appendChild(renderRoom(state))
}
