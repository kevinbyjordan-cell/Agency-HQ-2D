# Agency HQ — Escritório 2D ao vivo dos agentes

- **Data:** 2026-06-18
- **Autor:** Kevin (orquestrador) + Claude
- **Status:** Design aprovado → próximo passo: plano de implementação
- **Idioma do produto:** Português (ferramenta interna; a regra de "produto em inglês"
  do CLAUDE.md vale só para sites de cliente, não para esta ferramenta).

## 1. Resumo

Uma interface estilo "jogo 2D" que mostra, **em tempo real**, todos os agentes da
operação trabalhando — como um escritório visto de cima onde cada sessão do Claude
Code é uma sala, cada agente é um bonequinho, e tudo que eles fazem e falam aparece
animado na tela (balões de fala, ações, entrega de relatórios).

Não é um jogo: não há mecânica, pontuação ou input de jogador além de navegar/observar.
É um **observador ao vivo** (telemetria viva) com estética de office sim.

## 2. Objetivos e não-objetivos

### Objetivos
- Visualizar ao vivo o que cada agente/subagente está fazendo e dizendo.
- Mostrar a hierarquia real: orquestrador → subagentes → workflows.
- Cobrir **a operação inteira**: várias sessões/projetos simultâneos, cada um uma sala.
- Permitir "ver tudo de longe" e "focar num agente" (overview + zoom com play-by-play).
- Auto-descobrir agentes novos sem reconfiguração.

### Não-objetivos (v1)
- Não controla nem comanda agentes (somente leitura/observação).
- Não é multiplayer nem hospedado publicamente; roda local.
- Não persiste histórico de longo prazo nem tem "replay" gravado (pode vir em fase futura).
- Não substitui o terminal do Claude Code; é um painel paralelo.

## 3. Decisões travadas (brainstorming)

| Eixo | Decisão |
|---|---|
| Fidelidade | **Ao vivo de verdade** — conectado aos runs reais |
| Fonte de dados | **Tail dos transcripts JSONL** que o Claude Code já grava (+ hooks como reforço opcional) |
| Arte | **Flat vector** desenhado em código (sem pipeline de sprites) |
| Elenco | **Híbrido** — elenco nomeado sempre presente; ad-hoc (Explore/general-purpose) entram como visitantes |
| Escopo | **A empresa inteira** — multi-sessão, uma sala por sessão ativa |
| Navegação | **Overview + zoom** — pulso geral de longe, play-by-play ao focar |
| Engine | **DOM/SVG + CSS** (Web Animations), renderer atrás de uma interface trocável |

## 4. Fonte de dados (verificada na máquina)

O Claude Code grava, ao vivo, em `~/.claude/projects/<project-slug>/`:

- `<session-id>.jsonl` — transcript da sessão (o **orquestrador**). Cada linha é um JSON
  com `type` (`user`/`assistant`/`system`/...), `timestamp` (ISO8601), `sessionId`,
  `uuid`, `parentUuid`, `cwd`, `gitBranch`. Mensagens `assistant` trazem `message.content[]`
  com blocos `text` (a fala) e `tool_use` (`name` + `input`).
- `<session-id>/subagents/agent-<id>.jsonl` — transcript **interno de cada subagente**
  disparado via `Agent`/`Task` (play-by-play completo daquele subagente).
- `<session-id>/subagents/workflows/<wf-id>/agent-<id>.jsonl` — agentes de Workflow.

Evidências confirmadas (18/06/2026):
- O spawn aparece no transcript do orquestrador como `tool_use` `name: "Agent"` com
  `input.subagent_type` (ex: `pesquisador-local`, `copywriter`), `input.description`,
  `input.prompt`, `run_in_background`.
- Pastas `subagents/` reais e populadas existem em vários projetos do usuário.
- Os arquivos são **anexados ao vivo** durante a sessão (append por evento).

