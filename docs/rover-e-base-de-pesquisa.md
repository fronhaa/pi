# Rover e base de pesquisa (GLB)

Modelos gerados por código (Three.js) no mesmo estilo do astronauta chibi, inspirados no rover e na Moon Base da NASA. Escala: 1 unidade = 1 m; astronauta = 1,85 m. Origem no chão. Fontes em `art-source/scenery/`.

## research-base.glb

Bloco "base de pesquisa", o mesmo modelo na Lua e em Marte. Os próximos blocos se ligam pelas portas de acoplamento.

- Porta de acesso no chão (1,0 x 1,95 m), 10 cm mais alta que o astronauta, sem escada: o astronauta anda até a porta e some em `(0, 0, 4,1)`; a subida acontece dentro do tubo de acesso.
- Marcadores de acoplamento `port_a` / `port_b` (escotilha de ~1,96 m).
- Clipes: `observatory_scan` (24 s) e `weather_spin` (1,2 s).
- No jogo, o mesmo bloco aparece 4 vezes, arranjado em estrela em volta da cúpula (laboratório, alojamento, academia e a
  dois módulos de quartos no raio sul). Só a posição muda; o design é o mesmo. Ver `src/scene/base/layout.ts` e
  [estilo-visual.md](estilo-visual.md).

## rover.glb

Rover com rodas de raios em espiral, radiador atrás, faróis/LEDs e broca na frente (+X).

- Rodas `wheel_0..5`: girar em Z por distância / 0,34 (raio da roda).
- Clipes: `scan` (mastro) e `drill` (broca, 5 s).

## Ao trocar o material por toon

Preservar `name`, `emissive`, transparência, `map`, `alphaTest` e `vertexColors`. Contorno: `userData.outline` (0 = sem contorno). Sombra: `sun.shadow.normalBias = 0.05`.

Materiais que o jogo pode procurar pelo nome: `window`, `alarm`, `antenna_tip`, `plant`, `dome_glass`, `warning`, `rover_lights`, `base_lights`, `label`.

## No jogo: o rover de ciência não tem garagem

Como o Perseverance ([ciencia-marte.md](ciencia-marte.md), F23 a F25; [ADR 0011](decisoes/0011-rover-sem-garagem-e-quartos-no-raio-sul.md)):
o rover **não volta a uma base**. Ele começa a partida lá fora (`ROVER_START`), explora a cratera e, a cada sol com
ciência, as **3 primeiras paradas de estudo enchem tubos** (a regra dos tubos é de `src/sim/day.ts`); depois ele segue
explorando e **fotografando**, com o braço guardado, sem encher tubos. Os tubos ficam **guardados dentro dele**. À noite
(ou sem blocos de ciência) ele **para onde estiver** e continua no sol seguinte.
