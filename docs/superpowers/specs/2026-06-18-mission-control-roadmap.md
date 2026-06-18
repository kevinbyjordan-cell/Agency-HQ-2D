# Mission Control — Roadmap da Plataforma

- **Data:** 2026-06-18
- **Status:** v2 — roadmap revisado após estudo do **TenacitOS** (mission control do
  OpenClaw). M1–M3 entregues; M4+ reordenados por valor × viabilidade sobre os dados
  do Claude Code. **Construir módulo a módulo, na ordem.**
- **Relacionado:** estende [`2026-06-18-agency-hq-2d-office-design.md`](2026-06-18-agency-hq-2d-office-design.md) (o escritório 2D é a aba Office).

## 1. Visão

Agency HQ evolui de "escritório 2D" para **Mission Control**: um painel para
**gerenciar e visualizar a empresa de IA em tempo real**. O escritório vivo é UMA aba
dentro de um app maior com abas — métricas ao vivo (incl. gasto de API), navegação da
memória (.md), histórico de sessões, feed de atividade, sub-agentes e organograma.

Estética: **flat-vector caprichado** (sem pipeline de sprites). Idioma: **português**
(ferramenta interna). Tudo **local** e, por padrão, **somente leitura** (escrita —
edição de `.md`, envio de comandos — é fase posterior, explícita e com confirmação).

## 2. Inspiração: TenacitOS (e por que NÃO forkamos)

