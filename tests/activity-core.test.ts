import { describe, it, expect } from 'vitest'
import { activitiesFromLines, activityStats } from '../server/src/activity'
import type { TranscriptLine } from '../server/src/parse'

const lines: TranscriptLine[] = [
  { type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/x/GOOGLE ADS PRO', sessionId: 's1', message: { role: 'user', content: 'vai' } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [ { type: 'tool_use', id: 'a', name: 'Read', input: { file_path: '/x' } }, { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'ls' } } ] } },
  { type: 'user', timestamp: '2026-06-18T10:00:02Z', message: { role: 'user', content: [ { type: 'tool_result', tool_use_id: 'a', is_error: false }, { type: 'tool_result', tool_use_id: 'b', is_error: true } ] } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:03Z', message: { role: 'assistant', content: [ { type: 'tool_use', id: 'c', name: 'Write', input: { file_path: '/y' } } ] } },
]

describe('activitiesFromLines', () => {
  it('emits one activity per tool_use with project, session, label and paired status', () => {
    const a = activitiesFromLines(lines)
    expect(a.length).toBe(3)
    expect(a[0]).toMatchObject({ tool: 'Read', project: 'GOOGLE ADS PRO', sessionId: 's1', status: 'ok', label: 'Lendo arquivos' })
    expect(a[1]).toMatchObject({ tool: 'Bash', status: 'error' })
    expect(a[2]).toMatchObject({ tool: 'Write', status: 'pending' })
    expect(a[0].ts).toBe('2026-06-18T10:00:01Z')
  })
  it('is safe on empty input', () => {
    expect(activitiesFromLines([])).toEqual([])
  })
})

describe('activityStats', () => {
  it('counts total, successful, errors', () => {
    const a = activitiesFromLines(lines)
    expect(activityStats(a)).toEqual({ total: 3, successful: 1, errors: 1 })
  })
})
