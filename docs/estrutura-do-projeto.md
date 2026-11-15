# Estrutura do projeto: quem mexe onde

Guia para o time de 6 pessoas: como o código está dividido, que área cuida de quê e a **receita** para as
mudanças mais comuns (cenário novo, personagem novo, interação nova…). A decisão por trás está no
[ADR 0008](decisoes/0008-projeto-dividido-por-areas-cenarios-personagens-e-interacoes.md); o desenho geral, em
[arquitetura.md](arquitetura.md).

> Regra de ouro: **regras no `src/sim`, aparência no `src/scene` e `src/scenarios`, texto no `src/i18n`,
> tela no `src/ui`, e o `src/core` só liga as peças.** Se você está escrevendo regra fora do `src/sim`, pare e mova.

## Mapa

```
src/
├── sim/                 REGRAS (sem DOM, sem Three.js; roda no Node, no navegador e no servidor Go)
│   ├── config.ts        todos os números de jogo (mudou? npm run balance)
│   ├── mission.ts       o ciclo do sol: carta → plano → dia → noite → relatório
│   ├── actions.ts       INTERAÇÕES como dados: MissionAction + applyAction
│   ├── crew.ts          PERSONAGENS: ROLES, Role, ROLE_DEFS (quem decide o quê)
│   ├── eva.ts           regras da EVA (dupla, uma por vez, proibida na tempestade)
│   ├── problems.ts      problemas pela base (tempo de conserto, dentro/fora)
│   ├── cards.ts         cartas de decisão e seus efeitos
│   ├── day.ts           conta do dia e da noite (energia, vida, dose)
│   ├── historical.ts    missões históricas reais
│   └── bridge.ts        ponte para o servidor Go (empacotada em server/internal/sim/simjs/sim.js)
├── scenarios/           CENÁRIOS: o que muda na aparência de um lugar para o outro
│   ├── types.ts         interface Scenario (cores, céu, Sol, gravidade, "sem ar", extras)
│   ├── mars.ts, moon.ts um arquivo por lugar
│   └── index.ts         SCENARIOS (o TypeScript exige um por Location)
├── scene/               CENA 3D (só desenha o estado)
│   ├── BaseScene.ts     monta a base e aplica o cenário; recebe SceneState
│   ├── base/
│   │   ├── layout.ts    MAPA: onde fica cada prédio, posto, porta, problema, passarela e escadas
│   │   ├── terrain.ts   chão, mesas, pedras
│   │   ├── Habitat.ts   módulos, interior, janelas, modelo .glb
│   │   ├── structures.ts cúpula, base de comunicação, painéis, bateria, abrigo (mostram os recursos; .glb do Marcelo)
│   │   ├── Rover.ts     rover andando, estudando, desviando, atolado
│   │   └── Sky.ts       céu, Sol, estrelas, Terra, poeira no ar
│   ├── Crew.ts          visual dos astronautas (cor por papel, chibi .glb, poses)
│   ├── crewRoutine.ts   rotina dentro da base (posto → academia → quarto; senta e deita na cama; descansa antes da academia)
│   ├── crewMotion.ts    física de andar (Rapier, sob demanda)
│   └── ProblemMarkers.ts os "!" na cena
├── core/                ORQUESTRAÇÃO (liga sim, cena e interface)
│   ├── Game.ts          loop, fluxo do solo, câmera
│   ├── session.ts       MissionPort: a missão vista por quem joga (local ou servidor)
│   ├── CrewTasks.ts     tempo e lugar da tripulação (quem está dentro, na câmara, fora)
│   ├── ScenePointer.ts  clique e hover na cena
│   └── coop/CoopMode.ts modo em grupo (estado do servidor, envio das decisões)
├── ui/                  INTERFACE HTML (mostra e repassa decisões)
├── i18n/
│   ├── strings/         textos por assunto, PT e EN lado a lado:
│   │                    ui, crew, cards, report, nasa, coop
│   └── moon.ts          só os textos que mudam na Lua
├── net/                 cliente e protocolo do modo em grupo
├── render/              materiais toon, paleta, modelos .glb
└── data/                leitura dos dados da NASA
tests/sim/               testes de unidade das regras (npm test)
server/                  servidor coop em Go (salas); regras vêm do sim.js
```

### Quem pode importar quem

```
sim  ←  scenarios, scene, ui, net  ←  core
```

- `src/sim` não importa nada de fora dele (nem `@/`): imports relativos com `.ts`.
- `scene`, `scenarios` e `ui` podem ler **tipos e números** do `sim`, nunca mudar o estado.
- Só o `core` junta tudo. `ui` não importa `scene` e vice-versa.
- `main.ts` e `ui/LoadingScreen.ts` não importam nada disso de forma estática (o jogo vem por `import()`).

## As 6 áreas do time

