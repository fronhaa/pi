# Arquitetura

O que o jogo é: [game-design.md](game-design.md). Por que a arquitetura é assim:
[ADR 0004](decisoes/0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md) e
[ADR 0008](decisoes/0008-projeto-dividido-por-areas-cenarios-personagens-e-interacoes.md).
**Quem mexe onde e receitas (cenário, personagem, interação, problema, carta, texto):**
[estrutura-do-projeto.md](estrutura-do-projeto.md).

## Visão geral

```
index.html   tela de carregamento em HTML/CSS (aparece na hora, sem JS)
main.ts      (~1,5 KB gzip)
  └── import('@/core/Game')        ← carregado sob demanda (~160 KB gzip: Three.js + jogo)
        ├── data/flares.ts         carrega public/data/donki-flares.json (erupções reais)
        ├── sim/Mission, actions   SIMULAÇÃO PURA: regras, números, eventos, cartas, ações
        ├── scenarios/             o que muda de um lugar para o outro (Marte, Lua)
        ├── scene/BaseScene, Crew  CENA 3D: só desenha o estado
        ├── ui/Hud, dialogs        INTERFACE: mostra o estado e repassa decisões
        ├── core/coop/CoopMode     modo em grupo (estado vem do servidor)
        └── import('@/scene/crewMotion')  ← em segundo plano (~1,65 MB gzip: Rapier)
              movimentação da tripulação: setas, clique, pulo, gravidade de Marte
```

A regra principal (GDD, "Tecnologia e arquitetura"):

```
interface ──decisões──► simulação ──estado──► interface e cena
```

- A **simulação** não conhece DOM nem Three.js. Roda igual no navegador e no Node (`npm run balance`).
- A **cena** nunca altera regras. Ela recebe um `SceneState` e mostra (poeira, plantas, sacos de regolito, bateria, alarme, noite).
- A **interface** nunca calcula regras. Ela pede uma ação (`{ type: 'answerCard' }`, `{ type: 'endSol', plan }`…) e redesenha.

### Interações como dados

Toda decisão que muda a missão é uma `MissionAction` (`src/sim/actions.ts`), aplicada por `applyAction`.
Quem joga fala com a missão por uma `MissionPort` (`src/core/session.ts`):

```
interface / CrewTasks ──port.dispatch(ação)──►  solo:  applyAction(missão local)
                                              grupo: CoopMode.port → servidor → applyAction (sim.js no Go)
```

Assim o mesmo código (`CrewTasks`, `Game`) roda no solo e no grupo sem `if`.

## Pastas

| Pasta | Responsabilidade |
| --- | --- |
| [`src/sim/`](../src/sim) | Regras do jogo. `config.ts` tem **todos os números**; `mission.ts`, o ciclo do sol; `actions.ts`, as interações como dados; `crew.ts`, os personagens (papéis); `eva.ts`, as regras da EVA; `cards.ts`, as cartas; `problems.ts`, os problemas; `historical.ts`, as missões históricas. Imports com extensão `.ts` (o Node roda direto). |
| [`src/scenarios/`](../src/scenarios) | Um módulo por lugar (`mars.ts`, `moon.ts`): cores do terreno, céu, Sol, gravidade, objetos só daquele lugar. Interface em `types.ts`. |
| [`src/scene/`](../src/scene) | Cena 3D: `BaseScene.ts` monta a base com as partes de `base/` (`layout.ts` = onde fica cada coisa, `terrain.ts`, `Habitat.ts`, `structures.ts`, `Rover.ts`, `Sky.ts`) e aplica o cenário; tripulação (`Crew.ts`), rotina dentro da base (`crewRoutine.ts`), movimento com física (`crewMotion.ts`, sob demanda) e caminho desviando das construções (`crewPath.ts`). |
| [`src/ui/`](../src/ui) | Interface HTML sobre a cena: `Hud.ts` (barra, recursos, mensagens, plano), `dialogs.ts` (tutorial, cartas, relatório, fim, dados da NASA), `coop.ts` (sala do grupo), `IntroGuide.ts` (balão do treino dos sóis 1 a 3), `LoadingScreen.ts`. Sem framework. |
| [`src/i18n/`](../src/i18n) | Textos em PT e EN, por assunto em `strings/` (`ui`, `crew`, `cards`, `report`, `nasa`, `coop`); `moon.ts` só com o que muda na Lua. O TypeScript obriga toda chave a existir nos dois idiomas. |
| [`src/data/`](../src/data) | Carregamento dos dados da NASA para o jogo: `missions.ts` (missões históricas, padrão) e `flares.ts` (erupções, reserva). Coleta: [dados.md](dados.md). |
| [`src/render/`](../src/render) | Materiais cel-shading, contorno, paleta da Art Bible e carregamento de modelos `.glb`. |
| [`src/net/`](../src/net) | Cliente do modo em grupo: conexão com o servidor coop e tipos do protocolo. Ver [servidor-coop.md](servidor-coop.md). |
| [`server/`](../server) | **Servidor do coop online (Go)**: salas por WebSocket; as regras são o próprio `src/sim`, empacotado em JS e rodando dentro do Go (ADR 0006). Guia: [servidor-coop.md](servidor-coop.md). |
| [`src/core/`](../src/core) | `Game.ts` (loop, fluxo do solo, câmera; liga as peças), `session.ts` (`MissionPort`: missão local ou do servidor), `coop/CoopMode.ts` (modo em grupo), `ScenePointer.ts` (clique e hover na cena), `CrewTasks.ts` (tempo da tripulação e EVA: quem está dentro, na câmara ou fora), `intro.ts` (treino dos sóis 1 a 3: passos do guia e demonstrações só visuais), `Input.ts` (teclado), `Physics.ts` (Rapier, só via `crewMotion`), `constants.ts` (gravidades com fonte). |
| [`tests/sim/`](../tests/sim) | Testes de unidade das regras (`npm test`, com `node:test`). |
| [`public/data/`](../public/data) | Dados servidos ao jogo: erupções do DONKI (`donki-flares.json`) e missões históricas (`missions.json`). Gerados por scripts; não edite à mão. |
| [`scripts/`](../scripts) | `balance.ts` (equilíbrio), `fetch-donki.mjs` e `fetch-missions.mjs` (dados, ver [dados.md](dados.md) e [apis-nasa.md](apis-nasa.md)), `new-adr.mjs` (docs). |

Import com alias: `import { Mission } from '@/sim/mission'` (`@` = `src/`). Dentro de `src/sim/`, use caminhos relativos com `.ts`.

## Fluxo de um sol

Arquivo: [`src/core/Game.ts`](../src/core/Game.ts)

No modo em grupo o servidor conduz estas fases; o `Game` só reage ao estado (`CoopMode`).

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

- `npm run typecheck`, `npm test` (regras do `src/sim`, em `tests/sim/`) e `npm run build` (também no CI).
- `npm run balance`: 2.000 partidas por estratégia com a simulação real. Rode sempre que mudar `src/sim/config.ts`.
