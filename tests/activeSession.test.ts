import { describe, it, expect } from 'vitest'
import { isSessionFile, pickActiveSession } from '../server/src/activeSession'

describe('isSessionFile', () => {
  it('aceita .jsonl de sessão no diretório do projeto', () => {
    expect(isSessionFile('C:/x/projects/proj/abc.jsonl')).toBe(true)
  })
  it('rejeita arquivos dentro de subagents/', () => {
    expect(isSessionFile('C:/x/projects/proj/abc/subagents/agent-1.jsonl')).toBe(false)
    expect(isSessionFile('C:\\x\\projects\\proj\\abc\\subagents\\agent-1.jsonl')).toBe(false)
  })
  it('rejeita não-jsonl', () => {
    expect(isSessionFile('C:/x/projects/proj/abc.json')).toBe(false)
  })
})

describe('pickActiveSession', () => {
  it('escolhe o arquivo de sessão com mtime mais recente', () => {
    const files = [
      { path: 'C:/p/a.jsonl', mtimeMs: 100 },
      { path: 'C:/p/b.jsonl', mtimeMs: 300 },
      { path: 'C:/p/x/subagents/agent.jsonl', mtimeMs: 999 },
    ]
    expect(pickActiveSession(files)).toBe('C:/p/b.jsonl')
  })
  it('retorna null quando não há sessões', () => {
    expect(pickActiveSession([])).toBeNull()
  })
})
