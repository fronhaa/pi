# 0005. Gravidade real com dados da NASA

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** time Missão Jezero

## Contexto

A gravidade estava em −20 m/s², um valor "arcade" sem base real. O desafio pede que a criança entenda restrições reais do espaço, e a [Art Bible](../art-bible.md#7-fundamentação-científica) exige fundamentação científica verificável.
O time decidiu que a física deve seguir os dados da NASA. A Lua pode entrar como segunda missão, se Marte terminar a tempo.

## Opções consideradas

1. **Manter −20 (arcade):** o pulo fica "gostoso". Mas é falso e contradiz o propósito educativo.
2. **Gravidade real, com pulo e movimento recalibrados:** é real, ensina por si só (pulo alto e queda lenta) e vale para Marte e Lua com o mesmo código. Exige ajustar `JUMP_SPEED`.
3. **Gravidade real só como texto na tela, física arcade:** dá pouco trabalho. Mas a criança não sente a diferença.

## Decisão

Opção 2. A gravidade vem de `CELESTIAL_BODIES` em `src/core/constants.ts`: Marte **3,7 m/s²** ([NASA Glenn](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/)) e Lua **1,624 m/s²** ([NASA Science](https://science.nasa.gov/moon/by-the-numbers/)).
`Physics.create(body)` escolhe o corpo, e o padrão é Marte. O pulo usa a velocidade de impulso de um salto de 0,5 m na Terra (3,1 m/s), então a altura resulta da gravidade real.

## Consequências

- Em Marte o pulo chega a ~1,3 m; na Lua, a ~3 m. A diferença é visível e pode virar um "Você sabia?".
- A missão lunar já tem a física pronta: basta `Physics.create('moon')`.
- Todo número real de física precisa de fonte aberta e citada em [fisica.md](../fisica.md#gravidade-real).
- Velocidade de caminhada (`MOVE_SPEED`) continua sendo constante de jogo, não um dado real.
- A ficha NSSDC (3,73 m/s² para Marte) estava fora do ar em 14/11/2026; conferir quando voltar.
