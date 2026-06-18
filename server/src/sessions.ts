import type { TranscriptLine, ContentBlock } from './parse'
import { messageCostUsd, contextWindow, type UsageTokens } from './pricing'

export interface SessionMeta {
  id: string
  sessionId: string | null
  project: string
  model: string | null
  messages: number
  tokens: number
  costUsd: number
  contextTokens: number
  contextPct: number
  title: string
  startedAt: string | null
  updatedAt: string | null
  partial: boolean
}

export interface Bubble {
  role: 'user' | 'assistant' | 'tool'
  kind: 'text' | 'tool_use' | 'tool_result'
  ts: string | null
  text: string
  tool?: string
  isError?: boolean
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
  }
  return ''
}

function truncate(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, unknown>
  const pick = i.file_path ?? i.path ?? i.command ?? i.pattern ?? i.query ?? i.description ?? i.prompt ?? i.url
  return typeof pick === 'string' ? truncate(pick, 100) : ''
}

function resultPreview(b: ContentBlock): string {
  const c = (b as { content?: unknown }).content
  if (typeof c === 'string') return truncate(c, 300)
  if (Array.isArray(c)) return truncate(textFromContent(c), 300)
  if (typeof b.text === 'string') return truncate(b.text, 300)
  return ''
}

export function sessionMetaFromLines(id: string, lines: TranscriptLine[]): SessionMeta {
  let sessionId: string | null = null
  let project = ''
  let model: string | null = null
  let messages = 0
  let tokens = 0
  let costUsd = 0
  let lastUsage: UsageTokens | null = null
  let title = ''
  let startedAt: string | null = null
  let updatedAt: string | null = null

  for (const line of lines) {
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.timestamp) {
      if (!startedAt) startedAt = line.timestamp
      updatedAt = line.timestamp
    }
    if (line.type === 'user') {
      messages++
      if (!title) {
        const t = textFromContent(line.message?.content).trim()
        if (t) title = truncate(t, 140)
      }
    } else if (line.type === 'assistant') {
      messages++
      if (line.message?.model) model = line.message.model
      const u = line.message?.usage
      if (u) {
        tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
        if (line.message?.model) costUsd += messageCostUsd(line.message.model, u)
        lastUsage = u
      }
    }
  }

  const contextTokens = lastUsage
    ? (lastUsage.input_tokens ?? 0) + (lastUsage.cache_read_input_tokens ?? 0) + (lastUsage.cache_creation_input_tokens ?? 0)
    : 0
  const contextPct = model && contextTokens > 0 ? contextTokens / contextWindow(model) : 0

  return { id, sessionId, project, model, messages, tokens, costUsd, contextTokens, contextPct, title, startedAt, updatedAt, partial: false }
}

export function bubblesFromLines(lines: TranscriptLine[], cap: number): Bubble[] {
  const out: Bubble[] = []
  for (const line of lines) {
    const ts = line.timestamp ?? null
    if (line.type === 'user') {
      const content = line.message?.content
      if (typeof content === 'string') {
        if (content.trim()) out.push({ role: 'user', kind: 'text', ts, text: content })
        continue
      }
      const blocks = Array.isArray(content) ? content : []
      for (const b of blocks) {
        if (b.type === 'text' && b.text && b.text.trim()) out.push({ role: 'user', kind: 'text', ts, text: b.text })
        else if (b.type === 'tool_result') out.push({ role: 'tool', kind: 'tool_result', ts, text: resultPreview(b), isError: !!b.is_error })
      }
    } else if (line.type === 'assistant') {
      const blocks = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
      for (const b of blocks) {
        if (b.type === 'text' && b.text && b.text.trim()) out.push({ role: 'assistant', kind: 'text', ts, text: b.text })
        else if (b.type === 'tool_use') out.push({ role: 'assistant', kind: 'tool_use', ts, text: toolSummary(b.input), tool: b.name ?? '' })
      }
    }
  }
  return cap > 0 && out.length > cap ? out.slice(out.length - cap) : out
}
