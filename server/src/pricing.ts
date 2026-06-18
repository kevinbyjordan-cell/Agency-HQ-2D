// Preços por milhão de tokens (USD). Fonte: skill claude-api (cache 2026-06-04).
export interface ModelPrice {
  input: number
  output: number
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

const CACHE_READ_MULT = 0.1
const CACHE_WRITE_5M_MULT = 1.25
const CACHE_WRITE_1H_MULT = 2

export interface UsageTokens {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: {
    ephemeral_5m_input_tokens?: number
    ephemeral_1h_input_tokens?: number
  }
}

export function messageCostUsd(model: string, usage: UsageTokens): number {
  const p = PRICES[model]
  if (!p) return 0
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0

  const c5 = usage.cache_creation?.ephemeral_5m_input_tokens
  const c1 = usage.cache_creation?.ephemeral_1h_input_tokens
  let cacheWriteCost: number
  if (c5 != null || c1 != null) {
    cacheWriteCost = (c5 ?? 0) * p.input * CACHE_WRITE_5M_MULT + (c1 ?? 0) * p.input * CACHE_WRITE_1H_MULT
  } else {
    cacheWriteCost = (usage.cache_creation_input_tokens ?? 0) * p.input * CACHE_WRITE_5M_MULT
  }

  const total = input * p.input + output * p.output + cacheRead * p.input * CACHE_READ_MULT + cacheWriteCost
  return total / 1_000_000
}
