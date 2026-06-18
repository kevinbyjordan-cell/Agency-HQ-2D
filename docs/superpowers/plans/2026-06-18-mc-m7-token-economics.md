# MC M7 — Token Economics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add a **Costs** tab — a token/cost deep-dive across recent sessions: total cost, monthly projection, per-model breakdown (cost + tokens + share bar), input/output/cache split, and a daily cost trend chart.

**Architecture:** Pure accumulator (`newEconomicsAcc`/`addLinesToEconomics`/`finalizeEconomics`) aggregates per-message `usage`×model cost (via `messageCostUsd`) into: per-model totals, grand totals (input/output/cacheRead/cacheWrite), and per-day (UTC date) cost. FS wrapper `economicsFeed` scans recent-N sessions (reusing `listSessionFiles`, 20 MB guard). Endpoint `GET /api/economics` → the finalized `Economics` object. Fetch-on-open. Daily buckets use the UTC date prefix of the ISO timestamp (deterministic; cost trend is approximate by design). Projection = avg of last-7 daily costs × 30, server-side.

**Tech Stack:** Node+TS; reuses `messageCostUsd`/`UsageTokens` (`pricing.ts`), `parseLine`, `listSessionFiles` (`sessions.ts`). Front-end plain ESM + DOM reusing `.dgrid`/`.dcard` + `icon()`. Tests: `vitest` (+ `jsdom`).

---

## File Structure
- `server/src/economics.ts` (create) — types, pure accumulator, FS wrapper, `economicsResponse`.
- `server/src/server.ts` (modify) — route `/api/economics`.
- `web/src/costs.js` (create) — `renderCosts(state, root)`.
- `web/src/main.js` (modify) — Costs nav item + view + fetch.
- `web/style.css` (modify) — `.eco*` styles.
- `tests/economics-core.test.ts`, `tests/economics-fs.test.ts`, `tests/costs-render.test.ts` (create).

---

### Task M7-1: economics pure core (TDD)

**Files:** Create `server/src/economics.ts`; Test `tests/economics-core.test.ts`.

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from 'vitest'
import { newEconomicsAcc, addLinesToEconomics, finalizeEconomics } from '../server/src/economics'
import type { TranscriptLine } from '../server/src/parse'

