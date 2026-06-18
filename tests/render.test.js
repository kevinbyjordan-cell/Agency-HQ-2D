// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '../web/src/render.js'

function baseState(overrides = {}) {
  return {
    sessionId: 's1',
    project: 'Demo',
    cwd: 'C:/x/Demo',
    status: 'active',
    updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos começar', tool: 'Read' },
      { id: 'a1', type: 'copywriter', label: 'Copywriter', isVisitor: false, status: 'working', activity: 'Começando', speech: 'Escrevendo a copy', tool: null },
    ],
    ...overrides,
  }
}

describe('render', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    root = document.getElementById('root')
  })

  it('renderiza um boneco por agente, com nome da sala', () => {
    render(baseState(), root)
    expect(root.querySelectorAll('.agent').length).toBe(2)
    expect(root.querySelector('.room__name').textContent).toBe('Demo')
    expect(root.textContent).toContain('Orquestrador')
    expect(root.textContent).toContain('Escrevendo a copy')
  })

  it('aplica room--idle quando a sessão está ociosa', () => {
    render(baseState({ status: 'idle' }), root)
    expect(root.querySelector('.room').classList.contains('room--idle')).toBe(true)
  })

  it('marca visitantes com a classe agent--visitor', () => {
    const s = baseState()
    s.agents[1].isVisitor = true
    render(s, root)
    const visitor = root.querySelector('[data-agent-id="a1"]')
    expect(visitor.classList.contains('agent--visitor')).toBe(true)
  })

  it('re-renderiza de forma idempotente (sem acumular)', () => {
    render(baseState(), root)
    render(baseState(), root)
    expect(root.querySelectorAll('.agent').length).toBe(2)
  })
})
