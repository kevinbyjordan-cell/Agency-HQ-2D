import { promises as fs } from 'node:fs'
import type { TranscriptLine, ContentBlock } from './parse'
import { parseLine } from './parse'
import { labelForAgentType } from './labels'
import { listSessionFiles } from './sessions'

export interface SubAgent {
  id: string
  type: string
  label: string
  task: string
  model: string | null
  project: string
  sessionId: string | null
  status: 'running' | 'done' | 'failed'
  spawnTs: string | null
  endTs: string | null
  durationMs: number | null
  tokens: number | null
  toolUses: number | null
}

export interface SubAgentStats {
  total: number
  running: number
  done: number
  failed: number
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function firstLine(s: string, max = 120): string {
  const line = (s ?? '').split('\n').find((l) => l.trim().length > 0) ?? ''
  const t = line.trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function textOf(b: ContentBlock): string {
  const c = (b as { content?: unknown }).content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return (c as ContentBlock[]).filter((x) => x.type === 'text' && typeof x.text === 'string').map((x) => x.text as string).join('\n')
  return typeof b.text === 'string' ? b.text : ''
}

function num(re: RegExp, text: string): number | null {
  const m = text.match(re)
  return m ? Number(m[1]) : null
}

export function subAgentsFromLines(lines: TranscriptLine[]): SubAgent[] {
  let project = ''
  let sessionId: string | null = null
  const byId = new Map<string, SubAgent>()
  const order: string[] = []

  for (const line of lines) {
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []

    if (line.type === 'assistant') {
      for (const b of content) {
        if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && b.id) {
          const type = (b.input?.subagent_type as string) ?? 'unknown'
          const task = firstLine(((b.input?.description as string) ?? (b.input?.prompt as string) ?? '') as string)
          const model = (b.input?.model as string) ?? null
          const rec: SubAgent = {
            id: b.id, type, label: labelForAgentType(type), task, model, project, sessionId,
            status: 'running', spawnTs: line.timestamp ?? null, endTs: null, durationMs: null, tokens: null, toolUses: null,
          }
          if (!byId.has(b.id)) order.push(b.id)
          byId.set(b.id, rec)
        }
      }
    } else if (line.type === 'user') {
      for (const b of content) {
        if (b.type === 'tool_result' && b.tool_use_id && byId.has(b.tool_use_id)) {
          const rec = byId.get(b.tool_use_id)!
          rec.status = b.is_error ? 'failed' : 'done'
          rec.endTs = line.timestamp ?? null
          const text = textOf(b)
          rec.tokens = num(/subagent_tokens:\s*(\d+)/, text)
          rec.toolUses = num(/tool_uses:\s*(\d+)/, text)
          const dur = num(/duration_ms:\s*(\d+)/, text)
          rec.durationMs = dur != null ? dur : rec.spawnTs && rec.endTs ? Date.parse(rec.endTs) - Date.parse(rec.spawnTs) : null
        }
      }
    }
  }
  return order.map((id) => byId.get(id)!)
}

export function subAgentStats(subs: SubAgent[]): SubAgentStats {
  let running = 0, done = 0, failed = 0
  for (const s of subs) {
    if (s.status === 'running') running++
    else if (s.status === 'done') done++
    else failed++
  }
  return { total: subs.length, running, done, failed }
}

// ── Filesystem layer ────────────────────────────────────────────────────────

const MAX_SCAN_BYTES = 20_000_000
const SESSION_LIMIT = 25
const SUBAGENT_CAP = 100

export async function subAgentFeed(
  root: string,
  sessionLimit = SESSION_LIMIT,
  cap = SUBAGENT_CAP,
): Promise<{ subagents: SubAgent[]; stats: SubAgentStats }> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, sessionLimit)
  const all: SubAgent[] = []
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
      all.push(...subAgentsFromLines(lines))
    } catch {
      /* skip */
    }
  }
  all.sort((a, b) => (b.spawnTs ?? '').localeCompare(a.spawnTs ?? ''))
  const subagents = all.slice(0, cap)
  return { subagents, stats: subAgentStats(subagents) }
}

export async function subAgentsResponse(
  root: string,
  pathname: string,
  _query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/subagents') {
    return { status: 200, body: await subAgentFeed(root) }
  }
  return { status: 404, body: { error: 'not found' } }
}
