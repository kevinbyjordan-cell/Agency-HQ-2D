import type { OfficeState } from './types'

export interface DashboardSummary {
  agentsActive: number
  sessions: number
  costUsd: number
  updatedAt: string | null
}

export function dashboardSummary(rooms: OfficeState[], updatedAt: string | null): DashboardSummary {
  let agentsActive = 0
  let costUsd = 0
  for (const r of rooms) {
    costUsd += r.costUsd ?? 0
    if (r.status === 'active') {
      for (const a of r.agents) if (a.status === 'working') agentsActive++
    }
  }
  return { agentsActive, sessions: rooms.length, costUsd, updatedAt }
}
