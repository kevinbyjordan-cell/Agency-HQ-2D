# Agency HQ — Fase 2 (O prédio inteiro, multi-sessão) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mostrar TODAS as sessões do Claude Code recentemente ativas ao mesmo tempo — uma sala por sessão num prédio (grid) — com status ativo/ocioso por sala, e câmera (pan/zoom) para navegar quando há muitas salas.

**Architecture:** O servidor passa a rastrear várias sessões em paralelo (um `FileTailer` + um `OfficeState` por arquivo de sessão ativo), reconciliando a cada evento/tick e transmitindo um `BuildingState` (lista de salas). O front-end renderiza o prédio (grid de salas reutilizando o render de sala da Fase 1) dentro de um contêiner de câmera que aplica `transform` (pan/zoom) preservado entre atualizações.

**Tech Stack:** Igual à Fase 1 (Node+TS via tsx, chokidar, ws, vitest+jsdom; front-end JS ESM). Reaproveita `parse`, `reducer`, `tail`, `activeSession`, `labels`, `toolActivity`.

**Mudança de contrato WebSocket:** as mensagens passam de `{type:'state', state}` para `{type:'building', building}`.

---

## File Structure

- Modify `server/src/types.ts` — adicionar `BuildingState`.
- Create `server/src/sessionLifecycle.ts` — `shouldTrack`, `roomStatus`, `shouldDrop` (puro).
- Rewrite `server/src/server.ts` — multi-sessão (Map + reconcile + broadcast building).
- Rewrite `web/src/render.js` — `renderRoom(state)` + `renderBuilding(building, root)` (substituem `render`).
- Create `web/src/camera.js` — `initCamera(viewport, content)`.
- Rewrite `web/src/ws.js` — contrato `building`.
- Rewrite `web/src/main.js` — scaffold viewport/camera/building + initCamera.
- Modify `web/style.css` — estilos do prédio/câmera.
- Rewrite `tests/render.test.js`; create `tests/sessionLifecycle.test.ts`, `tests/camera.test.js`.

---

### Task 1: BuildingState + sessionLifecycle (TDD)

**Files:** Modify `server/src/types.ts`; Create `server/src/sessionLifecycle.ts`, `tests/sessionLifecycle.test.ts`.

- [ ] **Step 1: Adicionar `BuildingState` em `server/src/types.ts`** (append ao final do arquivo existente)

```ts
export interface BuildingState {
  rooms: OfficeState[]
  updatedAt: string | null
}
```

- [ ] **Step 2: Escrever `tests/sessionLifecycle.test.ts` (falha)**

```ts
import { describe, it, expect } from 'vitest'
import { shouldTrack, roomStatus, shouldDrop, IDLE_AFTER_MS, DROP_AFTER_MS, TRACK_WINDOW_MS } from '../server/src/sessionLifecycle'

const now = 1_000_000_000_000

describe('shouldTrack', () => {
  it('rastreia arquivo com mtime dentro da janela', () => {
    expect(shouldTrack(now - 1000, now)).toBe(true)
    expect(shouldTrack(now - TRACK_WINDOW_MS - 1, now)).toBe(false)
  })
})
describe('roomStatus', () => {
  it('ativo se atividade recente, ocioso depois', () => {
    expect(roomStatus(now - 1000, now)).toBe('active')
    expect(roomStatus(now - IDLE_AFTER_MS - 1, now)).toBe('idle')
  })
})
describe('shouldDrop', () => {
  it('descarta após DROP_AFTER_MS sem atividade', () => {
    expect(shouldDrop(now - 1000, now)).toBe(false)
    expect(shouldDrop(now - DROP_AFTER_MS - 1, now)).toBe(true)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run tests/sessionLifecycle.test.ts` → FAIL (módulo não encontrado).

- [ ] **Step 4: Implementar `server/src/sessionLifecycle.ts`**

