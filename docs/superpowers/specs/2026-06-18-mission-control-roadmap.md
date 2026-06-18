# Mission Control — Roadmap da Plataforma

- **Data:** 2026-06-18
- **Status:** Roadmap aprovado — construir módulo a módulo, na ordem.
- **Relacionado:** estende [`2026-06-18-agency-hq-2d-office-design.md`](2026-06-18-agency-hq-2d-office-design.md) (o escritório 2D vira a aba Office).

## 1. Visão

Agency HQ evolui de "escritório 2D" para **Mission Control**: um painel para
**gerenciar e visualizar a empresa de IA em tempo real**. O escritório vivo é UMA
aba dentro de um app maior com abas, métricas ao vivo (incl. gasto de API),
navegação da memória (.md) e organograma.

Estética: **flat-vector caprichado** (sem pipeline de sprites). Idioma: **português**
(ferramenta interna). Tudo **local** e, por padrão, **somente leitura** (a edição de
`.md` é um passo posterior, explícito).

## 2. Decisões travadas

| Eixo | Decisão |
|---|---|
| Estética | Flat-vector caprichado, desenhado em código (SVG/CSS) |
| Office: salas | **Sala = projeto** (departamento fixo); a sessão ativa acende a sala |
| Fonte de dados | Transcripts JSONL (`~/.claude/projects/**`) + arquivos do filesystem |
| Shell | App com sidebar de abas; servidor Node atual estendido; front-end ESM |
| Gasto de API | Somatório do `usage` (tokens) dos transcripts × preço por modelo |

## 3. Arquitetura do shell

- O **servidor Node** atual (watcher + WebSocket) é estendido para expor, além do
  `building`, os dados dos outros módulos (dashboard, memory, org chart, tasks) —
  via mensagens WebSocket tipadas e/ou endpoints HTTP de leitura.
- O **front-end** ganha um roteador de abas simples (sidebar). Cada módulo é um
  "view" isolado que consome o estado relevante. O renderer continua DOM/SVG.
- Estado compartilhado no cliente; o servidor manda snapshots + deltas por módulo.

## 4. Módulos

| # | Módulo | Escopo | Fonte de dados | Status |
|---|---|---|---|---|
| — | **Office** (base) | escritório vivo, salas, bonecos, balões | transcripts | ✅ Fases 1-2 |
| M1 | **Office por projeto** | prédio desenhado: lobby + salas rotuladas por projeto + mobília + água + avatares nomeados | transcripts (agrupados por projeto) | a fazer |
| M2 | **Shell + Dashboard** | abas (sidebar); home com nº de agentes ativos, **gasto de API ao vivo**, sessões, tarefas, feed | transcripts + `usage` | a fazer |
| M3 | **Memory (.md)** | navegar `.claude/agents`, `skills`, `CLAUDE.md`, `memory/*.md`; árvore + viewer | filesystem (leitura) | a fazer |
| M4 | **Org chart** | agentes por departamento (Pesquisa, Conteúdo, Técnico, SEO…), contagem, quem está ativo | roster + transcripts | a fazer |
| M5 | **Tasks** | o que está sendo processado agora | transcripts (tool/task) | a fazer |
| — | **Post Calendar** | clipes de vídeo gerados, agendados c/ legenda | pipeline de vídeo (skills tiktok/viral) | **projeto à parte** |
| — | **Edição de .md via chat** | atualizar arquivos de memória por comando | write channel + segurança | fase posterior |

## 5. Detalhe dos módulos

### M1 — Office por projeto (o prédio da agência)
Transforma a aba Office no prédio desenhado (estilo Gather, em flat-vector): fosso
d'água, **lobby central "Agency HQ"** (recepção, sofá, plantas), e **uma sala
rotulada por projeto** ao redor (Google Ads PRO, Venda Sites, DonaNeura, AGENTES IA,
Sena Detailing, Embassy…). A sessão ativa de um projeto **acende** sua sala e a enche
de bonecos identificados por nome/papel; ociosa fica apagada. Mobília por sala (mesas,
plantas), sala de Reuniões e Lounge. Câmera pan/zoom (Fase 2) reaproveitada.
- **Mudança no servidor:** agrupar sessões por **projeto** (basename do `cwd`); o
  estado vira "salas por projeto", não "uma sala por sessão".
- **Layout fixo + crescimento:** projetos conhecidos têm posição estável; projeto
  novo ganha uma sala automaticamente.

### M2 — Shell + Dashboard
Sidebar com abas (Office, Dashboard, Memory, Org chart, Tasks, Calendar) e topo com
métricas ao vivo. **Dashboard** (home): cards de agentes ativos, **gasto de API hoje**,
sessões e tarefas; resumo de departamentos; feed de atividade recente.
- **Gasto de API:** somar `usage.input_tokens`/`output_tokens` por mensagem dos
  transcripts e multiplicar pelo preço do modelo (tabela de preços versionada);
  agregar por dia e por sessão.

### M3 — Memory (.md browser)
Árvore de arquivos (`.claude/agents/*.md`, `skills/*/SKILL.md`, `CLAUDE.md`,
`memory/*.md`) + viewer com markdown renderizado. **Somente leitura** nesta fase.

### M4 — Org chart
Agentes agrupados em departamentos (mapa papel→departamento), com contagem e indicação
de quem está ativo agora. Visual simples (colunas/cards por departamento).

### M5 — Tasks
Lista do que está em processamento (derivado dos transcripts / ferramentas de tarefa),
com estado e a qual agente/sessão pertence.

### Post Calendar (à parte)
Depende do pipeline de geração de vídeo (skills tiktok/viral): clipes gerados,
legendas, agendamento. Será especificado e construído como projeto separado.

## 6. Ordem de construção

1. **M1 — Office por projeto** (centro emocional; evolui as Fases 1-2)
2. **M2 — Shell + Dashboard** (abas + gasto de API ao vivo)
3. **M3 — Memory (.md browser)**
4. **M4 — Org chart**
5. **M5 — Tasks**
6. **Post Calendar** — projeto à parte, depois

Cada módulo: plano próprio em `docs/superpowers/plans/`, construído por TDD +
revisão (spec + qualidade) + merge, como nas Fases 1-2.

## 7. Riscos / pontos a validar

- **Preços por modelo** podem mudar — manter a tabela de preços versionada e fácil de
  atualizar; exibir "estimativa".
- **`usage` nos transcripts**: confirmar que as mensagens do modelo principal trazem
  contagem de tokens (validar no parser ao construir o M2).
- **Edição de arquivos** (.md via chat): risco de segurança/escrita — fase posterior,
  com confirmação e escopo restrito.
- **Performance multi-módulo**: manter os módulos isolados; não recalcular tudo a cada
  evento (debounce, snapshots por módulo).
- **Agrupar por projeto** (M1): decodificar `cwd` → projeto de forma robusta
  (basename), lidando com caminhos com espaços ("GOOGLE ADS PRO").
