# MC M5 — Activity Feed + Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an **Activity** tab that shows, across recent sessions, a chronological feed of agent actions (each tool call, with success/error status), four stat cards (Total / Hoje / Sucesso / Erros), and an activity **heatmap** (weekday × hour) — in the new TenacitOS-style shell.

**Architecture:** A pure core (`activitiesFromLines`, `activityStats`) extracts activity events from parsed JSONL — testable without the filesystem. A thin FS wrapper (`activityFeed`) scans the recent-N session files (reusing `listSessionFiles` from `sessions.ts`, with the same 20 MB guard) and aggregates. One read-only endpoint `GET /api/activity` exposes `{activities, stats}`. The browser fetches on tab-open (not on the WS tick). Date-dependent views (the "Hoje" count, relative ages, and the local-time heatmap buckets) are computed **client-side** so they use the user's timezone; the server stays time-agnostic except for the mtime fallback it already uses.

**Tech Stack:** Node + TS (`tsx`); reuses `parseLine`/`TranscriptLine`/`ContentBlock`, `toolActivity` (labels), and `listSessionFiles` (newly exported from `sessions.ts`). Front-end plain ESM JS + DOM, reusing the `.dgrid`/`.dcard` stat-card styles and `icon()`. Tests: `vitest` (+ `jsdom`).

---

## File Structure

- `server/src/sessions.ts` (modify) — add `export` to `listSessionFiles` (reuse the session-file walk).
- `server/src/activity.ts` (create) — `Activity`/`ActivityStats` types, pure core (`activitiesFromLines`, `activityStats`), FS wrapper (`activityFeed`), `activityResponse`.
- `server/src/server.ts` (modify) — route `/api/activity`.
- `web/src/activity.js` (create) — `renderActivity(state, root)` + pure helpers `buildHeatmap`, `todayCount`, `relativeAge`.
- `web/src/main.js` (modify) — add the Activity nav item + view + fetch-on-open.
- `web/style.css` (modify) — `.feed*` + `.heat*` styles.
- `tests/activity-core.test.ts` (create) — pure core on line arrays.
- `tests/activity-fs.test.ts` (create) — wrapper + response on temp fixtures.
- `tests/activity-render.test.ts` (create) — render + date helpers (jsdom).

---

### Task M5-1: activity pure core (TDD)

**Files:**
- Create: `server/src/activity.ts`
- Test: `tests/activity-core.test.ts`

- [ ] **Step 1: failing test `tests/activity-core.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { activitiesFromLines, activityStats } from '../server/src/activity'
import type { TranscriptLine } from '../server/src/parse'

const lines: TranscriptLine[] = [
  { type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/x/GOOGLE ADS PRO', sessionId: 's1', message: { role: 'user', content: 'vai' } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [ { type: 'tool_use', id: 'a', name: 'Read', input: { file_path: '/x' } }, { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'ls' } } ] } },
  { type: 'user', timestamp: '2026-06-18T10:00:02Z', message: { role: 'user', content: [ { type: 'tool_result', tool_use_id: 'a', is_error: false }, { type: 'tool_result', tool_use_id: 'b', is_error: true } ] } },
  { type: 'assistant', timestamp: '2026-06-18T10:00:03Z', message: { role: 'assistant', content: [ { type: 'tool_use', id: 'c', name: 'Write', input: { file_path: '/y' } } ] } },
]

describe('activitiesFromLines', () => {
  it('emits one activity per tool_use with project, session, label and paired status', () => {
    const a = activitiesFromLines(lines)
    expect(a.length).toBe(3)
    expect(a[0]).toMatchObject({ tool: 'Read', project: 'GOOGLE ADS PRO', sessionId: 's1', status: 'ok', label: 'Lendo arquivos' })
    expect(a[1]).toMatchObject({ tool: 'Bash', status: 'error' })
    expect(a[2]).toMatchObject({ tool: 'Write', status: 'pending' }) // no matching tool_result
    expect(a[0].ts).toBe('2026-06-18T10:00:01Z')
  })

  it('is safe on empty input', () => {
    expect(activitiesFromLines([])).toEqual([])
  })
})

describe('activityStats', () => {
  it('counts total, successful, errors', () => {
    const a = activitiesFromLines(lines)
    expect(activityStats(a)).toEqual({ total: 3, successful: 1, errors: 1 })
  })
})
```

