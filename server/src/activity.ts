import type { TranscriptLine, ContentBlock } from './parse'
import { toolActivity } from './toolActivity'

export interface Activity {
  ts: string | null
  tool: string
  label: string
  project: string
  sessionId: string | null
  status: 'ok' | 'error' | 'pending'
}

export interface ActivityStats {
  total: number
  successful: number
  errors: number
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

export function activitiesFromLines(lines: TranscriptLine[]): Activity[] {
  let project = ''
  let sessionId: string | null = null
  const errorById = new Map<string, boolean>()

  for (const line of lines) {
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    if (line.type === 'user') {
      const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
      for (const b of content) {
        if (b.type === 'tool_result' && b.tool_use_id) errorById.set(b.tool_use_id, !!b.is_error)
      }
    }
  }

  const out: Activity[] = []
  for (const line of lines) {
    if (line.type !== 'assistant') continue
    const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
    for (const b of content) {
      if (b.type !== 'tool_use') continue
      const tool = b.name ?? '?'
      const status: Activity['status'] = b.id && errorById.has(b.id) ? (errorById.get(b.id) ? 'error' : 'ok') : 'pending'
      out.push({ ts: line.timestamp ?? null, tool, label: toolActivity(tool), project, sessionId, status })
    }
  }
  return out
}

export function activityStats(activities: Activity[]): ActivityStats {
  let successful = 0
  let errors = 0
  for (const a of activities) {
    if (a.status === 'ok') successful++
    else if (a.status === 'error') errors++
  }
  return { total: activities.length, successful, errors }
}
