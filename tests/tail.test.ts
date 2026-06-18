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

  it('reseta quando o arquivo encolhe (truncamento)', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'xxxx\n')
    expect(await t.readNewLines()).toEqual(['xxxx'])
    // novo conteúdo MENOR que o offset → reset determinístico por tamanho
    await fs.writeFile(p, 'y\n')
    expect(await t.readNewLines()).toEqual(['y'])
  })

  it('reseta em reescrita de mesmo tamanho quando o mtime muda', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'x\n')
    expect(await t.readNewLines()).toEqual(['x'])
    // mesmo tamanho (2 bytes): força o mtime adiante para tornar a detecção
    // determinística (sem depender do tick do filesystem entre as escritas)
    await fs.writeFile(p, 'y\n')
    await fs.utimes(p, new Date(), new Date(Date.now() + 5000))
    expect(await t.readNewLines()).toEqual(['y'])
  })

  it('retorna [] se o arquivo ainda não existe', async () => {
    const p = path.join(os.tmpdir(), `tail-missing-${Date.now()}.jsonl`)
    const t = new FileTailer(p)
    expect(await t.readNewLines()).toEqual([])
  })
})
