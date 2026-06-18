# MC M3 — Memory (.md browser) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Memory** tab to Mission Control that lists the operation's `.md` knowledge files (auto-memory, agent definitions, user skills, project `CLAUDE.md`) and renders any one of them read-only as formatted markdown.

**Architecture:** Server enumerates a fixed allowlist of root directories, walks each for `.md` files, and exposes two JSON endpoints (`GET /api/memory` for the index, `GET /api/memory/content?id=` for one file's text). The client never supplies a filesystem path — it references an opaque `id` that the server resolves against its own freshly-built index, so there is no path-traversal surface. The browser fetches the index when the Memory tab opens, renders a grouped file list, and on click fetches + renders the file through a tiny escape-first markdown renderer. This is request/response (not part of the live WebSocket building stream); live editing is a later phase.

**Tech Stack:** Node + TypeScript (`tsx`) for the server module + endpoints; plain ESM JS + DOM for the client; `vitest` + `jsdom` for tests. No new dependencies.

---

## File Structure

- `server/src/memory.ts` (create) — `memoryRoots()`, `buildMemoryIndex()`, `readMemoryFile()`, `memoryResponse()`. Owns enumeration, id resolution, content reads, and the JSON-route logic. Pure/FS-only; no HTTP.
- `server/src/server.ts` (modify) — wire `/api/memory*` routes to `memoryResponse()` before static serving; compute `WORKSPACE`.
- `web/src/markdown.js` (create) — `renderMarkdown(text)` → safe HTML string (escape-first).
- `web/src/memory.js` (create) — `renderMemory(state, root)` pure render of the two-pane Memory view (grouped list + document pane).
- `web/src/main.js` (modify) — add the Memory tab, fetch the index on open, delegated click → fetch content → re-render.
- `web/style.css` (modify) — `.mem*` two-pane + prose styles.
- `tests/memory.test.ts` (create) — index/resolve/response tests against a temp fixture (project keeps all tests in flat `tests/`; server modules imported as `../server/src/...`).
- `tests/markdown.test.ts` (create) — renderer correctness + XSS escaping (`../web/src/markdown.js`).
- `tests/memory-render.test.ts` (create) — `renderMemory` DOM output (needs `// @vitest-environment jsdom`; `../web/src/memory.js`).

---

### Task M3-1: Server memory module — roots, index, read, response (TDD)

**Files:**
- Create: `server/src/memory.ts`
- Test: `server/test/memory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/memory.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { memoryRoots, buildMemoryIndex, readMemoryFile, memoryResponse, type MemoryRoot } from '../src/memory'

let tmp: string
let roots: MemoryRoot[]

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-mem-'))
  // memory category fixture: <tmp>/projects/<slug>/memory/*.md
  const mem = path.join(tmp, 'projects', 'slug-a', 'memory')
  await fs.mkdir(mem, { recursive: true })
  await fs.writeFile(path.join(mem, 'MEMORY.md'), '# Index\n', 'utf8')
  await fs.writeFile(path.join(mem, 'note.md'), '# Note\nbody\n', 'utf8')
  // a noise dir that must be skipped
  const noise = path.join(tmp, 'projects', 'slug-a', 'memory', 'node_modules', 'pkg')
  await fs.mkdir(noise, { recursive: true })
  await fs.writeFile(path.join(noise, 'readme.md'), 'should be skipped', 'utf8')
  // agents category fixture
  const agents = path.join(tmp, 'agents')
  await fs.mkdir(agents, { recursive: true })
  await fs.writeFile(path.join(agents, 'researcher.md'), '# Researcher\n', 'utf8')

  roots = [
    { category: 'memory', label: 'Memória', dir: path.join(tmp, 'projects'), match: 'md', maxDepth: 3 },
    { category: 'agents', label: 'Agentes', dir: agents, match: 'md', maxDepth: 2 },
  ]
})

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('buildMemoryIndex', () => {
  it('collects .md files per root and skips node_modules', async () => {
    const files = await buildMemoryIndex(roots)
    const names = files.map((f) => f.name).sort()
    expect(names).toEqual(['MEMORY.md', 'note.md', 'researcher.md'])
    expect(files.every((f) => f.id && f.category && f.name)).toBe(true)
    // ids are unique
    expect(new Set(files.map((f) => f.id)).size).toBe(files.length)
  })
})

describe('readMemoryFile', () => {
  it('returns content for a known id', async () => {
    const files = await buildMemoryIndex(roots)
    const target = files.find((f) => f.name === 'note.md')!
    const res = await readMemoryFile(roots, target.id)
    expect(res).not.toBeNull()
    expect(res!.content).toContain('body')
    expect(res!.file.name).toBe('note.md')
  })

  it('returns null for an unknown id', async () => {
    const res = await readMemoryFile(roots, 'memory/../../etc/passwd')
    expect(res).toBeNull()
  })
})

describe('memoryResponse', () => {
  it('200s the index on /api/memory', async () => {
    const r = await memoryResponse(roots, '/api/memory', new URLSearchParams())
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.files)).toBe(true)
    // never leaks absolute paths
    expect(JSON.stringify(r.body)).not.toContain(tmp)
  })

  it('200s content for a valid id and 404s a bad id', async () => {
    const idx = await memoryResponse(roots, '/api/memory', new URLSearchParams())
    const id = idx.body.files[0].id
    const ok = await memoryResponse(roots, '/api/memory/content', new URLSearchParams({ id }))
    expect(ok.status).toBe(200)
    expect(typeof ok.body.content).toBe('string')
    const bad = await memoryResponse(roots, '/api/memory/content', new URLSearchParams({ id: 'nope' }))
    expect(bad.status).toBe(404)
  })
})

describe('memoryRoots', () => {
  it('produces categories for a given home + workspace', () => {
    const rs = memoryRoots('/home/u', '/work/space')
    const cats = rs.map((r) => r.category)
    expect(cats).toContain('memory')
    expect(cats).toContain('agents')
    expect(cats).toContain('instructions')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:/Users/kevin/Desktop/AGENCIA/VENDA SITES/agency-hq" && npx vitest run server/test/memory.test.ts`
Expected: FAIL — cannot find module `../src/memory`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/src/memory.ts
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface MemoryRoot {
  category: string
  label: string
  dir: string
  /** 'md' = any *.md file; otherwise an exact filename to match (e.g. 'CLAUDE.md') */
  match: 'md' | string
  maxDepth: number
}

export interface MemoryFile {
  id: string
  category: string
  categoryLabel: string
  name: string
  relPath: string
  /** absolute path — server-internal, never serialized to clients */
  absPath: string
  mtimeMs: number
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next'])
const MAX_CONTENT_BYTES = 400_000

const CATEGORY_ORDER = ['memory', 'agents', 'skills', 'instructions']

export function memoryRoots(home: string, workspace: string): MemoryRoot[] {
  const claude = path.join(home, '.claude')
  return [
    { category: 'memory', label: 'Memória', dir: path.join(claude, 'projects'), match: 'md', maxDepth: 3 },
    { category: 'agents', label: 'Agentes', dir: path.join(claude, 'agents'), match: 'md', maxDepth: 2 },
    { category: 'skills', label: 'Skills', dir: path.join(claude, 'skills'), match: 'md', maxDepth: 3 },
    { category: 'instructions', label: 'Instruções', dir: workspace, match: 'CLAUDE.md', maxDepth: 2 },
  ]
}

function matches(name: string, match: string): boolean {
  if (match === 'md') return name.toLowerCase().endsWith('.md')
  return name === match
}

async function walk(dir: string, match: string, maxDepth: number, depth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      await walk(path.join(dir, e.name), match, maxDepth, depth + 1, out)
    } else if (matches(e.name, match)) {
      out.push(path.join(dir, e.name))
    }
  }
}

