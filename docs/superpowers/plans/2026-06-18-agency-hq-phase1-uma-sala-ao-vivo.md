# Agency HQ — Fase 1 (Uma sala, ao vivo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um servidor local que faz tail do transcript da sessão ativa do Claude Code, traduz cada linha em estado de "escritório" e transmite por WebSocket para uma página que renderiza UMA sala com o orquestrador + subagentes falando e trabalhando, ao vivo.

**Architecture:** Funções puras testáveis (parse → reducer) no centro; cascas de I/O finas em volta (tail por offset, watcher chokidar, WebSocket, servidor estático). O servidor mantém o estado autoritativo e faz broadcast do estado completo a cada mudança (estado pequeno; sem deltas na Fase 1). O front-end (ESM puro, sem bundler) recebe o estado e re-renderiza a sala em DOM/SVG.

**Tech Stack:** Node 20+ / TypeScript (via `tsx`, sem build), `chokidar` (watch), `ws` (WebSocket), `vitest` + `jsdom` (testes). Front-end em JavaScript ES modules nativos servidos pelo próprio servidor.

---

## File Structure

Servidor (TypeScript, `server/src/`):
- `types.ts` — tipos de domínio (`Agent`, `OfficeState`).
- `constants.ts` — `KNOWN_AGENTS`, `ORCHESTRATOR_ID`.
- `labels.ts` — `labelForAgentType` (tipo → nome amigável PT).
- `toolActivity.ts` — `toolActivity` (nome da tool → frase de atividade PT).
- `parse.ts` — `parseLine` + tipos `TranscriptLine`/`ContentBlock`.
- `activeSession.ts` — `isSessionFile`, `pickActiveSession`.
- `reducer.ts` — `initialState`, `projectName`, `reduce` (coração: linha → estado).
- `tail.ts` — `FileTailer` (lê bytes novos por offset, bufferiza linha parcial).
- `server.ts` — wiring: scan + chokidar + tail + reduce + ws + estático.

Front-end (`web/`):
- `index.html` — casca + `<div id="stage">`.
- `style.css` — tela escura estilo "game screen", sala, bonecos, balões.
- `src/ws.js` — conecta no WebSocket, auto-reconnect, chama callback com estado.
- `src/render.js` — `render(state, root)`: desenha a sala/bonecos/balões.
- `src/main.js` — fia `ws` → `render`.

Testes (`tests/`): um arquivo por módulo puro + `render.test.js` (jsdom).

Raiz: `package.json`, `tsconfig.json`, `vitest.config.ts` (`.gitignore` já existe).

---

### Task 0: Scaffold e tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create dirs: `server/src/`, `web/src/`, `tests/`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "agency-hq",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch server/src/server.ts",
    "start": "tsx server/src/server.ts",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "@types/ws": "^8.5.12",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["server/src", "tests"]
}
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,js}'],
  },
})
```

- [ ] **Step 4: Instalar dependências e criar pastas**

Run:
```bash
cd "C:/Users/kevin/Desktop/AGENCIA/VENDA SITES/agency-hq"
mkdir -p server/src web/src tests
npm install
npm test
```
Expected: `npm install` conclui; `npm test` imprime "No test files found" e sai com código 0 (graças a `--passWithNoTests`).

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: scaffold agency-hq (ts + tsx + vitest)"
```

---

### Task 1: Tipos de domínio e constantes

**Files:**
- Create: `server/src/types.ts`, `server/src/constants.ts`

- [ ] **Step 1: Criar `server/src/types.ts`**

```ts
export type AgentStatus = 'working' | 'idle' | 'done'

export interface Agent {
  id: string
  type: string
  label: string
  isVisitor: boolean
  status: AgentStatus
  activity: string
  speech: string
  tool: string | null
}

export interface OfficeState {
  sessionId: string | null
  project: string
  cwd: string
  status: 'active' | 'idle'
  agents: Agent[]
  updatedAt: string | null
}
```

- [ ] **Step 2: Criar `server/src/constants.ts`**

```ts
export const ORCHESTRATOR_ID = 'orchestrator'

export const KNOWN_AGENTS = new Set<string>([
  'arquiteto-de-projeto',
  'auditor-seo',
  'copywriter',
  'pesquisador-de-nicho',
  'pesquisador-local',
])
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts server/src/constants.ts
git commit -m "feat: domain types and constants"
```