```ts
export const IDLE_AFTER_MS = 90_000
export const DROP_AFTER_MS = 20 * 60_000
export const TRACK_WINDOW_MS = 12 * 60_000

export function shouldTrack(mtimeMs: number, now: number): boolean {
  return now - mtimeMs <= TRACK_WINDOW_MS
}

export function roomStatus(lastActivityMs: number, now: number): 'active' | 'idle' {
  return now - lastActivityMs <= IDLE_AFTER_MS ? 'active' : 'idle'
}

export function shouldDrop(lastActivityMs: number, now: number): boolean {
  return now - lastActivityMs > DROP_AFTER_MS
}
```

- [ ] **Step 5: Rodar e ver passar** — `npx vitest run tests/sessionLifecycle.test.ts` → PASS. Depois `npx tsc --noEmit` → limpo.

- [ ] **Step 6: Commit**

```bash
git add server/src/types.ts server/src/sessionLifecycle.ts tests/sessionLifecycle.test.ts
git commit -m "feat: BuildingState + session lifecycle helpers"
```

---

### Task 2: Servidor multi-sessão (rewrite, verificação runtime pelo controlador)

**Files:** Rewrite `server/src/server.ts`.

- [ ] **Step 1: Substituir TODO o conteúdo de `server/src/server.ts` por:**

```ts
import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'
import chokidar from 'chokidar'
import { parseLine } from './parse'
import { reduce, initialState } from './reducer'
import { isSessionFile, type FileInfo } from './activeSession'
import { FileTailer } from './tail'
import { shouldTrack, roomStatus, shouldDrop } from './sessionLifecycle'
import type { OfficeState, BuildingState } from './types'

const PORT = Number(process.env.PORT ?? 4500)
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects')
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web')

interface Tracked {
  tailer: FileTailer
  state: OfficeState
  lastActivityMs: number
}

const sessions = new Map<string, Tracked>()
const clients = new Set<WebSocket>()

function buildingState(now: number): BuildingState {
  const rooms = [...sessions.values()]
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    .map((t) => ({ ...t.state, status: roomStatus(t.lastActivityMs, now) }))
  return { rooms, updatedAt: new Date(now).toISOString() }
}

function broadcast(now: number): void {
  const msg = JSON.stringify({ type: 'building', building: buildingState(now) })
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg)
}

async function listSessionFiles(): Promise<FileInfo[]> {
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
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith('.jsonl') && isSessionFile(p)) {
        try {
          const st = await fs.stat(p)
          out.push({ path: p, mtimeMs: st.mtimeMs })
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(PROJECTS_ROOT)
  return out
}

async function ingest(t: Tracked): Promise<boolean> {
  const lines = await t.tailer.readNewLines()
  if (lines.length === 0) return false
  for (const raw of lines) {
    const line = parseLine(raw)
    if (line) t.state = reduce(t.state, line)
  }
  return true
}

async function reconcile(now: number): Promise<void> {
  const files = await listSessionFiles()
  for (const f of files) {
    if (!shouldTrack(f.mtimeMs, now)) continue
    let t = sessions.get(f.path)
    if (!t) {
      t = { tailer: new FileTailer(f.path), state: initialState(), lastActivityMs: f.mtimeMs }
      sessions.set(f.path, t)
      await ingest(t) // replay inicial do arquivo inteiro
    } else if (await ingest(t)) {
      t.lastActivityMs = now
    }
  }
  for (const [p, t] of sessions) {
    if (shouldDrop(t.lastActivityMs, now)) sessions.delete(p)
  }
  broadcast(now)
}

let pending = false
function scheduleReconcile(): void {
  if (pending) return
  pending = true
  setTimeout(() => {
    pending = false
    reconcile(Date.now()).catch((e) => console.error('[hq] reconcile', e))
  }, 150)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0])
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

const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'building', building: buildingState(Date.now()) }))
  ws.on('close', () => clients.delete(ws))
})

async function main(): Promise<void> {
  await reconcile(Date.now())
  const watcher = chokidar.watch(PROJECTS_ROOT, { ignoreInitial: true, depth: 5 })
  watcher.on('all', scheduleReconcile)
  setInterval(() => reconcile(Date.now()).catch((e) => console.error('[hq] tick', e)), 3000)
  server.listen(PORT, () => console.log(`[hq] Agency HQ em http://localhost:${PORT}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Verificar compilação e suíte** — `npx tsc --noEmit` (limpo) e `npx vitest run` (a suíte ainda passa; nenhum teste novo aqui). Não tente subir o servidor — o controlador faz o smoke test de runtime.

