# 0006. Servidor roda as regras do TypeScript (goja)

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** time Missão Jezero
- **Substitui em parte:** [0005](0005-servidor-coop-em-go-com-as-regras.md) (o servidor continua em Go e continua mandando na partida; muda **de onde vêm as regras**)

## Contexto

No [ADR 0005](0005-servidor-coop-em-go-com-as-regras.md), as regras foram portadas à mão para Go, com um teste de paridade contra o TypeScript.
No mesmo dia, `src/sim` mudou duas vezes (problemas pela base, missões históricas), e cada mudança exigiu reescrever a regra em Go.
Durante o hackathon as regras mudam todo dia: manter duas cópias custa o dobro e exige que quem mexe em `src/sim` saiba Go.

## Opções consideradas

1. **Manter as duas cópias (TS e Go) com teste de paridade:** já funcionava. Mas toda mudança de regra custa o dobro.
2. **O servidor Go executa o próprio `src/sim`, compilado para JS, com [goja](https://github.com/dop251/goja):** regras num lugar só e o servidor continua em Go. Custa um motor JavaScript por sala (medido: ~170 KB de memória, 0,4 ms para criar, 0,2 ms por ação).
3. **Reescrever o servidor em Node/TypeScript:** regras num lugar só. Mas joga fora o Go, que foi a linguagem escolhida, e o trabalho já testado.

## Decisão

**Opção 2.**

- `npm run sim:bundle` empacota `src/sim/bridge.ts` (e tudo de `src/sim`) em `server/internal/sim/simjs/sim.js`. Ele também roda dentro do `npm run build`.
- O Go embute esse arquivo no binário e expõe a mesma interface de antes (`sim.NewMission`, `AnswerCard`, `EndSol`, problemas…). Salas, WebSocket, papéis e relógio do dia não mudaram.
- Cada sala tem o próprio runtime JS (goja não é seguro para uso concorrente; a sala já usa um mutex).
- `TestStateRoundTrip` joga 150 partidas aleatórias e garante que o estado passa do JS para os structs Go **sem perder nenhum campo**.
- O CI falha se o `sim.js` commitado estiver desatualizado em relação a `src/sim`.

## Consequências

- **Mudou uma regra em `src/sim`?** Rode `npm run build` (ou `npm run sim:bundle`) e commite o `sim.js` junto. Não precisa mexer em Go.
- **Só precisa mexer em Go** se aparecer um campo novo em `src/sim/types.ts` que o servidor precise ler ou repassar (o `TestStateRoundTrip` aponta qual).
- A porta manual (`mission.go`, `cards.go`, `problems.go`…) e o `npm run sim:golden` foram removidos.
- O container precisa de um pouco mais de memória: limite de 256 MB no `compose.yaml` (1.000 salas ≈ 170 MB).
