import { renderMarkdown } from './markdown.js'

function pct(n) {
  return Math.round((n || 0) * 100)
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function sessionCard(s, selected) {
  const item = document.createElement('button')
  item.className = 'sess__item' + (selected && selected.id === s.id ? ' sess__item--active' : '')
  item.setAttribute('data-sess-id', s.id)

  const top = el('div', 'sess__top')
  top.append(el('span', 'sess__proj', s.project || '—'), el('span', 'sess__model', s.model || '—'))

  const title = el('div', 'sess__title', s.title || s.sessionId || s.id)

  const bar = el('div', 'sess__bar')
  const fill = el('div', 'sess__barfill')
  fill.style.width = Math.min(100, pct(s.contextPct)) + '%'
  if (s.contextPct >= 0.8) fill.classList.add('sess__barfill--hot')
  bar.appendChild(fill)

  const meta = el('div', 'sess__meta')
  meta.append(
    el('span', null, Math.min(100, pct(s.contextPct)) + '% contexto'),
    el('span', null, (s.messages || 0) + ' msgs'),
    el('span', null, '$' + Number(s.costUsd || 0).toFixed(2)),
  )

  item.append(top, title, bar, meta)
  return item
}

const ROLE_LABEL = { user: 'Você', assistant: 'Agente', tool: 'Tool' }

function bubbleRow(b) {
  const row = el('div', 'bubblerow bubblerow--' + b.role)
  const who = el('div', 'bubblerow__who', ROLE_LABEL[b.role] || b.role)
  const body = el('div', 'bubblerow__body')
  if (b.kind === 'tool_use') {
    body.classList.add('bubblerow__body--tool')
    body.append(el('span', 'bubblerow__tool', b.tool || 'tool'))
    if (b.text) body.append(el('span', 'bubblerow__arg', ' ' + b.text))
  } else if (b.kind === 'tool_result') {
    body.classList.add('bubblerow__body--result')
    if (b.isError) body.classList.add('bubblerow__body--error')
    body.textContent = b.text || '(sem saída)'
  } else {
    body.innerHTML = renderMarkdown(b.text || '')
  }
  row.append(who, body)
  return row
}

export function renderSessions(state, root) {
  const sessions = (state && state.sessions) || []
  const selected = (state && state.selected) || null
  root.innerHTML = ''

  const wrap = el('div', 'sess')
  const list = el('div', 'sess__list')

  if (sessions.length === 0) {
    list.appendChild(el('div', 'sess__empty', 'Nenhuma sessão encontrada.'))
  } else {
    for (const s of sessions) list.appendChild(sessionCard(s, selected))
  }

  const doc = el('div', 'sess__doc')
  if (selected && Array.isArray(selected.bubbles)) {
    const head = el('div', 'sess__dochead')
    const m = selected.meta || {}
    head.append(
      el('span', 'sess__doctitle', m.title || m.sessionId || selected.id),
      el('span', 'sess__docsub', (m.project || '') + ' · ' + (m.model || '')),
    )
    doc.appendChild(head)
    const stream = el('div', 'sess__stream')
    if (selected.bubbles.length === 0) stream.appendChild(el('div', 'sess__hint', 'Transcript vazio.'))
    else for (const b of selected.bubbles) stream.appendChild(bubbleRow(b))
    doc.appendChild(stream)
  } else {
    doc.appendChild(el('div', 'sess__hint', 'Selecione uma sessão à esquerda para ver o transcript.'))
  }

  wrap.append(list, doc)
  root.appendChild(wrap)
}
