# Mission Control M1 — Office por projeto (prédio da agência) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes (`- [ ]`).

**Goal:** Transformar a aba Office num **prédio de agência** flat-vector: fosso d'água, **lobby central "Agency HQ"**, e **uma sala (departamento) por projeto** — mobiliada (mesa, planta), com luz de status e bonecos identificados. Sessão ativa acende a sala do seu projeto; ociosa apaga.

**Architecture:** O servidor passa a **agrupar por projeto** (uma sala por projeto, dirigida pela sessão mais recente daquele projeto) em vez de uma sala por sessão. O front-end desenha um prédio: `.water > .hq-floor` contendo departamentos (`.dept`) + um `.lobby` central, reusando `renderAgent` e a câmera (pan/zoom) da Fase 2.

**Tech Stack:** Igual (Node+TS via tsx, ws, chokidar, vitest+jsdom; front-end JS ESM). Contrato WebSocket `{type:'building', building:{rooms}}` inalterado — só muda como `rooms` é montado (por projeto) e como é renderizado.

---

### M1-1: Server agrupa salas por projeto (TDD)

**Files:** Create `server/src/projectRooms.ts`, `tests/projectRooms.test.ts`; Modify `server/src/server.ts`.

- [ ] **Step 1: Escrever `tests/projectRooms.test.ts` (falha)**

```ts
import { describe, it, expect } from 'vitest'
import { groupByProject } from '../server/src/projectRooms'
import { initialState } from '../server/src/reducer'

const now = 1_000_000_000_000
function snap(project: string, lastActivityMs: number, sessionId: string) {
  return { state: { ...initialState(), project, sessionId }, lastActivityMs }
}

describe('groupByProject', () => {
  it('uma sala por projeto, usando a sessão mais recente', () => {
    const rooms = groupByProject(
      [snap('Google Ads PRO', now - 50_000, 's1'), snap('Google Ads PRO', now - 1000, 's2'), snap('Venda Sites', now - 5000, 's3')],
      now
    )
    expect(rooms).toHaveLength(2)
    expect(rooms.find((r) => r.project === 'Google Ads PRO')?.sessionId).toBe('s2')
  })
  it('status ativo/ocioso conforme a atividade', () => {
    const rooms = groupByProject([snap('A', now - 1000, 'a'), snap('B', now - 200_000, 'b')], now)
    expect(rooms.find((r) => r.project === 'A')?.status).toBe('active')
    expect(rooms.find((r) => r.project === 'B')?.status).toBe('idle')
  })
  it('ordena por atividade mais recente primeiro', () => {
    const rooms = groupByProject([snap('Velho', now - 9000, 'a'), snap('Novo', now - 1000, 'b')], now)
    expect(rooms[0].project).toBe('Novo')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/projectRooms.test.ts` → FAIL.

- [ ] **Step 3: Implementar `server/src/projectRooms.ts`**

```ts
import type { OfficeState } from './types'
import { roomStatus } from './sessionLifecycle'

export interface SessionSnapshot {
  state: OfficeState
  lastActivityMs: number
}

// Uma sala por projeto: mantém a sessão mais recente de cada projeto e deriva
// o status (ativo/ocioso) da atividade dessa sessão.
export function groupByProject(sessions: SessionSnapshot[], now: number): OfficeState[] {
  const byProject = new Map<string, SessionSnapshot>()
  for (const s of sessions) {
    const key = s.state.project || s.state.cwd || s.state.sessionId || 'desconhecido'
    const cur = byProject.get(key)
    if (!cur || s.lastActivityMs > cur.lastActivityMs) byProject.set(key, s)
  }
  return [...byProject.values()]
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    .map((s) => ({ ...s.state, status: roomStatus(s.lastActivityMs, now) }))
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/projectRooms.test.ts` → PASS (3).

- [ ] **Step 5: Wire em `server/src/server.ts`** — substituir a função `buildingState` por:

```ts
function buildingState(now: number): BuildingState {
  const snaps = [...sessions.values()].map((t) => ({ state: t.state, lastActivityMs: t.lastActivityMs }))
  const rooms = groupByProject(snaps, now)
  return { rooms, updatedAt: new Date(now).toISOString() }
}
```
E ajustar os imports no topo: adicionar `import { groupByProject } from './projectRooms'`. Remover `roomStatus` do import de `./sessionLifecycle` se ficar sem uso (manter `shouldTrack`, `shouldDrop`). Rodar `npx tsc --noEmit` (limpo) e `npx vitest run` (tudo verde).

- [ ] **Step 6: Commit**

