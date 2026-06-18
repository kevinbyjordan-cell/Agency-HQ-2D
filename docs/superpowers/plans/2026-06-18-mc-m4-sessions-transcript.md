# MC M4 — Sessions & Transcript Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Sessions** tab to Mission Control that lists Claude Code sessions (recent first) with model, token/cost totals, a **context-usage bar**, age and a title, and lets you open any one to read its real transcript as chat bubbles (user / assistant / tool).

**Architecture:** A pure core derives session metadata and transcript bubbles from parsed JSONL lines (`sessionMetaFromLines`, `bubblesFromLines`) — fully testable without the filesystem. Thin FS wrappers (`sessionsIndex`, `readTranscript`) read files (recent-N, with an oversized-file guard so we never block on a 50 MB transcript) and call the pure core. Two read-only JSON endpoints (`GET /api/sessions`, `GET /api/sessions/transcript?id=`) expose them, reusing the M3 security posture (opaque id → resolved against the projects root with a containment + `isSessionFile` check; no client path is ever used raw). The browser fetches the index on tab-open and a transcript on click — request/response, not part of the live WebSocket stream. Age is formatted client-side (server stays time-free).

**Tech Stack:** Node + TypeScript (`tsx`); reuses `parseLine`/`TranscriptLine`/`ContentBlock` (`parse.ts`), `isSessionFile` (`activeSession.ts`), `messageCostUsd`/`UsageTokens` + new `contextWindow` (`pricing.ts`). Front-end plain ESM JS + DOM, reusing `renderMarkdown` (M3). Tests: `vitest` (+ `jsdom` for the view). All tests live in flat `tests/`; server modules imported as `../server/src/...`, web as `../web/src/...`.

---

## File Structure

- `server/src/pricing.ts` (modify) — add `CONTEXT_WINDOW` table + `contextWindow(model)`.
- `server/src/sessions.ts` (create) — types (`SessionMeta`, `Bubble`), pure core (`sessionMetaFromLines`, `bubblesFromLines`, helpers), FS wrappers (`sessionsIndex`, `readTranscript`), and `sessionsResponse`.
- `server/src/server.ts` (modify) — route `/api/sessions` + `/api/sessions/transcript` before static, like `/api/memory`.
- `web/src/sessions.js` (create) — `renderSessions(state, root)` pure render: session list + transcript panel.
- `web/src/main.js` (modify) — Sessions tab, index fetch on open, click → transcript fetch.
- `web/style.css` (modify) — `.sess*` styles (list cards, context bar, bubbles).
- `tests/sessions-core.test.ts` (create) — pure core on hand-built line arrays.
- `tests/sessions-fs.test.ts` (create) — wrappers + response on temp fixtures.
- `tests/sessions-render.test.ts` (create) — `renderSessions` DOM output (jsdom).

---

### Task M4-1: pricing context windows + sessions pure core (TDD)

**Files:**
- Modify: `server/src/pricing.ts`
- Create: `server/src/sessions.ts`
- Test: `tests/sessions-core.test.ts`

- [ ] **Step 1: Add context windows to `pricing.ts`** (append at end of file):

```ts
// Context windows (tokens) per model — used for the "% context used" bar.
export const CONTEXT_WINDOW: Record<string, number> = {
  'claude-fable-5': 1_000_000,
  'claude-opus-4-8': 1_000_000,
  'claude-opus-4-7': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-haiku-4-5': 200_000,
}

export function contextWindow(model: string): number {
  return CONTEXT_WINDOW[model] ?? 200_000
}
```

- [ ] **Step 2: Write the failing test `tests/sessions-core.test.ts`**:

```ts
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
    // last usage: 8000 + 12000 + 2000 = 22000 ; window opus = 1_000_000
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
```

- [ ] **Step 3: Run test → confirm FAIL**

Run: `cd "C:/Users/kevin/Desktop/AGENCIA/VENDA SITES/agency-hq" && npx vitest run tests/sessions-core.test.ts`
Expected: FAIL — cannot find module `../server/src/sessions`.

