// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderRoom, renderBuilding } from '../web/src/render.js'

function room(overrides = {}) {
  return {
    sessionId: 's1', project: 'Demo', cwd: 'C:/x/Demo', status: 'active', updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos começar', tool: 'Read' },
      { id: 'a1', type: 'copywriter', label: 'Copywriter', isVisitor: false, status: 'working', activity: 'Começando', speech: 'Escrevendo a copy', tool: null },
    ],
    ...overrides,
  }
}

describe('renderRoom', () => {
  it('cria uma .room com nome do projeto e um boneco por agente', () => {
    const el = renderRoom(room())
    expect(el.classList.contains('room')).toBe(true)
    expect(el.querySelector('.room__name').textContent).toBe('Demo')
    expect(el.querySelectorAll('.agent').length).toBe(2)
    expect(el.dataset.sessionId).toBe('s1')
  })
  it('marca room--idle quando ociosa', () => {
    expect(renderRoom(room({ status: 'idle' })).classList.contains('room--idle')).toBe(true)
  })
})

describe('renderBuilding', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="b"></div>'
    root = document.getElementById('b')
  })
  it('renderiza uma sala por sessão', () => {
    renderBuilding({ rooms: [room({ sessionId: 's1', project: 'A' }), room({ sessionId: 's2', project: 'B' })] }, root)
    expect(root.querySelectorAll('.room').length).toBe(2)
  })
  it('mostra estado vazio quando não há salas', () => {
    renderBuilding({ rooms: [] }, root)
    expect(root.querySelector('.building__empty')).not.toBeNull()
  })
  it('re-renderiza de forma idempotente', () => {
    const b = { rooms: [room()] }
    renderBuilding(b, root)
    renderBuilding(b, root)
    expect(root.querySelectorAll('.room').length).toBe(1)
  })
})
