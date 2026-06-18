import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { memoryRoots, buildMemoryIndex, readMemoryFile, memoryResponse, type MemoryRoot } from '../server/src/memory'

let tmp: string
let roots: MemoryRoot[]

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-mem-'))
  const mem = path.join(tmp, 'projects', 'slug-a', 'memory')
  await fs.mkdir(mem, { recursive: true })
  await fs.writeFile(path.join(mem, 'MEMORY.md'), '# Index\n', 'utf8')
  await fs.writeFile(path.join(mem, 'note.md'), '# Note\nbody\n', 'utf8')
  const noise = path.join(tmp, 'projects', 'slug-a', 'memory', 'node_modules', 'pkg')
  await fs.mkdir(noise, { recursive: true })
  await fs.writeFile(path.join(noise, 'readme.md'), 'should be skipped', 'utf8')
  const agents = path.join(tmp, 'agents')
  await fs.mkdir(agents, { recursive: true })
  await fs.writeFile(path.join(agents, 'researcher.md'), '# Researcher\n', 'utf8')

  roots = [
    { category: 'memory', label: 'Memória', dir: path.join(tmp, 'projects'), match: 'md', maxDepth: 3 },
    { category: 'agents', label: 'Agentes', dir: agents, match: 'md', maxDepth: 2 },
  ]
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('buildMemoryIndex', () => {
  it('collects .md files per root and skips node_modules', async () => {
    const files = await buildMemoryIndex(roots)
    const names = files.map((f) => f.name).sort()
    expect(names).toEqual(['MEMORY.md', 'note.md', 'researcher.md'])
    expect(files.every((f) => f.id && f.category && f.name)).toBe(true)
    expect(new Set(files.map((f) => f.id)).size).toBe(files.length)
  })
})

describe('readMemoryFile', () => {
  it('returns content for a known id', async () => {
    const files = await buildMemoryIndex(roots)
    const target = files.find((f) => f.name === 'note.md')!
    const res = await readMemoryFile(roots, target.id)
    expect(res).not.toBeNull()
    expect(res!.content).toContain('body')
    expect(res!.file.name).toBe('note.md')
  })

  it('returns null for an unknown id', async () => {
    const res = await readMemoryFile(roots, 'memory/../../etc/passwd')
    expect(res).toBeNull()
  })
})

describe('memoryResponse', () => {
  it('200s the index on /api/memory', async () => {
    const r = await memoryResponse(roots, '/api/memory', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.files)).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(tmp)
  })

  it('200s content for a valid id and 404s a bad id', async () => {
    const idx = await memoryResponse(roots, '/api/memory', new URLSearchParams())
    const id = idx.body.files[0].id
    const ok = await memoryResponse(roots, '/api/memory/content', new URLSearchParams({ id }))
    expect(ok.status).toBe(200)
    expect(typeof ok.body.content).toBe('string')
    expect(JSON.stringify(ok.body)).not.toContain(tmp)
    const bad = await memoryResponse(roots, '/api/memory/content', new URLSearchParams({ id: 'nope' }))
    expect(bad.status).toBe(404)
  })
})

describe('memoryRoots', () => {
  it('produces categories for a given home + workspace', () => {
    const rs = memoryRoots('/home/u', '/work/space')
    const cats = rs.map((r) => r.category)
    expect(cats).toContain('memory')
    expect(cats).toContain('agents')
    expect(cats).toContain('skills')
    expect(cats).toContain('instructions')
  })
})