```bash
git add server/src/projectRooms.ts tests/projectRooms.test.ts server/src/server.ts
git commit -m "feat(mc): agrupar salas por projeto (uma sala por projeto)"
```

---

### M1-2: Render do prédio — lobby + departamentos mobiliados (TDD)

**Files:** Rewrite `web/src/render.js`; Rewrite `tests/render.test.js`.

- [ ] **Step 1: Reescrever `tests/render.test.js`**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderDept, renderBuilding } from '../web/src/render.js'

function room(overrides = {}) {
  return {
    sessionId: 's1', project: 'Demo', cwd: 'C:/x/Demo', status: 'active', updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos lá', tool: 'Read' },
    ],
    ...overrides,
  }
}

describe('renderDept', () => {
  it('cria um .dept mobiliado com placa, luz, mesa, planta e agentes', () => {
    const el = renderDept(room())
    expect(el.classList.contains('dept')).toBe(true)
    expect(el.querySelector('.dept__title').textContent).toBe('Demo')
    expect(el.querySelector('.dept__light--active')).not.toBeNull()
    expect(el.querySelector('.dept__desk')).not.toBeNull()
    expect(el.querySelector('.plant')).not.toBeNull()
    expect(el.querySelectorAll('.agent').length).toBe(1)
    expect(el.dataset.project).toBe('Demo')
  })
  it('ociosa: .dept--idle e luz idle', () => {
    const el = renderDept(room({ status: 'idle' }))
    expect(el.classList.contains('dept--idle')).toBe(true)
    expect(el.querySelector('.dept__light--idle')).not.toBeNull()
  })
})

