# 0005. Servidor coop em Go com as regras

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** time Missão Jezero

## Contexto

O time quer o **modo cooperativo online**, cada jogador no seu aparelho. Antes o GDD previa só o coop no mesmo aparelho para o hackathon e o online "depois, precisa de servidor".
O jogo é um site estático, e as regras ficam numa simulação pura em TypeScript (`src/sim/`, [ADR 0004](0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md)).
O servidor vai rodar num container no VPS do time. Linguagem escolhida pelo time: **Go**.

## Opções consideradas

1. **Servidor só repassa mensagens; um aparelho (anfitrião) roda a simulação TS:** dá pouco trabalho e as regras ficam num lugar só. Mas se o anfitrião sair, a partida acaba, e o anfitrião pode mexer no estado.
2. **Servidor com as regras (autoritativo), em Go:** o servidor manda na partida, ninguém trapaceia, a partida não depende de um aparelho e cada papel só vê o que deve (a Terra não vê o plano; Marte não vê a previsão). Mas as regras ficam em **dois lugares** (TS e Go).
3. **Servidor com as regras, em Node/TypeScript:** reaproveita `src/sim` sem duplicar. Mas não é a linguagem escolhida pelo time.

## Decisão

**Opção 2**, com uma trava contra a duplicação: **teste de paridade**.

- `server/internal/sim` é uma porta linha a linha de `src/sim`, incluindo o mesmo gerador aleatório (mulberry32).
- `npm run sim:golden` joga 360 partidas com a simulação TS e grava um hash do estado a cada passo (`server/internal/sim/testdata/golden.json`). O `go test` repete as mesmas ações e exige o mesmo hash em todos os passos.
- O CI regenera os traços e falha se eles mudarem sem a porta Go acompanhar.
- Toda multiplicação de float em Go passa por `mul()`, que força o arredondamento. Sem isso, o compilador funde a*b+c (FMA, no arm64) e o resultado difere do JavaScript. Esse bug apareceu de verdade e o teste pegou.

## Consequências

- Mudou uma regra em `src/sim/`? É preciso mudar `server/internal/sim/`, rodar `npm run sim:golden` e `go test ./...` em `server/`. O `CLAUDE.md` e o [guia do servidor](../servidor-coop.md) dizem isso.
- O jogo solo e o coop no mesmo aparelho continuam sem servidor; o online é um modo a mais.
- O servidor é outro serviço para manter no VPS (container, HTTPS, atualização). O guia explica.
- Nada de dado pessoal no servidor: sem nome, sem conta, tudo em memória (crianças, LGPD).