Cada área tem um **dono** (revisa os PRs daquela pasta) e um **reserva**. Preencham os nomes; com os usuários do
GitHub dá para criar o `.github/CODEOWNERS` e o GitHub pede a revisão sozinho.

| Área | Pastas | Cuida de | Dono / reserva |
| --- | --- | --- | --- |
| 1. Regras e equilíbrio | `src/sim/`, `tests/sim/`, `scripts/balance.ts` | ações, números, `npm run balance`, `sim.js` | _a definir_ |
| 2. Cenários e base | `src/scenarios/`, `src/scene/BaseScene.ts`, `src/scene/base/` | lugares (Marte, Lua…), prédios, rover, céu | _a definir_ |
| 3. Personagens e movimento | `src/scene/Crew.ts`, `crewRoutine.ts`, `crewMotion.ts`, `crewPath.ts`, `src/core/CrewTasks.ts`, `src/render/` | tripulação, animação, física, EVA na cena | _a definir_ |
| 4. Interface e público 7–12 | `src/ui/`, `src/core/Game.ts`, `src/core/ScenePointer.ts` | HUD, janelas, fluxo do sol, acessibilidade, checklist do público | _a definir_ |
| 5. Modo em grupo e infra | `src/net/`, `src/core/coop/`, `server/`, `.github/` | salas, protocolo, deploy, CI | _a definir_ |
| 6. Ciência e conteúdo | `docs/ciencia-marte.md`, `src/i18n/`, `src/data/`, `public/data/` | fatos com fonte, textos PT/EN, dados da NASA, apresentação | _a definir_ |

Mexeu fora da sua área? Tudo bem, só peça revisão ao dono dela.

## Receitas

Cada receita lista **todos** os lugares. Se o TypeScript reclamar de um `Record<…>` incompleto, é ele lembrando
de um passo.

### Cenário novo (um lugar novo para a base)

1. **Regra:** `src/sim/config.ts`, acrescente o lugar em `Location` e os números que mudam (como `CONFIG.moon`).
   Use `state.location` na `Mission` onde a regra muda. Rode `npm run balance`.
2. **Visual:** crie `src/scenarios/<lugar>.ts` com um `Scenario` (cores do terreno, céu, Sol, gravidade com fonte
   em `src/core/constants.ts`, `airless`, `restDarkness`, `buildExtras` para objetos só dele). Registre em
   `src/scenarios/index.ts`. Cor nova vai em `PALETTE`/`MOON_PALETTE` (`src/render/toon.ts`) e em
   [estilo-visual.md](estilo-visual.md).
3. **Textos:** só o que muda, num arquivo como `src/i18n/moon.ts`, ligado em `src/i18n/index.ts` (`t()`).
4. **Escolha do lugar:** `showPlaceChoice` em `src/ui/dialogs.ts` e as chaves `place.*` em `src/i18n/strings/ui.ts`.
5. **Ciência:** todo fato do lugar entra antes em `docs/ciencia-marte.md`, com fonte. Regra nova vai para o GDD.
6. **Modo em grupo:** hoje é só Marte (ADR 0007). Levar um lugar para o grupo mexe no protocolo (área 5).

### Personagem novo (um papel na tripulação)

1. `src/sim/crew.ts`: acrescente em `ROLES` e em `ROLE_DEFS` (`block` = parte do plano que ele decide no grupo,
   `leads` = responde as cartas). Rode `npm test`.
2. `src/scene/base/layout.ts`: `POSTS`, `HABITAT_SPOTS` e `BUNK_SPOTS` (o TypeScript cobra os três). Confira se o
   ponto fica fora das caixas de colisão.
3. `src/scene/Crew.ts`: a cor do papel em `ROLE_COLORS`.
4. Textos `crew.<papel>` em `src/i18n/strings/crew.ts` (PT e EN) e a explicação do papel em `coop.role.*`.
5. Modo em grupo: o papel também existe no Go (`server/internal/coop/game.go`, `MarsRoles` e `BlockRole`) e em
   `COOP_ROLES` (`src/net/protocol.ts`). Mude os dois lados juntos (área 5) e rode `go test ./...`.
6. Interface: as teclas 1–4 e a lista da EVA (`src/ui/Hud.ts`) assumem 4 papéis; confira com 5.

### Interação nova (uma decisão do jogador que muda a missão)

1. `src/sim/actions.ts`: um caso novo em `MissionAction` e no `switch` de `applyAction`.
2. A regra em si: um método na `Mission` ou num módulo de `src/sim` (como `eva.ts`). Números em `config.ts`.
3. Um teste em `tests/sim/` (`npm test`).
4. Quem dispara: a interface (`src/ui`) chama um callback; o `Game` faz `this.port.dispatch({ type: … })`.
   Com `this.port`, a mesma linha funciona no solo e no grupo.
