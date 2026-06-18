import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { activityFeed, activityResponse } from '../server/src/activity'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-act-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'user', content: 'oi' } }),
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Read', input: {} }] } }),
    L({ type: 'user', timestamp: '2026-06-18T10:00:02Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: false }] } }),
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Bash' }] } }), 'utf8')
})
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('activityFeed', () => {
  it('aggregates activities from main sessions (not subagents), newest first, with stats', async () => {
    const { activities, stats } = await activityFeed(root, 25, 300)
    expect(activities.length).toBe(1)
    expect(activities[0]).toMatchObject({ tool: 'Read', project: 'A', status: 'ok' })
    expect(stats).toEqual({ total: 1, successful: 1, errors: 0 })
  })
})

describe('activityResponse', () => {
  it('200s the feed and never leaks absolute paths', async () => {
    const r = await activityResponse(root, '/api/activity', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.activities)).toBe(true)
    expect(r.body.stats.total).toBe(1)
    expect(JSON.stringify(r.body)).not.toContain(root)
  })
  it('404s unknown paths', async () => {
    const r = await activityResponse(root, '/api/nope', new URLSearchParams())
    expect(r.status).toBe(404)
  })
})
