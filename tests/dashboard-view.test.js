// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderDashboard } from '../web/src/dashboard.js'

describe('renderDashboard', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="d"></div>'
    root = document.getElementById('d')
  })
  it('mostra cards de agentes, sessões e gasto formatado', () => {
    renderDashboard({ agentsActive: 3, sessions: 2, costUsd: 4.2 }, root)
    const cards = root.querySelectorAll('.dcard')
    expect(cards.length).toBe(3)
    expect(root.textContent).toContain('3')
    expect(root.textContent).toContain('$4.20')
  })
  it('tolera dashboard nulo', () => {
    renderDashboard(null, root)
    expect(root.querySelectorAll('.dcard').length).toBe(3)
    expect(root.textContent).toContain('$0.00')
  })
})