- [ ] **Step 4: Implement `server/src/sessions.ts` (pure core only for this task)**:

```ts
import type { TranscriptLine, ContentBlock } from './parse'
import { messageCostUsd, contextWindow, type UsageTokens } from './pricing'

export interface SessionMeta {
  id: string
  sessionId: string | null
  project: string
  model: string | null
  messages: number
  tokens: number
  costUsd: number
  contextTokens: number
  contextPct: number
  title: string
  startedAt: string | null
  updatedAt: string | null
  partial: boolean
}

export interface Bubble {
  role: 'user' | 'assistant' | 'tool'
  kind: 'text' | 'tool_use' | 'tool_result'
  ts: string | null
  text: string
  tool?: string
  isError?: boolean
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
  }
  return ''
}

function truncate(s: string, max: number): string {
  const t = (s ?? '').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, unknown>
  const pick = i.file_path ?? i.path ?? i.command ?? i.pattern ?? i.query ?? i.description ?? i.prompt ?? i.url
  return typeof pick === 'string' ? truncate(pick, 100) : ''
}

function resultPreview(b: ContentBlock): string {
  const c = (b as { content?: unknown }).content
  if (typeof c === 'string') return truncate(c, 300)
  if (Array.isArray(c)) return truncate(textFromContent(c), 300)
  if (typeof b.text === 'string') return truncate(b.text, 300)
  return ''
}

export function sessionMetaFromLines(id: string, lines: TranscriptLine[]): SessionMeta {
  let sessionId: string | null = null
  let project = ''
  let model: string | null = null
  let messages = 0
  let tokens = 0
  let costUsd = 0
  let lastUsage: UsageTokens | null = null
  let title = ''
  let startedAt: string | null = null
  let updatedAt: string | null = null

  for (const line of lines) {
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.timestamp) {
      if (!startedAt) startedAt = line.timestamp
      updatedAt = line.timestamp
    }
    if (line.type === 'user') {
      messages++
      if (!title) {
        const t = textFromContent(line.message?.content).trim()
        if (t) title = truncate(t, 140)
      }
    } else if (line.type === 'assistant') {
      messages++
      if (line.message?.model) model = line.message.model
      const u = line.message?.usage
      if (u) {
        tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
        if (line.message?.model) costUsd += messageCostUsd(line.message.model, u)
        lastUsage = u
      }
    }
  }

  const contextTokens = lastUsage
    ? (lastUsage.input_tokens ?? 0) + (lastUsage.cache_read_input_tokens ?? 0) + (lastUsage.cache_creation_input_tokens ?? 0)
    : 0
  const contextPct = model && contextTokens > 0 ? contextTokens / contextWindow(model) : 0

  return { id, sessionId, project, model, messages, tokens, costUsd, contextTokens, contextPct, title, startedAt, updatedAt, partial: false }
}

export function bubblesFromLines(lines: TranscriptLine[], cap: number): Bubble[] {
  const out: Bubble[] = []
  for (const line of lines) {
    const ts = line.timestamp ?? null
    if (line.type === 'user') {
      const content = line.message?.content
      if (typeof content === 'string') {
        if (content.trim()) out.push({ role: 'user', kind: 'text', ts, text: content })
        continue
      }
      const blocks = Array.isArray(content) ? content : []
      for (const b of blocks) {
        if (b.type === 'text' && b.text && b.text.trim()) out.push({ role: 'user', kind: 'text', ts, text: b.text })
        else if (b.type === 'tool_result') out.push({ role: 'tool', kind: 'tool_result', ts, text: resultPreview(b), isError: !!b.is_error })
      }
    } else if (line.type === 'assistant') {
      const blocks = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
      for (const b of blocks) {
        if (b.type === 'text' && b.text && b.text.trim()) out.push({ role: 'assistant', kind: 'text', ts, text: b.text })
        else if (b.type === 'tool_use') out.push({ role: 'assistant', kind: 'tool_use', ts, text: toolSummary(b.input), tool: b.name ?? '' })
      }
    }
  }
  return cap > 0 && out.length > cap ? out.slice(out.length - cap) : out
}
```