O [TenacitOS](https://github.com/carlosazaustre/tenacitOS) é um mission control para o
runtime **OpenClaw** com um conjunto de features que é praticamente a visão completa
deste projeto (Agent Dashboard, Cost Tracking, Memory Browser, Activity Feed, Cron
Manager, Session History com viewer de transcript, Sub-Agent Dashboard, Notifications,
Office 3D). Decisão: **usar como blueprint de features/UX/schemas, não forkar.** Dois
descasamentos inviabilizam o reaproveitamento direto de código:

1. **Stack** — TenacitOS é Next.js 16 + React 19 + Tailwind 4 + React Three Fiber +
   SQLite. Agency HQ é Node+TS puro + JS/DOM sem bundler. Componentes não portam direto.
2. **Fonte de dados** — TenacitOS lê o OpenClaw (`openclaw.json` + SQLite do OpenClaw).
   Agency HQ lê **transcripts do Claude Code** (`~/.claude/projects/**/*.jsonl`), com
   modelo de sessão/agente/custo diferente. A camada de dados dele não se aproveita.

O que **se aproveita**: as **specs de features**, os **schemas de dados** (`data/*.example.json`
para tasks/activities/notifications), a **lógica de preço por modelo** e padrões de **UX**
(badges de sessão, barra de % de contexto, timeline semanal de cron, shell estilo OS).

## 3. Decisões travadas

| Eixo | Decisão |
|---|---|
| Estética | Flat-vector caprichado, desenhado em código (SVG/CSS) |
| Office: salas | **Sala = projeto** (departamento fixo); a sessão ativa acende a sala |
| Fonte de dados | Transcripts JSONL (`~/.claude/projects/**`) + arquivos do filesystem |
| Shell | App com sidebar de abas; servidor Node estendido; front-end ESM |
| Gasto de API | Somatório do `usage` (tokens) dos transcripts × preço por modelo |
| Renderer 3D | **Fora de escopo** — escolha consciente por flat-vector DOM/SVG |
| Escrita | Somente leitura por padrão; edição/comandos = fase posterior explícita |

## 4. Arquitetura do shell (já em produção desde M2)

- **Servidor Node** (watcher + WebSocket) expõe `building` + `dashboard` via WebSocket
  e endpoints HTTP de leitura (`/api/memory*`). Módulos novos adicionam: ou campos no
  snapshot WebSocket (dados ao vivo), ou endpoints HTTP `/api/<modulo>` (request/response
  para dados pesados/históricos como sessões e transcripts).
- **Front-end:** roteador de abas (sidebar). Cada módulo é um "view" isolado. Renderer
  DOM/SVG. Views ao-vivo (Office/Dashboard) consomem o WebSocket; views de dados
  (Memory/Sessions) fazem fetch sob demanda e não re-renderizam a cada tick.

## 5. Módulos

| # | Módulo | Escopo | Fonte de dados | Status |
|---|---|---|---|---|
| — | **Office** (base) | escritório vivo: salas, bonecos, balões | transcripts | ✅ Fases 1-2 |
| M1 | **Office por projeto** | prédio: lobby + salas por projeto + mobília + água + avatares | transcripts (por projeto) | ✅ |
| M2 | **Shell + Dashboard** | abas; home com agentes ativos, **gasto de API ao vivo**, sessões | transcripts + `usage` | ✅ |
| M3 | **Memory (.md)** | navegar memória/agentes/skills/CLAUDE.md; lista + viewer markdown | filesystem (leitura) | ✅ |
| **M4** | **Sessions & Transcript** | lista TODAS as sessões (ativas + recentes): badge de tipo (main/sub), modelo, tokens, **% de contexto**, idade; clique → **viewer do transcript** (balões user/assistant/tool) | transcripts (índice + leitura por sessão) | **próximo** |
| **M5** | **Activity Feed + heatmap** | stream cronológico de ações entre sessões (tool calls, entregas) + heatmap por hora/dia; taxa sucesso/erro | transcripts (eventos c/ timestamp) | a fazer |
| **M6** | **Sub-Agent Dashboard** | a "orquestra": sub-agentes ativos/recentes com estado, task, modelo, tokens e **timeline spawn→conclusão** | transcripts + `subagents/agent-*.jsonl` | a fazer |
| **M7** | **Token Economics** (estende M2) | custo por modelo, split input/output/**cache**, tendência diária, projeção mensal, top tarefas por tokens | transcripts (`usage` por modelo/dia) | a fazer |
| **M8** | **Org chart** | agentes por departamento (Pesquisa, Conteúdo, Técnico, SEO…); contagem e quem está ativo | roster (papel→depto) + transcripts | a fazer |
| **M9** | **Tasks** | o que está em processamento agora; board leve | transcripts (TaskCreate/Update) ou board manual | a fazer |
| — | **Backlog** | Notifications · File Browser + Global Search (estende M3) · Quick Actions · Skills Manager | vários | depois |
| — | **Post Calendar** | clipes de vídeo gerados/agendados c/ legenda (reaproveita a UX de timeline semanal do TenacitOS) | pipeline de vídeo (skills tiktok/viral) | **projeto à parte** |
| — | **Edição via chat** | atualizar `.md` / enviar comando | write channel + segurança | fase posterior explícita |

**Fora de escopo (decisão consciente):** **Office 3D** (escolhemos flat-vector),
**System Monitor de VPS** (somos local, não um agente em servidor), **Terminal/Config
editor** (escrita — risco; eventualmente, com allowlist e confirmação).

## 6. Detalhe dos módulos novos (M4–M9)

### M4 — Sessions & Transcript Viewer  ⭐ próximo
O maior amplificador da visão central ("ver todo mundo trabalhando"). Uma aba que lista
**todas as sessões** (não só as ativas): por projeto e por tipo (main / sub-agent),
mostrando **modelo**, **tokens totais**, **% de contexto usado** (tokens ÷ janela do
modelo, com cor), e **idade** ("2 h atrás"). Clicar abre um **viewer do transcript** em
painel lateral, renderizando as mensagens reais do JSONL como balões (user / assistant /
tool_use / tool_result), reaproveitando o `renderMarkdown` do M3 para o texto.
- **Servidor:** endpoint `/api/sessions` (índice: varre `~/.claude/projects/**`, 1 entrada
  por arquivo `.jsonl`, com metadados derivados) + `/api/sessions/transcript?id=` (lê e
  resume as mensagens de uma sessão). Mesma disciplina de segurança do M3 (id casa no
  índice; sem path do cliente).
- **Reaproveita:** `parseLine`/`reduce` já entendem o JSONL; `pricing.ts` já dá tokens.

### M5 — Activity Feed + heatmap
Stream cronológico unificado das ações de todas as sessões (cada `tool_use`, cada
entrega/`tool_result`, início/fim de sessão) com timestamp, tipo, agente e status.
Acompanha um **heatmap de atividade por hora × dia da semana** e contadores (ações/dia,
tipos mais frequentes, taxa de sucesso/erro). Schema espelhado do `activities.json` do
TenacitOS.

### M6 — Sub-Agent Dashboard
Visão analítica da orquestração multi-agente (o Office mostra ao vivo; aqui é a tabela).
Sub-agentes ativos/recentes com **estado** (running/done/failed), **task description**,
**modelo**, **tokens** e uma **timeline de spawns→conclusões**. Já detectamos sub-agentes
no reducer; aqui lemos também `subagents/agent-*.jsonl` para o play-by-play.

### M7 — Token Economics (estende o Dashboard/M2)
Aprofunda o card de custo do M2: **breakdown por modelo**, split **input / output /
cache (read/write 5m/1h)**, **tendência diária** (line/bar), **projeção mensal**, e
**top tarefas por consumo de tokens**. Tudo derivado do `usage` que já parseamos.

### M8 — Org chart
Agentes agrupados em departamentos via mapa **papel→departamento** (Pesquisa, Conteúdo,
Técnico, SEO — alinhado ao CLAUDE.md), com contagem e indicação de quem está ativo.
Visual simples (colunas/cards por depto). *Depende de definirmos o roster de agentes.*

### M9 — Tasks
Board leve do que está em processamento. Fonte: ou as chamadas de ferramenta de tarefa
(TaskCreate/TaskUpdate) nos transcripts, ou um `data/tasks.json` manual (schema do
TenacitOS). A definir na hora (qual fonte reflete melhor "o que está sendo feito").

### Post Calendar (à parte)
Depende do pipeline de geração de vídeo (skills tiktok/viral): clipes gerados, legendas,
agendamento. Especificado e construído como projeto separado; reaproveita a UX de
**timeline semanal** do TenacitOS (`CronWeeklyTimeline`).

## 7. Ordem de construção

1. ✅ **M1 — Office por projeto**
2. ✅ **M2 — Shell + Dashboard** (gasto de API ao vivo)
3. ✅ **M3 — Memory (.md browser)**
4. ⭐ **M4 — Sessions & Transcript Viewer**  ← próximo
5. **M5 — Activity Feed + heatmap**
6. **M6 — Sub-Agent Dashboard**
7. **M7 — Token Economics** (estende M2)
8. **M8 — Org chart**
9. **M9 — Tasks**
10. **Backlog** (Notifications, File Browser+Search, Quick Actions, Skills)
11. **Post Calendar** — projeto à parte

Cada módulo: plano próprio em `docs/superpowers/plans/`, construído por TDD + revisão
(spec + qualidade + final) + merge, como em M1–M3.

## 8. Riscos / pontos a validar

- **Volume de sessões (M4):** há muitas sessões históricas em `~/.claude/projects/**`.
  Índice deve paginar/limitar (ex.: últimas N por recência) e ler transcript sob demanda;
  não carregar tudo de uma vez.
- **% de contexto (M4):** precisa da janela do modelo — manter tabela de janelas por
  modelo junto do `pricing.ts`.
- **Privacidade dos transcripts:** o viewer expõe conversas reais — ferramenta é local e
  só-leitura, mas o endpoint deve continuar restrito ao índice do servidor (sem path do
  cliente), como no M3.
- **Roster de agentes (M8):** o organograma depende de um mapa papel→departamento que
  precisa ser definido (ainda não existe um roster canônico).
- **Preços/janelas por modelo** mudam — manter tabela versionada; exibir "estimativa".
- **Performance multi-módulo:** módulos isolados; views de dados (Sessions/Memory) fazem
  fetch sob demanda e não re-renderizam a cada tick do WebSocket (regra já aplicada no M3).
