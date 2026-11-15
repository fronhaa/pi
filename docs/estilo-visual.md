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

O Sol anda pelo céu ao longo do sol (`Scenario.sun.path`, em `src/scenarios/`): em Marte nasce à frente e à direita da base, passa pelo lado direito um pouco atrás dela e se põe atrás da base, de frente para a câmera, com o céu alaranjado perto do horizonte. Assim a sombra dos prédios vem para o lado da câmera e varre o chão durante o dia (com o Sol atrás da câmera, como era antes, ela ficava escondida atrás dos próprios prédios). Ele também fica mais baixo (no máximo ~46°), para a sombra ser comprida; o disco do Sol fica a 170 m (um pouco maior que o real, para ver). Outras diferenças na Lua: estrelas visíveis de dia, quase sem névoa, sem partículas de poeira no ar, Sol branco e baixo, que anda rente ao horizonte e não se põe
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
  fica o boneco simples de cápsulas. Quem está trabalhando ganha uma plaquinha sobre a cabeça ("🔧 Engenheiro", bolinha
  na cor do papel), desenhada por cima de tudo para aparecer através do casco da base (`Astronaut.setWorking`).
- HUD por cima do jogo: o que só informa não pega clique (`.toast` com `pointer-events: none`), e as setas de problema
  fora da tela ficam abaixo dos painéis (z-index 1), para não roubar o clique de um botão do HUD. Painel que redesenha
  sozinho (HUD do dia, sala do modo em grupo) usa `patchChildren`, nunca `replaceChildren`.
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
  com a **academia** a oeste e os **dois módulos de quartos** ao sul (`QUARTERS_CENTERS`, casco correndo em Z,
  `QUARTERS_YAW`; ADR 0011). O rover de ciência não tem garagem (F23 a F25). Base de comunicação acoplada na ponta do laboratório, painéis à direita (`PANELS_ORIGIN`) e bateria na frente da base de comunicação.
  As janelas acendem à noite.
- Dentro do habitat: cabines **transparentes**. Todas as peças do casco (casco, faixas, janelas e portas de acoplamento)
  ficam translúcidas para a câmera (`glassMaterial`, sem contorno), para nada opaco cortar a tripulação. Para o sol o casco
  continua metal: faz sombra pelos dois lados (`shadowSide = DoubleSide`), o sol não entra, e cada cabine
  tem uma luminária no teto (`PointLight` sem sombra). Cada peça tem ordem de desenho fixa
  (`GLASS_ORDER`): sem ela, as faixas e portas que se cruzam piscavam ao girar a câmera. Testamos uma vista
  em corte, mas o time preferiu ver através do casco. Cada módulo tem seu piso. Comandante e cientista
  ficam no laboratório e engenheiro e médico no alojamento (`HABITAT_SPOTS`); quem conserta o vazamento vai para a estufa
  (`GREENHOUSE_WORK_SPOT`). À noite e na câmara de descompressão, somem.
- O abrigo de regolito fica em `SHELTER_CENTER`, à frente e à esquerda do alojamento.
- Base de comunicação (`comm-base.glb`, ver [base-comunicacao-e-bateria.md](base-comunicacao-e-bateria.md)): acoplada na
  port_b do laboratório, na ponta leste da estrela (`COMM_POSITION`), em `HABITAT_SCALE` (100%), sem a torre de acesso.
  Substitui a torre de antena antiga (que fica de reserva se o `.glb` falhar): a luz de alerta (`alarm`) pisca na
  tempestade e a ponta da antena (`antenna_tip`) com mensagem da Terra. O conserto da antena (`PROBLEM_SPOTS.antenna`) e
  o posto do comandante ficam ao lado dela. Código: `BaseStructures.useCommBase` (`src/scene/base/structures.ts`).
