# 0007. Base lunar como segundo lugar: location na simulação e textos por lugar

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** Guilherme Possebon

## Contexto

O desafio aceita um posto "na Lua ou em Marte". Queremos a Lua como segundo lugar jogável no modo solo, com
regras que mudem de verdade (radiação, atraso, poeira, sombra), sem duplicar o jogo e sem quebrar o modo em grupo,
que roda o mesmo `src/sim` dentro do servidor Go (ADR 0006). Quase todo texto do jogo fala de "sol" e de Marte.

## Opções consideradas

1. **Só trocar o visual (skin lunar)**: rápido, mas mostraria números de Marte como se fossem da Lua (fere a honestidade de dados).
2. **Uma segunda simulação (`MoonMission`)**: regras separadas e claras, mas duplica o loop e o servidor teria de conhecer as duas.
3. **Um campo `location` na simulação + tabela `CONFIG.moon` só com o que muda + camada de textos por lugar**: um loop só; Marte continua exatamente igual (mesma sequência de sorteios).

## Decisão

Opção 3. `Mission` recebe `location` (`'mars'` padrão) e guarda em `GameState.location`; os números que mudam ficam em
`CONFIG.moon`. Os textos da Lua ficam em `src/i18n/moon.ts` e substituem os de Marte quando `setPlace('moon')`
(só as chaves que mudam). O modo em grupo continua só em Marte: `bridge.newMission` aceita `location` opcional e o
servidor de hoje não manda.

## Consequências

- Mudou uma regra que vale para os dois lugares? Confira as duas colunas do `npm run balance` (Marte e LUA).
- Texto novo que fala de "sol" ou de Marte: veja se precisa de versão em `src/i18n/moon.ts`.
- O Go ganhou os campos `location` e `shadowSol` em `GameState` (o teste de ida e volta do estado exige).
- Lua no modo em grupo fica para depois: precisa de escolha de lugar na sala (protocolo), `location` no `newMission`
  do servidor e `delayMin: 0` sem `omitempty` nas mensagens.