function makeId(category: string, relPath: string): string {
  return category + '/' + relPath.split(path.sep).join('/')
}

export async function buildMemoryIndex(roots: MemoryRoot[]): Promise<MemoryFile[]> {
  const files: MemoryFile[] = []
  const seen = new Set<string>()
  for (const root of roots) {
    const found: string[] = []
    await walk(root.dir, root.match, root.maxDepth, 0, found)
    for (const abs of found) {
      const relPath = path.relative(root.dir, abs)
      const id = makeId(root.category, relPath)
      if (seen.has(id)) continue
      seen.add(id)
      let mtimeMs = 0
      try {
        mtimeMs = (await fs.stat(abs)).mtimeMs
      } catch {
        continue
      }
      files.push({
        id,
        category: root.category,
        categoryLabel: root.label,
        name: path.basename(abs),
        relPath: relPath.split(path.sep).join('/'),
        absPath: abs,
        mtimeMs,
      })
    }
  }
  files.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return ca - cb
    return a.name.localeCompare(b.name)
  })
  return files
}

export async function readMemoryFile(
  roots: MemoryRoot[],
  id: string,
): Promise<{ file: MemoryFile; content: string } | null> {
  const files = await buildMemoryIndex(roots)
  const file = files.find((f) => f.id === id)
  if (!file) return null
  try {
    let content = await fs.readFile(file.absPath, 'utf8')
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      content = content.slice(0, MAX_CONTENT_BYTES) + '\n\n…(truncado)'
    }
    return { file, content }
  } catch {
    return null
  }
}