- [ ] **Step 2: run → FAIL** (`npx vitest run tests/activity-core.test.ts`).

- [ ] **Step 3: implement `server/src/activity.ts`** (pure core only):

```ts
import type { TranscriptLine, ContentBlock } from './parse'
import { toolActivity } from './toolActivity'

export interface Activity {
  ts: string | null
  tool: string
  label: string
  project: string
  sessionId: string | null
  status: 'ok' | 'error' | 'pending'
}

export interface ActivityStats {
  total: number
  successful: number
  errors: number
}

function projectFromCwd(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

export function activitiesFromLines(lines: TranscriptLine[]): Activity[] {
  let project = ''
  let sessionId: string | null = null
  const errorById = new Map<string, boolean>()

  // Pass 1: derive context + collect tool_result statuses by tool_use_id.
  for (const line of lines) {
    if (line.cwd && !project) project = projectFromCwd(line.cwd)
    if (line.sessionId && !sessionId) sessionId = line.sessionId
    if (line.type === 'user') {
      const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
      for (const b of content) {
        if (b.type === 'tool_result' && b.tool_use_id) errorById.set(b.tool_use_id, !!b.is_error)
      }
    }
  }

  // Pass 2: emit one activity per assistant tool_use.
  const out: Activity[] = []
  for (const line of lines) {
    if (line.type !== 'assistant') continue
    const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []
    for (const b of content) {
      if (b.type !== 'tool_use') continue
      const tool = b.name ?? '?'
      const status: Activity['status'] = b.id && errorById.has(b.id) ? (errorById.get(b.id) ? 'error' : 'ok') : 'pending'
      out.push({ ts: line.timestamp ?? null, tool, label: toolActivity(tool), project, sessionId, status })
    }
  }
  return out
}

export function activityStats(activities: Activity[]): ActivityStats {
  let successful = 0
  let errors = 0
  for (const a of activities) {
    if (a.status === 'ok') successful++
    else if (a.status === 'error') errors++
  }
  return { total: activities.length, successful, errors }
}
```

- [ ] **Step 4: run → PASS + `npx tsc --noEmit`.**

- [ ] **Step 5: commit** `git add server/src/activity.ts tests/activity-core.test.ts && git commit -m "feat(m5): activity pure core (events + stats)"`

---

### Task M5-2: activity FS wrapper + response (TDD)

**Files:**
- Modify: `server/src/sessions.ts` (export `listSessionFiles`)
- Modify: `server/src/activity.ts`
- Test: `tests/activity-fs.test.ts`

- [ ] **Step 1: export the walker** — in `server/src/sessions.ts`, change `async function listSessionFiles(` to `export async function listSessionFiles(`. (Additive; existing tests unaffected.)

- [ ] **Step 2: failing test `tests/activity-fs.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { activityFeed, activityResponse } from '../server/src/activity'

let root: string
const L = (o: object) => JSON.stringify(o)

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-act-'))
  const p = path.join(root, 'C--proj-A')
  await fs.mkdir(path.join(p, 'subagents'), { recursive: true })
  await fs.writeFile(path.join(p, 's1.jsonl'), [
    L({ type: 'user', timestamp: '2026-06-18T10:00:00Z', cwd: 'C:/proj/A', sessionId: 's1', message: { role: 'user', content: 'oi' } }),
    L({ type: 'assistant', timestamp: '2026-06-18T10:00:01Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Read', input: {} }] } }),
    L({ type: 'user', timestamp: '2026-06-18T10:00:02Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: false }] } }),
  ].join('\n'), 'utf8')
  await fs.writeFile(path.join(p, 'subagents', 'agent-x.jsonl'), L({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Bash' }] } }), 'utf8')
})

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }) })

describe('activityFeed', () => {
  it('aggregates activities from main sessions (not subagents), newest first, with stats', async () => {
    const { activities, stats } = await activityFeed(root, 25, 300)
    expect(activities.length).toBe(1)
    expect(activities[0]).toMatchObject({ tool: 'Read', project: 'A', status: 'ok' })
    expect(stats).toEqual({ total: 1, successful: 1, errors: 0 })
  })
})

describe('activityResponse', () => {
  it('200s the feed and never leaks absolute paths', async () => {
    const r = await activityResponse(root, '/api/activity', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.activities)).toBe(true)
    expect(r.body.stats.total).toBe(1)
    expect(JSON.stringify(r.body)).not.toContain(root)
  })
  it('404s unknown paths', async () => {
    const r = await activityResponse(root, '/api/nope', new URLSearchParams())
    expect(r.status).toBe(404)
  })
})
```