- [ ] **Step 3: Commit**

```bash
git add server/src/server.ts
git commit -m "feat: multi-session server (building state over websocket)"
```

---

### Task 3: renderBuilding + renderRoom (TDD)

**Files:** Rewrite `web/src/render.js`; Rewrite `tests/render.test.js`.

- [ ] **Step 1: Reescrever `tests/render.test.js` (falha contra a nova API)**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderRoom, renderBuilding } from '../web/src/render.js'

function room(overrides = {}) {
  return {
    sessionId: 's1', project: 'Demo', cwd: 'C:/x/Demo', status: 'active', updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos começar', tool: 'Read' },
      { id: 'a1', type: 'copywriter', label: 'Copywriter', isVisitor: false, status: 'working', activity: 'Começando', speech: 'Escrevendo a copy', tool: null },
    ],
    ...overrides,
  }
}

describe('renderRoom', () => {
  it('cria uma .room com nome do projeto e um boneco por agente', () => {
    const el = renderRoom(room())
    expect(el.classList.contains('room')).toBe(true)
    expect(el.querySelector('.room__name').textContent).toBe('Demo')
    expect(el.querySelectorAll('.agent').length).toBe(2)
    expect(el.dataset.sessionId).toBe('s1')
  })
  it('marca room--idle quando ociosa', () => {
    expect(renderRoom(room({ status: 'idle' })).classList.contains('room--idle')).toBe(true)
  })
})

describe('renderBuilding', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="b"></div>'
    root = document.getElementById('b')
  })
  it('renderiza uma sala por sessão', () => {
    renderBuilding({ rooms: [room({ sessionId: 's1', project: 'A' }), room({ sessionId: 's2', project: 'B' })] }, root)
    expect(root.querySelectorAll('.room').length).toBe(2)
  })
  it('mostra estado vazio quando não há salas', () => {
    renderBuilding({ rooms: [] }, root)
    expect(root.querySelector('.building__empty')).not.toBeNull()
  })
  it('re-renderiza de forma idempotente', () => {
    const b = { rooms: [room()] }
    renderBuilding(b, root)
    renderBuilding(b, root)
    expect(root.querySelectorAll('.room').length).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/render.test.js` → FAIL (exports `renderRoom`/`renderBuilding` não existem).

- [ ] **Step 3: Reescrever `web/src/render.js`** (substituir TODO o conteúdo)

```js
const SVG_NS = 'http://www.w3.org/2000/svg'

const TYPE_COLORS = {
  orchestrator: '#6C5CE7',
  copywriter: '#E0A33E',
  'pesquisador-local': '#3F7CB8',
  'pesquisador-de-nicho': '#3F7CB8',
  'arquiteto-de-projeto': '#1D9E75',
  'auditor-seo': '#D85A30',
}

function bodyColor(agent) {
  if (agent.isVisitor) return '#5DCAA5'
  return TYPE_COLORS[agent.type] ?? '#7C8AA0'
}

function makeBody(agent) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'agent__svg')
  svg.setAttribute('viewBox', '0 0 48 64')
  svg.setAttribute('width', '48')
  svg.setAttribute('height', '64')
  svg.innerHTML =
    (agent.isVisitor ? '<circle cx="24" cy="52" r="16" fill="none" stroke="#E0A33E" stroke-width="2"/>' : '') +
    `<rect x="16" y="24" width="16" height="22" rx="8" fill="${bodyColor(agent)}"/>` +
    '<circle cx="24" cy="18" r="9" fill="#F1CBA1"/>' +
    '<circle cx="21" cy="18" r="1.4" fill="#3A2A1F"/><circle cx="27" cy="18" r="1.4" fill="#3A2A1F"/>'
  return svg
}