/** strip absPath before serializing to the client */
function publicFile(f: MemoryFile) {
  return { id: f.id, category: f.category, categoryLabel: f.categoryLabel, name: f.name, relPath: f.relPath, mtimeMs: f.mtimeMs }
}

export async function memoryResponse(
  roots: MemoryRoot[],
  pathname: string,
  query: URLSearchParams,
): Promise<{ status: number; body: any }> {
  if (pathname === '/api/memory') {
    const files = await buildMemoryIndex(roots)
    return { status: 200, body: { files: files.map(publicFile) } }
  }
  if (pathname === '/api/memory/content') {
    const id = query.get('id') ?? ''
    const res = await readMemoryFile(roots, id)
    if (!res) return { status: 404, body: { error: 'not found' } }
    return { status: 200, body: { file: publicFile(res.file), content: res.content } }
  }
  return { status: 404, body: { error: 'not found' } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/memory.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add server/src/memory.ts server/test/memory.test.ts
git commit -m "feat(m3): server memory module — roots, index, read, json response"
```

---

### Task M3-2: Wire /api/memory routes into the server (manual verification)

**Files:**
- Modify: `server/src/server.ts`

- [ ] **Step 1: Add the import and workspace constant**

After the existing `import { dashboardSummary } from './dashboard'` line, add:

```ts
import { memoryRoots, memoryResponse } from './memory'
```

After the `WEB_DIR` constant, add:

```ts
// agency-hq lives at <workspace>/agency-hq; the workspace holds the orchestrator CLAUDE.md
const WORKSPACE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MEMORY_ROOTS = memoryRoots(os.homedir(), WORKSPACE)
```

- [ ] **Step 2: Route the request before static serving**

Replace the body of `http.createServer(async (req, res) => { ... })` so it parses the URL once and handles `/api/memory*` first:

```ts
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/api/memory' || pathname === '/api/memory/content') {
    const r = await memoryResponse(MEMORY_ROOTS, pathname, url.searchParams)
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(r.body))
    return
  }

  let p = pathname
  if (p === '/') p = '/index.html'
  const file = path.join(WEB_DIR, p)
  if (!file.startsWith(WEB_DIR)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  try {
    const data = await fs.readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

```bash
PORT=4599 npm start &
sleep 2
curl -s http://localhost:4599/api/memory | head -c 400
```
Expected: JSON `{"files":[...]}` including this project's `MEMORY.md` / `agency-hq-project.md`. Then grab an id and verify content:
```bash
curl -s "http://localhost:4599/api/memory/content?id=<paste-an-id>" | head -c 200
```
Expected: JSON with a `content` string. Stop the server (`kill %1`).

- [ ] **Step 5: Commit**

```bash
git add server/src/server.ts
git commit -m "feat(m3): serve /api/memory index + content endpoints"
```

---

### Task M3-3: Markdown renderer (TDD)

**Files:**
- Create: `web/src/markdown.js`
- Test: `web/test/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/markdown.test.ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/markdown.js'

describe('renderMarkdown', () => {
  it('escapes HTML to prevent injection', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders headings by level', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>')
    expect(renderMarkdown('### Sub')).toContain('<h3>Sub</h3>')
  })

  it('renders bold, italic and inline code', () => {
    expect(renderMarkdown('a **b** c')).toContain('<strong>b</strong>')
    expect(renderMarkdown('a *b* c')).toContain('<em>b</em>')
    expect(renderMarkdown('use `code` here')).toContain('<code>code</code>')
  })

  it('renders unordered lists', () => {
    const html = renderMarkdown('- one\n- two')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('renders fenced code blocks without applying inline rules inside', () => {
    const html = renderMarkdown('```\n**not bold**\n```')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('**not bold**')
    expect(html).not.toContain('<strong>')
  })

  it('renders safe links and neutralizes javascript: urls', () => {
    expect(renderMarkdown('[x](https://a.com)')).toContain('href="https://a.com"')
    const bad = renderMarkdown('[x](javascript:alert(1))')
    expect(bad).not.toContain('javascript:')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/test/markdown.test.ts`
Expected: FAIL — cannot find module `../src/markdown.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/markdown.js
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(s) {
  // operates on already-escaped text
  s = s.replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = /^(https?:\/\/|\/|\.\/|#|mailto:)/i.test(url) ? url : '#'
    return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + text + '</a>'
  })
  return s
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const out = []
  let inCode = false
  let codeBuf = []
  let listType = null
  let para = []

  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + inline(para.join(' ')) + '</p>')
      para = []
    }
  }
  const closeList = () => {
    if (listType) {
      out.push('</' + listType + '>')
      listType = null
    }
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>')
        codeBuf = []
        inCode = false
      } else {
        flushPara()
        closeList()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    if (/^\s*$/.test(line)) {
      flushPara()
      closeList()
      continue
    }

    const esc = escapeHtml(line)
    const h = esc.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>')
      continue
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara()
      closeList()
      out.push('<hr>')
      continue
    }
    const ul = esc.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      flushPara()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push('<li>' + inline(ul[1]) + '</li>')
      continue
    }
    const ol = esc.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      flushPara()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push('<li>' + inline(ol[1]) + '</li>')
      continue
    }
    const bq = esc.match(/^&gt;\s?(.*)$/)
    if (bq) {
      flushPara()
      closeList()
      out.push('<blockquote>' + inline(bq[1]) + '</blockquote>')
      continue
    }
    para.push(esc)
  }
  if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>')
  flushPara()
  closeList()
  return out.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/test/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/markdown.js web/test/markdown.test.ts
git commit -m "feat(m3): escape-first markdown renderer"
```

---

### Task M3-4: Memory view render (TDD)

**Files:**
- Create: `web/src/memory.js`
- Test: `web/test/memory-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/test/memory-render.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderMemory } from '../src/memory.js'

let root: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  root = document.getElementById('root')!
})

const files = [
  { id: 'memory/a/memory/MEMORY.md', category: 'memory', categoryLabel: 'Memória', name: 'MEMORY.md', relPath: 'a/memory/MEMORY.md' },
  { id: 'agents/researcher.md', category: 'agents', categoryLabel: 'Agentes', name: 'researcher.md', relPath: 'researcher.md' },
]

describe('renderMemory', () => {
  it('groups files by category label', () => {
    renderMemory({ files, selected: null }, root)
    const heads = [...root.querySelectorAll('.mem__grouphead')].map((e) => e.textContent)
    expect(heads).toContain('Memória')
    expect(heads).toContain('Agentes')
    expect(root.querySelectorAll('[data-mem-id]').length).toBe(2)
  })

  it('marks the selected file active and renders its html', () => {
    renderMemory({ files, selected: { id: files[0].id, name: 'MEMORY.md', html: '<h1>Index</h1>' } }, root)
    const active = root.querySelector('.mem__item--active')
    expect(active?.getAttribute('data-mem-id')).toBe(files[0].id)
    expect(root.querySelector('.mem__doc')?.innerHTML).toContain('<h1>Index</h1>')
  })

  it('shows an empty hint when nothing is selected', () => {
    renderMemory({ files, selected: null }, root)
    expect(root.querySelector('.mem__doc')?.textContent).toMatch(/selecione/i)
  })

  it('shows a placeholder when there are no files', () => {
    renderMemory({ files: [], selected: null }, root)
    expect(root.querySelector('.mem__empty')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/test/memory-render.test.ts`
Expected: FAIL — cannot find module `../src/memory.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// web/src/memory.js
function groupByCategory(files) {
  const groups = new Map()
  for (const f of files) {
    if (!groups.has(f.category)) groups.set(f.category, { label: f.categoryLabel, items: [] })
    groups.get(f.category).items.push(f)
  }
  return [...groups.values()]
}

export function renderMemory(state, root) {
  const files = (state && state.files) || []
  const selected = (state && state.selected) || null
  root.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.className = 'mem'

  const list = document.createElement('div')
  list.className = 'mem__list'

  if (files.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'mem__empty'
    empty.textContent = 'Nenhum arquivo de memória encontrado.'
    list.appendChild(empty)
  } else {
    for (const group of groupByCategory(files)) {
      const head = document.createElement('div')
      head.className = 'mem__grouphead'
      head.textContent = group.label
      list.appendChild(head)
      for (const f of group.items) {
        const item = document.createElement('button')
        item.className = 'mem__item' + (selected && selected.id === f.id ? ' mem__item--active' : '')
        item.setAttribute('data-mem-id', f.id)
        const name = document.createElement('span')
        name.className = 'mem__name'
        name.textContent = f.name
        const sub = document.createElement('span')
        sub.className = 'mem__sub'
        sub.textContent = f.relPath
        item.append(name, sub)
        list.appendChild(item)
      }
    }
  }

  const doc = document.createElement('div')
  doc.className = 'mem__doc'
  if (selected && selected.html != null) {
    const title = document.createElement('div')
    title.className = 'mem__doctitle'
    title.textContent = selected.name || ''
    const body = document.createElement('div')
    body.className = 'mem__docbody'
    body.innerHTML = selected.html
    doc.append(title, body)
  } else {
    const hint = document.createElement('div')
    hint.className = 'mem__hint'
    hint.textContent = 'Selecione um arquivo à esquerda para visualizar.'
    doc.appendChild(hint)
  }

  wrap.append(list, doc)
  root.appendChild(wrap)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/test/memory-render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/memory.js web/test/memory-render.test.ts
git commit -m "feat(m3): memory two-pane view render"
```

---

### Task M3-5: Wire Memory tab + CSS + e2e + merge/push

**Files:**
- Modify: `web/src/main.js`
- Modify: `web/style.css`

- [ ] **Step 1: Add the Memory tab + view to the shell in `main.js`**

Add the imports at the top:

```js
import { renderMemory } from './memory.js'
import { renderMarkdown } from './markdown.js'
```

In the `stage.innerHTML` template, add a tab button after the Dashboard tab:

```js
'<button class="mc__tab" data-tab="memory">Memory</button>' +
```

and a view section after the dashboard `<section>`:

```js
'<section class="mc__view mc__view--hidden" data-view="memory"><div class="memory"></div></section>' +
```

- [ ] **Step 2: Add the Memory state + fetching logic in `main.js`**

After `const dashboardEl = stage.querySelector('.dashboard')`, add:

```js
const memoryEl = stage.querySelector('.memory')
let memoryState = { files: [], selected: null }

async function loadMemoryIndex() {
  try {
    const res = await fetch('/api/memory')
    const data = await res.json()
    memoryState = { files: data.files || [], selected: memoryState.selected }
  } catch {
    memoryState = { files: [], selected: null }
  }
  if (tab === 'memory') renderMemory(memoryState, memoryEl)
}

async function openMemoryFile(id) {
  const file = memoryState.files.find((f) => f.id === id)
  memoryState.selected = { id, name: file ? file.name : id, html: '<p>Carregando…</p>' }
  renderMemory(memoryState, memoryEl)
  try {
    const res = await fetch('/api/memory/content?id=' + encodeURIComponent(id))
    const data = await res.json()
    memoryState.selected = { id, name: data.file ? data.file.name : (file ? file.name : id), html: renderMarkdown(data.content || '') }
  } catch {
    memoryState.selected = { id, name: file ? file.name : id, html: '<p>Erro ao carregar.</p>' }
  }
  renderMemory(memoryState, memoryEl)
}

memoryEl.addEventListener('click', (ev) => {
  const item = ev.target.closest('[data-mem-id]')
  if (item) openMemoryFile(item.getAttribute('data-mem-id'))
})
```

- [ ] **Step 3: Teach `renderActive` and the tab handler about Memory in `main.js`**

Update `renderActive`:

```js
function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else if (tab === 'dashboard') renderDashboard(latest.dashboard, dashboardEl)
  else if (tab === 'memory') renderMemory(memoryState, memoryEl)
}
```

In the tab-button click handler, fetch the index the first time Memory opens. Replace the handler body with:

```js
for (const btn of stage.querySelectorAll('.mc__tab')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.mc__tab')) b.classList.toggle('mc__tab--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    if (tab === 'memory') loadMemoryIndex()
    else renderActive()
  })
}
```

- [ ] **Step 4: Add the CSS in `web/style.css`**

Append:

```css
.memory { padding: 0; height: 80vh; }
.mem { display: flex; height: 100%; }
.mem__list {
  flex-shrink: 0;
  width: 260px;
  overflow-y: auto;
  border-right: 1px solid #3a3f4a;
  padding: 10px 8px;
  background: #1b1e25;
}
.mem__grouphead {
  color: #8a8f97;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 12px 8px 4px;
}
.mem__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
}
.mem__item:hover { background: #262a33; }
.mem__item--active { background: #2f3340; }
.mem__name { color: #e8eaed; font-size: 13px; }
.mem__sub { color: #6c727b; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 232px; }
.mem__doc { flex: 1; min-width: 0; overflow-y: auto; padding: 22px 28px; }
.mem__doctitle { color: #aeb4bd; font-size: 12px; margin-bottom: 14px; font-family: ui-monospace, "Cascadia Code", monospace; }
.mem__hint, .mem__empty { color: #6c727b; font-size: 13px; padding: 24px 8px; }
.mem__docbody { color: #d7dade; font-size: 14px; line-height: 1.6; }
.mem__docbody h1, .mem__docbody h2, .mem__docbody h3 { color: #fff; line-height: 1.25; margin: 1.2em 0 0.5em; }
.mem__docbody h1 { font-size: 22px; }
.mem__docbody h2 { font-size: 18px; }
.mem__docbody h3 { font-size: 15px; }
.mem__docbody code { background: #23272f; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, monospace; }
.mem__docbody pre { background: #1b1e25; border: 1px solid #3a3f4a; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
.mem__docbody pre code { background: none; padding: 0; }
.mem__docbody a { color: #6ea8fe; }
.mem__docbody ul, .mem__docbody ol { padding-left: 22px; }
.mem__docbody blockquote { border-left: 3px solid #3a3f4a; margin: 0.6em 0; padding-left: 12px; color: #aeb4bd; }
.mem__docbody hr { border: 0; border-top: 1px solid #3a3f4a; margin: 1.2em 0; }
```

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all test files pass; no type errors.

- [ ] **Step 6: e2e — verify in the browser**

Start the server (`npm start`), open `http://localhost:4500`, click the **Memory** tab. Expected: left list grouped (Memória / Agentes / Skills / Instruções) with this project's `MEMORY.md`, `agency-hq-project.md`, `CLAUDE.md`; clicking one renders formatted markdown in the right pane. Capture a screenshot via the preview tool.

- [ ] **Step 7: Commit, merge to main, push**

```bash
git add web/src/main.js web/style.css
git commit -m "feat(m3): Memory tab — index fetch, click-to-view, prose CSS"
# merge via finishing-a-development-branch (ff to main), then:
gh auth switch -u kevinbyjordan-cell
git push origin main
```

Update `README.md` status line and `agency-hq-project.md` memory to mark **M3 ✅**, next **M4 Org chart**.

---

## Self-Review

**Spec coverage** (roadmap M3 = "navigate `.claude/agents/*.md`, `skills/*/SKILL.md`, `CLAUDE.md`, `memory/*.md`; read-only viewer"):
- agents → `memoryRoots` `agents` root ✅
- skills → `skills` root (user-authored `~/.claude/skills`) ✅ (bundled/plugin skills intentionally excluded as vendor code, noted)
- CLAUDE.md → `instructions` root (match `CLAUDE.md`) ✅
- memory/*.md → `memory` root over `~/.claude/projects` ✅
- read-only viewer → render only, no write endpoint ✅

**Placeholder scan:** every code step contains full code; commands have expected output. None found.

**Type consistency:** `MemoryFile`/`MemoryRoot` field names (`id`, `category`, `categoryLabel`, `name`, `relPath`, `absPath`, `mtimeMs`) are identical across `memory.ts`, the JSON `publicFile`, and the client (`renderMemory` reads `id`/`category`/`categoryLabel`/`name`/`relPath`). `memoryResponse` returns `{status, body}` matching the server wiring. Tab key `'memory'` and `data-tab`/`data-view="memory"` match.
