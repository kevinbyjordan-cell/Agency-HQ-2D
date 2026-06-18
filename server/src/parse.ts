import type { UsageTokens } from './pricing'

export interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  is_error?: boolean
  content?: string | ContentBlock[]
}

export interface TranscriptLine {
  type: string
  timestamp?: string
  cwd?: string
  sessionId?: string
  isSidechain?: boolean
  message?: {
    role?: string
    model?: string
    usage?: UsageTokens
    content?: ContentBlock[] | string
  }
}

export function parseLine(raw: string): TranscriptLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && typeof obj.type === 'string') {
      return obj as TranscriptLine
    }
    return null
  } catch {
    return null
  }
}