- [ ] **Step 3: run → FAIL.**

- [ ] **Step 4: append FS wrapper + response to `server/src/activity.ts`** (add imports at top alongside existing ones):

```ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseLine } from './parse'
import { listSessionFiles } from './sessions'

const MAX_SCAN_BYTES = 20_000_000
const SESSION_LIMIT = 25
const ACTIVITY_CAP = 300

export async function activityFeed(
  root: string,
  sessionLimit = SESSION_LIMIT,
  cap = ACTIVITY_CAP,
): Promise<{ activities: Activity[]; stats: ActivityStats }> {
  const files = (await listSessionFiles(root)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, sessionLimit)
  const all: Activity[] = []
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
      const lines = []
      for (const raw of text.split('\n')) {
        const l = parseLine(raw)
        if (l) lines.push(l)
      }
      all.push(...activitiesFromLines(lines))
    } catch {
      /* skip */
    }
  }
  all.sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
  const activities = all.slice(0, cap)
  return { activities, stats: activityStats(activities) }
}

export async function activityResponse(
  root: string,
  pathname: string,
  _query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/activity') {
    return { status: 200, body: await activityFeed(root) }
  }
  return { status: 404, body: { error: 'not found' } }
}
```

Note: `Activity` carries only `project`/`sessionId` (no absolute path), so the body never leaks paths — the test asserts this.

- [ ] **Step 5: run → PASS + `npx tsc --noEmit`. Full suite `npx vitest run`.**

- [ ] **Step 6: commit** `git add server/src/sessions.ts server/src/activity.ts tests/activity-fs.test.ts && git commit -m "feat(m5): activity feed aggregation + response"`

---

### Task M5-3: wire /api/activity route (manual verification)

**Files:**
- Modify: `server/src/server.ts`

- [ ] **Step 1:** add import after `import { sessionsResponse } from './sessions'`:
```ts
import { activityResponse } from './activity'
```

- [ ] **Step 2:** add the route after the `/api/sessions*` block, before `let p = pathname`:
```ts
  if (pathname === '/api/activity') {
    const r = await activityResponse(PROJECTS_ROOT, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }
```

- [ ] **Step 3:** `npx tsc --noEmit` → clean.

- [ ] **Step 4: manual smoke** (non-default port):
```bash
PORT=4602 npm start &
SP=$!; sleep 3
curl -s http://localhost:4602/api/activity | head -c 500; echo ""
curl -s -o /dev/null -w "static / = %{http_code}\n" http://localhost:4602/
kill $SP 2>/dev/null
```
Expected: `{"activities":[...],"stats":{"total":N,"successful":...,"errors":...}}` with real recent tool calls; `/` = 200. If it errors or returns empty stats with nonzero sessions, STOP and report.

- [ ] **Step 5: commit** `git add server/src/server.ts && git commit -m "feat(m5): serve /api/activity endpoint"`

---

### Task M5-4: Activity view render + date helpers (TDD)

**Files:**
- Create: `web/src/activity.js`
- Test: `tests/activity-render.test.ts`

