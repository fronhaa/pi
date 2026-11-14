# Rover e base de pesquisa (GLB)

Modelos gerados por código (Three.js) no mesmo estilo do astronauta chibi, inspirados no rover e na Moon Base da NASA. Escala: 1 unidade = 1 m; astronauta = 1,85 m. Origem no chão. Fontes em `art-source/scenery/`.

## research-base.glb

Bloco "base de pesquisa", o mesmo modelo na Lua e em Marte. Os próximos blocos se ligam pelas portas de acoplamento.

- Porta de acesso no chão (1,0 x 1,95 m), 10 cm mais alta que o astronauta, sem escada: o astronauta anda até a porta e some em `(0, 0, 4,1)`; a subida acontece dentro do tubo de acesso.
- Marcadores de acoplamento `port_a` / `port_b` (escotilha de ~1,96 m).
- Clipes: `observatory_scan` (24 s) e `weather_spin` (1,2 s).

## rover.glb

Rover com rodas de raios em espiral, radiador atrás, faróis/LEDs e broca na frente (+X).

- Rodas `wheel_0..5`: girar em Z por distância / 0,34 (raio da roda).
- Clipes: `scan` (mastro) e `drill` (broca, 5 s).

## Ao trocar o material por toon

Preservar `name`, `emissive`, transparência, `map`, `alphaTest` e `vertexColors`. Contorno: `userData.outline` (0 = sem contorno). Sombra: `sun.shadow.normalBias = 0.05`.

Materiais que o jogo pode procurar pelo nome: `window`, `alarm`, `antenna_tip`, `plant`, `dome_glass`, `warning`, `rover_lights`, `base_lights`, `label`.
