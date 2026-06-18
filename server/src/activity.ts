import { promises as fs } from 'node:fs'
import type { TranscriptLine, ContentBlock } from './parse'
import { parseLine } from './parse'
import { toolActivity } from './toolActivity'
import { listSessionFiles } from './sessions'

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

// ── Filesystem layer ────────────────────────────────────────────────────────

const MAX_SCAN_BYTES = 20_000_000
const SESSION_LIMIT = 25
const ACTIVITY_CAP = 300

export async function activityFeed(
  root: string,
  sessionLimit = SESSION_LIMIT,
  cap = ACTIVITY_CAP,
): Promise<{ activities: Activity[]; stats: ActivityStats }> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, sessionLimit)
  const all: Activity[] = []
  for (const f of files) {
    let st
    try {
      st = await fs.stat(f.path)
    } catch {
      continue
    }
    if (st.size > MAX_SCAN_BYTES) continue
    try {
      const text = await fs.readFile(f.path, 'utf8')
      const lines: TranscriptLine[] = []
      for (const raw of text.split('\n')) {
        const l = parseLine(raw)
        if (l) lines.push(l)
      }
      all.push(...activitiesFromLines(lines))
    } catch {
      /* skip */
    }
  }
  all.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
  const activities = all.slice(0, cap)
  return { activities, stats: activityStats(activities) }
}

export async function activityResponse(
  root: string,
  pathname: string,
  _query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/activity') {
    return { status: 200, body: await activityFeed(root) }
  }
  return { status: 404, body: { error: 'not found' } }
}