---

### Task 2: labelForAgentType (TDD)

**Files:**
- Create: `server/src/labels.ts`
- Test: `tests/labels.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { labelForAgentType } from '../server/src/labels'

describe('labelForAgentType', () => {
  it('mapeia tipos conhecidos para nomes amigáveis', () => {
    expect(labelForAgentType('orchestrator')).toBe('Orquestrador')
    expect(labelForAgentType('copywriter')).toBe('Copywriter')
    expect(labelForAgentType('pesquisador-local')).toBe('Pesquisador local')
  })
  it('faz fallback para o próprio tipo quando desconhecido', () => {
    expect(labelForAgentType('algo-novo')).toBe('algo-novo')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/labels.test.ts`
Expected: FAIL (Cannot find module '../server/src/labels').

- [ ] **Step 3: Implementar `server/src/labels.ts`**

```ts
const LABELS: Record<string, string> = {
  orchestrator: 'Orquestrador',
  'arquiteto-de-projeto': 'Arquiteto',
  'auditor-seo': 'Auditor SEO',
  copywriter: 'Copywriter',
  'pesquisador-de-nicho': 'Pesquisador de nicho',
  'pesquisador-local': 'Pesquisador local',
  Explore: 'Explorador',
  'general-purpose': 'Generalista',
  Plan: 'Planejador',
}

export function labelForAgentType(type: string): string {
  return LABELS[type] ?? type
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/labels.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/labels.ts tests/labels.test.ts
git commit -m "feat: labelForAgentType"
```

---

### Task 3: toolActivity (TDD)

**Files:**
- Create: `server/src/toolActivity.ts`
- Test: `tests/toolActivity.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { toolActivity } from '../server/src/toolActivity'

describe('toolActivity', () => {
  it('mapeia tools conhecidas para frases em PT', () => {
    expect(toolActivity('Read')).toBe('Lendo arquivos')
    expect(toolActivity('Bash')).toBe('Rodando comando')
    expect(toolActivity('WebSearch')).toBe('Pesquisando na web')
  })
  it('faz fallback para "Usando <tool>"', () => {
    expect(toolActivity('FooBar')).toBe('Usando FooBar')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/toolActivity.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `server/src/toolActivity.ts`**

```ts
const ACTIVITY: Record<string, string> = {
  Read: 'Lendo arquivos',
  Grep: 'Buscando no código',
  Glob: 'Procurando arquivos',
  Bash: 'Rodando comando',
  PowerShell: 'Rodando comando',
  Write: 'Escrevendo arquivo',
  Edit: 'Editando arquivo',
  WebSearch: 'Pesquisando na web',
  WebFetch: 'Lendo uma página',
  Skill: 'Usando uma skill',
  Task: 'Delegando a um agente',
  Agent: 'Delegando a um agente',
  AskUserQuestion: 'Perguntando a você',
}

export function toolActivity(tool: string): string {
  return ACTIVITY[tool] ?? `Usando ${tool}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/toolActivity.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/toolActivity.ts tests/toolActivity.test.ts
git commit -m "feat: toolActivity mapping"
```

---

### Task 4: parseLine (TDD)

**Files:**
- Create: `server/src/parse.ts`
- Test: `tests/parse.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { parseLine } from '../server/src/parse'

describe('parseLine', () => {
  it('parseia uma linha JSON válida com type', () => {
    const line = parseLine('{"type":"assistant","timestamp":"2026-06-18T00:00:00Z"}')
    expect(line?.type).toBe('assistant')
  })
  it('retorna null para linha vazia ou só espaços', () => {
    expect(parseLine('')).toBeNull()
    expect(parseLine('   ')).toBeNull()
  })
  it('retorna null para JSON inválido', () => {
    expect(parseLine('{nao eh json')).toBeNull()
  })
  it('retorna null quando falta o campo type', () => {
    expect(parseLine('{"foo":1}')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `server/src/parse.ts`**

```ts
export interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  is_error?: boolean
}

export interface TranscriptLine {
  type: string
  timestamp?: string
  cwd?: string
  sessionId?: string
  isSidechain?: boolean
  message?: {
    role?: string
    content?: ContentBlock[] | string
  }
}

