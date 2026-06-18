import type { OfficeState } from './types'
import { roomStatus } from './sessionLifecycle'

export interface SessionSnapshot {
  state: OfficeState
  lastActivityMs: number
}

export function groupByProject(sessions: SessionSnapshot[], now: number): OfficeState[] {
  const byProject = new Map<string, SessionSnapshot>()
  for (const s of sessions) {
    const key = s.state.project || s.state.cwd || s.state.sessionId || 'desconhecido'
    const cur = byProject.get(key)
    if (!cur || s.lastActivityMs > cur.lastActivityMs) byProject.set(key, s)
  }
  return [...byProject.values()]
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    .map((s) => ({ ...s.state, status: roomStatus(s.lastActivityMs, now) }))
}