- [ ] **Step 1: failing test `tests/activity-render.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderActivity, buildHeatmap, todayCount, relativeAge } from '../web/src/activity.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="r"></div>'
  root = document.getElementById('r')!
})

const NOW = Date.parse('2026-06-18T12:00:00Z')
const acts = [
  { ts: '2026-06-18T11:00:00Z', tool: 'Read', label: 'Lendo arquivos', project: 'A', sessionId: 's1', status: 'ok' },
  { ts: '2026-06-18T10:00:00Z', tool: 'Bash', label: 'Rodando comando', project: 'A', sessionId: 's1', status: 'error' },
  { ts: '2026-06-10T10:00:00Z', tool: 'Write', label: 'Escrevendo arquivo', project: 'B', sessionId: 's2', status: 'ok' },
]

describe('date helpers', () => {
  it('buildHeatmap returns a 7x24 grid counting by local weekday/hour', () => {
    const h = buildHeatmap(acts)
    expect(h.length).toBe(7)
    expect(h[0].length).toBe(24)
    const total = h.flat().reduce((s, n) => s + n, 0)
    expect(total).toBe(3)
  })
  it('todayCount counts activities on the same local day as now', () => {
    expect(todayCount(acts, NOW)).toBe(2) // the two on 06-18
  })
  it('relativeAge formats deltas', () => {
    expect(relativeAge('2026-06-18T11:59:30Z', NOW)).toMatch(/agora|s/)
    expect(relativeAge('2026-06-18T10:00:00Z', NOW)).toContain('h')
  })
})

describe('renderActivity', () => {
  it('renders 4 stat cards, a heatmap grid and a feed row per activity', () => {
    renderActivity({ activities: acts, stats: { total: 3, successful: 2, errors: 1 } }, root)
    expect(root.querySelectorAll('.dcard').length).toBe(4)
    expect(root.querySelectorAll('.heat__cell').length).toBe(168)
    expect(root.querySelectorAll('.feed__row').length).toBe(3)
    expect(root.textContent).toContain('Lendo arquivos')
  })
  it('shows a placeholder when empty', () => {
    renderActivity({ activities: [], stats: { total: 0, successful: 0, errors: 0 } }, root)
    expect(root.querySelector('.feed__empty')).not.toBeNull()
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: implement `web/src/activity.js`**:

```js
import { icon } from './icons.js'

export function buildHeatmap(activities) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const a of activities) {
    if (!a.ts) continue
    const d = new Date(a.ts)
    if (isNaN(d.getTime())) continue
    grid[d.getDay()][d.getHours()]++
  }
  return grid
}

export function todayCount(activities, now) {
  const ref = new Date(now)
  let n = 0
  for (const a of activities) {
    if (!a.ts) continue
    const d = new Date(a.ts)
    if (d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()) n++
  }
  return n
}

export function relativeAge(ts, now) {
  if (!ts) return ''
  const diff = Math.max(0, now - Date.parse(ts))
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  return Math.floor(h / 24) + 'd'
}

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

const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function renderActivity(state, root) {
  const activities = (state && state.activities) || []
  const stats = (state && state.stats) || { total: 0, successful: 0, errors: 0 }
  const now = Date.now()
  root.innerHTML = ''

  const grid = el('div', 'dgrid')
  grid.append(
    statCard('Total', stats.total, 'activity'),
    statCard('Hoje', todayCount(activities, now), 'activity'),
    statCard('Sucesso', stats.successful, 'users'),
    statCard('Erros', stats.errors, 'dollar'),
  )
  root.appendChild(grid)

  // Heatmap
  const heat = el('div', 'heat')
  const hm = buildHeatmap(activities)
  let max = 1
  for (const row of hm) for (const v of row) if (v > max) max = v
  for (let d = 0; d < 7; d++) {
    const r = el('div', 'heat__row')
    r.appendChild(el('span', 'heat__wd', WD[d]))
    for (let h = 0; h < 24; h++) {
      const cell = el('div', 'heat__cell')
      const v = hm[d][h]
      if (v > 0) {
        cell.style.background = 'var(--accent)'
        cell.style.opacity = String(0.2 + 0.8 * (v / max))
      }
      cell.title = WD[d] + ' ' + h + 'h: ' + v
      r.appendChild(cell)
    }
    heat.appendChild(r)
  }
  root.appendChild(heat)

  // Feed
  const feed = el('div', 'feed')
  if (activities.length === 0) {
    feed.appendChild(el('div', 'feed__empty', 'Nenhuma atividade recente.'))
  } else {
    for (const a of activities.slice(0, 60)) {
      const row = el('div', 'feed__row')
      row.appendChild(el('span', 'feed__dot feed__dot--' + a.status))
      const main = el('div', 'feed__main')
      main.append(el('span', 'feed__label', a.label || a.tool), el('span', 'feed__sub', a.tool + ' · ' + (a.project || '')))
      row.append(main, el('span', 'feed__time', relativeAge(a.ts, now)))
      feed.appendChild(row)
    }
  }
  root.appendChild(feed)
}
```

- [ ] **Step 4: run → PASS + full suite.**

- [ ] **Step 5: commit** `git add web/src/activity.js tests/activity-render.test.ts && git commit -m "feat(m5): activity view render (stat cards + heatmap + feed)"`

---

### Task M5-5: wire Activity tab + CSS + e2e + merge/push

**Files:**
- Modify: `web/src/main.js`
- Modify: `web/style.css`

- [ ] **Step 1:** import in `main.js` (after `renderSessions` import): `import { renderActivity } from './activity.js'`

- [ ] **Step 2:** add to the `NAV` array (after the `sessions` entry):
```js
  { tab: 'activity', label: 'Activity', ico: 'activity', emoji: '⚡', title: 'Activity', sub: 'Fluxo de ações dos agentes e mapa de calor' },
