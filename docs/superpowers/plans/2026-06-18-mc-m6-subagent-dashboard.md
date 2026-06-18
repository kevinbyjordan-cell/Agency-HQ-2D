# MC M6 — Sub-Agent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Add a **Sub-agents** tab showing the multi-agent "orchestra": every sub-agent delegation across recent sessions — type, task, requested model, status (running/done/failed), tokens, tool-call count, and duration — plus Total/Ativos/Concluídos/Falhas stat cards.

**Architecture:** Pure core (`subAgentsFromLines`, `subAgentStats`) derives delegations from main-session transcripts by pairing each `Agent`/`Task` `tool_use` (spawn: `subagent_type`, `description`/`prompt`, `model`, spawn ts) with its matching `tool_result` (completion: `is_error` → failed; and the result text embeds a `<usage>subagent_tokens: N / tool_uses: N / duration_ms: N</usage>` block + `agentId`, parsed by regex). **No subagent-file linking needed** — everything comes from the main transcript we already scan. FS wrapper `subAgentFeed` reuses `listSessionFiles` (recent-N, 20 MB guard). Endpoint `GET /api/subagents` → `{subagents, stats}`. Browser fetches on tab-open.

**Tech Stack:** Node+TS (`tsx`); reuses `parseLine`/`TranscriptLine`/`ContentBlock`, `labelForAgentType` (`labels.ts`), `listSessionFiles` (`sessions.ts`). Front-end plain ESM JS + DOM, reusing `.dgrid`/`.dcard` + `icon()` and `relativeAge` (from `activity.js`). Tests: `vitest` (+ `jsdom`).

---

## File Structure
- `server/src/subagents.ts` (create) — types, pure core (`subAgentsFromLines`, `subAgentStats`, `parseUsage`), FS wrapper (`subAgentFeed`), `subAgentsResponse`.
- `server/src/server.ts` (modify) — route `/api/subagents`.
- `web/src/subagents.js` (create) — `renderSubAgents(state, root)`.
- `web/src/main.js` (modify) — Sub-agents nav item + view + fetch.
- `web/style.css` (modify) — `.sa*` styles.
- `tests/subagents-core.test.ts`, `tests/subagents-fs.test.ts`, `tests/subagents-render.test.ts` (create).

---

### Task M6-1: sub-agent pure core (TDD)

**Files:** Create `server/src/subagents.ts`; Test `tests/subagents-core.test.ts`.

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect } from 'vitest'
import { subAgentsFromLines, subAgentStats } from '../server/src/subagents'
import type { TranscriptLine } from '../server/src/parse'

const USAGE = '...trabalho... agentId: ax1\n<usage>subagent_tokens: 28139\ntool_uses: 13\nduration_ms: 89991</usage>'

const lines: TranscriptLine[] = [
  { type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/x/GOOGLE ADS PRO', sessionId: 's1', message: { role: 'user', content: 'vai' } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [
    { type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Implement Task 1', model: 'sonnet', prompt: 'do it' } },
    { type: 'tool_use', id: 't2', name: 'Task', input: { subagent_type: 'Explore', description: 'Search code' } },
  ] } },
  { type: 'user', timestamp: '2026-06-18T10:02:00Z', message: { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 't1', is_error: false, content: USAGE },
  ] } },
]

describe('subAgentsFromLines', () => {
  it('pairs spawns with results and parses usage from result text', () => {
    const subs = subAgentsFromLines(lines)
    expect(subs.length).toBe(2)
    const t1 = subs.find((s) => s.id === 't1')!
    expect(t1).toMatchObject({ type: 'general-purpose', label: 'Generalista', task: 'Implement Task 1', model: 'sonnet', project: 'GOOGLE ADS PRO', sessionId: 's1', status: 'done', tokens: 28139, toolUses: 13, durationMs: 89991 })
    const t2 = subs.find((s) => s.id === 't2')!
    expect(t2).toMatchObject({ type: 'Explore', task: 'Search code', status: 'running', tokens: null })
  })
  it('marks errored results as failed and is safe on empty', () => {
    const errored: TranscriptLine[] = [
      { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e', name: 'Agent', input: { subagent_type: 'x', description: 'd' } }] } },
      { type: 'user', timestamp: '2026-06-18T10:00:05Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e', is_error: true, content: 'boom' }] } },
    ]
    expect(subAgentsFromLines(errored)[0].status).toBe('failed')
    expect(subAgentsFromLines([])).toEqual([])
  })
})