export function parseLine(raw: string): TranscriptLine | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed)
    if (obj && typeof obj === 'object' && typeof obj.type === 'string') {
      return obj as TranscriptLine
    }
    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/parse.ts tests/parse.test.ts
git commit -m "feat: parseLine for transcript JSONL"
```

---

### Task 5: activeSession — isSessionFile + pickActiveSession (TDD)

**Files:**
- Create: `server/src/activeSession.ts`
- Test: `tests/activeSession.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { isSessionFile, pickActiveSession } from '../server/src/activeSession'

describe('isSessionFile', () => {
  it('aceita .jsonl de sessão no diretório do projeto', () => {
    expect(isSessionFile('C:/x/projects/proj/abc.jsonl')).toBe(true)
  })
  it('rejeita arquivos dentro de subagents/', () => {
    expect(isSessionFile('C:/x/projects/proj/abc/subagents/agent-1.jsonl')).toBe(false)
    expect(isSessionFile('C:\\x\\projects\\proj\\abc\\subagents\\agent-1.jsonl')).toBe(false)
  })
  it('rejeita não-jsonl', () => {
    expect(isSessionFile('C:/x/projects/proj/abc.json')).toBe(false)
  })
})

describe('pickActiveSession', () => {
  it('escolhe o arquivo de sessão com mtime mais recente', () => {
    const files = [
      { path: 'C:/p/a.jsonl', mtimeMs: 100 },
      { path: 'C:/p/b.jsonl', mtimeMs: 300 },
      { path: 'C:/p/x/subagents/agent.jsonl', mtimeMs: 999 },
    ]
    expect(pickActiveSession(files)).toBe('C:/p/b.jsonl')
  })
  it('retorna null quando não há sessões', () => {
    expect(pickActiveSession([])).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/activeSession.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `server/src/activeSession.ts`**

```ts
export interface FileInfo {
  path: string
  mtimeMs: number
}

export function isSessionFile(p: string): boolean {
  if (!p.endsWith('.jsonl')) return false
  const norm = p.replace(/\\/g, '/')
  if (norm.includes('/subagents/')) return false
  return true
}

export function pickActiveSession(files: FileInfo[]): string | null {
  const sessions = files.filter((f) => isSessionFile(f.path))
  if (sessions.length === 0) return null
  return sessions.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a)).path
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/activeSession.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/activeSession.ts tests/activeSession.test.ts
git commit -m "feat: active session selection"
```

---

### Task 6: reducer — initialState, projectName, reduce (TDD)

Constrói o coração: aplica uma `TranscriptLine` ao `OfficeState`. Cobre os três comportamentos (texto do assistente, tool_use de tool comum, spawn de `Agent`, e `tool_result` finalizando subagente) em um único módulo coeso, com vários casos de teste.

**Files:**
- Create: `server/src/reducer.ts`
- Test: `tests/reducer.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, it, expect } from 'vitest'
import { initialState, projectName, reduce } from '../server/src/reducer'
import type { TranscriptLine } from '../server/src/parse'

const ts = '2026-06-18T12:00:00Z'

describe('projectName', () => {
  it('extrai o basename de um caminho Windows', () => {
    expect(projectName('C:\\Users\\k\\Desktop\\GOOGLE ADS PRO')).toBe('GOOGLE ADS PRO')
  })
  it('extrai o basename de um caminho POSIX com barra final', () => {
    expect(projectName('/home/k/projects/site-ypw/')).toBe('site-ypw')
  })
})

describe('initialState', () => {
  it('começa com o orquestrador ocioso e sessão idle', () => {
    const s = initialState()
    expect(s.status).toBe('idle')
    expect(s.agents).toHaveLength(1)
    expect(s.agents[0].id).toBe('orchestrator')
    expect(s.agents[0].label).toBe('Orquestrador')
  })
})

describe('reduce', () => {
  it('define projeto/cwd a partir da primeira linha com cwd', () => {
    const line: TranscriptLine = { type: 'system', cwd: 'C:/x/MEU PROJETO', timestamp: ts }
    const s = reduce(initialState(), line)
    expect(s.project).toBe('MEU PROJETO')
    expect(s.cwd).toBe('C:/x/MEU PROJETO')
  })

  it('texto do assistente vira fala do orquestrador e ativa a sessão', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Vamos começar o trabalho' }] },
    }
    const s = reduce(initialState(), line)
    expect(s.status).toBe('active')
    expect(s.agents[0].speech).toBe('Vamos começar o trabalho')
    expect(s.agents[0].status).toBe('working')
  })

  it('tool_use comum define a atividade do orquestrador', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
    }
    const s = reduce(initialState(), line)
    expect(s.agents[0].tool).toBe('Read')
    expect(s.agents[0].activity).toBe('Lendo arquivos')
  })

  it('spawn de Agent adiciona um subagente trabalhando', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use', id: 'tool-abc', name: 'Agent',
          input: { subagent_type: 'copywriter', description: 'Escrever a home', prompt: 'Escreva...' },
        }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.agents).toHaveLength(2)
    const sub = s.agents[1]
    expect(sub.id).toBe('tool-abc')
    expect(sub.type).toBe('copywriter')
    expect(sub.label).toBe('Copywriter')
    expect(sub.isVisitor).toBe(false)
    expect(sub.status).toBe('working')
    expect(sub.speech).toBe('Escrever a home')
  })

  it('marca subagente desconhecido como visitante', () => {
    const line: TranscriptLine = {
      type: 'assistant',
      timestamp: ts,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool-x', name: 'Agent', input: { subagent_type: 'Explore', description: 'Mapear repo' } }],
      },
    }
    const s = reduce(initialState(), line)
    expect(s.agents[1].isVisitor).toBe(true)
  })

  it('tool_result do subagente o marca como done', () => {
    let s = initialState()
    s = reduce(s, {
      type: 'assistant', timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-abc', name: 'Agent', input: { subagent_type: 'copywriter', description: 'x' } }] },
    })
    s = reduce(s, {
      type: 'user', timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-abc', is_error: false }] },
    })
    const sub = s.agents.find((a) => a.id === 'tool-abc')!
    expect(sub.status).toBe('done')
    expect(sub.activity).toBe('Entregou')
  })

  it('tool_result do orquestrador limpa a tool sem virar done', () => {
    let s = initialState()
    s = reduce(s, {
      type: 'assistant', timestamp: ts,
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
    })
    s = reduce(s, {
      type: 'user', timestamp: ts,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1' }] },
    })
    expect(s.agents[0].tool).toBeNull()
  })

  it('não muta o estado anterior (imutabilidade)', () => {
    const prev = initialState()
    const after = reduce(prev, { type: 'assistant', timestamp: ts, message: { content: [{ type: 'text', text: 'oi' }] } })
    expect(prev.agents[0].speech).toBe('')
    expect(after).not.toBe(prev)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/reducer.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `server/src/reducer.ts`**

```ts
import type { Agent, OfficeState } from './types'
import type { TranscriptLine, ContentBlock } from './parse'
import { KNOWN_AGENTS, ORCHESTRATOR_ID } from './constants'
import { labelForAgentType } from './labels'
import { toolActivity } from './toolActivity'

function makeOrchestrator(): Agent {
  return {
    id: ORCHESTRATOR_ID,
    type: 'orchestrator',
    label: labelForAgentType('orchestrator'),
    isVisitor: false,
    status: 'idle',
    activity: '',
    speech: '',
    tool: null,
  }
}

export function initialState(): OfficeState {
  return {
    sessionId: null,
    project: '',
    cwd: '',
    status: 'idle',
    agents: [makeOrchestrator()],
    updatedAt: null,
  }
}

export function projectName(cwd: string): string {
  const norm = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : cwd
}

function firstLine(s: string, max = 140): string {
  const line = (s ?? '').split('\n').find((l) => l.trim().length > 0) ?? ''
  const t = line.trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

export function reduce(state: OfficeState, line: TranscriptLine): OfficeState {
  const next: OfficeState = { ...state, agents: state.agents.map((a) => ({ ...a })) }
  const orch = next.agents.find((a) => a.id === ORCHESTRATOR_ID)!

  if (line.cwd && !next.cwd) {
    next.cwd = line.cwd
    next.project = projectName(line.cwd)
  }
  if (line.sessionId) next.sessionId = line.sessionId

  const content = Array.isArray(line.message?.content) ? (line.message!.content as ContentBlock[]) : []

  if (line.type === 'assistant') {
    next.status = 'active'
    orch.status = 'working'
    for (const b of content) {
      if (b.type === 'text' && b.text && b.text.trim()) {
        orch.speech = firstLine(b.text)
      } else if (b.type === 'tool_use') {
        if (b.name === 'Agent' || b.name === 'Task') {
          const type = (b.input?.subagent_type as string) ?? 'unknown'
          const desc = ((b.input?.description as string) ?? (b.input?.prompt as string) ?? '') as string
          const id = b.id ?? `agent-${next.agents.length}`
          const agent: Agent = {
            id,
            type,
            label: labelForAgentType(type),
            isVisitor: !KNOWN_AGENTS.has(type),
            status: 'working',
            activity: 'Começando',
            speech: firstLine(desc),
            tool: null,
          }
          const existing = next.agents.find((a) => a.id === id)
          if (existing) Object.assign(existing, agent)
          else next.agents.push(agent)
        } else {
          orch.tool = b.name ?? null
          orch.activity = toolActivity(b.name ?? '')
        }
      }
    }
  } else if (line.type === 'user') {
    for (const b of content) {
      if (b.type === 'tool_result') {
        const target = next.agents.find((a) => a.id === b.tool_use_id)
        if (target && target.id !== ORCHESTRATOR_ID) {
          target.status = 'done'
          target.tool = null
          target.activity = b.is_error ? 'Erro' : 'Entregou'
        } else {
          orch.tool = null
          orch.activity = ''
        }
      }
    }
  }

  if (line.timestamp) next.updatedAt = line.timestamp
  return next
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/reducer.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add server/src/reducer.ts tests/reducer.test.ts
git commit -m "feat: office state reducer"
```

---

### Task 7: FileTailer (TDD)

**Files:**
- Create: `server/src/tail.ts`
- Test: `tests/tail.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FileTailer } from '../server/src/tail'

async function tmpFile(): Promise<string> {
  const p = path.join(os.tmpdir(), `tail-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`)
  await fs.writeFile(p, '')
  return p
}

describe('FileTailer', () => {
  it('retorna linhas completas novas e bufferiza parciais', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'a\nb\n')
    expect(await t.readNewLines()).toEqual(['a', 'b'])
    expect(await t.readNewLines()).toEqual([])
    await fs.appendFile(p, 'par')
    expect(await t.readNewLines()).toEqual([]) // parcial fica no buffer
    await fs.appendFile(p, 'tial\n')
    expect(await t.readNewLines()).toEqual(['partial'])
  })

  it('reseta quando o arquivo encolhe (truncamento)', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'xxxx\n')
    expect(await t.readNewLines()).toEqual(['xxxx'])
    await fs.writeFile(p, 'y\n')
    expect(await t.readNewLines()).toEqual(['y'])
  })

  it('reseta em reescrita de mesmo tamanho quando o mtime muda', async () => {
    const p = await tmpFile()
    const t = new FileTailer(p)
    await fs.appendFile(p, 'x\n')
    expect(await t.readNewLines()).toEqual(['x'])
    await fs.writeFile(p, 'y\n')
    await fs.utimes(p, new Date(), new Date(Date.now() + 5000))
    expect(await t.readNewLines()).toEqual(['y'])
  })

  it('retorna [] se o arquivo ainda não existe', async () => {
    const p = path.join(os.tmpdir(), `tail-missing-${Date.now()}.jsonl`)
    const t = new FileTailer(p)
    expect(await t.readNewLines()).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tail.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `server/src/tail.ts`**

```ts
import { promises as fs } from 'node:fs'

export class FileTailer {
  private offset = 0
  private buffer = ''
  private lastMtimeMs = -1

  constructor(private readonly path: string) {}

  async readNewLines(): Promise<string[]> {
    let stat
    try {
      stat = await fs.stat(this.path)
    } catch {
      return []
    }

    // Reset on truncation (size shrank) OR overwrite (mtime changed but size did
    // not grow past offset — catches same-size rewrites). The lastMtimeMs >= 0
    // guard prevents a false reset on the very first read (initial replay).
    const truncated = stat.size < this.offset
    const overwritten =
      this.lastMtimeMs >= 0 && stat.mtimeMs !== this.lastMtimeMs && stat.size <= this.offset

    if (truncated || overwritten) {
      this.offset = 0
      this.buffer = ''
    }

    this.lastMtimeMs = stat.mtimeMs

    if (stat.size === this.offset) return []

    const length = stat.size - this.offset
    const fd = await fs.open(this.path, 'r')
    try {
      const buf = Buffer.alloc(length)
      await fd.read(buf, 0, length, this.offset)
      this.offset = stat.size
      this.buffer += buf.toString('utf8')
    } finally {
      await fd.close()
    }

    const parts = this.buffer.split('\n')
    this.buffer = parts.pop() ?? ''
    return parts.filter((l) => l.length > 0)
  }
}
```

> Nota: a versão inicial deste plano não detectava sobrescrita de **mesmo tamanho**
> (ex.: `x\n` → `y\n`), porque `stat.size === offset` disparava o early-return antes
> de qualquer reset. A correção acima rastreia `mtime` e reseta também nesse caso.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/tail.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add server/src/tail.ts tests/tail.test.ts
git commit -m "feat: FileTailer (offset tail with partial-line buffer)"
```

---

### Task 8: Servidor — watcher + ws + estático (verificação manual)

Casca de I/O que fia tudo. Não tem teste unitário (é integração); a verificação é manual rodando contra os transcripts reais.

**Files:**
- Create: `server/src/server.ts`

- [ ] **Step 1: Implementar `server/src/server.ts`**

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
import { pickActiveSession, isSessionFile, type FileInfo } from './activeSession'
import { FileTailer } from './tail'
import type { OfficeState } from './types'

const PORT = Number(process.env.PORT ?? 4500)
const PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects')
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web')
const IDLE_MS = 90_000

let state: OfficeState = initialState()
let activeFile: string | null = null
let tailer: FileTailer | null = null
let lastActivityMs = 0
const clients = new Set<WebSocket>()

function broadcast(): void {
  const msg = JSON.stringify({ type: 'state', state })
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

async function applyLines(lines: string[]): Promise<void> {
  for (const raw of lines) {
    const line = parseLine(raw)
    if (line) state = reduce(state, line)
  }
}

async function switchTo(file: string): Promise<void> {
  activeFile = file
  state = initialState()
  tailer = new FileTailer(file)
  await applyLines(await tailer.readNewLines()) // replay do arquivo inteiro
  state.status = 'active'
  lastActivityMs = Date.now()
  console.log(`[hq] sessão ativa: ${file}`)
  broadcast()
}

async function onChange(): Promise<void> {
  const newest = pickActiveSession(await listSessionFiles())
  if (!newest) return
  if (newest !== activeFile) {
    await switchTo(newest)
    return
  }
  if (!tailer) return
  const lines = await tailer.readNewLines()
  if (lines.length === 0) return
  await applyLines(lines)
  state.status = 'active'
  lastActivityMs = Date.now()
  broadcast()
}

let pending = false
function scheduleChange(): void {
  if (pending) return
  pending = true
  setTimeout(() => {
    pending = false
    onChange().catch((e) => console.error('[hq] onChange', e))
  }, 150)
}

setInterval(() => {
  if (state.status === 'active' && Date.now() - lastActivityMs > IDLE_MS) {
    state = { ...state, status: 'idle' }
    broadcast()
  }
}, 2000)

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
  ws.send(JSON.stringify({ type: 'state', state }))
  ws.on('close', () => clients.delete(ws))
})

async function main(): Promise<void> {
  const active = pickActiveSession(await listSessionFiles())
  if (active) await switchTo(active)
  const watcher = chokidar.watch(PROJECTS_ROOT, { ignoreInitial: true, depth: 5 })
  watcher.on('all', scheduleChange)
  server.listen(PORT, () => console.log(`[hq] Agency HQ em http://localhost:${PORT}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Verificação manual (sobe o servidor)**

Run: `npm run dev`
Expected: imprime `[hq] sessão ativa: <algum arquivo>.jsonl` e `[hq] Agency HQ em http://localhost:4500`. Deixe rodando.

- [ ] **Step 3: Verificação manual (snapshot via WebSocket)**

Em outro terminal:
```bash
node -e "const ws=new (require('ws'))('ws://localhost:4500'); ws.on('message',m=>{console.log(JSON.parse(m).state.project, '| agentes:', JSON.parse(m).state.agents.length); process.exit(0)});"
```
Expected: imprime o nome do projeto da sessão ativa e a contagem de agentes (≥ 1). Pare o servidor com Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add server/src/server.ts
git commit -m "feat: live server (chokidar tail + websocket + static)"
```

---

### Task 9: Front-end — render (TDD com jsdom)

**Files:**
- Create: `web/src/render.js`
- Test: `tests/render.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '../web/src/render.js'

function baseState(overrides = {}) {
  return {
    sessionId: 's1',
    project: 'Demo',
    cwd: 'C:/x/Demo',
    status: 'active',
    updatedAt: null,
    agents: [
      { id: 'orchestrator', type: 'orchestrator', label: 'Orquestrador', isVisitor: false, status: 'working', activity: 'Lendo arquivos', speech: 'Vamos começar', tool: 'Read' },
      { id: 'a1', type: 'copywriter', label: 'Copywriter', isVisitor: false, status: 'working', activity: 'Começando', speech: 'Escrevendo a copy', tool: null },
    ],
    ...overrides,
  }
}

describe('render', () => {
  let root
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    root = document.getElementById('root')
  })

  it('renderiza um boneco por agente, com nome da sala', () => {
    render(baseState(), root)
    expect(root.querySelectorAll('.agent').length).toBe(2)
    expect(root.querySelector('.room__name').textContent).toBe('Demo')
    expect(root.textContent).toContain('Orquestrador')
    expect(root.textContent).toContain('Escrevendo a copy')
  })

  it('aplica room--idle quando a sessão está ociosa', () => {
    render(baseState({ status: 'idle' }), root)
    expect(root.querySelector('.room').classList.contains('room--idle')).toBe(true)
  })

  it('marca visitantes com a classe agent--visitor', () => {
    const s = baseState()
    s.agents[1].isVisitor = true
    render(s, root)
    const visitor = root.querySelector('[data-agent-id="a1"]')
    expect(visitor.classList.contains('agent--visitor')).toBe(true)
  })

  it('re-renderiza de forma idempotente (sem acumular)', () => {
    render(baseState(), root)
    render(baseState(), root)
    expect(root.querySelectorAll('.agent').length).toBe(2)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/render.test.js`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `web/src/render.js`**

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

export function render(state, root) {
  root.innerHTML = ''

  const room = document.createElement('div')
  room.className = 'room' + (state.status === 'idle' ? ' room--idle' : '')

  const name = document.createElement('div')
  name.className = 'room__name'
  name.textContent = state.project || 'Sessão'
  room.appendChild(name)

  const floor = document.createElement('div')
  floor.className = 'floor'
  for (const agent of state.agents) floor.appendChild(renderAgent(agent))
  room.appendChild(floor)

  root.appendChild(room)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/render.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/render.js tests/render.test.js
git commit -m "feat: DOM/SVG office renderer"
```

---

### Task 10: Front-end — ws, main, html, css (verificação manual end-to-end)

**Files:**
- Create: `web/src/ws.js`, `web/src/main.js`, `web/index.html`, `web/style.css`

- [ ] **Step 1: Criar `web/src/ws.js`**

```js
export function connect(onState) {
  let ws
  function open() {
    ws = new WebSocket(`ws://${location.host}`)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'state') onState(msg.state)
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => setTimeout(open, 1000)
  }
  open()
}
```

- [ ] **Step 2: Criar `web/src/main.js`**

```js
import { connect } from './ws.js'
import { render } from './render.js'

const stage = document.getElementById('stage')
connect((state) => render(state, stage))
```

- [ ] **Step 3: Criar `web/index.html`**

```html
<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agency HQ</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="stage"></div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Criar `web/style.css`**

```css
:root {
  --screen: #23272f;
  --screen-line: #3a3f4a;
  --floor: #efe9dc;
  --ink: #23272f;
  --muted: #8a8f97;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: #15171c;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
#stage { width: 100%; max-width: 900px; }
.room {
  background: var(--screen);
  border: 1px solid var(--screen-line);
  border-radius: 14px;
  padding: 16px;
  transition: opacity 0.4s ease;
}
.room--idle { opacity: 0.45; }
.room__name {
  color: #e8eaed;
  font-size: 14px;
  margin-bottom: 12px;
  padding: 6px 10px;
  background: #1e222a;
  border-radius: 6px;
  display: inline-block;
}
.floor {
  background: var(--floor);
  border-radius: 10px;
  padding: 28px 16px 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  align-items: flex-end;
  min-height: 200px;
}
.agent {
  position: relative;
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.agent--done { opacity: 0.55; }
.agent__label { color: var(--ink); font-size: 12px; margin-top: 4px; font-weight: 500; }
.agent__activity { color: var(--muted); font-size: 11px; }
.bubble {
  position: relative;
  max-width: 150px;
  background: #fff;
  color: var(--ink);
  font-size: 11px;
  line-height: 1.3;
  padding: 6px 9px;
  border-radius: 10px;
  margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.bubble::after {
  content: "";
  position: absolute;
  left: 18px;
  bottom: -6px;
  border-width: 6px 5px 0;
  border-style: solid;
  border-color: #fff transparent transparent;
}
.agent--working .agent__svg { animation: bob 1.1s ease-in-out infinite; }
@keyframes bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
```

- [ ] **Step 5: Verificação manual end-to-end**

Run: `npm run dev` e abra `http://localhost:4500` no navegador.
Expected: a sala da sua sessão ativa aparece com o orquestrador (e quaisquer subagentes da sessão). Em outra janela de terminal, rode uma sessão do Claude Code que dispare um agente (ou use uma sessão já em andamento) e observe o boneco aparecer, falar (balão) e, ao terminar, ficar esmaecido ("Entregou"). Após ~90s sem atividade, a sala escurece (idle).

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Expected: PASS em todos os arquivos de teste (labels, toolActivity, parse, activeSession, reducer, tail, render).

- [ ] **Step 7: Commit**

```bash
git add web/src/ws.js web/src/main.js web/index.html web/style.css
git commit -m "feat: front-end shell (ws + html + css)"
```

---

### Task 11: Docs e push final

**Files:**
- Modify: `README.md` (atualizar status para "Fase 1 implementada")

- [ ] **Step 1: Atualizar o bloco de Status no `README.md`**

Substituir a linha de status atual por:

```markdown
## Status

🟢 **Fase 1 implementada** — uma sala ao vivo (watcher → WebSocket → DOM/SVG).
Rode com `npm install && npm run dev`, abra `http://localhost:4500`.

Próximo: Fase 2 (o prédio inteiro, multi-sessão).
```

- [ ] **Step 2: Commit e push**

```bash
git add README.md
git commit -m "docs: status fase 1 implementada"
git push origin main
```
Expected: push aceito (a conta `kevinbyjordan-cell` está autenticada e tem permissão ADMIN no repo).

---

## Self-Review

**1. Cobertura da spec (Fase 1):**
- Tail dos transcripts JSONL ao vivo → Task 7 (FileTailer) + Task 8 (watcher).
- Linha → eventos/estado semântico → Task 6 (reducer).
- Seleção da sessão ativa → Task 5.
- Identidade (cwd → sala; subagent_type → persona/cor; visitante) → Task 6 (reducer) + Task 9 (cores).
- Mapa ação → atividade → Task 3 (toolActivity) + Task 6.
- WebSocket snapshot + broadcast → Task 8.
- UI uma sala (DOM/SVG, balões, estados, idle) → Tasks 9 e 10.
- Itens deferidos explicitamente: play-by-play interno do subagente (Fase 3), multi-sessão/prédio (Fase 2), hooks/pathing/som (Fase 4), zoom (Fase 3). Coerente com o escopo "uma sala".

**2. Placeholders:** nenhum "TBD/TODO"; todo passo de código mostra o código completo; todo passo de teste mostra o teste completo.

**3. Consistência de tipos:** `OfficeState`/`Agent` (Task 1) são usados de forma idêntica em `reduce` (Task 6), `server.ts` (Task 8) e nos testes de `render` (Task 9). `FileInfo` definido em `activeSession.ts` (Task 5) e importado em `server.ts`. `readNewLines()` (Task 7) chamado em `server.ts` com a mesma assinatura. `render(state, root)` (Task 9) chamado igual em `main.js` (Task 10). Imports do servidor são extensionless (resolução Bundler via tsx/vitest); imports do front-end usam `.js` (ESM nativo do browser).
