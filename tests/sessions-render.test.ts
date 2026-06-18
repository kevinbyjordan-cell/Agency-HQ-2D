// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderSessions } from '../web/src/sessions.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  root = document.getElementById('root')!
})

const sessions = [
  { id: 'A/s1.jsonl', sessionId: 's1', project: 'Google Ads PRO', model: 'claude-opus-4-8', messages: 12, tokens: 4200, costUsd: 0.42, contextTokens: 220000, contextPct: 0.22, title: 'Relatório de campanhas', startedAt: '2026-06-18T10:00:00Z', updatedAt: '2026-06-18T10:30:00Z', partial: false },
  { id: 'B/s2.jsonl', sessionId: 's2', project: 'Venda Sites', model: 'claude-sonnet-4-6', messages: 4, tokens: 800, costUsd: 0.02, contextTokens: 5000, contextPct: 0.005, title: '', startedAt: null, updatedAt: '2026-06-18T09:00:00Z', partial: false },
]

describe('renderSessions', () => {
  it('renders one card per session with project, model and a context bar', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.querySelectorAll('[data-sess-id]').length).toBe(2)
    expect(root.textContent).toContain('Google Ads PRO')
    expect(root.textContent).toContain('claude-opus-4-8')
    expect(root.querySelector('.sess__bar')).not.toBeNull()
  })

  it('falls back to sessionId when title is empty', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.textContent).toContain('s2')
  })

  it('marks the selected session active and renders its bubbles', () => {
    const selected = { id: 'A/s1.jsonl', meta: sessions[0], bubbles: [ { role: 'user', kind: 'text', text: 'oi', ts: null }, { role: 'assistant', kind: 'text', text: 'olá', ts: null } ] }
    renderSessions({ sessions, selected }, root)
    expect(root.querySelector('.sess__item--active')?.getAttribute('data-sess-id')).toBe('A/s1.jsonl')
    const bubbles = root.querySelectorAll('.bubblerow')
    expect(bubbles.length).toBe(2)
  })

  it('shows a placeholder when there are no sessions', () => {
    renderSessions({ sessions: [], selected: null }, root)
    expect(root.querySelector('.sess__empty')).not.toBeNull()
  })

  it('shows a hint when nothing is selected', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.querySelector('.sess__doc')?.textContent).toMatch(/selecione/i)
  })
})
