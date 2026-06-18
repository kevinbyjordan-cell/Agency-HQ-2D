import { describe, it, expect } from 'vitest'
import { flattenAgents, gridPosition } from '../web/src/office3dLayout.js'

const building = {
  rooms: [
    { project: 'GOOGLE ADS PRO', status: 'active', agents: [
      { id: 'orch', type: 'orchestrator', label: 'Orquestrador', status: 'working', speech: 'oi', isVisitor: false },
      { id: 'a1', type: 'general-purpose', label: 'Generalista', status: 'done', speech: '', isVisitor: true },
    ] },
    { project: 'Venda Sites', status: 'idle', agents: [
      { id: 'orch', type: 'orchestrator', label: 'Orquestrador', status: 'idle', speech: '', isVisitor: false },
    ] },
  ],
}

describe('flattenAgents', () => {
  it('flattens rooms→agents with composite ids and carries fields', () => {
    const flat = flattenAgents(building)
    expect(flat.length).toBe(3)
    expect(flat[0]).toMatchObject({ id: 'GOOGLE ADS PRO:orch', type: 'orchestrator', status: 'working', project: 'GOOGLE ADS PRO', roomIndex: 0 })
    // composite id keeps same-named agents from different rooms distinct
    expect(flat[2].id).toBe('Venda Sites:orch')
    expect(new Set(flat.map((f) => f.id)).size).toBe(3)
  })
  it('is safe on empty/missing', () => {
    expect(flattenAgents(null)).toEqual([])
    expect(flattenAgents({ rooms: [] })).toEqual([])
  })
})

describe('gridPosition', () => {
  it('centers a grid around the origin', () => {
    const p0 = gridPosition(0, 4)
    const p3 = gridPosition(3, 4)
    expect(p0.cols).toBe(2)
    // first and last cells are mirrored around 0
    expect(p0.x).toBeCloseTo(-p3.x, 6)
    expect(p0.z).toBeCloseTo(-p3.z, 6)
  })
  it('handles a single agent at the origin', () => {
    const p = gridPosition(0, 1)
    expect(p.x).toBeCloseTo(0, 6)
    expect(p.z).toBeCloseTo(0, 6)
  })
})