describe('renderBuilding', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="b"></div>'
    root = document.getElementById('b')
  })
  it('monta água + piso com lobby central e um dept por sala', () => {
    renderBuilding({ rooms: [room({ project: 'A' }), room({ project: 'B' })] }, root)
    expect(root.querySelector('.water .hq-floor')).not.toBeNull()
    expect(root.querySelector('.lobby .lobby__sign').textContent).toBe('Agency HQ')
    expect(root.querySelectorAll('.dept').length).toBe(2)
  })
  it('estado vazio quando não há salas', () => {
    renderBuilding({ rooms: [] }, root)
    expect(root.querySelector('.building__empty')).not.toBeNull()
  })
  it('idempotente', () => {
    const b = { rooms: [room()] }
    renderBuilding(b, root)
    renderBuilding(b, root)
    expect(root.querySelectorAll('.dept').length).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/render.test.js` → FAIL.

- [ ] **Step 3: Reescrever `web/src/render.js`** (substituir TODO o arquivo)

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

export function renderDept(state) {
  const dept = document.createElement('div')
  dept.className = 'dept' + (state.status === 'idle' ? ' dept--idle' : '')
  dept.dataset.sessionId = state.sessionId ?? ''
  dept.dataset.project = state.project ?? ''

  const plate = document.createElement('div')
  plate.className = 'dept__plate'
  const light = document.createElement('span')
  light.className = 'dept__light dept__light--' + (state.status === 'idle' ? 'idle' : 'active')
  const title = document.createElement('span')
  title.className = 'dept__title'
  title.textContent = state.project || 'Sessão'
  plate.append(light, title)
  dept.appendChild(plate)

  const floor = document.createElement('div')
  floor.className = 'dept__floor'
  const plant = document.createElement('div')
  plant.className = 'plant'
  floor.appendChild(plant)
  for (const agent of state.agents) floor.appendChild(renderAgent(agent))
  const desk = document.createElement('div')
  desk.className = 'dept__desk'
  floor.appendChild(desk)
  dept.appendChild(floor)

  return dept
}

export function renderLobby() {
  const lobby = document.createElement('div')
  lobby.className = 'lobby'
  const sign = document.createElement('div')
  sign.className = 'lobby__sign'
  sign.textContent = 'Agency HQ'
  const reception = document.createElement('div')
  reception.className = 'lobby__reception'
  const p1 = document.createElement('div')
  p1.className = 'plant'
  const p2 = document.createElement('div')
  p2.className = 'plant'
  lobby.append(sign, reception, p1, p2)
  return lobby
}

export function renderBuilding(building, root) {
  root.innerHTML = ''
  const water = document.createElement('div')
  water.className = 'water'
  const floor = document.createElement('div')
  floor.className = 'hq-floor'

  const rooms = (building && building.rooms) || []
  if (rooms.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'building__empty'
    empty.textContent = 'Nenhuma sessão ativa agora.'
    floor.appendChild(empty)
  } else {
    const els = rooms.map(renderDept)
    els.splice(Math.floor(els.length / 2), 0, renderLobby()) // lobby no centro do grid
    for (const el of els) floor.appendChild(el)
  }

  water.appendChild(floor)
  root.appendChild(water)
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/render.test.js` → PASS (5).

- [ ] **Step 5: Commit**

```bash
git add web/src/render.js tests/render.test.js
git commit -m "feat(mc): prédio com lobby central e departamentos mobiliados"
```

---

### M1-3: CSS do prédio + e2e + merge

**Files:** Modify `web/style.css`.

- [ ] **Step 1: No `web/style.css`, REMOVER o bloco da Fase 2 que conflita** (as regras `.building`, `.building .room`, e a `.floor`/`.room`/`.room__name`/`.room--idle` antigas que não são mais usadas), mantendo `.agent*`, `.bubble`, `.viewport`, `.camera`. Em seguida ADICIONAR o bloco do prédio abaixo. (O objetivo final: `.viewport`/`.camera` continuam; o conteúdo agora é `.water > .hq-floor > (.dept | .lobby)`.)

```css
.water {
  display: inline-block;
  background: #8CC4DD;
  padding: 22px;
  border-radius: 16px;
}
.hq-floor {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-start;
  justify-content: center;
  max-width: 1040px;
  background: #CBB68F;
  border: 6px solid #A89677;
  border-radius: 12px;
  padding: 16px;
}
.dept {
  position: relative;
  width: 300px;
  background: #EFE7D2;
  border-radius: 8px;
  padding: 8px;
  transition: opacity 0.4s ease, background 0.4s ease;
}
.dept--idle { background: #D9D5CE; opacity: 0.6; }
.dept__plate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #1E222A;
  color: #e8eaed;
  font-size: 12px;
  padding: 4px 9px;
  border-radius: 5px;
}
.dept__light { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dept__light--active { background: #46c28e; }
.dept__light--idle { background: #7a7f87; }
.dept__floor {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  min-height: 140px;
  padding: 26px 10px 10px;
}
.dept__desk { width: 82%; height: 14px; background: #b9966b; border-radius: 5px; margin: 6px auto 0; flex-basis: 100%; }
.plant {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #5c9e54;
  box-shadow: inset 0 0 0 3px #8a5a3a;
}
.lobby {
  position: relative;
  width: 300px;
  background: #f4f0e6;
  border: 2px solid #c9b89a;
  border-radius: 8px;
  padding: 8px;
  min-height: 156px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.lobby .plant { position: static; }
.lobby__sign { background: #1e222a; color: #e8eaed; font-size: 13px; padding: 6px 14px; border-radius: 6px; }
.lobby__reception { width: 130px; height: 18px; background: #7a5c9e; border-radius: 9px; }
.building__empty { color: #6b6b6b; font-size: 14px; padding: 48px; }
```

(`web/src/main.js` permanece igual: `initCamera(viewport, camera)` + `connect((b) => renderBuilding(b, building))`. O `.building` agora contém `.water`.)

- [ ] **Step 2: Suíte completa** — `npx vitest run` → tudo verde (inclui projectRooms + render reescrito + camera + lifecycle + os testes do servidor/parser).

- [ ] **Step 3: Commit**

```bash
git add web/style.css
git commit -m "feat(mc): estilo do prédio (água, piso, departamentos, lobby)"
```

- [ ] **Step 4: e2e + merge (controlador)** — o controlador sobe o servidor, confirma `building` com salas por projeto, tira screenshot do prédio, atualiza README, e mescla `mc-office-building`→`main`.

---

## Self-Review

- **Cobertura:** sala=projeto (M1-1 groupByProject + wire), prédio com lobby central + departamentos mobiliados (M1-2 render + M1-3 css), água/piso/luzes/mesa/planta (M1-3). Câmera pan/zoom e `renderAgent`/balões reusados da Fase 2.
- **Contrato:** inalterado (`{type:'building', building:{rooms:OfficeState[]}}`); só muda a montagem (por projeto) e o render (prédio). `ws.js`/`main.js` seguem iguais.
- **Sem placeholders:** código completo em cada passo.
- **Conflitos CSS:** M1-3 remove as regras antigas de `.building/.room/.floor` da Fase 2 (substituídas por `.water/.hq-floor/.dept/.lobby`); `.agent*`/`.bubble`/`.viewport`/`.camera` permanecem.
- **Nota:** `renderRoom`/`renderBuilding(state)` da Fase 2 viram `renderDept`/`renderBuilding(building)`; `tests/render.test.js` reescrito de acordo.
