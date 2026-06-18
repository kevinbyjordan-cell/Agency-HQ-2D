import { describe, it, expect } from 'vitest'
import { labelForAgentType } from '../server/src/labels'

describe('labelForAgentType', () => {
  it('mapeia tipos conhecidos para nomes amigáveis', () => {
    expect(labelForAgentType('orchestrator')).toBe('Orquestrador')
    expect(labelForAgentType('copywriter')).toBe('Copywriter')
    expect(labelForAgentType('pesquisador-local')).toBe('Pesquisador local')
  })
  it('faz fallback para o próprio tipo quando desconhecido', () => {
    expect(labelForAgentType('algo-novo')).toBe('algo-novo')
  })
})