Conclusão: **não é preciso inventar telemetria.** Basta fazer tail + parse desses
arquivos. Hooks entram só para reduzir latência e marcar ciclo de vida explicitamente.

## 5. Arquitetura

```
Sessões do Claude Code
        │ grava ao vivo
        ▼
Transcript JSONL (1 por sessão + subagents/)
        │ tail + parse
        ▼
Watcher (Node)  ◄── Hooks (opcional, latência instantânea)
   linhas → eventos semânticos
        │ WebSocket (snapshot + deltas)
        ▼
Office UI (DOM/SVG)  — salas · agentes · balões · zoom
```

### 5.1 Watcher / servidor (Node + TypeScript)
- Observa `~/.claude/projects/**/*.jsonl` (todos os projetos/sessões + `subagents/`)
  com `chokidar` (fallback de polling no Windows se necessário).
- Mantém um **offset por arquivo**; em cada append, lê só as linhas novas e parseia.
- Traduz linhas cruas em **eventos semânticos** (ver §6).
- Decide "ativo" vs "ocioso" pelo timestamp da última linha / mtime dentro de uma
  janela configurável (default ~3 min).
- Mantém o **estado autoritativo** (sessões → agentes → atividade atual) e:
  - envia um **snapshot** completo a cada cliente que conecta (abrir a página no meio
    de um run já mostra o escritório povoado, não em branco);
  - envia **deltas** via WebSocket conforme novos eventos chegam.
- Serve o front-end estático.

### 5.2 Front-end (Vite + TypeScript, DOM/SVG)
- Renderiza prédio, salas (1 por sessão ativa), bonecos (orquestrador + subagentes),
  balões de fala, estados (trabalhando/ocioso/visitante).
- Câmera com pan/zoom; clicar numa sala/boneco → foco + **painel de detalhe** com o
  feed play-by-play daquele agente.
- Assina o WebSocket: aplica snapshot inicial e depois os deltas.
- **Renderer atrás de uma interface** (`Renderer`) para trocar por PixiJS no futuro
  sem reescrever a lógica de estado/eventos.

## 6. Modelo de eventos semânticos

O watcher emite eventos normalizados (nomes provisórios):

- `session.active` / `session.idle` — `{ sessionId, project, cwd, branch }`
- `orchestrator.say` — `{ sessionId, text }` (texto do assistente)
- `tool.start` — `{ sessionId, agentId, name, inputSummary }`
- `tool.end` — `{ sessionId, agentId, name, ok }`
- `agent.spawn` — `{ sessionId, agentId, subagentType, description, prompt }`
- `agent.say` — `{ sessionId, agentId, text }`
- `agent.tool` — igual a `tool.start/end` mas vindo de `subagents/agent-*.jsonl`
- `agent.done` — `{ sessionId, agentId }`

Correlação `tool_use` → `tool_result` pelo `id` do bloco (padrão do formato).

## 7. Identidade e mapeamento

- **Sala** = sessão. Rótulo derivado do campo `cwd` da linha (basename do caminho real),
  não do slug ofuscado da pasta. Ex.: `.../GOOGLE ADS PRO` → "Google Ads PRO".
- **Persona/cor do boneco** = `subagent_type`:
  - orquestrador → roxo;
  - agentes nomeados (`.claude/agents/*.md`) → cores atribuídas por papel;
  - ad-hoc (`Explore`, `general-purpose`) → visitante (anel âmbar).
- Auto-descoberta: tipos novos ganham cor automática + entram como visitante até serem
  reconhecidos (sem reconfiguração).

## 8. Mapa ação real → animação

