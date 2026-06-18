import { describe, it, expect } from 'vitest'
import { subAgentsFromLines, subAgentStats } from '../server/src/subagents'
import type { TranscriptLine } from '../server/src/parse'

const USAGE = '...trabalho... agentId: ax1\n<usage>subagent_tokens: 28139\ntool_uses: 13\nduration_ms: 89991</usage>'

const lines: TranscriptLine[] = [
  { type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/x/GOOGLE ADS PRO', sessionId: 's1', message: { role: 'user', content: 'vai' } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [
    { type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Implement Task 1', model: 'sonnet', prompt: 'do it' } },
    { type: 'tool_use', id: 't2', name: 'Task', input: { subagent_type: 'Explore', description: 'Search code' } },
  ] } },
  { type: 'user', timestamp: '2026-06-18T10:02:00Z', message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 't1', is_error: false, content: USAGE },
  ] } },
]

describe('subAgentsFromLines', () => {
  it('pairs spawns with results and parses usage from result text', () => {
    const subs = subAgentsFromLines(lines)
    expect(subs.length).toBe(2)
    const t1 = subs.find((s) => s.id === 't1')!
    expect(t1).toMatchObject({ type: 'general-purpose', label: 'Generalista', task: 'Implement Task 1', model: 'sonnet', project: 'GOOGLE ADS PRO', sessionId: 's1', status: 'done', tokens: 28139, toolUses: 13, durationMs: 89991 })
    const t2 = subs.find((s) => s.id === 't2')!
    expect(t2).toMatchObject({ type: 'Explore', task: 'Search code', status: 'running', tokens: null })
  })
  it('marks errored results as failed and is safe on empty', () => {
    const errored: TranscriptLine[] = [
      { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e', name: 'Agent', input: { subagent_type: 'x', description: 'd' } }] } },
      { type: 'user', timestamp: '2026-06-18T10:00:05Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e', is_error: true, content: 'boom' }] } },
    ]
    expect(subAgentsFromLines(errored)[0].status).toBe('failed')
    expect(subAgentsFromLines([])).toEqual([])
  })
})

describe('subAgentStats', () => {
  it('counts total/running/done/failed', () => {
    const subs = subAgentsFromLines(lines)
    expect(subAgentStats(subs)).toEqual({ total: 2, running: 1, done: 1, failed: 0 })
  })
})
