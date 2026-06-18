import { describe, it, expect } from 'vitest'
import { groupByProject } from '../server/src/projectRooms'
import { initialState } from '../server/src/reducer'

const now = 1_000_000_000_000
function snap(project: string, lastActivityMs: number, sessionId: string) {
  return { state: { ...initialState(), project, sessionId }, lastActivityMs }
}

describe('groupByProject', () => {
  it('uma sala por projeto, usando a sessão mais recente', () => {
    const rooms = groupByProject(
      [snap('Google Ads PRO', now - 50_000, 's1'), snap('Google Ads PRO', now - 1000, 's2'), snap('Venda Sites', now - 5000, 's3')],
      now
    )
    expect(rooms).toHaveLength(2)
    expect(rooms.find((r) => r.project === 'Google Ads PRO')?.sessionId).toBe('s2')
  })
  it('status ativo/ocioso conforme a atividade', () => {
    const rooms = groupByProject([snap('A', now - 1000, 'a'), snap('B', now - 200_000, 'b')], now)
    expect(rooms.find((r) => r.project === 'A')?.status).toBe('active')
    expect(rooms.find((r) => r.project === 'B')?.status).toBe('idle')
  })
  it('ordena por atividade mais recente primeiro', () => {
    const rooms = groupByProject([snap('Velho', now - 9000, 'a'), snap('Novo', now - 1000, 'b')], now)
    expect(rooms[0].project).toBe('Novo')
  })
})
