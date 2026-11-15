# 0011. Rover sem garagem e quartos no raio sul

- **Status:** Aceito
- **Data:** 2026-11-15
- **Autores:** @wnmonzine

## Contexto

O raio sul da base tinha uma **garagem do rover com rampa** (vinda do concept art do time). O rover voltava a ela depois
de cada expedição, entregava as amostras e ficava estacionado até o sol seguinte; depois um cientista passou a fazer a
manutenção lá dentro (PR #57).

O time decidiu que o jogo segue **o que a NASA documenta**, não "o que faz sentido". As fontes (registradas em
[ciencia-marte.md](../ciencia-marte.md)) dizem:

- **F23:** o Perseverance não volta a uma base; dorme onde parou, com o calor do gerador (MMRTG) aquecendo os eletrônicos
  nas noites frias. O Curiosity dirige de dia e dorme à noite no lugar.
- **F24:** num estudo da NASA, "Providing a pressurized garage space would be very expensive, so maintenance will be done
  during an EVA"; no acampamento base estudado, o rover tripulado se acopla ao habitat. Não há garagem.
- **F25:** as amostras ficam **guardadas dentro do rover**, em tubos lacrados (e uma parte foi deixada no chão, em Three
  Forks, como reserva). Ninguém as descarrega numa base.

Ao mesmo tempo, os quartos individuais ([ADR 0010](0010-quartos-individuais-em-vez-de-beliche.md)) ocupavam dois módulos
no raio oeste, antes da academia.

## Opções consideradas

1. **Seguir a NASA** (escolhida): sem garagem; o rover de ciência explora, guarda os tubos dentro dele e passa a noite onde
   parar. O raio sul fica livre: os dois módulos de quartos vão para lá, e a academia fica sozinha no raio oeste.
2. **Manter a garagem como ficção do concept art**: menos mudança, mas contradiz F23 a F25 e passaria à criança uma ideia
   errada de como um rover funciona.

## Decisão

Opção 1. O rover não tem garagem nem volta à base; a manutenção pelo cientista dentro da garagem (PR #57) sai. Os dois
módulos de quartos ficam no raio sul, ligados à estufa pelo túnel sul, girados como a garagem (o casco corre em Z).

## Consequências

- `src/scene/base/layout.ts`: saem `GARAGE_*`, `GARAGE_RAMP`, `ROVER_DOCK` e `GARAGE_SERVICE_SPOT`; entram
  `QUARTERS_CENTERS`, `QUARTERS_YAW`, `quartersPoint` (referencial do módulo → mundo), `BED_ROOMS`, `bedFeetLocalX` e
  `ROVER_START`. `GYM_OFFSET_X` passa a ser o primeiro módulo do raio oeste.
- `src/scene/base/Rover.ts`: só `drive` e `study`. A cada sol com ciência, as 3 primeiras paradas enchem tubos; depois só
  fotografa (braço guardado). À noite para onde estiver. Sai a rampa e a altura do chão da garagem.
- `src/scene/base/Habitat.ts`: os módulos de quartos e o interior deles (piso, luminária, divisória, camas, armários) são
  montados no referencial do módulo e girados; sai a garagem com a rampa.
- `src/scene/Crew.ts` (`bedBlend`, `setLying`, `lyingHip`) aceitam o giro do módulo; `src/scene/crewRoutine.ts` anda pelo
  eixo do raio sul até os quartos e faz as contas da cama no referencial do módulo.
- Medido: nos 4 quartos, cada um dorme na própria cama, nada sai do casco nem toca os móveis andando, a cabeça nunca passa
  do teto no túnel; o rover enche 3 tubos por sol, depois só fotografa, fica parado à noite e nunca entra num prédio.
- Só cena: nada muda em `src/sim`, no balanceamento, no protocolo ou no servidor coop.