```
and to `VIEW_INNER`: `activity: '<div class="activity"></div>',`

- [ ] **Step 3:** after `const sessionsEl = ...` add `const activityEl = stage.querySelector('.activity')`; add state + loader after the sessions block:
```js
let activityState = { activities: [], stats: { total: 0, successful: 0, errors: 0 } }

async function loadActivity() {
  try {
    const res = await fetch('/api/activity')
    const data = await res.json()
    activityState = { activities: data.activities || [], stats: data.stats || { total: 0, successful: 0, errors: 0 } }
  } catch {
    activityState = { activities: [], stats: { total: 0, successful: 0, errors: 0 } }
  }
  if (tab === 'activity') renderActivity(activityState, activityEl)
}
```

- [ ] **Step 4:** extend `renderActive` with `else if (tab === 'activity') renderActivity(activityState, activityEl)` and the tab handler with `else if (tab === 'activity') loadActivity()`.

- [ ] **Step 5:** append CSS to `web/style.css`:
```css
.feed { margin-top: 20px; }
.feed__row { display: flex; align-items: center; gap: 12px; padding: 9px 4px; border-bottom: 1px solid var(--border); }
.feed__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--faint); }
.feed__dot--ok { background: var(--green); }
.feed__dot--error { background: var(--red); }
.feed__dot--pending { background: var(--muted); }
.feed__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.feed__label { color: var(--text); font-size: 13px; }
.feed__sub { color: var(--faint); font-size: 11px; font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed__time { color: var(--muted); font-size: 11px; flex-shrink: 0; }
.feed__empty { color: var(--faint); font-size: 13px; padding: 24px 4px; }
.heat { margin-top: 22px; display: flex; flex-direction: column; gap: 3px; }
.heat__row { display: flex; align-items: center; gap: 3px; }
.heat__wd { width: 34px; color: var(--muted); font-size: 10px; flex-shrink: 0; }
.heat__cell { width: 14px; height: 14px; border-radius: 3px; background: var(--panel-2); }
```

- [ ] **Step 6:** full suite + `npx tsc --noEmit`.

- [ ] **Step 7: e2e** — controller starts server, opens **Activity**, confirms stat cards + heatmap + feed render on real data; screenshot via preview.

- [ ] **Step 8:** commit, final review, merge to main, push; update README (M5) + memory.

---

## Self-Review

**Spec coverage** (roadmap v2 M5 = "stream cronológico de ações + heatmap por hora + contadores total/hoje/sucesso/erro"):
- chronological feed → `activityFeed` sorts desc, feed rows ✅
- per-action status (ok/error) → tool_use↔tool_result pairing ✅
- counters Total/Hoje/Sucesso/Erros → stat cards (Hoje + heatmap computed client-side in local tz) ✅
- heatmap weekday×hour → `buildHeatmap` 7×24 ✅
- performance → reuse recent-N session scan + 20 MB guard ✅
- new shell style → reuses `.dgrid`/`.dcard`, page header via main.js NAV ✅

**Placeholder scan:** all code present; commands have expected output. None.

**Type consistency:** `Activity {ts,tool,label,project,sessionId,status}` identical across `activity.ts`, the `{activities,stats}` body, and `renderActivity`/feed rows. `ActivityStats {total,successful,errors}` consistent. Nav key `'activity'` matches `data-tab`/`data-view`. `listSessionFiles` exported once in `sessions.ts`, imported in `activity.ts`.
