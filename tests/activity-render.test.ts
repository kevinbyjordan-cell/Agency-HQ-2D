// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderActivity, buildHeatmap, todayCount, relativeAge } from '../web/src/activity.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="r"></div>'
  root = document.getElementById('r')!
})

const NOW = Date.parse('2026-06-18T12:00:00Z')
const acts = [
  { ts: '2026-06-18T11:00:00Z', tool: 'Read', label: 'Lendo arquivos', project: 'A', sessionId: 's1', status: 'ok' },
  { ts: '2026-06-18T10:00:00Z', tool: 'Bash', label: 'Rodando comando', project: 'A', sessionId: 's1', status: 'error' },
  { ts: '2026-06-10T10:00:00Z', tool: 'Write', label: 'Escrevendo arquivo', project: 'B', sessionId: 's2', status: 'ok' },
]

describe('date helpers', () => {
  it('buildHeatmap returns a 7x24 grid counting by local weekday/hour', () => {
    const h = buildHeatmap(acts)
    expect(h.length).toBe(7)
    expect(h[0].length).toBe(24)
    const total = h.flat().reduce((s, n) => s + n, 0)
    expect(total).toBe(3)
  })
  it('todayCount counts activities on the same local day as now', () => {
    expect(todayCount(acts, NOW)).toBe(2)
  })
  it('relativeAge formats deltas', () => {
    expect(relativeAge('2026-06-18T11:59:30Z', NOW)).toMatch(/agora|s/)
    expect(relativeAge('2026-06-18T10:00:00Z', NOW)).toContain('h')
  })
})

describe('renderActivity', () => {
  it('renders 4 stat cards, a heatmap grid and a feed row per activity', () => {
    renderActivity({ activities: acts, stats: { total: 3, successful: 2, errors: 1 } }, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.heat__cell').length).toBe(168)
    expect(root.querySelectorAll('.feed__row').length).toBe(3)
    expect(root.textContent).toContain('Lendo arquivos')
  })
  it('shows a placeholder when empty', () => {
    renderActivity({ activities: [], stats: { total: 0, successful: 0, errors: 0 } }, root)
    expect(root.querySelector('.feed__empty')).not.toBeNull()
  })
})
