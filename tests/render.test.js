// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderDept, renderBuilding } from '../web/src/render.js'

function room(overrides = {}) {
  return {
    sessionId: 's1', project: 'Demo', cwd: 'C:/x/Demo', status: 'active', updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos lá', tool: 'Read' },
    ],
    ...overrides,
  }
}

describe('renderDept', () => {
  it('cria um .dept mobiliado com placa, luz, mesa, planta e agentes', () => {
    const el = renderDept(room())
    expect(el.classList.contains('dept')).toBe(true)
    expect(el.querySelector('.dept__title').textContent).toBe('Demo')
    expect(el.querySelector('.dept__light--active')).not.toBeNull()
    expect(el.querySelector('.dept__desk')).not.toBeNull()
    expect(el.querySelector('.plant')).not.toBeNull()
    expect(el.querySelectorAll('.agent').length).toBe(1)
    expect(el.dataset.project).toBe('Demo')
  })
  it('ociosa: .dept--idle e luz idle', () => {
    const el = renderDept(room({ status: 'idle' }))
    expect(el.classList.contains('dept--idle')).toBe(true)
    expect(el.querySelector('.dept__light--idle')).not.toBeNull()
  })
})

describe('renderBuilding', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="b"></div>'
    root = document.getElementById('b')
  })
  it('monta água + piso com lobby central e um dept por sala', () => {
    renderBuilding({ rooms: [room({ project: 'A' }), room({ project: 'B' })] }, root)
    expect(root.querySelector('.water .hq-floor')).not.toBeNull()
    expect(root.querySelector('.lobby .lobby__sign').textContent).toBe('Agency HQ')
    expect(root.querySelectorAll('.dept').length).toBe(2)
  })
  it('estado vazio quando não há salas', () => {
    renderBuilding({ rooms: [] }, root)
    expect(root.querySelector('.building__empty')).not.toBeNull()
  })
  it('idempotente', () => {
    const b = { rooms: [room()] }
    renderBuilding(b, root)
    renderBuilding(b, root)
    expect(root.querySelectorAll('.dept').length).toBe(1)
  })
})