function renderAgent(agent) {
  const el = document.createElement('div')
  el.className = `agent agent--${agent.status}` + (agent.isVisitor ? ' agent--visitor' : '')
  el.dataset.agentId = agent.id
  el.dataset.type = agent.type

  if (agent.speech) {
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = agent.speech
    el.appendChild(bubble)
  }

  el.appendChild(makeBody(agent))

  const label = document.createElement('div')
  label.className = 'agent__label'
  label.textContent = agent.label
  el.appendChild(label)

  const act = document.createElement('div')
  act.className = 'agent__activity'
  act.textContent = agent.activity || (agent.status === 'idle' ? 'ocioso' : '')
  el.appendChild(act)

  return el
}

export function renderRoom(state) {
  const room = document.createElement('div')
  room.className = 'room' + (state.status === 'idle' ? ' room--idle' : '')
  room.dataset.sessionId = state.sessionId ?? ''

  const name = document.createElement('div')
  name.className = 'room__name'
  name.textContent = state.project || 'Sessão'
  room.appendChild(name)

  const floor = document.createElement('div')
  floor.className = 'floor'
  for (const agent of state.agents) floor.appendChild(renderAgent(agent))
  room.appendChild(floor)

  return room
}

export function renderBuilding(building, root) {
  root.innerHTML = ''
  const rooms = (building && building.rooms) || []
  if (rooms.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'building__empty'
    empty.textContent = 'Nenhuma sessão ativa agora.'
    root.appendChild(empty)
    return
  }
  for (const state of rooms) root.appendChild(renderRoom(state))
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/render.test.js` → PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/render.js tests/render.test.js
git commit -m "feat: renderBuilding + renderRoom (multi-room grid)"
```

---

### Task 4: Câmera pan/zoom (TDD)

**Files:** Create `web/src/camera.js`, `tests/camera.test.js`.

- [ ] **Step 1: Escrever `tests/camera.test.js` (falha)**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { initCamera } from '../web/src/camera.js'

describe('initCamera', () => {
  let vp, content
  beforeEach(() => {
    document.body.innerHTML = '<div id="vp"><div id="c"></div></div>'
    vp = document.getElementById('vp')
    content = document.getElementById('c')
  })

  it('wheel com deltaY negativo aumenta a escala', () => {
    initCamera(vp, content)
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(content.style.transform).toContain('scale(1.1')
  })

  it('arrastar move o conteúdo (translate muda)', () => {
    initCamera(vp, content)
    vp.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 20 }))
    expect(content.style.transform).toContain('translate(30px, 20px)')
    window.dispatchEvent(new MouseEvent('mouseup', {}))
  })

  it('reset volta a câmera ao estado inicial', () => {
    const cam = initCamera(vp, content)
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    cam.reset()
    expect(content.style.transform).toContain('scale(1)')
    expect(content.style.transform).toContain('translate(0px, 0px)')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/camera.test.js` → FAIL.

- [ ] **Step 3: Implementar `web/src/camera.js`**

```js
export function initCamera(viewport, content) {
  const cam = { x: 0, y: 0, scale: 1 }

  function apply() {
    content.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`
  }

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      cam.scale = Math.min(2, Math.max(0.3, cam.scale * factor))
      apply()
    },
    { passive: false }
  )

  let dragging = false
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0

  viewport.addEventListener('mousedown', (e) => {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    originX = cam.x
    originY = cam.y
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    cam.x = originX + (e.clientX - startX)
    cam.y = originY + (e.clientY - startY)
    apply()
  })
  window.addEventListener('mouseup', () => {
    dragging = false
  })

  apply()
  return {
    reset() {
      cam.x = 0
      cam.y = 0
      cam.scale = 1
      apply()
    },
  }
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/camera.test.js` → PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/camera.js tests/camera.test.js
git commit -m "feat: camera pan/zoom"
```

---

### Task 5: Shell (ws/main/css) + e2e

**Files:** Rewrite `web/src/ws.js`, `web/src/main.js`; Modify `web/style.css`.

- [ ] **Step 1: Reescrever `web/src/ws.js`** (contrato `building`)

```js
export function connect(onBuilding) {
  let ws
  function open() {
    ws = new WebSocket(`ws://${location.host}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'building') onBuilding(msg.building)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => setTimeout(open, 1000)
  }
  open()
}
```

- [ ] **Step 2: Reescrever `web/src/main.js`**

```js
import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { initCamera } from './camera.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="viewport"><div class="camera"><div class="building"></div></div></div>'

const viewport = stage.querySelector('.viewport')
const camera = stage.querySelector('.camera')
const building = stage.querySelector('.building')

initCamera(viewport, camera)
connect((b) => renderBuilding(b, building))
```

- [ ] **Step 3: Acrescentar ao final de `web/style.css`**

```css
#stage { max-width: none; }
.viewport {
  position: relative;
  width: 100%;
  height: 80vh;
  overflow: hidden;
  cursor: grab;
}
.viewport:active { cursor: grabbing; }
.camera { transform-origin: 0 0; will-change: transform; }
.building {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 8px;
  align-items: flex-start;
}
.building .room { width: 360px; }
.building__empty {
  color: var(--muted);
  font-size: 14px;
  padding: 48px 8px;
}
```

- [ ] **Step 4: Suíte completa** — `npx vitest run` → todos os arquivos verdes (labels, toolActivity, parse, activeSession, reducer, tail, sessionLifecycle, render, camera). Cole o resumo.

- [ ] **Step 5: Commit**

```bash
git add web/src/ws.js web/src/main.js web/style.css
git commit -m "feat: building shell (camera viewport + building grid)"
```

- [ ] **Step 6: e2e (controlador)** — o controlador sobe o servidor, confirma que `{type:'building'}` chega com `rooms[]` e que os assets servem, e tira um screenshot no navegador.

---

### Task 6: Docs + finalização

- [ ] **Step 1: Atualizar Status no `README.md`** para refletir a Fase 2 (prédio multi-sessão + câmera). Ajustar a linha de Fases marcando a 2 como feita.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: status fase 2 (prédio multi-sessão)"
```

- [ ] **Step 3:** Revisão final + merge `phase-2`→`main` + push (via finishing-a-development-branch).

---

## Self-Review

**Cobertura:** multi-sessão (Task 2 reconcile + Task 1 lifecycle), uma sala por sessão (Task 3 renderBuilding), ativo/ocioso por sala (Task 1 roomStatus aplicado no buildingState), câmera pan/zoom (Task 4 + Task 5 scaffold), contrato `building` ponta a ponta (Task 2 server + Task 5 ws/main). Estado vazio tratado (Task 3).

**Sem placeholders:** todo passo de código mostra o código completo; testes completos.

**Consistência de tipos/contrato:** `BuildingState { rooms: OfficeState[] }` (Task 1) é o que `buildingState()` produz (Task 2), o que `{type:'building', building}` carrega (Task 2), o que `ws.js` repassa via `onBuilding(msg.building)` (Task 5) e o que `renderBuilding(building, root)` consome lendo `building.rooms` (Task 3). `renderRoom(state)` consome um `OfficeState` (mesmos campos da Fase 1). `initCamera(viewport, content)` (Task 4) é chamado igual em `main.js` (Task 5). Câmera vive no `.camera` (pai), preservada porque `renderBuilding` só recria o conteúdo de `.building` (filho).

**Nota:** o `render` da Fase 1 é substituído por `renderRoom`/`renderBuilding`; `tests/render.test.js` é reescrito de acordo. `pickActiveSession` deixa de ser usado pelo servidor (continua exportado/testado para uso futuro).
