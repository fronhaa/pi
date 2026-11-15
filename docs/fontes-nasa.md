# Fontes da NASA: quais dados o jogo usa e por quê

> Para juízes, professores e pais. O jogo não mostra referências na tela, porque é feito para crianças de 7 a 12 anos
> ([ADR 0013](decisoes/0013-fontes-da-nasa-so-na-documentacao.md)). **Toda fonte fica aqui**, com link, o que é real e
> onde aparece no jogo. Os fatos científicos têm ficha com trecho original em [ciencia-marte.md](ciencia-marte.md).

## Em uma frase

As **tempestades solares** e o **atraso das mensagens** do Artemis Quest são reais: vêm do DONKI e do JPL Horizons, para
datas reais de 2023 a 2025. Energia, suporte de vida, blindagem e dose são **números simplificados do jogo**.

## O que é real e o que é do jogo

| No jogo | Classificação | De onde vem |
| --- | --- | --- |
| Data e força de cada tempestade solar | **REAL** (dado baixado, não ao vivo) | DONKI |
| Minutos que cada mensagem leva da Terra a Marte | **REAL** (dado baixado) | JPL Horizons |
| Fotos da Terra, de Marte e da Lua na viagem | **REAL** | Apollo 17, sondas Viking, Apollo 11 |
| Tempo da viagem (203 dias até Marte, 4 dias até a Lua) | **REAL** | Perseverance (2021) e Apollo 11 (1969) |
| Posições do Sol, da Terra, de Marte e da Lua no mapa da tela de escolha (no computador; no celular a tela é a clássica, sem mapa) | **REAL** (calculado para hoje, não ao vivo; distâncias e tamanhos fora de escala) | JPL, "Approximate Positions of the Planets" (Tabela 1, 1800–2050), e NASA GSFC, "Phases of the Moon 2001 to 2100": fichas [F38 e F39](ciencia-marte.md#f38-onde-estão-a-terra-e-marte-hoje-calculado) |
| Níveis da missão (Primeira missão, Normal, Expert) e idade recomendada | **INTERPRETADO**: escala do jogo; as tempestades e os atrasos reais são os mesmos em todos os níveis | `DIFFICULTY` em `src/sim/config.ts`; idades em `src/ui/level.ts` ([game-design.md](game-design.md#níveis-de-dificuldade)) |
| Fatos nos balões e nos relatórios ("💡…") | **REAL**, simplificado para criança | Fichas em [ciencia-marte.md](ciencia-marte.md) e [game-design.md](game-design.md) |
| Dose de radiação (0 a 100) | **INTERPRETADO**: escala do jogo, não é mSv | Fórmula em [game-design.md](game-design.md#sistemas-e-regras) |
| Energia, bateria, suporte de vida, blindagem, ciência | **INTERPRETADO**: números do jogo | `src/sim/config.ts` |

**Regras de honestidade que continuam valendo dentro do jogo:**

- Dado baixado nunca é chamado de "ao vivo". A mensagem do sol 1 se chama "☀️ O Sol antes da viagem": fala das erupções
  fortes nos 30 dias antes do download, sem dizer "agora" nem "últimos dias". A data do download fica em `public/data/`.
- Cada alerta diz se a tempestade é **real** (com a data) ou **simulada** (quando falta o arquivo de dados).
- A dose nunca é dita em mSv para a criança.

## Os conjuntos de dados

### DONKI: banco de dados de clima espacial

- **Link:** <https://ccmc.gsfc.nasa.gov/tools/DONKI/> (pela API em <https://api.nasa.gov/>)
- **O que usamos:** nuvens de plasma do Sol (CMEs) com data, tipo e velocidade, em 6 **missões históricas** de 15 sóis
  cada, de 2023 a 2025 (`public/data/missions.json`). Sem esse arquivo, o jogo sorteia erupções solares reais classe
  M e X (`public/data/donki-flares.json`).
- **Por quê:** é a fonte que o desafio cita para "atividade solar real e risco de radiação". A troca de engenharia da
  blindagem (proteger a tripulação ou fazer ciência) acontece em cima de uma tempestade que aconteceu de verdade.
- **Onde aparece:** no aviso da Terra ("Tempestade real: data"), no relatório da noite e na tela final, que lista as 3
  tempestades da missão com data e força. A força vira palavra (fraca, média, forte).
- **Cada evento guarda o link** para a página original no DONKI, dentro do arquivo de dados.
- **Detalhes técnicos:** [dados.md](dados.md) e [apis-nasa.md](apis-nasa.md#donki-clima-espacial).

### JPL Horizons: posição dos planetas

- **Link:** <https://ssd.jpl.nasa.gov/horizons/>
- **O que usamos:** a distância real entre a Terra e Marte em cada sol da missão histórica. Dela vem o atraso da
  mensagem: de 3 a 22 minutos, conforme a posição dos planetas.
- **Por quê:** o desafio pede o **atraso de comunicação** como restrição. Com o número real, a criança sente que a Terra
  não responde na hora e que às vezes a tripulação decide sozinha.
- **Onde aparece:** em toda mensagem da Terra e na tela final ("as mensagens levaram de X a Y minutos").

### Fotos reais na viagem (NASA Image Library e Photojournal)

Cartões com o selo "FOTO REAL" e uma legenda curta passam ao lado do foguete na intro da viagem. O crédito fica aqui,
não no cartão.

| Foto | Legenda no jogo | Link | Crédito | Ficha |
| --- | --- | --- | --- | --- |
| A Terra vista pela Apollo 17 (07/12/1972) | "A Terra vista pela Apollo 17 (1972)" | <https://images.nasa.gov/details/as17-148-22727> | NASA | [F34](ciencia-marte.md#f34-a-f36-fotos-reais-na-trajetória-da-viagem) |
| Marte inteiro, mosaico de ~1000 imagens das sondas Viking | "Marte visto pelas sondas Viking" | <https://photojournal.jpl.nasa.gov/catalog/PIA00407> | NASA/JPL/USGS | F35 |
| A Lua cheia vista pela Apollo 11 na volta (21/07/1969) | "A Lua vista pela Apollo 11 (1969)" | <https://images.nasa.gov/details/as11-44-6667> | NASA | F36 |

**Fatos da viagem:** 203 dias até Marte ([F30](ciencia-marte.md#f30-a-viagem-até-marte-leva-meses)), 4 dias até a Lua
([F31](ciencia-marte.md#f31-a-viagem-até-a-lua-leva-dias)) e a órbita da Terra antes de partir
([F37](ciencia-marte.md#f37-o-foguete-entra-em-órbita-da-terra-antes-de-partir)).

### Foto da cratera Jezero: rover Perseverance (PIA24745)

- **Link:** <https://images.nasa.gov/details/PIA24745>
- **O que é:** a cratera Jezero em 15 de julho de 2021 (sol 143), cinco imagens da câmera Mastcam-Z juntas.
- **Crédito:** NASA/JPL-Caltech/ASU/MSSS.
- **Onde aparece:** **não aparece no jogo** desde a nova escolha de lugar em 3D. O arquivo continua em
  `public/assets/images/` e é usado no pitch.

### OSDR: pesquisas de saúde no espaço

- **Link:** <https://osdr.nasa.gov/bio/repo/data/studies/OSD-342>
- **O que é:** no estudo OSD-342 (missão RR-19), camundongos que passaram 33 dias na Estação Espacial perderam massa
  muscular e óssea ([F29](ciencia-marte.md#f29-camundongos-no-espaço-perderam-músculo-e-osso-osdr)).
- **Por quê:** é a base do motivo de a tripulação ir à academia todo dia ([F9](ciencia-marte.md#f9-astronautas-se-exercitam-todo-dia)).
- **Onde aparece:** **não aparece no jogo.** O balão do exercício usa o fato F9 (2 horas por dia), mais simples para 7 anos.

### RAD do Curiosity: radiação medida no chão de Marte

- **Link:** <https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/>
- **O que é:** cerca de 0,67 mSv por dia na superfície de Marte (cratera Gale, 2012–2013).
- **Por quê:** é a única medição de radiação **em Marte**. Serve para explicar aos adultos que a dose do jogo é uma
  escala própria, que nunca é convertida em mSv.
- **Onde aparece:** **não aparece no jogo.**

### Na Lua

- **Radiação:** a sonda chinesa Chang'e 4 mediu cerca de 1,4 mSv por dia no chão da Lua, uns 2 vezes o que o Curiosity
  mediu em Marte. <https://doi.org/10.1126/sciadv.aaz1334>. Por isso a dose de todo dia na Lua é +2, e não +1. No jogo,
  aparece só o fato simplificado ("💡 A sonda Chang'e 4 mediu o dobro da radiação de Marte").
- **Outros fatos da Lua** (sombra no polo, Terra baixa no horizonte, Lunokhod 2): fontes L1 a L5 em
  [game-design.md, Base lunar](game-design.md#base-lunar).

## Fatos nos balões e relatórios

Cada fato aparece uma vez por partida, sem a linha "Fonte". A fonte está na ficha.

| Fato no jogo (chave) | Ficha / fonte |
| --- | --- |
| 💪 Hora de malhar (`fact.exercise`) | [F9](ciencia-marte.md#f9-astronautas-se-exercitam-todo-dia) |
| 🌱 Estufa de encher (`fact.greenhouseInflatable`) | [F20](ciencia-marte.md#f20-a-estufa-da-nasa-para-a-lua-e-marte-é-inflável-não-de-vidro) |
| 🚀 EVA (caminhada lá fora) (`eva.fact`) | Relatório da NASA sobre EVA, em [game-design.md](game-design.md) (seção da EVA) |
| 🦘 Pulo gigante (`crew.fact.gravity`) | Gravidade de Marte, 0,38 g: [fisica.md](fisica.md) (NASA/JPL, Mars 2020 Quick Facts) |
| 💡 Tubos do Perseverance (`fact.tubes`) | [F14](ciencia-marte.md#f14-o-perseverance-tem-poucos-tubos-de-amostra) |
| 💡 Bateria do Perseverance (`fact.battery`) | [F23](ciencia-marte.md#f23-o-rover-de-ciência-passa-a-noite-onde-está) |
| 💡 Opportunity e Spirit (`fact.opportunity`, `fact.spirit`) | [game-design.md, Fatos reais dos rovers](game-design.md#fatos-reais-dos-rovers) |

## Planejado (ainda não está no jogo)

| Fonte | Para quê |
| --- | --- |
| [RadLab](https://visualization.osdr.nasa.gov/radlab/gui/data-api/) | Dose medida na Estação Espacial, sempre dita "em órbita da Terra", nunca "em Marte" |
| [Mars Trek](https://trek.nasa.gov/mars/) e [Moon Trek](https://trek.nasa.gov/moon/) | Terreno real da cratera Jezero e do polo sul da Lua; hoje o terreno é gerado pelo jogo |
| MEDA (clima do Perseverance) | Temperatura e nascer do sol reais de Jezero no relatório ([apis-nasa.md](apis-nasa.md#meda-clima-do-perseverance)) |
