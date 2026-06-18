# Agency HQ — Escritório 2D ao vivo dos agentes

Interface estilo **jogo 2D** que mostra, em tempo real, todos os agentes da operação
trabalhando — como um escritório visto de cima onde cada sessão do Claude Code é uma
sala, cada agente é um bonequinho, e tudo que eles fazem e falam aparece animado
(balões de fala, ações, entrega de relatórios).

Não é um jogo: é um **observador ao vivo** (telemetria viva) com estética de office sim.

## Status

🟢 **Mission Control · M2** — app de **abas**: a aba **Office** é o prédio de agência
(fosso d'água, lobby "Agency HQ", uma sala por projeto, câmera pan/zoom) e a aba
**Dashboard** mostra métricas ao vivo — agentes ativos, sessões e **gasto de API em
tempo real** (somando os tokens dos transcripts × preço por modelo). Rode com
`npm install && npm run dev`, abra `http://localhost:4500`.

- Roadmap Mission Control: [`docs/superpowers/specs/2026-06-18-mission-control-roadmap.md`](docs/superpowers/specs/2026-06-18-mission-control-roadmap.md)
- Design do office: [`docs/superpowers/specs/2026-06-18-agency-hq-2d-office-design.md`](docs/superpowers/specs/2026-06-18-agency-hq-2d-office-design.md)
- Planos: [Fase 1](docs/superpowers/plans/2026-06-18-agency-hq-phase1-uma-sala-ao-vivo.md) · [Fase 2](docs/superpowers/plans/2026-06-18-agency-hq-phase2-predio-multi-sessao.md) · [MC M1](docs/superpowers/plans/2026-06-18-mc-m1-office-por-projeto.md) · [MC M2](docs/superpowers/plans/2026-06-18-mc-m2-shell-dashboard.md)

Próximo: MC M3 — Memory (.md browser) → M4 Org chart → M5 Tasks.

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