- Placas e bateria (`solar-panels-battery.glb`): o modelo foi feito com o primeiro painel em (12; 2); no arranjo em
  estrela ele é deslocado em `SOLAR_MODEL_OFFSET` para `PANELS_ORIGIN`, à direita da base de comunicação, com a bateria
  (`BATTERY_POSITION`) na frente dela. A poeira escurece as células (`panel_cells`). As células da bateria mostram
  a carga (em código, só a altura de cada `battery_cell_N` muda, de baixo para cima; o clipe `battery_level`
  não é usado porque encolhe a largura junto) e batem com a prévia do plano: de manhã, a carga atual; no dia, andam
  junto com o Sol direto até o resultado previsto ("depois da noite" no plano), subindo ou descendo, sem passar dele;
  à noite terminam de chegar ao resultado (dia curto ou sem dia). Quando a carga pula (carta, tarefa, noite), a
  bateria sobe ou desce suave até ela (~1 s), com os pulsos de entrada ou saída, nunca de uma vez. Conta em `BaseScene.batteryFrame`, prévia em
  `Game.batteryTarget`. De `battery_charge` (energia entrando) e
  `battery_discharge` (saindo) o jogo tira as trilhas das células e usa só os pulsos de energia e as luzes. Carregando, os pulsos também
  vão da bateria até a tomada (a base continua gastando), sem a luz laranja da descarga; os pulsos de descarga
  seguem o cabo de saída encurtado. A tomada fica em
  `OUTLET_LOCAL_X` (5,0 no referencial do modelo), depois da torre do airlock; o cabo de saída é encurtado junto.
  Código: `BaseStructures.useSolarField`.
