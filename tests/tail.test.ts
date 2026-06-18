import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FileTailer } from '../server/src/tail'

async function tmpFile(): Promise<string> {
  const p = path.join(os.tmpdir(), `tail-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`)
  await fs.writeFile(p, '')
  return p
}

describe('FileTailer', () => {
  it('retorna linhas completas novas e bufferiza parciais', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'a\nb\n')
    expect(await t.readNewLines()).toEqual(['a', 'b'])
    expect(await t.readNewLines()).toEqual([])
    await fs.appendFile(p, 'par')
    expect(await t.readNewLines()).toEqual([])
    await fs.appendFile(p, 'tial\n')
    expect(await t.readNewLines()).toEqual(['partial'])
  })

  it('reseta quando o arquivo é truncado/reescrito', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'x\n')
    expect(await t.readNewLines()).toEqual(['x'])
    await fs.writeFile(p, 'y\n')
    expect(await t.readNewLines()).toEqual(['y'])
  })

  it('retorna [] se o arquivo ainda não existe', async () => {
    const p = path.join(os.tmpdir(), `tail-missing-${Date.now()}.jsonl`)
    const t = new FileTailer(p)
    expect(await t.readNewLines()).toEqual([])
  })
})
