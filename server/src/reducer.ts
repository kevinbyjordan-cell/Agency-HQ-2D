import type { Agent, OfficeState } from './types'
import type { TranscriptLine, ContentBlock } from './parse'
import { KNOWN_AGENTS, ORCHESTRATOR_ID } from './constants'
import { messageCostUsd } from './pricing'
import { labelForAgentType } from './labels'
import { toolActivity } from './toolActivity'

function makeOrchestrator(): Agent {
  return {
    id: ORCHESTRATOR_ID,
    type: 'orchestrator',
    label: labelForAgentType('orchestrator'),
    isVisitor: false,
    status: 'idle',
    activity: '',
    speech: '',
    tool: null,
  }
}

export function initialState(): OfficeState {
  return {
    sessionId: null,
    project: '',
    cwd: '',
    status: 'idle',
    agents: [makeOrchestrator()],
    updatedAt: null,
    costUsd: 0,
  }
}

export function projectName(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function firstLine(s: string, max = 140): string {
  const line = (s ?? '').split('\n').find((l) => l.trim().length > 0) ?? ''
  const t = line.trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

export function reduce(state: OfficeState, line: TranscriptLine): OfficeState {
  const next: OfficeState = { ...state, agents: state.agents.map((a) => ({ ...a })) }
  const orch = next.agents.find((a) => a.id === ORCHESTRATOR_ID)!

  if (line.cwd && !next.cwd) {
    next.cwd = line.cwd
    next.project = projectName(line.cwd)
  }
  if (line.sessionId) next.sessionId = line.sessionId

  const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []

  if (line.type === 'assistant') {
    next.status = 'active'
    orch.status = 'working'
    if (line.message?.usage && line.message?.model) {
      next.costUsd += messageCostUsd(line.message.model, line.message.usage)
    }
    for (const b of content) {
      if (b.type === 'text' && b.text && b.text.trim()) {
        orch.speech = firstLine(b.text)
      } else if (b.type === 'tool_use') {
        if (b.name === 'Agent' || b.name === 'Task') {
          const type = (b.input?.subagent_type as string) ?? 'unknown'
          const desc = ((b.input?.description as string) ?? (b.input?.prompt as string) ?? '') as string
          const id = b.id ?? `agent-${next.agents.length}`
          const agent: Agent = {
            id,
            type,
            label: labelForAgentType(type),
            isVisitor: !KNOWN_AGENTS.has(type),
            status: 'working',
            activity: 'Começando',
            speech: firstLine(desc),
            tool: null,
          }
          const existing = next.agents.find((a) => a.id === id)
          if (existing) Object.assign(existing, agent)
          else next.agents.push(agent)
        } else {
          orch.tool = b.name ?? null
          orch.activity = toolActivity(b.name ?? '')
        }
      }
    }
  } else if (line.type === 'user') {
    for (const b of content) {
      if (b.type === 'tool_result') {
        const target = next.agents.find((a) => a.id === b.tool_use_id)
        if (target && target.id !== ORCHESTRATOR_ID) {
          target.status = 'done'
          target.tool = null
          target.activity = b.is_error ? 'Erro' : 'Entregou'
        } else {
          orch.tool = null
          orch.activity = ''
        }
      }
    }
  }

  if (line.timestamp) next.updatedAt = line.timestamp
  return next
}
