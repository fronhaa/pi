# Arquitetura

O que o jogo é: [game-design.md](game-design.md). Por que a arquitetura é assim:
[ADR 0004](decisoes/0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md).

## Visão geral

```
index.html   tela de carregamento em HTML/CSS (aparece na hora, sem JS)
main.ts      (~1,5 KB gzip)
  └── import('@/core/Game')        ← carregado sob demanda (~160 KB gzip: Three.js + jogo)
        ├── data/flares.ts         carrega public/data/donki-flares.json (erupções reais)
        ├── sim/Mission            SIMULAÇÃO PURA: regras, números, eventos, cartas
        ├── scene/MarsBase, Crew   CENA 3D: só desenha o estado
        ├── ui/Hud, dialogs        INTERFACE: mostra o estado e repassa decisões
        └── import('@/scene/crewMotion')  ← em segundo plano (~1,65 MB gzip: Rapier)
              movimentação da tripulação: setas, clique, pulo, gravidade de Marte
```

A regra principal (GDD, "Tecnologia e arquitetura"):

```
interface ──decisões──► simulação ──estado──► interface e cena
```

- A **simulação** não conhece DOM nem Three.js. Roda igual no navegador e no Node (`npm run balance`).
- A **cena** nunca altera regras. Ela recebe um `SceneState` e mostra (poeira, plantas, sacos de regolito, bateria, alarme, noite).
- A **interface** nunca calcula regras. Ela chama `mission.answerCard()` e `mission.endSol(plano)` e redesenha.

## Pastas

| Pasta | Responsabilidade |
| --- | --- |
| [`src/sim/`](../src/sim) | Regras do jogo. `config.ts` tem **todos os números**; `mission.ts`, o ciclo do sol; `cards.ts`, as cartas. Imports com extensão `.ts` (o Node roda direto). |
| [`src/scene/`](../src/scene) | Cena 3D: base na cratera Jezero (`MarsBase.ts`) e tripulação (`Crew.ts`). |
| [`src/ui/`](../src/ui) | Interface HTML sobre a cena: `Hud.ts` (barra, recursos, mensagens, plano), `dialogs.ts` (tutorial, cartas, relatório, fim, dados da NASA), `LoadingScreen.ts`. Sem framework. |
| [`src/i18n/`](../src/i18n) | Textos em PT e EN (`strings.ts`). O TypeScript obriga toda chave a existir nos dois idiomas. |
| [`src/data/`](../src/data) | Carregamento dos dados da NASA para o jogo. Coleta: [dados.md](dados.md). |
| [`src/render/`](../src/render) | Materiais cel-shading, contorno e paleta da Art Bible. |
| [`server/`](../server) | **Servidor do coop online (Go)**: salas por WebSocket e as mesmas regras de `src/sim` (porta com teste de paridade). Guia: [servidor-coop.md](servidor-coop.md). |
| [`src/core/`](../src/core) | `Game.ts` (orquestra tudo, clique na cena), `Input.ts` (teclado), `Physics.ts` (Rapier, só via `crewMotion`), `constants.ts` (gravidade de Marte com fonte). |
| [`public/data/`](../public/data) | Dados servidos ao jogo: erupções do DONKI (`donki-flares.json`) e missões históricas (`missions.json`, ainda não lidas pelo jogo). Gerados por scripts; não edite à mão. |
| [`scripts/`](../scripts) | `balance.ts` (equilíbrio), `fetch-donki.mjs` e `fetch-missions.mjs` (dados, ver [dados.md](dados.md) e [apis-nasa.md](apis-nasa.md)), `new-adr.mjs` (docs). |

Import com alias: `import { Mission } from '@/sim/mission'` (`@` = `src/`). Dentro de `src/sim/`, use caminhos relativos com `.ts`.

## Fluxo de um sol

Arquivo: [`src/core/Game.ts`](../src/core/Game.ts)

1. `beginSol()`: interface mostra o estado; se houver carta, abre a janela e espera a escolha.
2. O jogador distribui os blocos no plano de energia e clica em "Terminar o sol".
3. `endSol()`: a simulação resolve dia e noite e devolve o relatório. A cena escurece (noite), a tripulação
   some no abrigo se houver tempestade e a interface mostra os novos valores.
4. Relatório do sol (causa e efeito). Depois, o próximo sol ou a tela final.

## Inicialização e tamanho

1. `index.html` já contém a tela de carregamento (HTML/CSS inline).
2. `main.ts` é mínimo e só importa `ui/LoadingScreen`.
3. O jogo (`core/Game` e tudo que ele importa) vem por `import()` dinâmico.
4. O Rapier **não** está no pacote principal: `Game.start()` chama `import('@/scene/crewMotion')` em segundo plano
   ([ADR 0004](decisoes/0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md)). Enquanto carrega, a faixa
   da tripulação mostra "Carregando a física de Marte…"; se falhar, a faixa some e o jogo segue só com a interface.

**Regras:**
- Não importe nada de `core/`, `scene/`, `sim/` ou `render/` em `main.ts` ou `ui/LoadingScreen.ts`.
- Não importe `core/Physics.ts` nem `scene/crewMotion.ts` estaticamente em lugar nenhum (só `import type` ou `import()`).
- Confira com `npm run build`: o `index-*.js` deve ter poucos KB e nenhum chunk deve ter o Rapier.

## Build e hospedagem

`vite.config.ts` usa `base: './'`, então o `dist/` funciona em qualquer host estático, inclusive em subpasta (GitHub Pages).

## Testes

- `npm run typecheck` e `npm run build` (também no CI).
- `npm run balance`: 2.000 partidas por estratégia com a simulação real. Rode sempre que mudar `src/sim/config.ts`.
