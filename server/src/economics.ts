import { promises as fs } from 'node:fs'
import type { TranscriptLine } from './parse'
import { parseLine } from './parse'
import { messageCostUsd, type UsageTokens } from './pricing'
import { listSessionFiles } from './sessions'

export interface ModelLine {
  model: string
  costUsd: number
  input: number
  output: number
  cache: number
  messages: number
}

export interface EconomicsTotals {
  costUsd: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messages: number
}

export interface EconomicsAcc {
  byModel: Map<string, ModelLine>
  totals: EconomicsTotals
  daily: Map<string, number>
}

export interface Economics {
  totals: EconomicsTotals
  byModel: ModelLine[]
  daily: { date: string; costUsd: number }[]
  projectionUsd: number
}

export function newEconomicsAcc(): EconomicsAcc {
  return {
    byModel: new Map(),
    totals: { costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 },
    daily: new Map(),
  }
}

function cacheWriteTokens(u: UsageTokens): number {
  const c5 = u.cache_creation?.ephemeral_5m_input_tokens
  const c1 = u.cache_creation?.ephemeral_1h_input_tokens
  if (c5 != null || c1 != null) return (c5 ?? 0) + (c1 ?? 0)
  return u.cache_creation_input_tokens ?? 0
}

export function addLinesToEconomics(acc: EconomicsAcc, lines: TranscriptLine[]): void {
  for (const line of lines) {
    if (line.type !== 'assistant') continue
    const model = line.message?.model
    const u = line.message?.usage
    if (!model || !u) continue
    const cost = messageCostUsd(model, u)
    const input = u.input_tokens ?? 0
    const output = u.output_tokens ?? 0
    const cacheRead = u.cache_read_input_tokens ?? 0
    const cacheWrite = cacheWriteTokens(u)

    let m = acc.byModel.get(model)
    if (!m) {
      m = { model, costUsd: 0, input: 0, output: 0, cache: 0, messages: 0 }
      acc.byModel.set(model, m)
    }
    m.costUsd += cost
    m.input += input
    m.output += output
    m.cache += cacheRead + cacheWrite
    m.messages += 1

    acc.totals.costUsd += cost
    acc.totals.input += input
    acc.totals.output += output
    acc.totals.cacheRead += cacheRead
    acc.totals.cacheWrite += cacheWrite
    acc.totals.messages += 1

    if (line.timestamp) {
      const date = line.timestamp.slice(0, 10)
      acc.daily.set(date, (acc.daily.get(date) ?? 0) + cost)
    }
  }
}

export function finalizeEconomics(acc: EconomicsAcc, days = 14): Economics {
  const byModel = [...acc.byModel.values()].sort((a, b) => b.costUsd - a.costUsd)
  const daily = [...acc.daily.entries()]
    .map(([date, costUsd]) => ({ date, costUsd }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const last7 = daily.slice(-7)
  const avg = last7.length ? last7.reduce((s, d) => s + d.costUsd, 0) / last7.length : 0
  return { totals: acc.totals, byModel, daily: daily.slice(-days), projectionUsd: avg * 30 }
}

// ── Filesystem layer ────────────────────────────────────────────────────────

const MAX_SCAN_BYTES = 20_000_000
const SESSION_LIMIT = 25

export async function economicsFeed(root: string, sessionLimit = SESSION_LIMIT): Promise<Economics> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, sessionLimit)
  const acc = newEconomicsAcc()
  for (const f of files) {
    let st
    try {
      st = await fs.stat(f.path)
    } catch {
      continue
    }
    if (st.size > MAX_SCAN_BYTES) continue
    try {
      const text = await fs.readFile(f.path, 'utf8')
      const lines: TranscriptLine[] = []
      for (const raw of text.split('\n')) {
        const l = parseLine(raw)
        if (l) lines.push(l)
      }
      addLinesToEconomics(acc, lines)
    } catch {
      /* skip */
    }
  }
  return finalizeEconomics(acc)
}

export async function economicsResponse(
  root: string,
  pathname: string,
  _query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/economics') {
    return { status: 200, body: await economicsFeed(root) }
  }
  return { status: 404, body: { error: 'not found' } }
}