- **Estufa fechada, do mesmo material das cápsulas, não de vidro** (ARC-002,
  [F20](ciencia-marte.md#f20-a-estufa-da-nasa-para-a-lua-e-marte-é-inflável-não-de-vidro), `BaseStructures.buildDome`):
  o casco usa o mesmo `seeThroughHull` e as cores do `research-base.glb` (`HULL_COLORS`): translúcido só para a
  câmera, faz sombra para o sol (lá dentro não caem sombras das nervuras e do concentrador) e recebe sombra por fora
  (a do concentrador e das nervuras aparece em cima da estufa; `sun.shadow.normalBias = 0.05`). Faixas escura e laranja perto da base e 12 nervuras (meio gomo de defasagem, para
  nenhuma cruzar a boca de um túnel), com ordem de desenho fixa como no `GLASS_ORDER`. Anel de regolito na base (com
  uma volta de caixas de colisão). A luz das plantas vem de dentro: o **concentrador solar** no topo segue o Sol
  (`Sky.sunVector`) e três cabos de **fibra óptica** descem pelo casco; por dentro, um difusor no alto leva a luz por
  fibras até **duas luminárias sobre os canteiros**, cada uma com um foco de luz de verdade (SpotLight, sem sombra) e um
  **facho visível** (cone translúcido que soma luz), fortes de dia. Duas barras de **LED de cultivo** (magenta) têm o seu
  facho, mais forte à noite. Assim dá para ver que as plantas, na sombra do casco, recebem luz de fontes de dentro. A estufa real ficaria enterrada; aqui ela fica à vista
  e translúcida pela mesma convenção dos módulos.
- Passarela da cúpula (`WALKWAY`, na altura do piso dos módulos) em **T**: leste-oeste (laboratório ↔ alojamento) e um
  braço para o sul até o túnel dos quartos, com corrimão laranja aberto nas entradas. Uma **escada** de cada lado
  (`GREENHOUSE_STAIRS`: norte a leste, sul a oeste, degraus de ~17 cm) desce até o chão da estufa
  (`GREENHOUSE_FLOOR_Y`); os canteiros deixam livre o espaço embaixo da passarela e na frente das escadas. A colheita
  (🌱) acontece ao pé da escada do sul, e o conserto do vazamento ao pé da do norte.
- **Tamanho dos módulos: 100%** (`HABITAT_SCALE = 1`, [ADR 0009](decisoes/0009-modulos-da-base-em-100-de-escala-com-medidas-da-nasa.md)),
  o tamanho em que o `research-base.glb` foi feito, seguindo as medidas da NASA ([ciencia-marte.md](ciencia-marte.md),
  F15 a F19): casco de ~3,3 m de diâmetro, piso em `HABITAT_FLOOR_Y` (1,56 m) com ~2,7 m de altura livre (a NASA
  recomenda 2,4 m) e ~37 m³ por tripulante nos três módulos de moradia (mínimo da NASA: 29 m³ habitáveis). As janelas
  acendem à noite.
- Túneis: raio `TUBE_RADIUS` (1,2 m), com ~2,1 m livres acima do piso: o astronauta (1,87 m) passa **em pé**.
  Cada túnel **começa e termina dentro da estufa** (`TUBE_START`: onde até o alto dele fica sob a cúpula; nada sai
  pelo casco da estufa) e vai até a porta do módulo. São do mesmo casco das cápsulas, translúcidos para a câmera
  (dá para ver quem passa), com piso e um anel laranja em cada ponta. A cúpula
  tem 6 m de raio para a passarela ter altura até a boca dos túneis. Se um teto ficar baixo, ele se curva sozinho
  (`Astronaut.fitHeadroom`, altura em `headroomAt`).
- **Quartos individuais** ([ADR 0010](decisoes/0010-quartos-individuais-em-vez-de-beliche.md)): dois módulos de quartos
  no raio sul (`QUARTERS_CENTERS`, girados com `QUARTERS_YAW`; o interior é montado no referencial do módulo, `quartersPoint`), cada um com dois quartos separados por uma divisória translúcida, do fundo até perto da faixa do
  corredor. Em cada quarto, uma **cama baixa** (`BED_LEVEL`, estrado de quatro pés, aberto embaixo) encostada no fundo
  (`BED_Z`, colchão de `BED_DEPTH` = 0,85 m) e um armário ao lado da divisória. Tudo fica atrás de
  `ROOM_FURNITURE_FRONT_Z` (43 cm do eixo): o corredor do meio fica livre e quem passa anda reto, sem desviar. Engenheiro e médico no primeiro módulo,
  comandante e cientista no segundo (`BED_SPOTS`). O boneco deitado fica em tamanho normal (`LYING_SCALE = 1`).
  Deitar: de pé de costas para a cama, **senta na beirada** (pose `sit`, montada por código em `src/render/chibiSit.ts`)
  e deita girando em volta do quadril, pondo as pernas na cama (`Astronaut.bedBlend`); levantar é o mesmo ao contrário.
- Academia: o módulo do raio oeste (`GYM_OFFSET_X`), com esteira, bicicleta e aparelho de força (F9). Rotina só visual
  (GDD, "Atividades dentro da base", B): quem está dentro sem ordem há 8 s vai à esteira ou à bicicleta (`GYM_STATIONS`,
  `walk` no lugar na esteira; sentado pedalando na bicicleta, com o clipe `pedal`), descansa deitado no seu quarto e volta ao posto. Na primeira vez aparece o fato F9.
- À noite (sem tempestade) cada astronauta dorme deitado na cama do seu quarto (`BED_SPOTS`); na noite de tempestade, está no abrigo.
- O resto é feito com primitivas (leve). Modelos `.glb` novos: exportar do Blender em glTF Binary,
  eixo Y para cima, em metros, com cores sólidas; ao carregar, trocar os materiais por `toonMaterial(cor)`.
  Coloque em `public/assets/models/` com nome em `kebab-case`.

## Escolha e viagem (`src/scene/LaunchScene.ts`)

- **O foguete já está no espaço**, em órbita da Terra (órbita de espera, F37): não há decolagem nem base de lançamento.
- **Tela de escolha (Marte ou Lua):** câmera de longe: a Terra embaixo, a órbita tracejada e o foguete dando a volta
  com o motor desligado (maior que o real, para não virar um pontinho). Marte e Lua em 3D presos à câmera, com noção de
  profundidade: a Lua grande, perto da Terra; Marte pequeno, no alto do outro lado e lá no fundo (`PICK_PORTRAIT`,
  `PICK_LANDSCAPE`). A criança toca no planeta: botões de verdade
  (`src/ui/PlaceChoice.ts`) do tamanho do planeta, com nome e dica curta; o planeta cresce sob o dedo ou o mouse.
- **Viagem (~13 a 15 s, só visual, devagar para a criança ler):** ao escolher, os planetas da escolha somem, o motor liga e o foguete acelera em
  volta da Terra até o ponto de saída (sempre o mais à esquerda, onde a tangente aponta para cima). Ali aparece
  "Motor ligado!" e ele sai da órbita para cima; a câmera vai para trás dele SEM girar (girar de ponta-cabeça ficava
  ruim no celular), aparecem linhas de velocidade e o destino crescendo, e ele entra no planeta.
- **Sem engasgo no toque (celular):** tudo fica pronto na tela de carregamento (`Game.prepare`): modelos 3D da base
  e da tripulação, física, shaders da base (`compileAsync`) e a cena da escolha e da viagem montada e preparada
  (`LaunchScene.warmUp`: mostra por um instante o que fica escondido, espera os shaders e desenha uma vez). Na tela de
  escolha, chama, linhas de velocidade e cartões continuam desenhados (invisíveis/minúsculos). Preparar um shader na
  primeira vez que ele aparece travava a viagem por quase 1 s no celular.
- **Sem HUD até a nave chegar:** a classe `pre-mission` no `body` esconde o HUD (`#ui`), balões, setas, guia e avisos
  na tela de escolha e na viagem. Sai quando o foguete chega (`Game.playLaunch`).
- Usa o renderizador do jogo: enquanto passa, o quadro desenha só esta cena (a base não é desenhada, não pesa no celular).
- O texto por cima ("Motor ligado!", fato real F30/F31, "Pular") é HTML em `src/ui/LaunchIntro.ts`.
- O destino é "trapaça de cinema": fica sempre à frente e atrás do foguete e cresce. Exceção à regra "planeta gigante
  no céu" abaixo, que vale para a cena da base.
- **Fotos reais na trajetória:** 2 cartões de foto da NASA (a Terra e o destino) presos à câmera passam ao lado do
  foguete, fora do meio da tela. Papel claro com contorno escuro, selo "FOTO REAL", legenda e crédito desenhados num
  canvas. Fontes: F34 a F36 em `docs/ciencia-marte.md`.
- "Reduzir movimento" no sistema: a cena fica parada perto da chegada.

## O que não usar

- Logotipo, insígnia ou nome da NASA como marca. O emblema da missão é próprio: "JZ-1".
- Planeta gigante no céu. A Terra é um pontinho azul que aparece à noite.

## Limitações conhecidas

- O inverted hull falha em quinas agudas e malhas abertas. Alternativa futura: detecção de bordas em pós-processamento (via ADR).

## Desempenho no celular

- **Sem rolar a página:** `html` e `body` fixos, sem "esticar" (`overscroll-behavior: none`) e sem zoom de toque
  duplo (`touch-action: manipulation`), em `index.html`. Só painéis longos (diálogo, mensagens, plano) rolam por
  dentro, com `overscroll-behavior: contain` para não arrastar a página junto.

Perfil de qualidade em [`src/render/quality.ts`](../src/render/quality.ts) (`QUALITY`): no celular (toque como ponteiro
principal ou sistema móvel; `?quality=high|low` força), densidade de pixels até 1,5 com **resolução dinâmica** (baixa um
degrau se o quadro passa de 22 ms, sobe se sobra folga), sem antialiasing, sombra de 1024 recalculada ~10 vezes por
segundo, sem luzes pontuais e focos (cabines, fibra óptica, LED) e peças pequenas sem sombra e sem contorno
(`applyQuality`, chamada depois de carregar os `.glb`; a tripulação mantém o contorno). Medido num iPhone simulado:
chamadas de desenho de 3.288 para ~1.540 e triângulos de 1,36 milhão para ~730 mil. No computador nada muda.

## Blocos de vidro (Grégor)

`gym.glb`, `dormitory.glb` e `refectory.glb` (ver [blocos-de-vidro.md](blocos-de-vidro.md)): cilindros de vidro de 5,2 m
com as portas de acoplamento na mesma altura dos módulos. **Academia:** `gym.glb` no raio oeste
(`GYM_GLASS_POSITION`: a porta de acoplamento encaixa no fim do túnel da estufa), sem o tubo de entrada (uma porta só,
a do laboratório). **O casco é de metal, não de vidro:** de verdade a tripulação não pode ficar no sol direto
(radiação). Como os outros módulos, fica opaco por padrão, transparente só para a câmera no "See inside" e sempre faz
sombra; o vidro do modelo ganha a cor de metal dos módulos e a academia tem luminárias por dentro. A academia simples (módulo, móveis feitos à mão e luminária) some quando ele carrega; o módulo
simples continua como molde dos quartos. Os aparelhos da rotina (`GYM_STATIONS`) passam a ser os pontos de interação
do modelo (`treadmill_N_run`, `bike_N_ride`; +Z local é para onde olha), e as correias (`treadmills_run`) só andam
com alguém correndo. Dormitório e refeitório ainda não estão no jogo.

