// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderSubAgents } from '../web/src/subagents.js'

let root: HTMLElement
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')! })

const subs = [
  { id: 't1', type: 'general-purpose', label: 'Generalista', task: 'Implement Task 1', model: 'sonnet', project: 'A', sessionId: 's1', status: 'done', spawnTs: '2026-06-18T10:00:01Z', endTs: '2026-06-18T10:01:41Z', durationMs: 100000, tokens: 28139, toolUses: 13 },
  { id: 't2', type: 'Explore', label: 'Explorador', task: 'Search', model: null, project: 'A', sessionId: 's1', status: 'running', spawnTs: '2026-06-18T10:05:00Z', endTs: null, durationMs: null, tokens: null, toolUses: null },
]

describe('renderSubAgents', () => {
  it('renders 4 stat cards and a row per sub-agent', () => {
    renderSubAgents({ subagents: subs, stats: { total: 2, running: 1, done: 1, failed: 0 } }, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.sa__row').length).toBe(2)
    expect(root.textContent).toContain('Generalista')
    expect(root.textContent).toContain('Implement Task 1')
  })
  it('shows a placeholder when empty', () => {
    renderSubAgents({ subagents: [], stats: { total: 0, running: 0, done: 0, failed: 0 } }, root)
    expect(root.querySelector('.sa__empty')).not.toBeNull()
  })
})
