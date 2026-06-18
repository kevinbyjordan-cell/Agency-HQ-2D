import { icon } from './icons.js'

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function usd(n) {
  return '$' + Number(n || 0).toFixed(2)
}

function fmtTokens(n) {
  n = n || 0
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

function statCard(label, value, iconName) {
  const c = el('div', 'dcard')
  const ico = el('div', 'dcard__ico')
  ico.innerHTML = icon(iconName)
  c.append(ico, el('div', 'dcard__label', label), el('div', 'dcard__value', value))
  return c
}

export function renderCosts(eco, root) {
  const e = eco || { totals: {}, byModel: [], daily: [], projectionUsd: 0 }
  const t = e.totals || {}
  const byModel = e.byModel || []
  const daily = e.daily || []
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Custo total', usd(t.costUsd), 'dollar'),
    statCard('Projeção mensal', usd(e.projectionUsd), 'activity'),
    statCard('Tokens', fmtTokens((t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0)), 'layers'),
    statCard('Mensagens', String(t.messages || 0), 'users'),
  )
  root.appendChild(grid)

  if (byModel.length === 0) {
    root.appendChild(el('div', 'eco__empty', 'Sem dados de custo ainda.'))
    return
  }

  const maxCost = Math.max(...byModel.map((m) => m.costUsd), 0.000001)
  const models = el('div', 'eco__models')
  models.appendChild(el('div', 'eco__head', 'Por modelo'))
  for (const m of byModel) {
    const row = el('div', 'eco__mrow')
    row.append(el('span', 'eco__model', m.model), el('span', 'eco__mcost', usd(m.costUsd)))
    const track = el('div', 'eco__track')
    const fill = el('div', 'eco__fill')
    fill.style.width = Math.max(2, (m.costUsd / maxCost) * 100) + '%'
    track.appendChild(fill)
    const sub = el('div', 'eco__msub', fmtTokens(m.input) + ' in · ' + fmtTokens(m.output) + ' out · ' + fmtTokens(m.cache) + ' cache')
    row.append(track, sub)
    models.appendChild(row)
  }
  root.appendChild(models)

  const maxDay = Math.max(...daily.map((d) => d.costUsd), 0.000001)
  const trend = el('div', 'eco__daily')
  trend.appendChild(el('div', 'eco__head', 'Tendência diária'))
  const chart = el('div', 'eco__chart')
  for (const d of daily) {
    const col = el('div', 'eco__col')
    const bar = el('div', 'eco__bar')
    bar.style.height = Math.max(3, (d.costUsd / maxDay) * 100) + '%'
    bar.title = d.date + ': ' + usd(d.costUsd)
    col.append(bar, el('span', 'eco__day', d.date.slice(5)))
    chart.appendChild(col)
  }
  trend.appendChild(chart)
  root.appendChild(trend)
}
