# 0013. Níveis de dificuldade só com escala de jogo

- **Status:** Proposto
- **Data:** 2026-11-15
- **Autores:** Guilherme Possebon (com Claude Code)

## Contexto

O público vai de 7 a 12 anos (`docs/publico-e-impacto.md`). Um nível só é difícil para quem tem 7 anos e fácil
para quem tem 12. O jogo também precisa usar dados reais da NASA (tempestades do DONKI, atrasos do JPL Horizons,
missões históricas). Esses dados não podem ficar mais fracos ou mais fortes para facilitar.

## Opções consideradas

1. **Mesmas regras, números diferentes por nível**: a lição é a mesma nos 3 níveis, a mudança é barata e o
   `npm run balance` mede cada nível. Contra: o Difícil fica "mais apertado", não "diferente".
2. **Regras diferentes por nível** (ex.: Fácil sem radiação): o Fácil fica mais simples. Contra: quebra a lição
   principal (energia × proteção) e dobra teste e textos.
3. **Dificuldade automática**: não precisa de tela a mais. Contra: invisível para o professor, difícil de balancear,
   e as estrelas perdem o sentido.
4. **Enfraquecer as tempestades no Fácil**: daria o maior efeito. Contra: deixa de ser dado real da NASA (descartado
   pelo time).

## Decisão

**Opção 1.** Perfis `easy`, `medium` e `hard` em `src/sim/config.ts` (`DIFFICULTY`), com só escala de jogo: blocos
por sol, bateria e suporte de vida no começo, cartas, problemas por dia, duração do dia e meta de ciência. Uma regra
de interface: o Difícil esconde o resultado da noite na prévia. **Nunca mudam com o nível:** força e sóis das
tempestades solares, atrasos reais, missões históricas (só o sorteio entre elas), tempestade de poeira e luz da Lua.
O teste `tests/sim/difficulty.test.ts` garante isso.

## Consequências

- O Médio é exatamente o jogo de antes: mesmos números e mesmos sorteios, e o `balance` não mudou.
- A mesma semente dá os mesmos sóis em todos os níveis (os sorteios não dependem do nível).
- Número de nível novo: rode `npm run balance` (ou `BALANCE_LEVEL=hard npm run balance`) e atualize a tabela de
  equilíbrio em `docs/game-design.md#níveis-de-dificuldade`.
- Modo em grupo: o dono da sala escolhe o nível (ação `level`, `docs/servidor-coop.md`). O servidor Go não guarda
  número nenhum de nível: lê os níveis válidos e a duração do dia de `config().difficulty`, que vem do TypeScript.