const lines: TranscriptLine[] = [
  { type: 'assistant', timestamp: '2026-06-18T10:00:00Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 } } },
  { type: 'assistant', timestamp: '2026-06-17T10:00:00Z', message: { role: 'assistant', model: 'claude-sonnet-4-6', usage: { input_tokens: 4000, output_tokens: 50 } } },
  { type: 'user', timestamp: '2026-06-18T10:00:01Z', message: { role: 'user', content: 'x' } }, // ignored
]

describe('economics accumulator', () => {
  it('aggregates per-model, totals and per-day cost', () => {
    const acc = newEconomicsAcc()
    addLinesToEconomics(acc, lines)
    const e = finalizeEconomics(acc)
    expect(e.byModel.length).toBe(2)
    expect(e.byModel[0].costUsd).toBeGreaterThan(e.byModel[1].costUsd) // sorted desc
    expect(e.totals.messages).toBe(2)
    expect(e.totals.input).toBe(5000)
    expect(e.totals.output).toBe(150)
    expect(e.totals.cacheRead).toBe(2000)
    expect(e.totals.cacheWrite).toBe(500)
    expect(e.totals.costUsd).toBeGreaterThan(0)
    expect(e.daily.length).toBe(2)
    expect(e.daily[0].date).toBe('2026-06-17') // sorted asc
    expect(e.daily[1].date).toBe('2026-06-18')
  })

  it('projects monthly from recent daily average', () => {
    const acc = newEconomicsAcc()
    addLinesToEconomics(acc, [
      { type: 'assistant', timestamp: '2026-06-18T10:00:00Z', message: { role: 'assistant', model: 'claude-sonnet-4-6', usage: { input_tokens: 1_000_000, output_tokens: 0 } } },
    ])
    const e = finalizeEconomics(acc)
    // one day, cost = 1M input * $3/M = $3 ; avg/day = 3 ; projection = 90
    expect(e.projectionUsd).toBeCloseTo(90, 5)
  })

  it('is safe on empty', () => {
    const e = finalizeEconomics(newEconomicsAcc())
    expect(e.byModel).toEqual([])
    expect(e.totals.costUsd).toBe(0)
    expect(e.projectionUsd).toBe(0)
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: implement `server/src/economics.ts`** (pure core only):

```ts
import type { TranscriptLine } from './parse'
import { messageCostUsd, type UsageTokens } from './pricing'

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
```

- [ ] **Step 4: run → PASS + `npx tsc --noEmit`.**
- [ ] **Step 5: commit** `git add server/src/economics.ts tests/economics-core.test.ts && git commit -m "feat(m7): economics pure accumulator (per-model/totals/daily + projection)"`

---

### Task M7-2: economics FS wrapper + response (TDD)

**Files:** Modify `server/src/economics.ts`; Test `tests/economics-fs.test.ts`.

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { economicsFeed, economicsResponse } from '../server/src/economics'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-eco-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 100 } } }),
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 9999 } } }), 'utf8')
})
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('economicsFeed', () => {
  it('aggregates economics from main sessions only', async () => {
    const e = await economicsFeed(root, 25)
    expect(e.totals.messages).toBe(1) // subagent file excluded
    expect(e.byModel.length).toBe(1)
    expect(e.byModel[0].model).toBe('claude-opus-4-8')
    expect(e.totals.input).toBe(1000)
  })
})

