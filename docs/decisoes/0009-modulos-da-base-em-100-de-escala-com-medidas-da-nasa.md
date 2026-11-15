# 0009. Módulos da base em 100% de escala, com medidas da NASA

- **Status:** Aceito (15/11/2026: o time escolheu a opção 1)
- **Data:** 2026-11-14
- **Autores:** @wnmonzine

## Contexto

Os módulos do habitat (`research-base.glb`: laboratório, alojamento, academia e base de comunicação) estão em **80%**
(`HABITAT_SCALE = 0.8` em `src/scene/base/layout.ts`), escolhido "para o astronauta caber justo na cabine"
([estilo-visual.md](../estilo-visual.md)). Foi uma escolha visual, sem referência real. Os túneis da cúpula têm
raio de 0,85 m.

Com isso apareceram problemas que só conseguimos contornar com remendos (PR #46):

- nos **túneis** sobra 1,7 m de altura e o astronauta (1,87 m, [Art Bible 4.1](../art-bible.md#41-escala-global)) precisa
  andar **abaixado**;
- no **beliche** sobram 0,64 m entre as camas e o capacete deitado (0,67 m) não cabe: o boneco deitado é encolhido para
  80% (`LYING_SCALE`) e mesmo assim termina de entrar na cama já deitado, deslizando;
- deitado na cama de cima, o ombro encostava no casco.

Pesquisamos o tamanho de habitats reais e as medidas que a NASA recomenda, e registramos tudo com fonte em
[ciencia-marte.md](../ciencia-marte.md) (F15 a F19). O resumo:

| Referência (fonte) | Medida |
| --- | --- |
| Habitat da CHAPEA, simulação de Marte da NASA (F15) | 1.700 pés² (~158 m²) para 4 pessoas, com **quartos individuais** |
| HERA (F16) | 650 pés² (60 m²), dois andares e um mezanino onde dormem |
| Módulo Destiny da Estação Espacial (F17) | 28 × 14 pés (~8,5 m de comprimento × 4,3 m de diâmetro) |
| Cabine de dormir da Estação (F17) | 2,1 m³ |
| Altura padrão num habitat de superfície (F18) | **2,4 m**; para dormir, **1 m acima da cama**; beliche é possível, mas quarto individual é muito recomendado |
| Volume habitável mínimo (F19) | **28,96 m³ por tripulante** (4 pessoas, 180 dias ou mais) |
| Habitat de Marte estudado pela NASA (F19) | 7,2 m de diâmetro, 172 m³ para 4 pessoas |

### O jogo hoje comparado com 100% e com a NASA

Medido no `research-base.glb`: em 100% o casco vai de y = 1,01 a 4,29 m, com ±1,69 m de raio e 7,16 m de comprimento;
o piso fica em 1,25 / 0,8 = 1,56 m. Os volumes abaixo são o corte do casco **acima do piso** vezes o comprimento do piso,
ou seja, volume **bruto**, antes de móveis e equipamentos (o "habitável" da NASA é menor que isso).

| | Hoje (80%) | Proposta (100%) | NASA |
| --- | --- | --- | --- |
| Diâmetro do casco | ~2,7 m | ~3,3 m | ISS 4,3 m; Marte 7,2 m |
| Altura livre no meio do módulo | ~2,1 m | **~2,7 m** | **2,4 m** |
| Piso útil por módulo | 5,2 × 1,9 m (~10 m²) | 6,5 × 2,4 m (~15 m²) | — |
| Volume bruto dos 3 módulos de moradia | ~76 m³ (**~19 m³ por pessoa**) | ~148 m³ (**~37 m³ por pessoa**) | mínimo de **29 m³ habitáveis** por pessoa |
| Espaço acima de cada cama do beliche | 0,64 m (baixo) e ~0,86 m (cima) | **1,0 m** nas duas (com as camas novas) | **1 m** |
| Altura dentro do túnel | 1,7 m (anda abaixado) | **~2,1 m** (raio 1,2 m) | passagem sem restrição |

Em 80% a base fica abaixo do mínimo da NASA em altura, em volume por pessoa e no espaço para dormir. Em 100%, que é o
tamanho em que o modelo foi feito, ela passa a seguir as três recomendações.

## Opções consideradas

1. **Módulos em 100%, túneis mais altos, cúpula de 6 m e beliche com 1 m por cama** (recomendada):
   - prós: segue as medidas da NASA (F18, F19), o astronauta anda em pé nos túneis, deita e levanta do beliche sem
     encolher nem deslizar (`LYING_SCALE` volta a 1), e a base fica coerente para ensinar ("na NASA, cada pessoa precisa
     de pelo menos 29 m³");
   - contras: a base fica ~25% maior (a câmera e alguns pontos fixos do mapa precisam de ajuste), a cúpula cresce e a
     escada da estufa ganha degraus; é preciso conferir de novo as colisões e os caminhos da tripulação.
2. **Ficar em 80% e documentar que a base é compacta de propósito**:
   - prós: nenhum trabalho;
   - contras: continua abaixo do mínimo da NASA em tudo, ficam os remendos (andar abaixado, boneco encolhido e
     deslizando no beliche), e passa à criança uma ideia errada do tamanho de um habitat.
3. **Opção 1 com quartos individuais em vez de beliche** (como na CHAPEA e como a NASA recomenda):
   - prós: o mais fiel às fontes; nada de subir em beliche;
   - contras: 4 camas de 1,9 m não cabem no fundo de um módulo só; precisa de outro módulo de quartos ou de trocar a
     academia de lugar. Fica para uma segunda etapa, se o time quiser.

## Decisão

Proposta: **opção 1**. Módulos de volta a 100%, túnel com raio de 1,2 m, cúpula com raio de 6 m e beliche com 1 m livre
acima de cada cama. A opção 3 fica registrada como próximo passo possível.

## Implementado (15/11/2026)

- `HABITAT_SCALE = 1`, `HABITAT_FLOOR_Y = 1.5625`, `DOME_RADIUS = 6`, `TUBE_RADIUS = 1.2` e `TUBE_Y` = piso + 0,94 m
  (2,14 m livres no túnel), `BUNK_LEVELS = [0.31, 1.49]` (1 m acima de cada colchão), `LYING_SCALE = 1`,
  escada da estufa com 7 degraus, mais plantas na cúpula maior e a sombra do Sol cobrindo a base maior.
- Simulado quadro a quadro (tarefas, academia, 4 camas, noite e manhã): cabeça acima do teto 0 cm, **sem andar
  abaixado em nenhum lugar**, nada entra em colchão, no casco no máximo ~0,6 cm (ao levantar da cama de cima),
  nenhum salto de posição. Postos, problemas e entradas fora das caixas de colisão (as três tarefas de dentro ficam
  dentro dos prédios de propósito).
- `BED_MOVE` reajustado para as camas novas (`src/scene/crewRoutine.ts`).
- Falta conferir no navegador: a base inteira na câmera inicial, no computador e no celular em pé.

## Consequências

Só cena: nada muda em `src/sim/`, no balanceamento, no protocolo ou no servidor coop (o modo em grupo não sincroniza
quem está dentro da base).

**O que muda** (com os valores de partida, a conferir na implementação):

| Arquivo | Mudança |
| --- | --- |
| `src/scene/base/layout.ts` | `HABITAT_SCALE = 1`; `HABITAT_FLOOR_Y = 1.5625`; `DOME_RADIUS = 6`; `TUBE_Y = 2.5` e raio do túnel 1,2 m (a boca do túnel precisa ficar onde a cúpula tem altura para ele); `BUNK_LEVELS` com 1 m livre acima de cada cama (ex.: camas em 0,31 e 1,49 m acima do piso). Os pontos derivados (laboratório, alojamento, academia, garagem, base de comunicação, campo solar, postos, camas, academia, problemas) já são calculados a partir dessas constantes; conferir os pontos fixos (`POSTS` do engenheiro e do cientista, `SHELTER_CENTER`, `ROVER_TRACK`) |
| `src/scene/base/Habitat.ts` | Túnel com o raio novo; escadas da estufa com mais degraus (o piso dos módulos sobe de 1,25 para 1,56 m) |
| `src/scene/Crew.ts` | `LYING_SCALE = 1` (o boneco não precisa mais encolher para caber na cama) |
| `src/scene/crewRoutine.ts` | Os ajustes de deitar e levantar (`BED_MOVE`) e o andar abaixado (`headroomAt`) continuam valendo, mas devem deixar de agir sozinhos: conferir com a simulação quadro a quadro das 4 camas (a mesma do PR #46) |
| `src/core/Game.ts` | Talvez afastar a câmera inicial para a base maior caber na tela (conferir no celular em pé) |
| `docs/estilo-visual.md` e `docs/rover-e-base-de-pesquisa.md` | Trocar "80%" pelas medidas novas, citando F15 a F19 |

**Ordem:** primeiro fazer o merge do PR #46 (passarela, escadas, postura e beliche), porque ele cria `headroomAt`,
`TUBE_RADIUS`, `BUNK_Z` e a simulação das camas que esta mudança reaproveita; depois implementar esta proposta numa
branch própria.

**Pronto quando:**

- [ ] Em 100%, a simulação quadro a quadro mostra **0 cm** de cabeça acima do teto nos túneis **sem** andar abaixado.
- [ ] Nas 4 camas, deitar e levantar com o boneco em tamanho normal, sem nada entrar no casco, no chão ou num colchão.
- [ ] Postos, problemas e entradas fora das caixas de colisão (mesma conferência do merge de 14/11/2026).
- [ ] A base inteira aparece na câmera inicial, no computador e no celular em pé.
- [ ] `estilo-visual.md` atualizado com as medidas e as fontes.
