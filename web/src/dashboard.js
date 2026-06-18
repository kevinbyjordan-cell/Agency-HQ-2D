function card(label, value) {
  const el = document.createElement('div')
  el.className = 'dcard'
  const l = document.createElement('div')
  l.className = 'dcard__label'
  l.textContent = label
  const v = document.createElement('div')
  v.className = 'dcard__value'
  v.textContent = value
  el.append(l, v)
  return el
}

export function renderDashboard(dashboard, root) {
  root.innerHTML = ''
  const d = dashboard || { agentsActive: 0, sessions: 0, costUsd: 0 }
  const grid = document.createElement('div')
  grid.className = 'dgrid'
  grid.appendChild(card('Agentes ativos', String(d.agentsActive ?? 0)))
  grid.appendChild(card('Sessões', String(d.sessions ?? 0)))
  grid.appendChild(card('Gasto de API', '$' + Number(d.costUsd ?? 0).toFixed(2)))
  root.appendChild(grid)
}