| Evento real | Tela |
|---|---|
| `Agent` spawn (`subagent_type` + `prompt`) | Boneco entra/acende, anda até a mesa; balão com a tarefa |
| Texto do assistente | Balão de fala (resumido; completo no painel de zoom) |
| `tool_use` Read/Grep/Glob | "lendo", ícone de documento |
| `tool_use` Bash/PowerShell | ícone de terminal, "rodando comando" |
| `tool_use` Write/Edit | "digitando", ícone de teclado |
| `tool_use` WebSearch/WebFetch | "navegando", ícone de globo |
| `tool_use` Skill | boneco vai até uma **estação** (skill como objeto na sala) |
| `tool_result` ok/erro | check verde / balão vermelho |
| Subagente termina | volta ao orquestrador, entrega relatório, some (ad-hoc) ou senta (fixo) |
| Sessão sem append há X min | sala escurece → ociosa |

## 9. UX — overview + zoom

- **Overview:** prédio top-down, HUD com relógio + contagem de ativos + legenda
  (trabalhando/ocioso/visitante). Salas acendem/apagam conforme atividade.
- **Foco:** clicar numa sala ou boneco aproxima a câmera e abre um **painel de detalhe**
  com o feed cronológico daquele agente (cada fala e cada tool call, completos).
- Densidade controlada: de longe só o pulso; o play-by-play vive no foco.

## 10. Stack e layout do projeto

- **Watcher/servidor:** Node + TypeScript, `chokidar` (watch) + `ws` (WebSocket).
- **Front-end:** Vite + TypeScript, DOM/SVG puro (sem framework pesado).
- **Execução local:** `npm run dev` sobe watcher+servidor; abrir `http://localhost:4500`.
- **Localização:** `VENDA SITES/agency-hq/` (ferramenta interna, separada dos sites).
  Vira o próprio repositório git no scaffold (a raiz VENDA SITES não é repo).
- Estrutura provável:
  ```
  agency-hq/
    server/        # watcher + parser + websocket + estático
      watcher.ts   # chokidar + tail por offset
      parser.ts    # linha JSONL → evento semântico
      state.ts     # estado autoritativo (sessões/agentes)
      server.ts    # ws + http estático
    web/           # front-end Vite
      src/
        renderer/  # interface Renderer + impl DOM/SVG
        scene/     # prédio, salas, bonecos, balões
        store.ts   # estado do cliente (snapshot + deltas)
        ws.ts
    package.json
  ```

## 11. Fases

1. **Uma sala, ao vivo** — watcher na sessão ativa; orquestrador + subagentes; balões;
   estados básicos; WebSocket + snapshot. *Entrega a mágica central.*
2. **O prédio inteiro** — descoberta multi-sessão; várias salas; ativo/ocioso; pan.
3. **Zoom & play-by-play** — foco por clique; painel de detalhe; ícones/animações por ação.
4. **Polimento** — hooks para latência mínima; personas caprichadas; bonecos andando
   (pathing); (opcional) som e linha do tempo/replay.

A Fase 1 é a unidade implementável principal deste ciclo; 2–4 são roadmap.

## 12. Riscos e pontos a validar no plano

- **Correlação tool_use → tool_result** por `id` (confirmar no parser).
- **Latência de append** dos JSONL (observado sub-segundo; hooks como reforço se preciso).
- **Decodificar slug do projeto → nome amigável** (usar `cwd`, não o nome da pasta).
- **Performance com muitos arquivos**: só fazer tail dos "ativos", debounce, teto de salas.
- **File-watching no Windows** (chokidar; usar polling se eventos falharem).
- **Privacidade**: prompts/transcripts podem conter dados sensíveis; a ferramenta é local
  e somente leitura, mas não deve expor a porta para fora do localhost.

## 13. Critérios de sucesso (Fase 1)

- Ao rodar um fluxo real (ex.: agência disparando `pesquisador-local` + `copywriter`),
  a sala correspondente mostra o orquestrador e os subagentes aparecendo, falando e
  entregando relatório, com atraso perceptível < ~1–2 s.
- Abrir a página no meio de um run mostra o estado atual (snapshot), não tela vazia.
- Subagente ad-hoc não cadastrado aparece como visitante sem quebrar nada.
