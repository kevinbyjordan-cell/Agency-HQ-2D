import { describe, it, expect } from 'vitest'
import { toolActivity } from '../server/src/toolActivity'

describe('toolActivity', () => {
  it('mapeia tools conhecidas para frases em PT', () => {
    expect(toolActivity('Read')).toBe('Lendo arquivos')
    expect(toolActivity('Bash')).toBe('Rodando comando')
    expect(toolActivity('WebSearch')).toBe('Pesquisando na web')
  })
  it('faz fallback para "Usando <tool>"', () => {
    expect(toolActivity('FooBar')).toBe('Usando FooBar')
  })
})
