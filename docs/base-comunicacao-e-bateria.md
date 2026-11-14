# Base de comunicação e placas solares com bateria (GLB)

Modelos gerados por código (Three.js) no estilo do astronauta chibi. Escala: 1 unidade = 1 m; astronauta = 1,85 m. Origem no chão. Fontes em `art-source/scenery/`.

## comm-base.glb

Terceiro bloco da base (o mesmo na Lua e em Marte): a torre de antena da primeira estação, no formato dos blocos. Caixa com o mesmo piso, a mesma altura e as mesmas portas de acoplamento dos blocos cilíndricos, porta de 1,95 m no chão e, em cima, plataforma com grade, mastro treliçado (~10,3 m), parabólica, rádio-cúpula e luz de alerta.

- `hatch_door`: o astronauta entra em `(0, 0, 4,1)` e some.
- `port_a` (-X) e `port_b` (+X): portas de acoplamento, iguais às dos outros blocos.
- `alarm_light` (material `alarm`) no topo do mastro; `antenna_tip` (material `antenna_tip`) na parabólica.
- Clipes: `dish_scan` (grupo `dish`, 8 s, laço) e `radome_spin` (grupo `radome_spin`, 6 s, laço; vidro `radome_glass` translúcido).

## solar-panels-battery.glb

As mesmas 10 placas de `solar-panels.glb` (mesmas posições), mais um fio saindo da caixinha de cada painel até a calha, o cabo-tronco até a bateria (oeste do campo, `x ≈ 8,6; z ≈ 3,15`) e um cabo de saída até a tomada `power_outlet` (`x ≈ 4,2`), onde o jogo liga a base.

O jogo controla a carga e a descarga; aqui só existem as animações:

| Clipe | Duração | O que faz |
|---|---|---|
| `battery_charge` | 3,2 s, laço | Pulsos de energia das placas até a bateria, 5 células enchendo de baixo para cima, luz verde piscando |
| `battery_discharge` | 3,2 s, laço | Pulsos da bateria até a tomada, células esvaziando de cima para baixo, luz laranja piscando |
| `battery_level` | 1 s, sem laço | O tempo do clipe é o nível: toque com `timeScale = 0` e ponha `action.time = nível` (0 a 1) |

Sem clipe tocando: células cheias, pulsos escondidos, luzes meio apagadas. Os pulsos (`energy_pulse_*`) são esferas que aparecem e correm pelo cabo; as células (`battery_cell_0..4`) e as luzes mudam de escala.

Materiais que o jogo pode procurar pelo nome: `panel_cells`, `panel_grid`, `battery_cell`, `battery_bolt`, `battery_led_charge`, `battery_led_discharge`, `energy_pulse`, `alarm`, `antenna_tip`, `window`, `base_lights`, `label`, `radome_glass`.

Ao trocar o material por toon, preservar `name`, `emissive`, transparência, `map`, `alphaTest` e `vertexColors`. Contorno: `userData.outline` (0 = sem contorno).
