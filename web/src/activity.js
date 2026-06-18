import { icon } from './icons.js'

export function buildHeatmap(activities) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const a of activities) {
    if (!a.ts) continue
    const d = new Date(a.ts)
    if (isNaN(d.getTime())) continue
    grid[d.getDay()][d.getHours()]++
  }
  return grid
}

export function todayCount(activities, now) {
  const ref = new Date(now)
  let n = 0
  for (const a of activities) {
    if (!a.ts) continue
    const d = new Date(a.ts)
    if (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()) n++
  }
  return n
}

export function relativeAge(ts, now) {
  if (!ts) return ''
  const diff = Math.max(0, now - Date.parse(ts))
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  return Math.floor(h / 24) + 'd'
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function statCard(label, value, iconName) {
  const c = el('div', 'dcard')
  const ico = el('div', 'dcard__ico')
  ico.innerHTML = icon(iconName)
  c.append(ico, el('div', 'dcard__label', label), el('div', 'dcard__value', String(value)))
  return c
}

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function renderActivity(state, root) {
  const activities = (state && state.activities) || []
  const stats = (state && state.stats) || { total: 0, successful: 0, errors: 0 }
  const now = Date.now()
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Total', stats.total, 'activity'),
    statCard('Hoje', todayCount(activities, now), 'activity'),
    statCard('Sucesso', stats.successful, 'users'),
    statCard('Erros', stats.errors, 'dollar'),
  )
  root.appendChild(grid)

  const heat = el('div', 'heat')
  const hm = buildHeatmap(activities)
  let max = 1
  for (const row of hm) for (const v of row) if (v > max) max = v
  for (let d = 0; d < 7; d++) {
    const r = el('div', 'heat__row')
    r.appendChild(el('span', 'heat__wd', WD[d]))
    for (let h = 0; h < 24; h++) {
      const cell = el('div', 'heat__cell')
      const v = hm[d][h]
      if (v > 0) {
        cell.style.background = 'var(--accent)'
        cell.style.opacity = String(0.2 + 0.8 * (v / max))
      }
      cell.title = WD[d] + ' ' + h + 'h: ' + v
      r.appendChild(cell)
    }
    heat.appendChild(r)
  }
  root.appendChild(heat)

  const feed = el('div', 'feed')
  if (activities.length === 0) {
    feed.appendChild(el('div', 'feed__empty', 'Nenhuma atividade recente.'))
  } else {
    for (const a of activities.slice(0, 60)) {
      const row = el('div', 'feed__row')
      row.appendChild(el('span', 'feed__dot feed__dot--' + a.status))
      const main = el('div', 'feed__main')
      main.append(el('span', 'feed__label', a.label || a.tool), el('span', 'feed__sub', a.tool + ' · ' + (a.project || '')))
      row.append(main, el('span', 'feed__time', relativeAge(a.ts, now)))
      feed.appendChild(row)
    }
  }
  root.appendChild(feed)
}