describe('subAgentStats', () => {
  it('counts total/running/done/failed', () => {
    const subs = subAgentsFromLines(lines)
    expect(subAgentStats(subs)).toEqual({ total: 2, running: 1, done: 1, failed: 0 })
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: implement `server/src/subagents.ts` (pure core only):**

```ts
import type { TranscriptLine, ContentBlock } from './parse'
import { labelForAgentType } from './labels'

export interface SubAgent {
  id: string
  type: string
  label: string
  task: string
  model: string | null
  project: string
  sessionId: string | null
  status: 'running' | 'done' | 'failed'
  spawnTs: string | null
  endTs: string | null
  durationMs: number | null
  tokens: number | null
  toolUses: number | null
}

export interface SubAgentStats {
  total: number
  running: number
  done: number
  failed: number
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function firstLine(s: string, max = 120): string {
  const line = (s ?? '').split('\n').find((l) => l.trim().length > 0) ?? ''
  const t = line.trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function textOf(b: ContentBlock): string {
  const c = (b as { content?: unknown }).content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return (c as ContentBlock[]).filter((x) => x.type === 'text' && typeof x.text === 'string').map((x) => x.text as string).join('\n')
  return typeof b.text === 'string' ? b.text : ''
}

function num(re: RegExp, text: string): number | null {
  const m = text.match(re)
  return m ? Number(m[1]) : null
}

export function subAgentsFromLines(lines: TranscriptLine[]): SubAgent[] {
  let project = ''
  let sessionId: string | null = null
  const byId = new Map<string, SubAgent>()
  const order: string[] = []

  for (const line of lines) {
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []

    if (line.type === 'assistant') {
      for (const b of content) {
        if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && b.id) {
          const type = (b.input?.subagent_type as string) ?? 'unknown'
          const task = firstLine(((b.input?.description as string) ?? (b.input?.prompt as string) ?? '') as string)
          const model = (b.input?.model as string) ?? null
          const rec: SubAgent = {
            id: b.id, type, label: labelForAgentType(type), task, model, project, sessionId,
            status: 'running', spawnTs: line.timestamp ?? null, endTs: null, durationMs: null, tokens: null, toolUses: null,
          }
          if (!byId.has(b.id)) order.push(b.id)
          byId.set(b.id, rec)
        }
      }
    } else if (line.type === 'user') {
      for (const b of content) {
        if (b.type === 'tool_result' && b.tool_use_id && byId.has(b.tool_use_id)) {
          const rec = byId.get(b.tool_use_id)!
          rec.status = b.is_error ? 'failed' : 'done'
          rec.endTs = line.timestamp ?? null
          const text = textOf(b)
          rec.tokens = num(/subagent_tokens:\s*(\d+)/, text)
          rec.toolUses = num(/tool_uses:\s*(\d+)/, text)
          const dur = num(/duration_ms:\s*(\d+)/, text)
          rec.durationMs = dur != null ? dur : rec.spawnTs && rec.endTs ? Date.parse(rec.endTs) - Date.parse(rec.spawnTs) : null
        }
      }
    }
  }
  return order.map((id) => byId.get(id)!)
}

export function subAgentStats(subs: SubAgent[]): SubAgentStats {
  let running = 0, done = 0, failed = 0
  for (const s of subs) {
    if (s.status === 'running') running++
    else if (s.status === 'done') done++
    else failed++
  }
  return { total: subs.length, running, done, failed }
}
```

- [ ] **Step 4: run → PASS + `npx tsc --noEmit`.**
- [ ] **Step 5: commit** `git add server/src/subagents.ts tests/subagents-core.test.ts && git commit -m "feat(m6): sub-agent pure core (spawn↔result pairing + usage parse)"`

---

### Task M6-2: sub-agent FS wrapper + response (TDD)

**Files:** Modify `server/src/subagents.ts`; Test `tests/subagents-fs.test.ts`.

- [ ] **Step 1: failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { subAgentFeed, subAgentsResponse } from '../server/src/subagents'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-sa-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:01Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { subagent_type: 'general-purpose', description: 'Do it' } }] } }),
    L({ type: 'user', timestamp: '2026-06-18T10:01:00Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: '<usage>subagent_tokens: 100\ntool_uses: 2\nduration_ms: 5000</usage>' }] } }),
  ].join('\n'), 'utf8')
  // subagent file must be ignored by the scan
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Agent', input: { subagent_type: 'y' } }] } }), 'utf8')
})

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('subAgentFeed', () => {
  it('aggregates delegations from main sessions with stats', async () => {
    const { subagents, stats } = await subAgentFeed(root, 25, 100)
    expect(subagents.length).toBe(1)
    expect(subagents[0]).toMatchObject({ type: 'general-purpose', project: 'A', status: 'done', tokens: 100 })
    expect(stats).toEqual({ total: 1, running: 0, done: 1, failed: 0 })
  })
})

