# Mission Control M2 — Shell + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes (`- [ ]`).

**Goal:** Transformar o app numa casca de **abas** (Office, Dashboard) e adicionar a aba **Dashboard** com métricas ao vivo: agentes ativos, sessões e **gasto de API em tempo real** (somando `usage` dos transcripts × preço por modelo).

**Architecture:** Um motor de custo puro (`pricing.ts`) precifica cada mensagem do modelo. O `reducer` acumula `costUsd` por sessão. O servidor agrega um `dashboard` (agentes ativos, sessões, custo total) e o envia junto do `building` na mesma mensagem WebSocket. O front-end ganha uma sidebar de abas; a aba Office mostra o prédio (M1), a aba Dashboard mostra cards de métricas.

**Tech Stack:** Igual (Node+TS via tsx, ws, chokidar, vitest+jsdom; front-end JS ESM).

**Mensagem WebSocket:** passa de `{type:'building', building}` para `{type:'building', building, dashboard}`.

---

### M2-1: Motor de custo (pricing, TDD)

**Files:** Create `server/src/pricing.ts`, `tests/pricing.test.ts`.

- [ ] **Step 1: Escrever `tests/pricing.test.ts` (falha)**

```ts
import { describe, it, expect } from 'vitest'
import { messageCostUsd } from '../server/src/pricing'

describe('messageCostUsd', () => {
  it('precifica input + output do Opus 4.8', () => {
    // 1M input ($5) + 1M output ($25) = $30
    const c = messageCostUsd('claude-opus-4-8', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    expect(c).toBeCloseTo(30, 5)
  })
  it('cache read = 0.1x input; cache write 5m = 1.25x; 1h = 2x (Opus 4.8)', () => {
    const c = messageCostUsd('claude-opus-4-8', {
      cache_read_input_tokens: 1_000_000, // 0.1 * 5 = 0.5
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 }, // 1.25*5 + 2*5 = 16.25
    })
    expect(c).toBeCloseTo(16.75, 5)
  })
  it('usa cache_creation_input_tokens (5m) quando não há breakdown', () => {
    const c = messageCostUsd('claude-opus-4-8', { cache_creation_input_tokens: 1_000_000 }) // 1.25*5 = 6.25
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
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/pricing.test.ts` → FAIL.

- [ ] **Step 3: Implementar `server/src/pricing.ts`**

```ts
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

// Custo em USD de uma única mensagem do modelo dado.
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
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/pricing.test.ts` → PASS. Depois `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add server/src/pricing.ts tests/pricing.test.ts
git commit -m "feat(mc): motor de custo de API (preços por modelo + cache)"
```

---

### M2-2: Custo no reducer + agregação do dashboard (TDD)

**Files:** Modify `server/src/parse.ts`, `server/src/types.ts`, `server/src/reducer.ts`, `server/src/server.ts`; Create `server/src/dashboard.ts`, `tests/dashboard.test.ts`; extend `tests/reducer.test.ts`.

- [ ] **Step 1: Estender `server/src/parse.ts`** — no tipo da mensagem, adicionar `model` e `usage` (importando `UsageTokens`):

No topo, adicionar: `import type { UsageTokens } from './pricing'`

Substituir o campo `message?` da interface `TranscriptLine` por:
```ts
  message?: {
    role?: string
    model?: string
    usage?: UsageTokens
    content?: ContentBlock[] | string
  }
```

- [ ] **Step 2: Estender `server/src/types.ts`** — adicionar `costUsd: number` ao fim da interface `OfficeState`:
```ts
  costUsd: number
```

- [ ] **Step 3: Atualizar `server/src/reducer.ts`** — acumular custo.
  - No topo: `import { messageCostUsd } from './pricing'`.
  - Em `initialState()`, adicionar `costUsd: 0,` ao objeto retornado.
  - Em `reduce`, dentro do ramo `if (line.type === 'assistant') {` (logo após `next.status = 'active'`), adicionar:
```ts
    if (line.message?.usage && line.message?.model) {
      next.costUsd += messageCostUsd(line.message.model, line.message.usage)
    }
```

- [ ] **Step 4: Adicionar caso de custo em `tests/reducer.test.ts`** (novo `it` dentro do `describe('reduce', ...)`):
```ts
  it('acumula custo de API a partir de usage + model', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        model: 'claude-opus-4-8',
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
        content: [{ type: 'text', text: 'oi' }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.costUsd).toBeCloseTo(30, 5)
  })
```
Também ajustar quaisquer asserções existentes que comparem o estado inteiro (não há — os testes checam campos específicos). Rode `npx vitest run tests/reducer.test.ts` → PASS.

- [ ] **Step 5: Escrever `tests/dashboard.test.ts` (falha)**