5. Modo em grupo: o servidor precisa receber a ação. Hoje cada ação tem mensagem própria no protocolo
   (`src/net/protocol.ts` + `server/internal/coop/`); a porta do grupo (`CoopMode.port`) traduz a ação.
   A ponte já tem `bridge.apply(actionJson)`, que aplica qualquer `MissionAction` no servidor.
6. Regra nova vai para o GDD; texto novo, para o i18n.

### Problema novo pela base

1. `src/sim/types.ts`: o tipo em `ProblemKind`.
2. `src/sim/problems.ts`: em `PROBLEMS` (segundos de conserto, dentro ou fora). Se fora, já exige EVA (`eva.ts`).
3. O efeito de não consertar: `src/sim/day.ts`. Rode `npm run balance`.
4. `src/scene/base/layout.ts`: o lugar em `PROBLEM_SPOTS` (o TypeScript cobra), alcançável a pé.
5. Textos `problem.<tipo>` e `problem.<tipo>.where` em `src/i18n/strings/crew.ts`.

### Carta nova

1. `src/sim/types.ts`: o id em `CardId`. `src/sim/cards.ts`: em `CARDS` (opções) e o efeito em `applyCardOption`.
   Só existe em Marte? Também em `MARS_ONLY_CARDS`. Números em `config.ts`; rode `npm run balance`.
2. Textos `card.<id>.*` em `src/i18n/strings/cards.ts`. Fato real por trás dela: `docs/ciencia-marte.md`.

### Prédio ou objeto novo na base

1. Posição em `src/scene/base/layout.ts`. Objeto que mostra um recurso vai em `structures.ts` (e muda em
   `setState`); um sistema maior ganha arquivo próprio em `src/scene/base/` e é montado pela `BaseScene`.
2. Use `toonMesh`/`toonMaterial` e cores de `PALETTE`. Bloqueia a passagem? `addObstacle(...)`.
3. Muda de cor em outro lugar? Use cores de terreno (`soil`, `rock`, `lit`, `dust`) ou trate no cenário.

### Modelo 3D (.glb) novo

`public/assets/models/<nome>.glb` (kebab-case, até ~1 MB), registro em `SCENERY_MODELS`
(`src/render/sceneryModel.ts`) e troca do modelo simples num `useModel()` da peça (como `Habitat` e `Rover`).
O modelo simples continua como reserva se o .glb falhar. Doc do modelo em `docs/`.

### Texto novo

No arquivo do assunto em `src/i18n/strings/`, nos dois idiomas, com a mesma chave. Passe no checklist de
[publico-e-impacto.md](publico-e-impacto.md). Muda na Lua? Também em `src/i18n/moon.ts`.

## Onde foi parar (antes → agora)

| Antes | Agora |
| --- | --- |
| `src/scene/MarsBase.ts` (`POSTS`, `HABITAT_SPOTS`, `BUNK_SPOTS`, `GYM_STATIONS`, `ENTRANCES`, `PROBLEM_SPOTS`, `terrainHeight`) | `src/scene/base/layout.ts` |
| `MarsBase` (classe) | `BaseScene` (`src/scene/BaseScene.ts`) + partes em `src/scene/base/` |
| `MarsBase.buildMoonExtras`, cores da Lua, `SKIES` | `src/scenarios/moon.ts`, `src/scenarios/mars.ts` |
| `type Role` (de `MarsBase`), `ROLES` (de `scene/Crew`) | `src/sim/crew.ts` |
| `Mission.evaBanned` (regra) | `src/sim/eva.ts` (`isEvaBanned`); `Mission.evaBanned` continua e delega |
| `Game.showCrewInside` | `src/scene/crewRoutine.ts` |
| `Game.setupPointer`, `setupHover` | `src/core/ScenePointer.ts` |
| `Game.startCoop`, `onCoopState`, `coopView`, `coopCrewTick`… | `src/core/coop/CoopMode.ts` |
| `Game.coopTaskMission` (Mission falsa) | `CoopMode.port` (`MissionPort`, `src/core/session.ts`) |
| `src/i18n/strings.ts` (787 linhas) | `src/i18n/strings/{ui,crew,cards,report,nasa,coop}.ts` |

## Como trabalhar em 6

- **Branch curta, PR pequeno, um assunto.** Traga a `main` antes de abrir (outras pessoas mergeiam rápido).
- **Contrato primeiro.** Mudar `src/sim/types.ts`, `actions.ts`, `crew.ts`, a interface `Scenario` ou o protocolo
  é um PR próprio, revisado pela área 1 (ou 5). Depois cada um constrói em cima, em paralelo.
- **Antes de pedir revisão:** `npm run typecheck`, `npm test` e `npm run build`. Mexeu em `src/sim`: também
  `npm run balance` e commit do `sim.js`. Mexeu em `server/` ou no protocolo: `cd server && go test ./...`.
- **Visual mudou?** Screenshot no PR. **Texto, interface ou mecânica?** Checklist do público 7–12.
