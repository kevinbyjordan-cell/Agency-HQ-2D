# Agency HQ — Escritório 2D ao vivo dos agentes

Interface estilo **jogo 2D** que mostra, em tempo real, todos os agentes da operação
trabalhando — como um escritório visto de cima onde cada sessão do Claude Code é uma
sala, cada agente é um bonequinho, e tudo que eles fazem e falam aparece animado
(balões de fala, ações, entrega de relatórios).

Não é um jogo: é um **observador ao vivo** (telemetria viva) com estética de office sim.

## Status

🟢 **Mission Control · M7** — shell estilo "OS" (top bar + sidebar de ícones + headers +
stat cards) com 7 abas: **Office** (prédio ao vivo), **Dashboard** (métricas + gasto ao
vivo), **Memory** (navegador `.md`), **Sessions** (transcript em balões), **Activity**
(feed + **mapa de calor**), **Sub-agents** (delegações: tipo/task/modelo/tokens/duração/
estado) e **Costs** — economia de tokens: **custo por modelo**, split input/output/**cache**,
**tendência diária** e **projeção mensal**. Rode com `npm install && npm run dev`, abra `http://localhost:4500`.

- Roadmap Mission Control: [`docs/superpowers/specs/2026-06-18-mission-control-roadmap.md`](docs/superpowers/specs/2026-06-18-mission-control-roadmap.md)
- Design do office: [`docs/superpowers/specs/2026-06-18-agency-hq-2d-office-design.md`](docs/superpowers/specs/2026-06-18-agency-hq-2d-office-design.md)
- Planos: [Fase 1](docs/superpowers/plans/2026-06-18-agency-hq-phase1-uma-sala-ao-vivo.md) · [Fase 2](docs/superpowers/plans/2026-06-18-agency-hq-phase2-predio-multi-sessao.md) · [MC M1](docs/superpowers/plans/2026-06-18-mc-m1-office-por-projeto.md) · [MC M2](docs/superpowers/plans/2026-06-18-mc-m2-shell-dashboard.md) · [MC M3](docs/superpowers/plans/2026-06-18-mc-m3-memory-browser.md) · [MC M4](docs/superpowers/plans/2026-06-18-mc-m4-sessions-transcript.md) · [MC M5](docs/superpowers/plans/2026-06-18-mc-m5-activity-feed.md) · [MC M6](docs/superpowers/plans/2026-06-18-mc-m6-subagent-dashboard.md) · [MC M7](docs/superpowers/plans/2026-06-18-mc-m7-token-economics.md)

Próximo (roadmap v2): MC M8 — Org chart → M9 Tasks.

## Como funciona (resumo)

O Claude Code grava transcripts JSONL ao vivo em `~/.claude/projects/**`. Um watcher
em Node faz tail desses arquivos, traduz cada linha em eventos semânticos e transmite
por WebSocket para a interface do escritório (DOM/SVG), que anima tudo.

```
Sessões do Claude Code → Transcript JSONL → Watcher (Node) → WebSocket → Office UI (DOM/SVG)
```

## Stack

- **Servidor/watcher:** Node + TypeScript via `tsx` (`chokidar` + `ws`)
- **Front-end:** JavaScript ESM nativo + DOM/SVG, servido pelo próprio servidor (sem bundler na Fase 1; Vite entra se o front crescer)
- **Execução:** local — `npm install && npm run dev`, abrir `http://localhost:4500`

## Decisões travadas

- Ao vivo de verdade (tail dos transcripts reais; hooks como reforço opcional)
- Arte flat vector desenhada em código
- Elenco híbrido (nomeados fixos + visitantes ad-hoc)
- Multi-sessão (a empresa inteira, uma sala por sessão)
- Overview + zoom (pulso geral de longe, play-by-play ao focar)
- Engine DOM/SVG + CSS (renderer trocável por PixiJS no futuro)

## Fases

1. ✅ Uma sala, ao vivo (núcleo da mágica)
2. ✅ O prédio inteiro (multi-sessão + câmera pan/zoom)
3. Zoom no agente & play-by-play interno do subagente
4. Polimento (hooks, personas, pathing, som/replay)

## Idioma

Ferramenta **interna**, em português. A regra de "produto em inglês" do projeto da
agência vale apenas para sites de cliente, não para esta ferramenta.