```ts
import { describe, it, expect } from 'vitest'
import { dashboardSummary } from '../server/src/dashboard'
import { initialState } from '../server/src/reducer'

function room(over = {}) {
  return { ...initialState(), status: 'active', ...over }
}

describe('dashboardSummary', () => {
  it('conta sessões, agentes ativos e soma custo', () => {
    const rooms = [
      room({ project: 'A', costUsd: 1.5, agents: [{ id: 'o', type: 'orchestrator', label: 'O', isVisitor: false, status: 'working', activity: '', speech: '', tool: null }] }),
      room({ project: 'B', costUsd: 2.25, status: 'idle', agents: [{ id: 'o2', type: 'orchestrator', label: 'O', isVisitor: false, status: 'working', activity: '', speech: '', tool: null }] }),
    ]
    const d = dashboardSummary(rooms, '2026-06-18T00:00:00Z')
    expect(d.sessions).toBe(2)
    expect(d.costUsd).toBeCloseTo(3.75, 5)
    // só conta agentes 'working' em salas ATIVAS → 1 (a sala B é idle)
    expect(d.agentsActive).toBe(1)
  })
})
```

- [ ] **Step 6: Implementar `server/src/dashboard.ts`**

```ts
import type { OfficeState } from './types'

export interface DashboardSummary {
  agentsActive: number
  sessions: number
  costUsd: number
  updatedAt: string | null
}

export function dashboardSummary(rooms: OfficeState[], updatedAt: string | null): DashboardSummary {
  let agentsActive = 0
  let costUsd = 0
  for (const r of rooms) {
    costUsd += r.costUsd ?? 0
    if (r.status === 'active') {
      for (const a of r.agents) if (a.status === 'working') agentsActive++
    }
  }
  return { agentsActive, sessions: rooms.length, costUsd, updatedAt }
}
```

- [ ] **Step 7: Rodar e ver passar** — `npx vitest run tests/dashboard.test.ts` → PASS.

- [ ] **Step 8: Incluir o dashboard no broadcast do `server/src/server.ts`.**
  - No topo: `import { dashboardSummary } from './dashboard'`.
  - Substituir `buildingState` + `broadcast` + o `ws.send` da conexão por um único `snapshot`:
```ts
function snapshot(now: number): string {
  const snaps = [...sessions.values()].map((t) => ({ state: t.state, lastActivityMs: t.lastActivityMs }))
  const rooms = groupByProject(snaps, now)
  const iso = new Date(now).toISOString()
  return JSON.stringify({
    type: 'building',
    building: { rooms, updatedAt: iso },
    dashboard: dashboardSummary(rooms, iso),
  })
}

function broadcast(now: number): void {
  const msg = snapshot(now)
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg)
}
```
  - Em `wss.on('connection', ...)`, trocar o `ws.send(...)` por: `ws.send(snapshot(Date.now()))`.
  - Remover a função `buildingState` antiga e o import de `BuildingState` se ficar sem uso (mantenha o import de `OfficeState`).

- [ ] **Step 9: Verificar** — `npx tsc --noEmit` limpo; `npx vitest run` tudo verde. Não suba o servidor (controlador faz o smoke).

- [ ] **Step 10: Commit**

```bash
git add server/src/parse.ts server/src/types.ts server/src/reducer.ts server/src/dashboard.ts server/src/server.ts tests/reducer.test.ts tests/dashboard.test.ts
git commit -m "feat(mc): custo por sessão no reducer + agregação do dashboard"
```

---

### M2-3: Shell de abas + view Dashboard (TDD onde dá) + e2e

**Files:** Create `web/src/dashboard.js`, `tests/dashboard-view.test.js`; Rewrite `web/src/ws.js`, `web/src/main.js`; Modify `web/style.css`.

- [ ] **Step 1: Escrever `tests/dashboard-view.test.js` (falha)**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderDashboard } from '../web/src/dashboard.js'

