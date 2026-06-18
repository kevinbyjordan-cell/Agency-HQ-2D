import { describe, it, expect } from 'vitest'
import { sessionMetaFromLines, bubblesFromLines } from '../server/src/sessions'
import type { TranscriptLine } from '../server/src/parse'

const lines: TranscriptLine[] = [
  { type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/Users/kevin/Desktop/AGENCIA/VENDA SITES/GOOGLE ADS PRO', sessionId: 'abc-123', message: { role: 'user', content: 'Crie o relatório de campanhas' } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:05Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000 }, content: [ { type: 'text', text: 'Vou começar pelo relatório.' }, { type: 'tool_use', name: 'Read', input: { file_path: '/reports/x.csv' } } ] } },
  { type: 'user', timestamp: '2026-06-18T10:00:06Z', message: { role: 'user', content: [ { type: 'tool_result', tool_use_id: 't1', is_error: false, text: 'ok, 42 linhas' } ] } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:10Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 8000, output_tokens: 300, cache_read_input_tokens: 12000, cache_creation_input_tokens: 2000 }, content: [ { type: 'text', text: 'Relatório pronto.' } ] } },
]

describe('sessionMetaFromLines', () => {
  it('derives project, sessionId, model, totals, title, timestamps', () => {
    const m = sessionMetaFromLines('GOOGLE ADS PRO/s1.jsonl', lines)
    expect(m.id).toBe('GOOGLE ADS PRO/s1.jsonl')
    expect(m.sessionId).toBe('abc-123')
    expect(m.project).toBe('GOOGLE ADS PRO')
    expect(m.model).toBe('claude-opus-4-8')
    expect(m.messages).toBe(4)
    expect(m.title).toBe('Crie o relatório de campanhas')
    expect(m.startedAt).toBe('2026-06-18T10:00:00Z')
    expect(m.updatedAt).toBe('2026-06-18T10:00:10Z')
    expect(m.tokens).toBe(1000 + 200 + 8000 + 300)
    expect(m.costUsd).toBeGreaterThan(0)
  })

  it('computes context from the LAST assistant usage vs the model window', () => {
    const m = sessionMetaFromLines('p/s.jsonl', lines)
    expect(m.contextTokens).toBe(22000)
    expect(m.contextPct).toBeCloseTo(22000 / 1_000_000, 6)
  })

  it('is safe on empty input', () => {
    const m = sessionMetaFromLines('p/empty.jsonl', [])
    expect(m.model).toBeNull()
    expect(m.contextPct).toBe(0)
    expect(m.title).toBe('')
    expect(m.messages).toBe(0)
  })
})

describe('bubblesFromLines', () => {
  it('maps user/assistant/tool blocks into bubbles', () => {
    const b = bubblesFromLines(lines, 100)
    expect(b[0]).toMatchObject({ role: 'user', kind: 'text', text: 'Crie o relatório de campanhas' })
    expect(b.find((x) => x.kind === 'tool_use')).toMatchObject({ role: 'assistant', tool: 'Read' })
    expect(b.find((x) => x.kind === 'tool_result')).toMatchObject({ role: 'tool', isError: false })
    expect(b.some((x) => x.role === 'assistant' && x.text === 'Relatório pronto.')).toBe(true)
  })

  it('keeps only the last `cap` bubbles', () => {
    const b = bubblesFromLines(lines, 1)
    expect(b.length).toBe(1)
    expect(b[0].text).toBe('Relatório pronto.')
  })
})
