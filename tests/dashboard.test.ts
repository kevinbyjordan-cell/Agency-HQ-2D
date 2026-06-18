import { describe, it, expect } from 'vitest'
import { dashboardSummary } from '../server/src/dashboard'
import { initialState } from '../server/src/reducer'
import type { OfficeState } from '../server/src/types'

function room(over: Partial<OfficeState> = {}): OfficeState {
  return { ...initialState(), status: 'active', ...over }
}

describe('dashboardSummary', () => {
  it('conta sessões, agentes ativos e soma custo', () => {
    const rooms = [
      room({ project: 'A', costUsd: 1.5, agents: [{ id: 'o', type: 'orchestrator', label: 'O', isVisitor: false, status: 'working', activity: '', speech: '', tool: null }] }),
      room({ project: 'B', costUsd: 2.25, status: 'idle', agents: [{ id: 'o2', type: 'orchestrator', label: 'O', isVisitor: false, status: 'working', activity: '', speech: '', tool: null }] }),
    ]
    const d = dashboardSummary(rooms, '2026-06-18T00:00:00Z')
    expect(d.sessions).toBe(2)
    expect(d.costUsd).toBeCloseTo(3.75, 5)
    expect(d.agentsActive).toBe(1)
  })
})