describe('economicsResponse', () => {
  it('200s economics and 404s unknown', async () => {
    const r = await economicsResponse(root, '/api/economics', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(r.body.totals.messages).toBe(1)
    expect(Array.isArray(r.body.byModel)).toBe(true)
    expect((await economicsResponse(root, '/api/nope', new URLSearchParams())).status).toBe(404)
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: append to `server/src/economics.ts`** (imports at top with existing):

```ts
import { promises as fs } from 'node:fs'
import { parseLine } from './parse'
import { listSessionFiles } from './sessions'

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
```

- [ ] **Step 4: run → PASS + full suite + tsc.**
- [ ] **Step 5: commit** `git add server/src/economics.ts tests/economics-fs.test.ts && git commit -m "feat(m7): economics feed aggregation + response"`

---

### Task M7-3: wire /api/economics route (manual verification)

**Files:** Modify `server/src/server.ts`.

- [ ] **Step 1:** import after `import { subAgentsResponse } from './subagents'`:
```ts
import { economicsResponse } from './economics'
```
- [ ] **Step 2:** route after the `/api/subagents` block, before `let p = pathname`:
```ts
  if (pathname === '/api/economics') {
    const r = await economicsResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }
```
- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4: smoke** (port 4604):
```bash
PORT=4604 npm start & SP=$!; sleep 3
curl -s http://localhost:4604/api/economics | head -c 600; echo ""
curl -s -o /dev/null -w "static / = %{http_code}\n" http://localhost:4604/
kill $SP 2>/dev/null
```
Expected: `{"totals":{...},"byModel":[{"model":"claude-opus-4-8","costUsd":...}],"daily":[...],"projectionUsd":...}` with real numbers; `/` = 200. STOP/report on error.
- [ ] **Step 5: commit** `git add server/src/server.ts && git commit -m "feat(m7): serve /api/economics endpoint"`

---

### Task M7-4: Costs view render (TDD)

**Files:** Create `web/src/costs.js`; Test `tests/costs-render.test.ts`.

- [ ] **Step 1: failing test**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderCosts } from '../web/src/costs.js'

let root: HTMLElement
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')! })

const eco = {
  totals: { costUsd: 12.5, input: 5000, output: 150, cacheRead: 2000, cacheWrite: 500, messages: 2 },
  byModel: [
    { model: 'claude-opus-4-8', costUsd: 10, input: 1000, output: 100, cache: 2500, messages: 1 },
    { model: 'claude-sonnet-4-6', costUsd: 2.5, input: 4000, output: 50, cache: 0, messages: 1 },
  ],
  daily: [ { date: '2026-06-17', costUsd: 2.5 }, { date: '2026-06-18', costUsd: 10 } ],
  projectionUsd: 187.5,
}

describe('renderCosts', () => {
  it('renders stat cards, a row per model and a daily bar per day', () => {
    renderCosts(eco, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.eco__mrow').length).toBe(2)
    expect(root.querySelectorAll('.eco__bar').length).toBe(2)
    expect(root.textContent).toContain('claude-opus-4-8')
    expect(root.textContent).toContain('$12.50')
  })
  it('shows a placeholder when empty', () => {
    renderCosts({ totals: { costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 }, byModel: [], daily: [], projectionUsd: 0 }, root)
    expect(root.querySelector('.eco__empty')).not.toBeNull()
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: implement `web/src/costs.js`:**

```js
import { icon } from './icons.js'

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function usd(n) {
  return '$' + Number(n || 0).toFixed(2)
}

function fmtTokens(n) {
  n = n || 0
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

function statCard(label, value, iconName) {
  const c = el('div', 'dcard')
  const ico = el('div', 'dcard__ico')
  ico.innerHTML = icon(iconName)
  c.append(ico, el('div', 'dcard__label', label), el('div', 'dcard__value', value))
  return c
}

export function renderCosts(eco, root) {
  const e = eco || { totals: {}, byModel: [], daily: [], projectionUsd: 0 }
  const t = e.totals || {}
  const byModel = e.byModel || []
  const daily = e.daily || []
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Custo total', usd(t.costUsd), 'dollar'),
    statCard('Projeção mensal', usd(e.projectionUsd), 'activity'),
    statCard('Tokens', fmtTokens((t.input || 0) + (t.output || 0) + (t.cacheRead || 0) + (t.cacheWrite || 0)), 'layers'),
    statCard('Mensagens', String(t.messages || 0), 'users'),
  )
  root.appendChild(grid)

  if (byModel.length === 0) {
    root.appendChild(el('div', 'eco__empty', 'Sem dados de custo ainda.'))
    return
  }

  // Per-model breakdown
  const maxCost = Math.max(...byModel.map((m) => m.costUsd), 0.000001)
  const models = el('div', 'eco__models')
  models.appendChild(el('div', 'eco__head', 'Por modelo'))
  for (const m of byModel) {
    const row = el('div', 'eco__mrow')
    row.append(el('span', 'eco__model', m.model), el('span', 'eco__mcost', usd(m.costUsd)))
    const track = el('div', 'eco__track')
    const fill = el('div', 'eco__fill')
    fill.style.width = Math.max(2, (m.costUsd / maxCost) * 100) + '%'
    track.appendChild(fill)
    const sub = el('div', 'eco__msub', fmtTokens(m.input) + ' in · ' + fmtTokens(m.output) + ' out · ' + fmtTokens(m.cache) + ' cache')
    row.append(track, sub)
    models.appendChild(row)
  }
  root.appendChild(models)

  // Daily trend
  const maxDay = Math.max(...daily.map((d) => d.costUsd), 0.000001)
  const trend = el('div', 'eco__daily')
  trend.appendChild(el('div', 'eco__head', 'Tendência diária'))
  const chart = el('div', 'eco__chart')
  for (const d of daily) {
    const col = el('div', 'eco__col')
    const bar = el('div', 'eco__bar')
    bar.style.height = Math.max(3, (d.costUsd / maxDay) * 100) + '%'
    bar.title = d.date + ': ' + usd(d.costUsd)
    col.append(bar, el('span', 'eco__day', d.date.slice(5)))
    chart.appendChild(col)
  }
  trend.appendChild(chart)
  root.appendChild(trend)
}
```

- [ ] **Step 4: run → PASS + full suite.**
- [ ] **Step 5: commit** `git add web/src/costs.js tests/costs-render.test.ts && git commit -m "feat(m7): Costs view render (stat cards + per-model + daily trend)"`

---

### Task M7-5: wire Costs tab + CSS + e2e + merge/push

**Files:** Modify `web/src/main.js`, `web/style.css`.

- [ ] **Step 1:** import after `renderSubAgents` import: `import { renderCosts } from './costs.js'`
- [ ] **Step 2:** add to `NAV` (after subagents): `{ tab: 'costs', label: 'Costs', ico: 'dollar', emoji: '💰', title: 'Costs', sub: 'Custo por modelo, cache e projeção' },` and `VIEW_INNER`: `costs: '<div class="costs"></div>',`
- [ ] **Step 3:** after `const subagentsEl = ...` add `const costsEl = stage.querySelector('.costs')`; after the subagents loader add:
```js
let costsState = null

async function loadCosts() {
  try {
    const res = await fetch('/api/economics')
    costsState = await res.json()
  } catch {
    costsState = null
  }
  if (tab === 'costs') renderCosts(costsState, costsEl)
}
```
- [ ] **Step 4:** extend `renderActive` (`else if (tab === 'costs') renderCosts(costsState, costsEl)`) and the nav handler (`else if (tab === 'costs') loadCosts()`).
- [ ] **Step 5:** append CSS:
```css
.eco__models, .eco__daily { margin-top: 24px; }
.eco__head { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
.eco__mrow { display: grid; grid-template-columns: 180px 1fr 80px; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.eco__model { color: var(--text); font-size: 12px; font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eco__track { height: 8px; background: var(--panel-2); border-radius: 4px; overflow: hidden; }
.eco__fill { height: 100%; background: var(--accent); }
.eco__mcost { color: var(--text); font-size: 13px; text-align: right; grid-column: 3; grid-row: 1; }
.eco__msub { grid-column: 1 / -1; color: var(--faint); font-size: 10px; font-family: ui-monospace, monospace; }
.eco__chart { display: flex; align-items: flex-end; gap: 6px; height: 140px; padding-top: 8px; }
.eco__col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
.eco__bar { width: 60%; min-height: 3px; background: var(--accent); border-radius: 3px 3px 0 0; }
.eco__day { color: var(--faint); font-size: 9px; }
.eco__empty { color: var(--faint); font-size: 13px; padding: 24px 4px; }
```
- [ ] **Step 6:** full suite + `npx tsc --noEmit`.
- [ ] **Step 7: e2e** — controller opens Costs tab, confirms stat cards + per-model bars + daily trend; screenshot.
- [ ] **Step 8:** commit, final review, merge to main, push; update README (M7) + memory.

---

## Self-Review

**Spec coverage** (roadmap v2 M7 = "custo por modelo, split input/output/cache, tendência diária, projeção mensal, top tarefas por tokens"):
- custo por modelo → `byModel` rows ✅
- split input/output/cache → `totals` + per-model `cache`; shown in stat cards + per-model sub ✅
- tendência diária → `daily` bar chart ✅
- projeção mensal → `projectionUsd` (avg last-7 × 30) ✅
- top tarefas por tokens → represented as per-model breakdown sorted by cost (per-session/top-task ranking deferred; the Sessions tab already ranks sessions — noted)

**Placeholders:** none. **Type consistency:** `Economics`/`ModelLine`/`EconomicsTotals` identical across `economics.ts`, the body, and `renderCosts`. Nav key `'costs'` matches `data-tab`/`data-view`. Reuses `messageCostUsd`, `listSessionFiles`.
