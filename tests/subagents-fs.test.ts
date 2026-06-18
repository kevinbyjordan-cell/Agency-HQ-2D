import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { subAgentFeed, subAgentsResponse } from '../server/src/subagents'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-sa-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:01Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Do it' } }] } }),
    L({ type: 'user', timestamp: '2026-06-18T10:01:00Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: '<usage>subagent_tokens: 100\ntool_uses: 2\nduration_ms: 5000</usage>' }] } }),
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Agent', input: { subagent_type: 'y' } }] } }), 'utf8')
})

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('subAgentFeed', () => {
  it('aggregates delegations from main sessions with stats', async () => {
    const { subagents, stats } = await subAgentFeed(root, 25, 100)
    expect(subagents.length).toBe(1)
    expect(subagents[0]).toMatchObject({ type: 'general-purpose', project: 'A', status: 'done', tokens: 100 })
    expect(stats).toEqual({ total: 1, running: 0, done: 1, failed: 0 })
  })
})

describe('subAgentsResponse', () => {
  it('200s and never leaks absolute paths; 404s unknown', async () => {
    const r = await subAgentsResponse(root, '/api/subagents', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.subagents)).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(root)
    expect((await subAgentsResponse(root, '/api/nope', new URLSearchParams())).status).toBe(404)
  })
})
