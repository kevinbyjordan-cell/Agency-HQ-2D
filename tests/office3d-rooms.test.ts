import { describe, it, expect } from 'vitest'
import { layoutRooms } from '../web/src/office3dLayout.js'

const building = {
  rooms: [
    { project: 'A', status: 'active', agents: [
      { id: 'o', type: 'orchestrator', label: 'Orq', status: 'working' },
      { id: 'a1', type: 'general-purpose', label: 'Gen', status: 'done' },
    ] },
    { project: 'B', status: 'idle', agents: [
      { id: 'o', type: 'orchestrator', label: 'Orq', status: 'idle' },
    ] },
  ],
}

describe('layoutRooms', () => {
  it('produces one room per project with absolute agent positions', () => {
    const rooms = layoutRooms(building)
    expect(rooms.length).toBe(2)
    expect(rooms[0]).toMatchObject({ project: 'A', status: 'active' })
    expect(rooms[0].agents.length).toBe(2)
    expect(rooms[0].agents[0].id).toBe('A:o')
    expect(rooms[1].agents[0].id).toBe('B:o')
    // distinct rooms sit at distinct centers; footprints are positive
    expect(rooms[0].cx).not.toBe(rooms[1].cx)
    expect(rooms[0].w).toBeGreaterThan(0)
    expect(rooms[0].d).toBeGreaterThan(0)
  })
  it('is safe on empty/missing', () => {
    expect(layoutRooms(null)).toEqual([])
    expect(layoutRooms({ rooms: [] })).toEqual([])
  })
})