describe('renderDashboard', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="d"></div>'
    root = document.getElementById('d')
  })
  it('mostra cards de agentes, sessões e gasto formatado', () => {
    renderDashboard({ agentsActive: 3, sessions: 2, costUsd: 4.2 }, root)
    const cards = root.querySelectorAll('.dcard')
    expect(cards.length).toBe(3)
    expect(root.textContent).toContain('3')
    expect(root.textContent).toContain('$4.20')
  })
  it('tolera dashboard nulo', () => {
    renderDashboard(null, root)
    expect(root.querySelectorAll('.dcard').length).toBe(3)
    expect(root.textContent).toContain('$0.00')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/dashboard-view.test.js` → FAIL.

- [ ] **Step 3: Implementar `web/src/dashboard.js`**

```js
function card(label, value) {
  const el = document.createElement('div')
  el.className = 'dcard'
  const l = document.createElement('div')
  l.className = 'dcard__label'
  l.textContent = label
  const v = document.createElement('div')
  v.className = 'dcard__value'
  v.textContent = value
  el.append(l, v)
  return el
}

export function renderDashboard(dashboard, root) {
  root.innerHTML = ''
  const d = dashboard || { agentsActive: 0, sessions: 0, costUsd: 0 }
  const grid = document.createElement('div')
  grid.className = 'dgrid'
  grid.appendChild(card('Agentes ativos', String(d.agentsActive ?? 0)))
  grid.appendChild(card('Sessões', String(d.sessions ?? 0)))
  grid.appendChild(card('Gasto de API', '$' + Number(d.costUsd ?? 0).toFixed(2)))
  root.appendChild(grid)
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/dashboard-view.test.js` → PASS.

- [ ] **Step 5: Reescrever `web/src/ws.js`** (passa a mensagem inteira)

```js
export function connect(onUpdate) {
  let ws
  function open() {
    ws = new WebSocket(`ws://${location.host}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'building') onUpdate(msg)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => setTimeout(open, 1000)
  }
  open()
}
```

- [ ] **Step 6: Reescrever `web/src/main.js`** (shell de abas)

```js
import { connect } from './ws.js'
import { renderBuilding } from './render.js'
import { renderDashboard } from './dashboard.js'
import { initCamera } from './camera.js'

const stage = document.getElementById('stage')
stage.innerHTML =
  '<div class="mc">' +
  '<aside class="mc__nav">' +
  '<div class="mc__brand">Agency HQ</div>' +
  '<button class="mc__tab mc__tab--active" data-tab="office">Office</button>' +
  '<button class="mc__tab" data-tab="dashboard">Dashboard</button>' +
  '</aside>' +
  '<main class="mc__content">' +
  '<section class="mc__view" data-view="office"><div class="viewport"><div class="camera"><div class="building"></div></div></div></section>' +
  '<section class="mc__view mc__view--hidden" data-view="dashboard"><div class="dashboard"></div></section>' +
  '</main>' +
  '</div>'

const buildingEl = stage.querySelector('.building')
const dashboardEl = stage.querySelector('.dashboard')
const viewport = stage.querySelector('.viewport')
const camera = stage.querySelector('.camera')
initCamera(viewport, camera)

let latest = { building: { rooms: [] }, dashboard: null }
let tab = 'office'

function renderActive() {
  if (tab === 'office') renderBuilding(latest.building, buildingEl)
  else renderDashboard(latest.dashboard, dashboardEl)
}

for (const btn of stage.querySelectorAll('.mc__tab')) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab
    for (const b of stage.querySelectorAll('.mc__tab')) b.classList.toggle('mc__tab--active', b === btn)
    for (const v of stage.querySelectorAll('.mc__view')) v.classList.toggle('mc__view--hidden', v.dataset.view !== tab)
    renderActive()
  })
}

connect((msg) => {
  latest = msg
  renderActive()
})
```

- [ ] **Step 7: Acrescentar ao final de `web/style.css`**

```css
.mc { display: flex; gap: 0; align-items: stretch; }
.mc__nav {
  flex-shrink: 0;
  width: 150px;
  background: #1e222a;
  border-radius: 12px 0 0 12px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mc__brand { color: #e8eaed; font-size: 14px; font-weight: 500; padding: 4px 8px 12px; }
.mc__tab {
  text-align: left;
  background: transparent;
  border: 0;
  color: #aeb4bd;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.mc__tab:hover { background: #2a2e37; }
.mc__tab--active { background: #2f3340; color: #fff; }
.mc__content { flex: 1; min-width: 0; }
.mc__view--hidden { display: none; }
.dashboard { padding: 20px; }
.dgrid { display: flex; flex-wrap: wrap; gap: 14px; }
.dcard {
  background: #23272f;
  border: 1px solid #3a3f4a;
  border-radius: 12px;
  padding: 16px 20px;
  min-width: 150px;
}
.dcard__label { color: #aeb4bd; font-size: 13px; }
.dcard__value { color: #fff; font-size: 28px; font-weight: 500; margin-top: 4px; }
```

- [ ] **Step 8: Suíte completa** — `npx vitest run` → tudo verde (pricing, dashboard, dashboard-view, reducer estendido, render, camera, etc.).

- [ ] **Step 9: Commit**

```bash
git add web/src/dashboard.js tests/dashboard-view.test.js web/src/ws.js web/src/main.js web/style.css
git commit -m "feat(mc): shell de abas + view Dashboard (gasto de API ao vivo)"
```

- [ ] **Step 10: e2e + merge (controlador)** — sobe o servidor, confirma `dashboard` no payload, screenshot das duas abas, README, merge na main.

---

## Self-Review

- **Cobertura:** custo por mensagem (M2-1 pricing), acúmulo por sessão (M2-2 reducer), agregação (M2-2 dashboard) ponta a ponta no broadcast (M2-2 server), abas + view de métricas com gasto ao vivo (M2-3).
- **Contrato:** `{type:'building', building, dashboard}` — `dashboard` = `{agentsActive, sessions, costUsd, updatedAt}`; `ws.js` repassa a msg inteira; `main.js` guarda `latest` e renderiza a aba ativa; `renderDashboard` lê `dashboard`. `renderBuilding` (M1) inalterado.
- **Sem placeholders:** código completo em cada passo.
- **Preços:** tabela em `pricing.ts` com fonte e data; fácil de atualizar. Cache precificado por breakdown 5m/1h quando presente.
- **Nota:** `agentsActive` conta só agentes `working` em salas `active` (evita inflar com salas ociosas). Custo é sobre as sessões rastreadas (janela ativa + replay do arquivo), rotulado "Gasto de API" — não promete "hoje" exato.