- [ ] **Step 5: Run test → confirm PASS, then typecheck**

Run: `npx vitest run tests/sessions-core.test.ts && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add server/src/pricing.ts server/src/sessions.ts tests/sessions-core.test.ts
git commit -m "feat(m4): sessions pure core (meta + bubbles) + context windows"
```

---

### Task M4-2: sessions FS wrappers + response (TDD)

**Files:**
- Modify: `server/src/sessions.ts`
- Test: `tests/sessions-fs.test.ts`

- [ ] **Step 1: Write the failing test `tests/sessions-fs.test.ts`**:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sessionsIndex, readTranscript, sessionsResponse } from '../server/src/sessions'

let root: string

function line(obj: object): string {
  return JSON.stringify(obj)
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-sess-'))
  const projA = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(projA, 'subagents'), { recursive: true })
  await fs.writeFile(
    path.join(projA, 's1.jsonl'),
    [
      line({ type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'user', content: 'Olá agente' } }),
      line({ type: 'assistant', timestamp: '2026-06-18T10:00:05Z', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'text', text: 'Oi!' }] } }),
    ].join('\n'),
    'utf8',
  )
  // a subagent transcript that must NOT be listed
  await fs.writeFile(path.join(projA, 'subagents', 'agent-x.jsonl'), line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'sub' }] } }), 'utf8')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('sessionsIndex', () => {
  it('lists main sessions (not subagents) with derived metadata', async () => {
    const idx = await sessionsIndex(root, 25)
    expect(idx.length).toBe(1)
    expect(idx[0].sessionId).toBe('s1')
    expect(idx[0].project).toBe('A')
    expect(idx[0].title).toBe('Olá agente')
    expect(idx[0].model).toBe('claude-opus-4-8')
    expect(idx[0].id.endsWith('s1.jsonl')).toBe(true)
  })
})

describe('readTranscript', () => {
  it('returns meta + bubbles for a valid id', async () => {
    const idx = await sessionsIndex(root, 25)
    const res = await readTranscript(root, idx[0].id, 250)
    expect(res).not.toBeNull()
    expect(res!.bubbles[0]).toMatchObject({ role: 'user', text: 'Olá agente' })
    expect(res!.meta.sessionId).toBe('s1')
  })

  it('rejects traversal / unknown ids', async () => {
    expect(await readTranscript(root, '../../etc/passwd', 250)).toBeNull()
    expect(await readTranscript(root, 'C--proj-A/subagents/agent-x.jsonl', 250)).toBeNull() // subagents excluded
    expect(await readTranscript(root, 'C--proj-A/nope.jsonl', 250)).toBeNull()
  })
})

