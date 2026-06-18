import { describe, it, expect } from 'vitest'
import { newEconomicsAcc, addLinesToEconomics, finalizeEconomics } from '../server/src/economics'
import type { TranscriptLine } from '../server/src/parse'

const lines: TranscriptLine[] = [
  { type: 'assistant', timestamp: '2026-06-18T10:00:00Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 } } },
  { type: 'assistant', timestamp: '2026-06-17T10:00:00Z', message: { role: 'assistant', model: 'claude-sonnet-4-6', usage: { input_tokens: 4000, output_tokens: 50 } } },
  { type: 'user', timestamp: '2026-06-18T10:00:01Z', message: { role: 'user', content: 'x' } },
]

describe('economics accumulator', () => {
  it('aggregates per-model, totals and per-day cost', () => {
    const acc = newEconomicsAcc()
    addLinesToEconomics(acc, lines)
    const e = finalizeEconomics(acc)
    expect(e.byModel.length).toBe(2)
    expect(e.byModel[0].costUsd).toBeGreaterThan(e.byModel[1].costUsd)
    expect(e.totals.messages).toBe(2)
    expect(e.totals.input).toBe(5000)
    expect(e.totals.output).toBe(150)
    expect(e.totals.cacheRead).toBe(2000)
    expect(e.totals.cacheWrite).toBe(500)
    expect(e.totals.costUsd).toBeGreaterThan(0)
    expect(e.daily.length).toBe(2)
    expect(e.daily[0].date).toBe('2026-06-17')
    expect(e.daily[1].date).toBe('2026-06-18')
  })

  it('projects monthly from recent daily average', () => {
    const acc = newEconomicsAcc()
    addLinesToEconomics(acc, [
      { type: 'assistant', timestamp: '2026-06-18T10:00:00Z', message: { role: 'assistant', model: 'claude-sonnet-4-6', usage: { input_tokens: 1_000_000, output_tokens: 0 } } },
    ])
    const e = finalizeEconomics(acc)
    expect(e.projectionUsd).toBeCloseTo(90, 5)
  })

  it('is safe on empty', () => {
    const e = finalizeEconomics(newEconomicsAcc())
    expect(e.byModel).toEqual([])
    expect(e.totals.costUsd).toBe(0)
    expect(e.projectionUsd).toBe(0)
  })
})
