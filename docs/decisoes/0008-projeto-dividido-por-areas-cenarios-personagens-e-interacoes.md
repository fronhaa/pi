# 0008. Projeto dividido por áreas: cenários, personagens e interações como dados

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** Willias Monzine (com Claude)

## Contexto

Somos 6 pessoas mexendo no mesmo jogo, com PRs mergeados rápido. Três arquivos concentravam quase tudo e viviam em
conflito: `src/core/Game.ts` (1.208 linhas, solo e grupo misturados, com 67 `if (coop)`), `src/scene/MarsBase.ts`
(1.226 linhas, com terreno, habitat, rover, céu e a Lua no meio) e `src/i18n/strings.ts` (787 linhas). Além disso:

- o tipo `Role` (personagens) nascia de posições da cena (`POSTS`), e não da simulação;
- a regra da EVA estava no cliente (`CrewTasks`) e copiada em Go, e o modo em grupo chamava a regra por um atalho
  (`Mission.prototype` aplicado a um objeto que não era Mission);
- o `CrewTasks` recebia uma Mission "falsa" no modo em grupo (`as unknown as Mission`);
- `src/sim` não tinha teste de unidade, só o `npm run balance`.

## Opções consideradas

1. **Deixar como está**: zero custo agora, mas cada cenário, personagem ou interação novo aumenta os mesmos 3 arquivos.
2. **Reescrever o protocolo coop em ações genéricas** (todas as regras do grupo em TS, Go só como sala): a solução mais
   limpa no papel, mas mexe no servidor inteiro (700 linhas de teste em Go) em plena reta final. Fica para depois.
3. **Dividir por áreas sem mudar regra nem protocolo**: módulos pequenos com dono claro e contratos tipados entre eles.

## Decisão

Opção 3, com estes padrões:

- **Personagens** são dados em `src/sim/crew.ts` (`ROLES`, `ROLE_DEFS`); a cena só diz onde ficam e como aparecem.
- **Interações** são dados (padrão Command): `MissionAction` + `applyAction` em `src/sim/actions.ts`. O solo, o
  `CrewTasks` (por uma `MissionPort`, `src/core/session.ts`) e a ponte do servidor (`bridge.apply`) usam a mesma função.
- **Regras da EVA** num lugar só: `src/sim/eva.ts`. O Go guarda só o estado da sala (que dupla está fora).
- **Cenários** (padrão Strategy): um módulo por lugar em `src/scenarios/` (cores, luz, gravidade, extras), aplicado
  pela `BaseScene`. A cena da base fica em partes em `src/scene/base/` (layout, terreno, habitat, prédios, rover, céu).
- **Modo em grupo** isolado em `src/core/coop/CoopMode.ts`; ponteiro em `src/core/ScenePointer.ts`; rotina da
  tripulação dentro da base em `src/scene/crewRoutine.ts`.
- **Textos** por assunto em `src/i18n/strings/` (PT e EN no mesmo arquivo).
- **Testes de unidade** do `sim` com `node:test` (`npm test`, sem dependência nova), também no CI.

Nada de regra mudou: o `npm run balance` dá o mesmo resultado da `main` e o `go test` passa.

## Consequências

- Cenário, personagem, interação, problema ou texto novo tem receita em [estrutura-do-projeto.md](../estrutura-do-projeto.md).
- PRs paralelos batem menos: cada área tem suas pastas.
- PRs abertos que mexiam em `MarsBase.ts`, `Game.ts` ou `strings.ts` precisam trazer a `main` e mover o trecho
  para o arquivo novo (a tabela "Onde foi parar" no guia ajuda).
- O protocolo coop continua com mensagens próprias por ação (opção 2 segue possível depois, em cima de `MissionAction`).