describe('sessionsResponse', () => {
  it('200s index and never leaks absolute paths', async () => {
    const r = await sessionsResponse(root, '/api/sessions', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.sessions)).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(root)
  })

  it('200s transcript for valid id, 404s bad id', async () => {
    const idx = await sessionsIndex(root, 25)
    const ok = await sessionsResponse(root, '/api/sessions/transcript', new URLSearchParams({ id: idx[0].id }))
    expect(ok.status).toBe(200)
    expect(Array.isArray(ok.body.bubbles)).toBe(true)
    const bad = await sessionsResponse(root, '/api/sessions/transcript', new URLSearchParams({ id: 'nope' }))
    expect(bad.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test → confirm FAIL** (`sessionsIndex` not exported).

Run: `npx vitest run tests/sessions-fs.test.ts`

- [ ] **Step 3: Append the FS wrappers + response to `server/src/sessions.ts`**:

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseLine } from './parse'
import { isSessionFile, type FileInfo } from './activeSession'

const MAX_SCAN_BYTES = 20_000_000
const DEFAULT_LIMIT = 25
const DEFAULT_BUBBLE_CAP = 250

async function listSessionFiles(root: string): Promise<FileInfo[]> {
  const out: FileInfo[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'subagents') continue
        await walk(p)
      } else if (e.name.endsWith('.jsonl') && isSessionFile(p)) {
        try {
          const st = await fs.stat(p)
          out.push({ path: p, mtimeMs: st.mtimeMs })
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(root)
  return out
}

function idFor(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

function parseAll(text: string) {
  const lines = []
  for (const raw of text.split('\n')) {
    const l = parseLine(raw)
    if (l) lines.push(l)
  }
  return lines
}

export async function sessionsIndex(root: string, limit = DEFAULT_LIMIT): Promise<SessionMeta[]> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit)
  const metas: SessionMeta[] = []
  for (const f of files) {
    const id = idFor(root, f.path)
    let st
    try {
      st = await fs.stat(f.path)
    } catch {
      continue
    }
    if (st.size > MAX_SCAN_BYTES) {
      metas.push({
        id, sessionId: null, project: id.split('/')[0] ?? '', model: null, messages: 0, tokens: 0,
        costUsd: 0, contextTokens: 0, contextPct: 0, title: '(sessão grande — não lida)',
        startedAt: null, updatedAt: new Date(f.mtimeMs).toISOString(), partial: true,
      })
      continue
    }
    try {
      const meta = sessionMetaFromLines(id, parseAll(await fs.readFile(f.path, 'utf8')))
      if (!meta.updatedAt) meta.updatedAt = new Date(f.mtimeMs).toISOString()
      metas.push(meta)
    } catch {
      /* skip unreadable */
    }
  }
  return metas
}

function resolveId(root: string, id: string): string | null {
  const abs = path.resolve(root, id)
  const rootPrefix = path.resolve(root) + path.sep
  if (!abs.startsWith(rootPrefix)) return null
  if (!isSessionFile(abs)) return null
  return abs
}

export async function readTranscript(
  root: string,
  id: string,
  cap = DEFAULT_BUBBLE_CAP,
): Promise<{ meta: SessionMeta; bubbles: Bubble[] } | null> {
  const abs = resolveId(root, id)
  if (!abs) return null
  let text
  try {
    text = await fs.readFile(abs, 'utf8')
  } catch {
    return null
  }
  const lines = parseAll(text)
  return { meta: sessionMetaFromLines(id, lines), bubbles: bubblesFromLines(lines, cap) }
}

export async function sessionsResponse(
  root: string,
  pathname: string,
  query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/sessions') {
    return { status: 200, body: { sessions: await sessionsIndex(root) } }
  }
  if (pathname === '/api/sessions/transcript') {
    const res = await readTranscript(root, query.get('id') ?? '')
    if (!res) return { status: 404, body: { error: 'not found' } }
    return { status: 200, body: res }
  }
  return { status: 404, body: { error: 'not found' } }
}
```

Note: `SessionMeta` already omits any absolute path (`id` is the relative path), so no separate `publicFile` step is needed — confirm the index/transcript bodies contain only `id`/relative data.

- [ ] **Step 4: Run test → PASS, then typecheck**

Run: `npx vitest run tests/sessions-fs.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add server/src/sessions.ts tests/sessions-fs.test.ts
git commit -m "feat(m4): sessions index + transcript reader + json response"
```

---

### Task M4-3: wire /api/sessions routes into the server (manual verification)

**Files:**
- Modify: `server/src/server.ts`

- [ ] **Step 1: Add the import** (after `import { memoryRoots, memoryResponse } from './memory'`):

```ts
import { sessionsResponse } from './sessions'
```

- [ ] **Step 2: Add the routes** inside the `http.createServer` handler, right after the existing `/api/memory` block and before `let p = pathname`:

```ts
  if (pathname === '/api/sessions' || pathname === '/api/sessions/transcript') {
    const r = await sessionsResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }
```

(`PROJECTS_ROOT` already exists in `server.ts` = `path.join(os.homedir(), '.claude', 'projects')`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Manual smoke test** (non-default port):

```bash
PORT=4599 npm start &
SERVER_PID=$!
sleep 3
echo "--- index (first 600 bytes) ---"
curl -s http://localhost:4599/api/sessions | head -c 600
echo ""
echo "--- transcript of first session (first 400) ---"
ID=$(curl -s http://localhost:4599/api/sessions | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write(j.sessions[0]?.id||'')})")
curl -s "http://localhost:4599/api/sessions/transcript?id=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$ID")" | head -c 400
echo ""
echo "--- bad id (expect 404) ---"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4599/api/sessions/transcript?id=nope"
kill $SERVER_PID 2>/dev/null
```

Expected: index returns `{"sessions":[...]}` with real sessions (recent first, each with `project`, `model`, `contextPct`, `title`); transcript returns `{"meta":...,"bubbles":[...]}`; bad id → `404`. If the list is slow, that's the recent-N scan — acceptable. If anything errors, STOP and report BLOCKED.

- [ ] **Step 5: Commit**

```bash
git add server/src/server.ts
git commit -m "feat(m4): serve /api/sessions index + transcript endpoints"
```

---

### Task M4-4: Sessions view render (TDD)

**Files:**
- Create: `web/src/sessions.js`
- Test: `tests/sessions-render.test.ts`

- [ ] **Step 1: Write the failing test `tests/sessions-render.test.ts`**:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderSessions } from '../web/src/sessions.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  root = document.getElementById('root')!
})

const sessions = [
  { id: 'A/s1.jsonl', sessionId: 's1', project: 'Google Ads PRO', model: 'claude-opus-4-8', messages: 12, tokens: 4200, costUsd: 0.42, contextTokens: 220000, contextPct: 0.22, title: 'Relatório de campanhas', startedAt: '2026-06-18T10:00:00Z', updatedAt: '2026-06-18T10:30:00Z', partial: false },
  { id: 'B/s2.jsonl', sessionId: 's2', project: 'Venda Sites', model: 'claude-sonnet-4-6', messages: 4, tokens: 800, costUsd: 0.02, contextTokens: 5000, contextPct: 0.005, title: '', startedAt: null, updatedAt: '2026-06-18T09:00:00Z', partial: false },
]

describe('renderSessions', () => {
  it('renders one card per session with project, model and a context bar', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.querySelectorAll('[data-sess-id]').length).toBe(2)
    expect(root.textContent).toContain('Google Ads PRO')
    expect(root.textContent).toContain('claude-opus-4-8')
    expect(root.querySelector('.sess__bar')).not.toBeNull()
  })

  it('falls back to sessionId when title is empty', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.textContent).toContain('s2')
  })

  it('marks the selected session active and renders its bubbles', () => {
    const selected = { id: 'A/s1.jsonl', meta: sessions[0], bubbles: [ { role: 'user', kind: 'text', text: 'oi', ts: null }, { role: 'assistant', kind: 'text', text: 'olá', ts: null } ] }
    renderSessions({ sessions, selected }, root)
    expect(root.querySelector('.sess__item--active')?.getAttribute('data-sess-id')).toBe('A/s1.jsonl')
    const bubbles = root.querySelectorAll('.bubblerow')
    expect(bubbles.length).toBe(2)
  })

  it('shows a placeholder when there are no sessions', () => {
    renderSessions({ sessions: [], selected: null }, root)
    expect(root.querySelector('.sess__empty')).not.toBeNull()
  })

  it('shows a hint when nothing is selected', () => {
    renderSessions({ sessions, selected: null }, root)
    expect(root.querySelector('.sess__doc')?.textContent).toMatch(/selecione/i)
  })
})
```

- [ ] **Step 2: Run test → confirm FAIL** (module missing).

Run: `npx vitest run tests/sessions-render.test.ts`

- [ ] **Step 3: Implement `web/src/sessions.js`**:

```js
import { renderMarkdown } from './markdown.js'

function pct(n) {
  return Math.round((n || 0) * 100)
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function sessionCard(s, selected) {
  const item = document.createElement('button')
  item.className = 'sess__item' + (selected && selected.id === s.id ? ' sess__item--active' : '')
  item.setAttribute('data-sess-id', s.id)

  const top = el('div', 'sess__top')
  top.append(el('span', 'sess__proj', s.project || '—'), el('span', 'sess__model', s.model || '—'))

  const title = el('div', 'sess__title', s.title || s.sessionId || s.id)

  const bar = el('div', 'sess__bar')
  const fill = el('div', 'sess__barfill')
  fill.style.width = Math.min(100, pct(s.contextPct)) + '%'
  if (s.contextPct >= 0.8) fill.classList.add('sess__barfill--hot')
  bar.appendChild(fill)

  const meta = el('div', 'sess__meta')
  meta.append(
    el('span', null, pct(s.contextPct) + '% contexto'),
    el('span', null, (s.messages || 0) + ' msgs'),
    el('span', null, '$' + Number(s.costUsd || 0).toFixed(2)),
  )

  item.append(top, title, bar, meta)
  return item
}

const ROLE_LABEL = { user: 'Você', assistant: 'Agente', tool: 'Tool' }

function bubbleRow(b) {
  const row = el('div', 'bubblerow bubblerow--' + b.role)
  const who = el('div', 'bubblerow__who', ROLE_LABEL[b.role] || b.role)
  const body = el('div', 'bubblerow__body')
  if (b.kind === 'tool_use') {
    body.classList.add('bubblerow__body--tool')
    body.append(el('span', 'bubblerow__tool', b.tool || 'tool'))
    if (b.text) body.append(el('span', 'bubblerow__arg', ' ' + b.text))
  } else if (b.kind === 'tool_result') {
    body.classList.add('bubblerow__body--result')
    if (b.isError) body.classList.add('bubblerow__body--error')
    body.textContent = b.text || '(sem saída)'
  } else {
    body.innerHTML = renderMarkdown(b.text || '')
  }
  row.append(who, body)
  return row
}

export function renderSessions(state, root) {
  const sessions = (state && state.sessions) || []
  const selected = (state && state.selected) || null
  root.innerHTML = ''

  const wrap = el('div', 'sess')
  const list = el('div', 'sess__list')

  if (sessions.length === 0) {
    list.appendChild(el('div', 'sess__empty', 'Nenhuma sessão encontrada.'))
  } else {
    for (const s of sessions) list.appendChild(sessionCard(s, selected))
  }

  const doc = el('div', 'sess__doc')
  if (selected && Array.isArray(selected.bubbles)) {
    const head = el('div', 'sess__dochead')
    const m = selected.meta || {}
    head.append(
      el('span', 'sess__doctitle', m.title || m.sessionId || selected.id),
      el('span', 'sess__docsub', (m.project || '') + ' · ' + (m.model || '')),
    )
    doc.appendChild(head)
    const stream = el('div', 'sess__stream')
    if (selected.bubbles.length === 0) stream.appendChild(el('div', 'sess__hint', 'Transcript vazio.'))
    else for (const b of selected.bubbles) stream.appendChild(bubbleRow(b))
    doc.appendChild(stream)
  } else {
    doc.appendChild(el('div', 'sess__hint', 'Selecione uma sessão à esquerda para ver o transcript.'))
  }

  wrap.append(list, doc)
  root.appendChild(wrap)
}
```

- [ ] **Step 4: Run test → PASS**

Run: `npx vitest run tests/sessions-render.test.ts`

- [ ] **Step 5: Commit**

```bash
git add web/src/sessions.js tests/sessions-render.test.ts
git commit -m "feat(m4): sessions view render (list + transcript bubbles)"
```

---

### Task M4-5: wire Sessions tab + CSS + e2e + merge/push

**Files:**
- Modify: `web/src/main.js`
- Modify: `web/style.css`

- [ ] **Step 1: Add the import** (after the memory imports in `main.js`):

```js
import { renderSessions } from './sessions.js'
```

- [ ] **Step 2: Add the tab button + view** — in the `stage.innerHTML` template, after the memory tab button:

```js
'<button class="mc__tab" data-tab="sessions">Sessions</button>' +
```
and after the memory `<section>`:

```js
'<section class="mc__view mc__view--hidden" data-view="sessions"><div class="sessions"></div></section>' +
```

- [ ] **Step 3: Add element ref + state + fetch logic** — after `const memoryEl = ...` add `const sessionsEl = stage.querySelector('.sessions')`; and after the memory state/fns add:

```js
let sessionsState = { sessions: [], selected: null }

async function loadSessionsIndex() {
  try {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    sessionsState = { sessions: data.sessions || [], selected: sessionsState.selected }
  } catch {
    sessionsState = { sessions: [], selected: null }
  }
  if (tab === 'sessions') renderSessions(sessionsState, sessionsEl)
}

async function openSession(id) {
  const s = sessionsState.sessions.find((x) => x.id === id)
  sessionsState.selected = { id, meta: s || { id }, bubbles: [] }
  renderSessions(sessionsState, sessionsEl)
  try {
    const res = await fetch('/api/sessions/transcript?id=' + encodeURIComponent(id))
    const data = await res.json()
    sessionsState.selected = { id, meta: data.meta || s || { id }, bubbles: data.bubbles || [] }
  } catch {
    sessionsState.selected = { id, meta: s || { id }, bubbles: [] }
  }
  renderSessions(sessionsState, sessionsEl)
}

sessionsEl.addEventListener('click', (ev) => {
  const item = ev.target.closest('[data-sess-id]')
  if (item) openSession(item.getAttribute('data-sess-id'))
})
```

- [ ] **Step 4: Teach `renderActive` + tab handler** — extend `renderActive`:

```js
function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else if (tab === 'dashboard') renderDashboard(latest.dashboard, dashboardEl)
  else if (tab === 'memory') renderMemory(memoryState, memoryEl)
  else if (tab === 'sessions') renderSessions(sessionsState, sessionsEl)
}
```
and in the tab click handler, alongside the memory branch:

```js
    if (tab === 'memory') loadMemoryIndex()
    else if (tab === 'sessions') loadSessionsIndex()
    else renderActive()
```

(The WS-tick guard from M3 already only re-renders office/dashboard, so Sessions won't be rebuilt on ticks — correct.)

- [ ] **Step 5: Append CSS to `web/style.css`**:

```css
.sessions { padding: 0; height: 80vh; }
.sess { display: flex; height: 100%; }
.sess__list { flex-shrink: 0; width: 300px; overflow-y: auto; border-right: 1px solid #3a3f4a; padding: 10px 8px; background: #1b1e25; }
.sess__item { display: block; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 8px; padding: 9px 10px; margin-bottom: 4px; cursor: pointer; }
.sess__item:hover { background: #262a33; }
.sess__item--active { background: #2f3340; }
.sess__top { display: flex; justify-content: space-between; gap: 8px; }
.sess__proj { color: #e8eaed; font-size: 12px; font-weight: 500; }
.sess__model { color: #8a8f97; font-size: 10px; font-family: ui-monospace, monospace; }
.sess__title { color: #aeb4bd; font-size: 12px; margin: 3px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sess__bar { height: 4px; background: #3a3f4a; border-radius: 2px; overflow: hidden; }
.sess__barfill { height: 100%; background: #46c28e; }
.sess__barfill--hot { background: #e0794a; }
.sess__meta { display: flex; gap: 10px; margin-top: 6px; color: #6c727b; font-size: 10px; }
.sess__doc { flex: 1; min-width: 0; overflow-y: auto; padding: 16px 22px; }
.sess__dochead { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px; border-bottom: 1px solid #3a3f4a; margin-bottom: 14px; }
.sess__doctitle { color: #fff; font-size: 15px; }
.sess__docsub { color: #8a8f97; font-size: 11px; font-family: ui-monospace, monospace; }
.sess__hint, .sess__empty { color: #6c727b; font-size: 13px; padding: 24px 8px; }
.bubblerow { display: flex; gap: 10px; margin-bottom: 12px; }
.bubblerow__who { flex-shrink: 0; width: 56px; color: #8a8f97; font-size: 11px; padding-top: 2px; }
.bubblerow__body { flex: 1; min-width: 0; color: #d7dade; font-size: 13px; line-height: 1.5; background: #23272f; border-radius: 8px; padding: 8px 12px; }
.bubblerow--user .bubblerow__body { background: #2a2f3a; }
.bubblerow__body--tool { background: #1b1e25; border: 1px solid #3a3f4a; font-family: ui-monospace, monospace; font-size: 12px; }
.bubblerow__tool { color: #6ea8fe; }
.bubblerow__arg { color: #8a8f97; }
.bubblerow__body--result { background: #1b1e25; color: #aeb4bd; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; }
.bubblerow__body--error { color: #e0794a; }
.bubblerow__body p { margin: 0 0 0.5em; }
.bubblerow__body code { background: #1b1e25; padding: 1px 4px; border-radius: 4px; font-size: 0.9em; }
.bubblerow__body pre { background: #1b1e25; border: 1px solid #3a3f4a; border-radius: 6px; padding: 10px; overflow-x: auto; }
```

- [ ] **Step 6: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 7: e2e — controller verifies in the browser**

Start the server, open the **Sessions** tab, confirm: recent sessions listed with project/model/context bar; clicking one shows the transcript as bubbles (user/assistant/tool). Capture a screenshot via the preview tool (Sessions is a static view → screenshot won't hang).

- [ ] **Step 8: Commit, final review, merge to main, push**

```bash
git add web/src/main.js web/style.css
git commit -m "feat(m4): Sessions tab — index fetch, click-to-open transcript, CSS"
# final holistic review, then merge via finishing-a-development-branch:
git checkout main && git merge --ff-only mc-sessions-transcript
npx vitest run     # verify on merged main
gh auth switch -u kevinbyjordan-cell
git push origin main
git branch -d mc-sessions-transcript
```

Update `README.md` status (M4) and `agency-hq-project.md` memory.

---

## Self-Review

**Spec coverage** (roadmap v2 M4 = "lista TODAS as sessões: badge tipo, modelo, tokens, % de contexto, idade; clique → viewer do transcript em balões"):
- list sessions recent-first → `sessionsIndex` sorts by mtime desc ✅
- model / tokens / cost / % context → `SessionMeta` + context bar ✅
- title + age → `title` from first user msg; `updatedAt` (age formatted client-side) ✅
- transcript viewer in bubbles (user/assistant/tool) → `bubblesFromLines` + `renderSessions` bubble rows, reusing `renderMarkdown` ✅
- read-only + security → resolve id with containment + `isSessionFile`; subagents excluded; no absolute paths serialized ✅
- performance (large transcripts) → recent-N limit + `MAX_SCAN_BYTES` guard (`partial`) ✅

**Placeholder scan:** every code step has full code; commands have expected output. None.

**Type consistency:** `SessionMeta`/`Bubble` field names identical across `sessions.ts`, the JSON bodies (`{sessions}`, `{meta,bubbles}`), and the client (`renderSessions` reads `project`/`model`/`contextPct`/`messages`/`costUsd`/`title`/`sessionId`/`id`; bubbles read `role`/`kind`/`tool`/`isError`/`text`). Tab key `'sessions'` + `data-tab`/`data-view` match. `contextWindow` imported from `pricing.ts`.
