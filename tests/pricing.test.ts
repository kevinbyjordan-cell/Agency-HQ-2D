import { describe, it, expect } from 'vitest'
import { messageCostUsd } from '../server/src/pricing'

describe('messageCostUsd', () => {
  it('precifica input + output do Opus 4.8', () => {
    const c = messageCostUsd('claude-opus-4-8', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    expect(c).toBeCloseTo(30, 5)
  })
  it('cache read = 0.1x input; cache write 5m = 1.25x; 1h = 2x (Opus 4.8)', () => {
    const c = messageCostUsd('claude-opus-4-8', {
      cache_read_input_tokens: 1_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    })
    expect(c).toBeCloseTo(16.75, 5)
  })
  it('usa cache_creation_input_tokens (5m) quando não há breakdown', () => {
    const c = messageCostUsd('claude-opus-4-8', { cache_creation_input_tokens: 1_000_000 })
    expect(c).toBeCloseTo(6.25, 5)
  })
  it('preços por modelo (Fable/Sonnet/Haiku)', () => {
    expect(messageCostUsd('claude-fable-5', { input_tokens: 1_000_000 })).toBeCloseTo(10, 5)
    expect(messageCostUsd('claude-sonnet-4-6', { output_tokens: 1_000_000 })).toBeCloseTo(15, 5)
    expect(messageCostUsd('claude-haiku-4-5', { input_tokens: 1_000_000 })).toBeCloseTo(1, 5)
  })
  it('modelo desconhecido custa 0', () => {
    expect(messageCostUsd('modelo-x', { input_tokens: 1_000_000 })).toBe(0)
  })
})
