# 0012. Sóis de introdução

- **Status:** Aceito
- **Data:** 2026-11-15
- **Autores:** @wnmonzine

## Contexto

O jogo começava com um tutorial de 3 telas (texto) e já no sol 2 podiam vir cartas, no sol 3 os problemas pela base e a
tempestade de poeira. Para crianças de 7 a 12 anos é muita coisa nova de uma vez, e o tutorial em texto não mostrava a
base: a criança não via que as cápsulas são fechadas de verdade (no jogo elas são transparentes), não via a mensagem da
Terra chegando com atraso, nem a diferença entre a energia do dia e a da noite.

O time pediu que os primeiros dias sejam um treino: mostrar a cápsula sem e depois com transparência, a comunicação com
a Terra, o uso de energia de dia e de noite, e os fenômenos (poeira e tempestade solar) de forma breve, só para
demonstrar, explicando que uma tempestade de poeira em Marte pode durar muito mais (F27: "semanas a meses", NASA).

## Opções consideradas

1. **Quantos sóis:** só o sol 1 (pesado demais), sóis 1 e 2, ou **sóis 1 a 3** (escolhido pelo time). As tempestades
   solares e as missões históricas já começam no sol 4, então 3 sóis cabem sem mexer nas datas reais.
2. **Dentro dos 15 sóis** (escolhida) ou sóis extras antes da missão (17 no total; desalinha as janelas históricas de
   15 sóis do DONKI e do Horizons e muda o servidor coop).
3. **Fenômenos só como demonstração visual** (escolhida) ou com um efeito pequeno nos números (mexeria em `src/sim`, no
   balanceamento e no servidor só para um treino).
4. **Depois do treino:** casco sempre transparente, ou **um botão 👁️ para ver por dentro e por fora** (escolhida).

## Decisão

Os sóis 1 a 3 são um treino guiado dentro dos 15 sóis. Nas regras, eles não têm cartas, problemas nem tempestade de
poeira (`CONFIG.intro`, `cards.firstSol`, `problems.firstSol` e `dustStorm.firstSol` passam a 4). Um guia na tela (só
solo) mostra até 3 passos por vez, e a cena faz as demonstrações só no visual. Um botão 👁️ no topo fecha e abre o casco.

## Consequências

- `src/sim/config.ts`: `intro: { sols: 3 }`; cartas, problemas e poeira começam no sol 4. `npm run balance` mantém a
  forma (a estratégia "reage aos alertas" ganha um pouco mais de 3★). `server/internal/sim/simjs/sim.js` reconstruído.
- `src/core/intro.ts` (novo): os passos de cada sol e o que a cena faz neles. `src/ui/IntroGuide.ts` (novo): o balão.
  `src/i18n/strings/intro.ts` (novo) e chaves da Lua em `src/i18n/moon.ts`.
- `src/scene/BaseScene.ts`: `setHullsOpen` (casco opaco ou transparente, com `setHullOpen` de `src/render/toon.ts`) e
  `setDemo` (céu de poeira, alarme e antena, ou sombra na Lua), só visual.
- `src/core/Game.ts`: a missão solo começa direto no treino (o "Como jogar" continua no topo); nos sóis de treino sem
  problemas, um dia curto de 12 s (visual) mostra o Sol cruzando o céu.
- Em grupo, as regras são as mesmas (o servidor roda o mesmo `src/sim`), mas sem o guia nem o dia curto; o protocolo não
  muda.
- Fato novo F27 em `docs/ciencia-marte.md`; GDD, "Introdução: sóis 1 a 3".
