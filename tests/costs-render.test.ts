// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderCosts } from '../web/src/costs.js'

let root: HTMLElement
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')! })

const eco = {
  totals: { costUsd: 12.5, input: 5000, output: 150, cacheRead: 2000, cacheWrite: 500, messages: 2 },
  byModel: [
    { model: 'claude-opus-4-8', costUsd: 10, input: 1000, output: 100, cache: 2500, messages: 1 },
    { model: 'claude-sonnet-4-6', costUsd: 2.5, input: 4000, output: 50, cache: 0, messages: 1 },
  ],
  daily: [ { date: '2026-06-17', costUsd: 2.5 }, { date: '2026-06-18', costUsd: 10 } ],
  projectionUsd: 187.5,
}

describe('renderCosts', () => {
  it('renders stat cards, a row per model and a daily bar per day', () => {
    renderCosts(eco, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.eco__mrow').length).toBe(2)
    expect(root.querySelectorAll('.eco__bar').length).toBe(2)
    expect(root.textContent).toContain('claude-opus-4-8')
    expect(root.textContent).toContain('$12.50')
  })
  it('shows a placeholder when empty', () => {
    renderCosts({ totals: { costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 }, byModel: [], daily: [], projectionUsd: 0 }, root)
    expect(root.querySelector('.eco__empty')).not.toBeNull()
  })
})
