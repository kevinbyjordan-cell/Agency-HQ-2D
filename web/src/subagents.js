import { icon } from './icons.js'
import { relativeAge } from './activity.js'

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

function fmtDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  return m + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '')
}

function fmtTokens(n) {
  if (n == null) return '—'
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
}

export function renderSubAgents(state, root) {
  const subs = (state && state.subagents) || []
  const stats = (state && state.stats) || { total: 0, running: 0, done: 0, failed: 0 }
  const now = Date.now()
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Total', stats.total, 'users'),
    statCard('Ativos', stats.running, 'activity'),
    statCard('Concluídos', stats.done, 'layers'),
    statCard('Falhas', stats.failed, 'dollar'),
  )
  root.appendChild(grid)

  const list = el('div', 'sa')
  if (subs.length === 0) {
    list.appendChild(el('div', 'sa__empty', 'Nenhum sub-agente recente.'))
  } else {
    for (const s of subs) {
      const row = el('div', 'sa__row')
      row.appendChild(el('span', 'sa__dot sa__dot--' + s.status))
      const main = el('div', 'sa__main')
      const head = el('div', 'sa__head')
      head.append(el('span', 'sa__label', s.label || s.type), el('span', 'sa__task', s.task || ''))
      const meta = el('div', 'sa__meta')
      const bits = [s.model || '', s.tokens != null ? fmtTokens(s.tokens) + ' tok' : '', s.toolUses != null ? s.toolUses + ' tools' : '', fmtDuration(s.durationMs), s.project || '']
      meta.textContent = bits.filter(Boolean).join(' · ')
      main.append(head, meta)
      row.append(main, el('span', 'sa__time', relativeAge(s.spawnTs, now)))
      list.appendChild(row)
    }
  }
  root.appendChild(list)
}
