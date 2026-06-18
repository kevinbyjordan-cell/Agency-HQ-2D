import { describe, it, expect } from 'vitest'
import { initialState, projectName, reduce } from '../server/src/reducer'
import type { TranscriptLine } from '../server/src/parse'

const ts = '2026-06-18T12:00:00Z'

describe('projectName', () => {
  it('extrai o basename de um caminho Windows', () => {
    expect(projectName('C:\\Users\\k\\Desktop\\GOOGLE ADS PRO')).toBe('GOOGLE ADS PRO')
  })
  it('extrai o basename de um caminho POSIX com barra final', () => {
    expect(projectName('/home/k/projects/site-ypw/')).toBe('site-ypw')
  })
})

describe('initialState', () => {
  it('começa com o orquestrador ocioso e sessão idle', () => {
    const s = initialState()
    expect(s.status).toBe('idle')
    expect(s.agents).toHaveLength(1)
    expect(s.agents[0].id).toBe('orchestrator')
    expect(s.agents[0].label).toBe('Orquestrador')
  })
})

describe('reduce', () => {
  it('define projeto/cwd a partir da primeira linha com cwd', () => {
    const line: TranscriptLine = { type: 'system', cwd: 'C:/x/MEU PROJETO', timestamp: ts }
    const s = reduce(initialState(), line)
    expect(s.project).toBe('MEU PROJETO')
    expect(s.cwd).toBe('C:/x/MEU PROJETO')
  })

  it('texto do assistente vira fala do orquestrador e ativa a sessão', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Vamos começar o trabalho' }] },
    }
    const s = reduce(initialState(), line)
    expect(s.status).toBe('active')
    expect(s.agents[0].speech).toBe('Vamos começar o trabalho')
    expect(s.agents[0].status).toBe('working')
  })

  it('tool_use comum define a atividade do orquestrador', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
    }
    const s = reduce(initialState(), line)
    expect(s.agents[0].tool).toBe('Read')
    expect(s.agents[0].activity).toBe('Lendo arquivos')
  })

  it('spawn de Agent adiciona um subagente trabalhando', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use', id: 'tool-abc', name: 'Agent',
          input: { subagent_type: 'copywriter', description: 'Escrever a home', prompt: 'Escreva...' },
        }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.agents).toHaveLength(2)
    const sub = s.agents[1]
    expect(sub.id).toBe('tool-abc')
    expect(sub.type).toBe('copywriter')
    expect(sub.label).toBe('Copywriter')
    expect(sub.isVisitor).toBe(false)
    expect(sub.status).toBe('working')
    expect(sub.speech).toBe('Escrever a home')
  })

  it('marca subagente desconhecido como visitante', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool-x', name: 'Agent', input: { subagent_type: 'Explore', description: 'Mapear repo' } }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.agents[1].isVisitor).toBe(true)
  })

  it('tool_result do subagente o marca como done', () => {
    let s = initialState()
    s = reduce(s, {
      type: 'assistant', timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-abc', name: 'Agent', input: { subagent_type: 'copywriter', description: 'x' } }] },
    })
    s = reduce(s, {
      type: 'user', timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-abc', is_error: false }] },
    })
    const sub = s.agents.find((a) => a.id === 'tool-abc')!
    expect(sub.status).toBe('done')
    expect(sub.activity).toBe('Entregou')
  })

  it('tool_result do orquestrador limpa a tool sem virar done', () => {
    let s = initialState()
    s = reduce(s, {
      type: 'assistant', timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
    })
    s = reduce(s, {
      type: 'user', timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1' }] },
    })
    expect(s.agents[0].tool).toBeNull()
  })

  it('não muta o estado anterior (imutabilidade)', () => {
    const prev = initialState()
    const after = reduce(prev, { type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text: 'oi' }] } })
    expect(prev.agents[0].speech).toBe('')
    expect(after).not.toBe(prev)
  })

  it('acumula custo de API a partir de usage + model', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        content: [{ type: 'text', text: 'oi' }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.costUsd).toBeCloseTo(30, 5)
  })
})
