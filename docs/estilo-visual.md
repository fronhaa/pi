# Estilo visual: regras técnicas

> **Direção de arte oficial:** [art-bible.md](art-bible.md). Este guia diz só **como aplicá-la no código**.
> Código: [`src/render/toon.ts`](../src/render/toon.ts). Decisão técnica: [ADR 0002](decisoes/0002-estilo-toon.md).
>
> Já alinhado: paleta de 7 cores, 4 faixas sem sombra preta, contorno fino, escala 1 m, sem logos.
> Ainda a migrar (item 14 do [backlog](game-design.md#backlog-do-hackathon-por-prioridade)): geometria mais
> detalhada (hoje são primitivas, mais simples do que a [seção 2.1](art-bible.md#21-estilo-visual-escolhido) pede)
> e o pôr do sol com halo azulado ([seção 5](art-bible.md#5-padrão-de-iluminação)).

## Ingredientes

1. **Cel-shading em 4 faixas, sem sombra preta.** `MeshToonMaterial` com `gradientMap` de 4 tons
   (`105, 160, 210, 255`). O tom mais escuro é propositalmente claro.
2. **Contorno escuro e fino (inverted hull)**, na cor de sombra profunda da paleta (`#473C3A`).
3. **Paleta oficial da Art Bible**; laranja só em detalhes.

## Como usar

```ts
import { toonMesh, toonMaterial, addOutline, PALETTE } from '@/render/toon';

const modulo = toonMesh(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 20), PALETTE.light);  // contorno 3%
const chao = new THREE.Mesh(geo, toonMaterial(PALETTE.soil));                           // sem contorno
```

Não use `MeshStandardMaterial` / `MeshPhongMaterial` em objetos do jogo: quebra a consistência.

## Paleta (`PALETTE`)

| Nome | Hex | Origem | Uso |
| --- | --- | --- | --- |
| `soil` | `#8E382B` | Art Bible | Solo marciano |
| `rock` | `#C65B36` | Art Bible | Rochas avermelhadas, abrigo |
| `lit` | `#E58A51` | Art Bible | Superfícies iluminadas (camadas das mesetas) |
| `dust` | `#E6B47A` | Art Bible | Poeira clara, sacos de regolito, painéis empoeirados |
| `shadow` | `#473C3A` | Art Bible | Sombras profundas, contornos, texto da interface |
| `tech` | `#718B9A` | Art Bible | Equipamentos (mochila, postes, pernas dos módulos) |
| `light` | `#C8D5D8` | Art Bible | Superfícies claras (módulos, trajes, torre) |
| `accent` | `#E8792B` | Referência do time | **Só detalhes**: anéis dos módulos, faixa da torre, emblema JZ-1, comandante |
| `panel` | `#2F4A6E` | Apoio | Painéis solares limpos |
| `plant` / `plantDead` | `#6F9A4A` / `#7A5434` | Apoio | Estufa saudável / murchando |
| `alarm`, `window` | `#FF3B2F`, `#FFD27A` | Apoio | Luz de alarme da torre, janelas acesas |

Cor nova? Adicione em `PALETTE` **e** nesta tabela, dizendo a origem.

### Base lunar (`MOON_PALETTE`)

Na Lua (`BaseScene.setLocation('moon')`, cenário em [`src/scenarios/moon.ts`](../src/scenarios/moon.ts)), só as cores de **terreno** mudam: os materiais que usam `soil`, `rock`, `lit` e
`dust` (chão, pedras, mesetas, abrigo, sacos) trocam para os cinzas abaixo. Prédios, trajes e plantas ficam iguais.

| Nome | Hex | Uso |
| --- | --- | --- |
| `soil` | `#7D7C83` | Regolito lunar (chão, fundo das crateras) |
| `rock` | `#A3A2A9` | Pedras, abrigo, bordas de cratera |
| `lit` | `#C4C3C9` | Camadas claras das bordas ao fundo |
| `dust` | `#B1AEA6` | Sacos de regolito, painéis empoeirados |
| `sky` | `#0B0D16` | Céu preto até de dia (sem atmosfera) |
| `earth` / `earthLand` | `#3F7FD6` / `#5F9A4F` | A Terra grande e baixa no horizonte (no polo sul ela fica sempre perto do horizonte) |

O Sol anda pelo céu ao longo do sol (`Scenario.sun.path`, em `src/scenarios/`): em Marte nasce atrás da câmera, passa alto pelo lado dela ao meio-dia (frente iluminada) e se põe atrás da base, com o céu alaranjado perto do horizonte; o disco do Sol fica a 170 m (um pouco maior que o real, para ver). Outras diferenças na Lua: estrelas visíveis de dia, quase sem névoa, sem partículas de poeira no ar, Sol branco e baixo, que anda rente ao horizonte e não se põe
(sombras compridas, como no polo sul), mesetas achatadas (viram bordas de cratera) e crateras extras longe da base.
A luz do Sol da cena acompanha a luz do dia (`SceneState.sunlight`, 0–1): de 20% a 100% da intensidade, então dias de pouco Sol e de sombra ficam mais escuros. A noite (descanso da tripulação) quase não escurece a cena na Lua (12% do escurecimento de Marte), porque no polo sul o Sol não se põe a cada 24 h; só a noite da sombra fica escura de verdade.

## Espessura do contorno

| Objeto | `thickness` |
| --- | --- |
| Padrão (módulos, torre, rover) | `0.03` |
| Partes pequenas (astronautas, rochas, sacos) | `0.04`–`0.05` |
| Muito grandes (mesetas ao fundo) | `0.012` |
| Chão, anéis, faixas | `0` |

## A cena mostra o estado do jogo

A tabela completa está no GDD. No código, tudo passa por `BaseScene.setState()` e `BaseScene.update()`
([`src/scene/BaseScene.ts`](../src/scene/BaseScene.ts)), que repassam às partes de [`src/scene/base/`](../src/scene/base)
(`structures.ts`: painéis, plantas, sacos, bateria, alarme; `Sky.ts`: céu e luz; `Habitat.ts`: janelas; `Rover.ts`); a cena nunca muda regras.

## Escala e modelos

- 1 unidade = 1 metro. Astronauta com ~1,85 m (Art Bible).
- Tripulação: o astronauta chibi (`public/assets/models/astronaut-chibi.glb`, ver [astronauta-chibi.md](astronauta-chibi.md)).
  `Crew.loadChibi()` baixa o `.glb` uma vez, clona para os 4 papéis e troca o laranja do traje pela cor do papel
  (`ROLE_COLORS`). Animações: `walk` ao andar, `jump` no Espaço, `interact` ao consertar. Até carregar (ou se falhar),
  fica o boneco simples de cápsulas.
- Base e rover: `research-base.glb` e `rover.glb` (ver [rover-e-base-de-pesquisa.md](rover-e-base-de-pesquisa.md)),
  carregados por `BaseScene.loadModels()` com `src/render/sceneryModel.ts`. A base fica em `HABITAT_POSITION`, com a porta
  do airlock (`ENTRANCES.habitat`) virada para a câmera. O rover usa a mesma lógica de andar, parar e desviar; as rodas
  `wheel_0..5` giram pela distância e, ao parar para estudar, tocam `scan` e `drill`. Até carregar (ou se falhar), ficam
  o módulo e o rover simples.
- **Arranjo da base em estrela** (concept art ARC-001/ARC-002, vista superior:
  [conceito-bases-lunar-marciana.png](img/conceito-bases-lunar-marciana.png)), definido em
  [`src/scene/base/layout.ts`](../src/scene/base/layout.ts): a **cúpula** da estufa é o núcleo (`DOME_CENTER`), e túneis
  (`TUBES`, cilindros claros com anel laranja na ponta) a ligam a quatro módulos do mesmo `research-base.glb`, sem mudar o
  design: **laboratório** a leste (com o airlock virado para a câmera, a bancada e o observatório), **alojamento** a oeste
  (`QUARTERS_OFFSET_X`, dois beliches, uma cama por astronauta) com a **academia** acoplada na ponta, e a **garagem do
  rover** ao sul (`GARAGE_POSITION`, casco correndo em Z, em 100% de escala para o rover caber, com piso e uma **rampa**
  com faixas e corrimãos laranja até o chão: `GARAGE_RAMP`). Base de comunicação acoplada na ponta do laboratório, painéis à direita (`PANELS_ORIGIN`) e bateria na frente da base de comunicação.
  As janelas acendem à noite.
- Dentro do habitat: cabines **transparentes**. Todas as peças do casco (casco, faixas, janelas e portas de acoplamento)
  ficam translúcidas para a câmera (`glassMaterial`, sem contorno), para nada opaco cortar a tripulação. Para o sol o casco
  continua metal: faz sombra pelos dois lados (`shadowSide = DoubleSide`), o sol não entra, e cada cabine (e a garagem)
  tem uma luminária no teto (`PointLight` sem sombra). Cada peça tem ordem de desenho fixa
  (`GLASS_ORDER`): sem ela, as faixas e portas que se cruzam piscavam ao girar a câmera. Testamos uma vista
  em corte, mas o time preferiu ver através do casco. Cada módulo tem seu piso. Comandante e cientista
  ficam no laboratório e engenheiro e médico no alojamento (`HABITAT_SPOTS`); quem conserta o vazamento vai para a estufa
  (`GREENHOUSE_WORK_SPOT`). À noite e na câmara de descompressão, somem.
- O abrigo de regolito fica em `SHELTER_CENTER`, à frente e à esquerda do alojamento.
- Base de comunicação (`comm-base.glb`, ver [base-comunicacao-e-bateria.md](base-comunicacao-e-bateria.md)): acoplada na
  port_b do laboratório, na ponta leste da estrela (`COMM_POSITION`), em `HABITAT_SCALE`, sem a torre de acesso.
  Substitui a torre de antena antiga (que fica de reserva se o `.glb` falhar): a luz de alerta (`alarm`) pisca na
  tempestade e a ponta da antena (`antenna_tip`) com mensagem da Terra. O conserto da antena (`PROBLEM_SPOTS.antenna`) e
  o posto do comandante ficam ao lado dela. Código: `BaseStructures.useCommBase` (`src/scene/base/structures.ts`).
- Placas e bateria (`solar-panels-battery.glb`): o modelo foi feito com o primeiro painel em (12; 2); no arranjo em
  estrela ele é deslocado em `SOLAR_MODEL_OFFSET` para `PANELS_ORIGIN`, à direita da base de comunicação, com a bateria
  (`BATTERY_POSITION`) na frente dela. A poeira escurece as células (`panel_cells`). A bateria toca `battery_charge` de
  dia, `battery_discharge` à noite e, cheia, mostra o nível (`battery_level` com `timeScale = 0`). A tomada fica em
  `OUTLET_LOCAL_X` (5,0 no referencial do modelo), depois da torre do airlock; o cabo de saída é encurtado junto.
  Código: `BaseStructures.useSolarField`.
- Passarela da cúpula (`WALKWAY`, na altura do piso dos módulos) em **T**: leste-oeste (laboratório ↔ alojamento) e um
  braço para o sul até o túnel da garagem, com corrimão laranja aberto nas entradas. Uma **escada** de cada lado
  (`GREENHOUSE_STAIRS`: norte a leste, sul a oeste, degraus de ~17 cm) desce até o chão da estufa
  (`GREENHOUSE_FLOOR_Y`); os canteiros deixam livre o espaço embaixo da passarela e na frente das escadas.
- Túneis: raio `TUBE_RADIUS` (0,85 m): sobra ~1,7 m e o astronauta (1,87 m) passa **abaixado** (corpo curvado para a
  frente a partir dos pés, `Astronaut.fitHeadroom`). Os beliches ficam em `BUNK_Z`, um pouco mais para o meio do casco
  que a bancada, para quem deita na cama de cima não sair pelo casco.
- Os módulos do habitat ficam em 80% (`HABITAT_SCALE`), para o astronauta caber justo na cabine; a torre do airlock e o
  armário continuam em 100% (a porta segue mais alta que o astronauta). As janelas acendem à noite. Deitado no beliche, o boneco fica em 80% para caber entre as camas.
- Academia: terceiro módulo (`GYM_OFFSET_X`), com esteira, bicicleta e aparelho de força (F9). Rotina só visual
  (GDD, "Atividades dentro da base", B): quem está dentro sem ordem há 8 s vai à esteira ou à bicicleta (`GYM_STATIONS`,
  `walk` no lugar na esteira; sentado pedalando na bicicleta, com o clipe `pedal`), descansa deitado no beliche e volta ao posto. Na primeira vez aparece o fato F9.
- À noite (sem tempestade) cada astronauta dorme deitado na sua cama (`BUNK_SPOTS`); na noite de tempestade, está no abrigo.
- O resto é feito com primitivas (leve). Modelos `.glb` novos: exportar do Blender em glTF Binary,
  eixo Y para cima, em metros, com cores sólidas; ao carregar, trocar os materiais por `toonMaterial(cor)`.
  Coloque em `public/assets/models/` com nome em `kebab-case`.

## O que não usar

- Logotipo, insígnia ou nome da NASA como marca. O emblema da missão é próprio: "JZ-1".
- Planeta gigante no céu. A Terra é um pontinho azul que aparece à noite.

## Limitações conhecidas

- O inverted hull falha em quinas agudas e malhas abertas. Alternativa futura: detecção de bordas em pós-processamento (via ADR).