describe('subAgentsResponse', () => {
  it('200s and never leaks absolute paths; 404s unknown', async () => {
    const r = await subAgentsResponse(root, '/api/subagents', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.subagents)).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(root)
    expect((await subAgentsResponse(root, '/api/nope', new URLSearchParams())).status).toBe(404)
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: append to `server/src/subagents.ts`** (imports at top with the existing ones):

```ts
import { promises as fs } from 'node:fs'
import { parseLine } from './parse'
import { listSessionFiles } from './sessions'

const MAX_SCAN_BYTES = 20_000_000
const SESSION_LIMIT = 25
const SUBAGENT_CAP = 100

export async function subAgentFeed(
  root: string,
  sessionLimit = SESSION_LIMIT,
  cap = SUBAGENT_CAP,
): Promise<{ subagents: SubAgent[]; stats: SubAgentStats }> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, sessionLimit)
  const all: SubAgent[] = []
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
      all.push(...subAgentsFromLines(lines))
    } catch {
      /* skip */
    }
  }
  all.sort((a, b) => (b.spawnTs ?? '').localeCompare(a.spawnTs ?? ''))
  const subagents = all.slice(0, cap)
  return { subagents, stats: subAgentStats(subagents) }
}

export async function subAgentsResponse(
  root: string,
  pathname: string,
  _query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/subagents') {
    return { status: 200, body: await subAgentFeed(root) }
  }
  return { status: 404, body: { error: 'not found' } }
}
```

- [ ] **Step 4: run → PASS + full suite + tsc.**
- [ ] **Step 5: commit** `git add server/src/subagents.ts tests/subagents-fs.test.ts && git commit -m "feat(m6): sub-agent feed aggregation + response"`

---

### Task M6-3: wire /api/subagents route (manual verification)

**Files:** Modify `server/src/server.ts`.

- [ ] **Step 1:** import after `import { activityResponse } from './activity'`:
```ts
import { subAgentsResponse } from './subagents'
```
- [ ] **Step 2:** route after the `/api/activity` block, before `let p = pathname`:
```ts
  if (pathname === '/api/subagents') {
    const r = await subAgentsResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }
```
- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4: smoke** (port 4603):
```bash
PORT=4603 npm start & SP=$!; sleep 3
curl -s http://localhost:4603/api/subagents | head -c 600; echo ""
curl -s -o /dev/null -w "static / = %{http_code}\n" http://localhost:4603/
kill $SP 2>/dev/null
```
Expected: `{"subagents":[{...,"type":"general-purpose","status":"done","tokens":...}],"stats":{...}}` with real delegations from this session; `/` = 200. STOP/report if it errors.
- [ ] **Step 5: commit** `git add server/src/server.ts && git commit -m "feat(m6): serve /api/subagents endpoint"`

---

### Task M6-4: Sub-agent view render (TDD)

**Files:** Create `web/src/subagents.js`; Test `tests/subagents-render.test.ts`.

- [ ] **Step 1: failing test**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderSubAgents } from '../web/src/subagents.js'

let root: HTMLElement
beforeEach(() => { document.body.innerHTML = '<div id="r"></div>'; root = document.getElementById('r')! })

const subs = [
  { id: 't1', type: 'general-purpose', label: 'Generalista', task: 'Implement Task 1', model: 'sonnet', project: 'A', sessionId: 's1', status: 'done', spawnTs: '2026-06-18T10:00:01Z', endTs: '2026-06-18T10:01:41Z', durationMs: 100000, tokens: 28139, toolUses: 13 },
  { id: 't2', type: 'Explore', label: 'Explorador', task: 'Search', model: null, project: 'A', sessionId: 's1', status: 'running', spawnTs: '2026-06-18T10:05:00Z', endTs: null, durationMs: null, tokens: null, toolUses: null },
]

describe('renderSubAgents', () => {
  it('renders 4 stat cards and a row per sub-agent', () => {
    renderSubAgents({ subagents: subs, stats: { total: 2, running: 1, done: 1, failed: 0 } }, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.sa__row').length).toBe(2)
    expect(root.textContent).toContain('Generalista')
    expect(root.textContent).toContain('Implement Task 1')
  })
  it('shows a placeholder when empty', () => {
    renderSubAgents({ subagents: [], stats: { total: 0, running: 0, done: 0, failed: 0 } }, root)
    expect(root.querySelector('.sa__empty')).not.toBeNull()
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: implement `web/src/subagents.js`:**

```js
import { icon } from './icons.js'
import { relativeAge } from './activity.js'

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function statCard(label, value, iconName) {
  const c = el('div', 'dcard')
  const ico = el('div', 'dcard__ico')
  ico.innerHTML = icon(iconName)
  c.append(ico, el('div', 'dcard__label', label), el('div', 'dcard__value', String(value)))
  return c
}

function fmtDuration(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  return m + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '')
}

function fmtTokens(n) {
  if (n == null) return '—'
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
}

export function renderSubAgents(state, root) {
  const subs = (state && state.subagents) || []
  const stats = (state && state.stats) || { total: 0, running: 0, done: 0, failed: 0 }
  const now = Date.now()
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Total', stats.total, 'users'),
    statCard('Ativos', stats.running, 'activity'),
    statCard('Concluídos', stats.done, 'layers'),
    statCard('Falhas', stats.failed, 'dollar'),
  )
  root.appendChild(grid)

  const list = el('div', 'sa')
  if (subs.length === 0) {
    list.appendChild(el('div', 'sa__empty', 'Nenhum sub-agente recente.'))
  } else {
    for (const s of subs) {
      const row = el('div', 'sa__row')
      row.appendChild(el('span', 'sa__dot sa__dot--' + s.status))
      const main = el('div', 'sa__main')
      const head = el('div', 'sa__head')
      head.append(el('span', 'sa__label', s.label || s.type), el('span', 'sa__task', s.task || ''))
      const meta = el('div', 'sa__meta')
      const bits = [s.model || '', s.tokens != null ? fmtTokens(s.tokens) + ' tok' : '', s.toolUses != null ? s.toolUses + ' tools' : '', fmtDuration(s.durationMs), s.project || '']
      meta.textContent = bits.filter(Boolean).join(' · ')
      main.append(head, meta)
      row.append(main, el('span', 'sa__time', relativeAge(s.spawnTs, now)))
      list.appendChild(row)
    }
  }
  root.appendChild(list)
}
```

- [ ] **Step 4: run → PASS + full suite.**
- [ ] **Step 5: commit** `git add web/src/subagents.js tests/subagents-render.test.ts && git commit -m "feat(m6): sub-agent view render (stat cards + rows)"`

---

### Task M6-5: wire Sub-agents tab + CSS + e2e + merge/push

**Files:** Modify `web/src/main.js`, `web/style.css`.

- [ ] **Step 1:** import after `renderActivity` import: `import { renderSubAgents } from './subagents.js'`
- [ ] **Step 2:** add to `NAV` (after activity): `{ tab: 'subagents', label: 'Sub-agents', ico: 'users', emoji: '🤖', title: 'Sub-agents', sub: 'Delegações: estado, tokens, duração' },` and to `VIEW_INNER`: `subagents: '<div class="subagents"></div>',`
- [ ] **Step 3:** after `const activityEl = ...` add `const subagentsEl = stage.querySelector('.subagents')`; after the activity loader add:
```js
let subagentsState = { subagents: [], stats: { total: 0, running: 0, done: 0, failed: 0 } }

async function loadSubAgents() {
  try {
    const res = await fetch('/api/subagents')
    const data = await res.json()
    subagentsState = { subagents: data.subagents || [], stats: data.stats || { total: 0, running: 0, done: 0, failed: 0 } }
  } catch {
    subagentsState = { subagents: [], stats: { total: 0, running: 0, done: 0, failed: 0 } }
  }
  if (tab === 'subagents') renderSubAgents(subagentsState, subagentsEl)
}
```
- [ ] **Step 4:** extend `renderActive` (`else if (tab === 'subagents') renderSubAgents(subagentsState, subagentsEl)`) and the nav handler (`else if (tab === 'subagents') loadSubAgents()`).
- [ ] **Step 5:** append CSS:
```css
.sa { margin-top: 18px; }
.sa__row { display: flex; align-items: flex-start; gap: 12px; padding: 11px 4px; border-bottom: 1px solid var(--border); }
.sa__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.sa__dot--running { background: var(--blue); }
.sa__dot--done { background: var(--green); }
.sa__dot--failed { background: var(--red); }
.sa__main { flex: 1; min-width: 0; }
.sa__head { display: flex; gap: 8px; align-items: baseline; }
.sa__label { color: var(--accent); font-size: 12px; font-weight: 600; flex-shrink: 0; }
.sa__task { color: var(--text); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sa__meta { color: var(--faint); font-size: 11px; font-family: ui-monospace, monospace; margin-top: 2px; }
.sa__time { color: var(--muted); font-size: 11px; flex-shrink: 0; }
.sa__empty { color: var(--faint); font-size: 13px; padding: 24px 4px; }
```
- [ ] **Step 6:** full suite + `npx tsc --noEmit`.
- [ ] **Step 7: e2e** — controller opens Sub-agents tab, confirms stat cards + rows (type/task/model/tokens/duration/status); screenshot.
- [ ] **Step 8:** commit, final review, merge to main, push; update README (M6) + memory.

---

## Self-Review

**Spec coverage** (roadmap v2 M6 = "sub-agentes ativos/recentes: estado, task, modelo, tokens, timeline spawn→conclusão"):
- estado (running/done/failed) → spawn↔result pairing ✅
- task + modelo → from spawn input ✅
- tokens + tool calls + duração → parsed from result `<usage>` block (+ ts-delta fallback) ✅
- recentes → sort by spawnTs desc, cap 100 ✅
- stat cards Total/Ativos/Concluídos/Falhas ✅
- timeline → represented as ordered rows with spawn relative time + duration (full visual timeline = future polish; noted)

**Placeholders:** none. **Type consistency:** `SubAgent`/`SubAgentStats` fields identical across `subagents.ts`, `{subagents,stats}` body, and `renderSubAgents`. Nav key `'subagents'` matches `data-tab`/`data-view`. Reuses `listSessionFiles`, `labelForAgentType`, `relativeAge`.
