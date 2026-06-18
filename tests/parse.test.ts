import { describe, it, expect } from 'vitest'
import { parseLine } from '../server/src/parse'

describe('parseLine', () => {
  it('parseia uma linha JSON válida com type', () => {
    const line = parseLine('{"type":"assistant","timestamp":"2026-06-18T00:00:00Z"}')
    expect(line?.type).toBe('assistant')
  })
  it('retorna null para linha vazia ou só espaços', () => {
    expect(parseLine('')).toBeNull()
    expect(parseLine('   ')).toBeNull()
  })
  it('retorna null para JSON inválido', () => {
    expect(parseLine('{nao eh json')).toBeNull()
  })
  it('retorna null quando falta o campo type', () => {
    expect(parseLine('{"foo":1}')).toBeNull()
  })
})
