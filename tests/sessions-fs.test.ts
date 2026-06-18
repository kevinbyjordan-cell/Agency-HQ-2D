import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sessionsIndex, readTranscript, sessionsResponse } from '../server/src/sessions'

let root: string

function line(obj: object): string {
  return JSON.stringify(obj)
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-sess-'))
  const projA = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(projA, 'subagents'), { recursive: true })
  await fs.writeFile(
    path.join(projA, 's1.jsonl'),
    [
      line({ type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'user', content: 'Olá agente' } }),
      line({ type: 'assistant', timestamp: '2026-06-18T10:00:05Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Oi!' }] } }),
    ].join('\n'),
    'utf8',
  )
  await fs.writeFile(path.join(projA, 'subagents', 'agent-x.jsonl'), line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'sub' }] } }), 'utf8')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('sessionsIndex', () => {
  it('lists main sessions (not subagents) with derived metadata', async () => {
    const idx = await sessionsIndex(root, 25)
    expect(idx.length).toBe(1)
    expect(idx[0].sessionId).toBe('s1')
    expect(idx[0].project).toBe('A')
    expect(idx[0].title).toBe('Olá agente')
    expect(idx[0].model).toBe('claude-opus-4-8')
    expect(idx[0].id.endsWith('s1.jsonl')).toBe(true)
  })
})

describe('readTranscript', () => {
  it('returns meta + bubbles for a valid id', async () => {
    const idx = await sessionsIndex(root, 25)
    const res = await readTranscript(root, idx[0].id, 250)
    expect(res).not.toBeNull()
    expect(res!.bubbles[0]).toMatchObject({ role: 'user', text: 'Olá agente' })
    expect(res!.meta.sessionId).toBe('s1')
  })

  it('rejects traversal / unknown ids', async () => {
    expect(await readTranscript(root, '../../etc/passwd', 250)).toBeNull()
    expect(await readTranscript(root, 'C--proj-A/subagents/agent-x.jsonl', 250)).toBeNull()
    expect(await readTranscript(root, 'C--proj-A/nope.jsonl', 250)).toBeNull()
  })
})

describe('sessionsResponse', () => {
  it('200s index and never leaks absolute paths', async () => {
    const r = await sessionsResponse(root, '/api/sessions', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.sessions)).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(root)
  })

  it('200s transcript for valid id, 404s bad id', async () => {
    const idx = await sessionsIndex(root, 25)
    const ok = await sessionsResponse(root, '/api/sessions/transcript', new URLSearchParams({ id: idx[0].id }))
    expect(ok.status).toBe(200)
    expect(Array.isArray(ok.body.bubbles)).toBe(true)
    const bad = await sessionsResponse(root, '/api/sessions/transcript', new URLSearchParams({ id: 'nope' }))
    expect(bad.status).toBe(404)
  })
})
