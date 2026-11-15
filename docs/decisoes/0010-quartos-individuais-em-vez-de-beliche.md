# 0010. Quartos individuais em vez de beliche

- **Status:** Aceito
- **Data:** 2026-11-15
- **Autores:** @wnmonzine

## Contexto

O [ADR 0009](0009-modulos-da-base-em-100-de-escala-com-medidas-da-nasa.md) pôs os módulos em 100% com 1 m livre acima de
cada cama, mas manteve os **beliches** (opção 1) e deixou os quartos individuais (opção 3) para uma segunda etapa.

Na prática, subir e descer da cama de cima de um beliche ficou estranho: o chibi não tem pose de subir escada, e entrar
deitado numa cama a 1,5 m do piso, rente ao casco redondo, obrigava o corpo a deslizar deitado no ar. Ao mesmo tempo, as
fontes que registramos dizem o contrário do beliche:

- **F18** (estudo do habitat de superfície da NASA): "this would allow for the possibility of bunkbeds, however individual
  crew quarters is highly recommended".
- **F15** (CHAPEA, simulação de Marte da NASA): "Four private crew quarters".
- **F17** (Estação Espacial): uma cabine de dormir para cada astronauta.

## Opções consideradas

1. **Beliche com escada**: menos mudança na base; mas a subida pela escada fica apertada embaixo do casco (o astronauta
   precisaria se curvar no alto) e fica longe do que a NASA recomenda.
2. **Quartos individuais** (escolhida pelo time): cada astronauta com seu quarto e uma cama de um andar; ninguém sobe em
   nada. Precisa de mais espaço: duas camas de 1,9 m cabem no fundo de um módulo, uma em cada metade.

## Decisão

Quartos individuais: **dois módulos de quartos** na fila oeste (o segundo encaixado na ponta do primeiro, e a academia
depois dele), cada um com **dois quartos separados por uma divisória**. Cada quarto tem uma **cama baixa** (o chibi tem
pernas curtas e senta na beirada com os pés no chão) e um armário. Para deitar, ele fica de costas para a cama, **senta
na beirada e deita**, pondo as pernas na cama; para levantar, o contrário.

## Consequências

- `src/scene/base/layout.ts`: `QUARTERS_B_OFFSET_X`, `QUARTERS_MODULES`, `BED_LEVEL`, `BED_TOP`, `BED_Z`, `BED_SPOTS`
  (no lugar de `BUNK_LEVELS`, `BUNK_Z`, `BUNK_SPOTS`), `ROOM_BED_DX`, `ROOM_LOCKER_DX`; a academia vai um módulo para o
  oeste (`GYM_OFFSET_X`).
- `src/render/chibiSit.ts`: pose `sit` montada por código (como o `pedal`); `Astronaut.bedBlend` (no lugar de `lieBlend`)
  junta o giro de deitar e o peso da pose de sentar.
- `src/scene/crewRoutine.ts`: passos `face` → `sit` → `lie` para deitar e `rise` → `stand` para levantar, com tempo
  próprio e sem interromper no meio; a faixa do corredor vale nos dois módulos de quartos.
- Medido nos 4 quartos com o corpo do chibi (pernas na pose de sentar): nada sai do casco, nada toca divisórias, armários
  ou pés da cama, o capacete nunca abaixo do chão; só a panturrilha roça a beirada do colchão (~3 cm) ao pôr as pernas na
  cama. Nenhum salto de posição. Uma ordem chegando no meio da sequência espera ela terminar.
- A base fica um módulo (7 m) mais comprida para o oeste: conferir no navegador se ela cabe na câmera inicial.
- Só cena: nada muda em `src/sim`, no balanceamento, no protocolo ou no servidor coop.
