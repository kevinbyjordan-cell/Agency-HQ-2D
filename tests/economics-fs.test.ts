import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { economicsFeed, economicsResponse } from '../server/src/economics'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-eco-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 100 } } }),
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 9999 } } }), 'utf8')
})
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('economicsFeed', () => {
  it('aggregates economics from main sessions only', async () => {
    const e = await economicsFeed(root, 25)
    expect(e.totals.messages).toBe(1)
    expect(e.byModel.length).toBe(1)
    expect(e.byModel[0].model).toBe('claude-opus-4-8')
    expect(e.totals.input).toBe(1000)
  })
})

describe('economicsResponse', () => {
  it('200s economics and 404s unknown', async () => {
    const r = await economicsResponse(root, '/api/economics', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(r.body.totals.messages).toBe(1)
    expect(Array.isArray(r.body.byModel)).toBe(true)
    expect((await economicsResponse(root, '/api/nope', new URLSearchParams())).status).toBe(404)
  })
})
