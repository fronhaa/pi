# APIs da NASA para o jogo

Este guia lista só as APIs abertas da NASA que o jogo pode usar e explica como cada uma funciona e para que serve na Missão Jezero.
A regra de jogo de cada dado fica em [game-design.md](game-design.md#dados-reais-da-nasa). Este guia trata da parte técnica: endpoint, autenticação, formato da resposta e se a API funciona direto do navegador.

> Última conferência: 2026-11-14. Todos os endpoints foram chamados de verdade, com cabeçalho `Origin` de site externo para testar o CORS.
> Se uma API mudar de comportamento, atualize este guia e a data acima.

## Resumo para decidir

O jogo é um site estático: roda no navegador do jogador, sem servidor. Por isso, o que mais importa em cada API é o **CORS**, ou seja, se o navegador tem permissão de chamá-la a partir do nosso domínio.

- **CORS liberado** (`access-control-allow-origin: *`): dá para chamar ao vivo, do navegador.
- **Sem CORS**: o navegador bloqueia. O dado precisa ser baixado **antes do deploy**, por um script em Node, e salvo como JSON em `public/data/`.

| API | CORS | Uso na Missão Jezero | Decisão |
| --- | --- | --- | --- |
| [DONKI (clima espacial)](#donki-clima-espacial) | ✅ | Tempestades solares reais | **Em uso (núcleo).** O endpoint `FLR` está fora do ar; as erupções vêm de `notifications` ([dados.md](dados.md)) |
| [JPL Horizons](#jpl-horizons-distância-terra-marte) | ❌ | Atraso real das mensagens entre Terra e Marte | **Usar, com dado baixado** |
| [MEDA, clima do Perseverance](#meda-clima-do-perseverance) | ✅ | Nascer e pôr do sol e temperatura real de Jezero no relatório do sol | **Usar, com dado baixado** |
| [OSDR, busca](#osdr-pesquisas-de-biologia-espacial) | ❌ | Estudos reais na tela final | **Usar, com dado baixado** |
| [Fotos do Perseverance](#fotos-brutas-do-perseverance) | ✅ | "Foto de Jezero" na tela inicial ou no relatório | Opcional |
| [Mars Trek](#mars-trek-mapas-de-marte) | ✅ | Minimapa ou textura | Depois do hackathon |
| [RadLab](#radlab-dose-medida-na-iss) | ❌ | Comparação com dose medida na ISS | Depois do hackathon |
| [Biblioteca de imagens](#biblioteca-de-imagens-e-vídeos-da-nasa) | ✅ | Arte da tela de título e do vídeo | Baixa prioridade |

**Prioridade no hackathon:** as tempestades reais do DONKI já estão no jogo ([dados.md](dados.md)). Próximos: (1) missões históricas com atraso real do Horizons (dados prontos), (2) baixar OSDR e MEDA antes do deploy.

## Configurar a chave da NASA

A chave pessoal do projeto fica no arquivo `.env` da raiz, que **não vai para o git** (o `.gitignore` ignora `.env*`):

```bash
# .env
NASA_API_KEY=sua-chave-aqui
```

- **Quem acabou de clonar o repositório:** copie `.env.example` para `.env` e cole a chave do time (peça a quem tem o `.env`) ou gere uma própria, grátis, em <https://api.nasa.gov/>.
- **Nunca** escreva a chave em código, docs ou commits. O código sempre lê da variável de ambiente.
- A chave só é usada pelos scripts de coleta (`npm run fetch-data`, `npm run data:missions`). **O jogo nunca chama a API** ([dados.md](dados.md)), então a chave não vai para o JavaScript publicado e o deploy não precisa dela. Por isso a variável **não** tem o prefixo `VITE_`: com ele, o Vite embutiria a chave no jogo.
- Limite: a chave do projeto aceitou 2.500 chamadas por hora no teste de 2026-11-14 (o cabeçalho `X-RateLimit-Remaining` de cada resposta mostra quanto sobra). Com a `DEMO_KEY`, o limite é bem menor e é dividido por IP.

## Regras para todo código que usa estas APIs

1. **Chave da NASA:** só o `api.nasa.gov` exige chave (DONKI). O projeto já tem uma chave pessoal configurada no arquivo `.env` da raiz, na variável `NASA_API_KEY` (ver [Configurar a chave](#configurar-a-chave-da-nasa)). Em scripts Node, leia `process.env.NASA_API_KEY`. Sem chave, use `DEMO_KEY`, que tem limite baixo e quase sempre está esgotada.
2. **Sempre checar vazio e nulo.** Telemetria vem com falhas: o DONKI devolve `[]` quando não houve evento, e o MEDA devolve `"--"` em temperaturas sem leitura.
3. **Ordem de carregamento** para todo dado: ao vivo, depois arquivo baixado, depois simulado. O jogo mostra um selo honesto em cada caso: "ao vivo", "dados reais baixados em AAAA-MM-DD" ou "simulado". Dado baixado **nunca** aparece como ao vivo (o desafio exige isso).
4. **Não usar** a API antiga `api.nasa.gov/mars-photos/api/v1/...`, que foi aposentada. Para fotos, use os feeds diretos do JPL listados aqui.
5. **Fonte citada no jogo:** todo dado real aparece com nome da fonte e link na tela "Dados da NASA".

## APIs recomendadas

### DONKI (clima espacial)

Banco de dados de eventos de clima espacial da NASA: erupções solares, ejeções de massa coronal e tempestades geomagnéticas.

| Item | Valor |
| --- | --- |
| Endpoint | `https://api.nasa.gov/DONKI/{TIPO}?startDate=AAAA-MM-DD&endDate=AAAA-MM-DD&api_key=CHAVE` |
| Autenticação | `api_key` (ou `DEMO_KEY`) |
| CORS | ✅ liberado |
| Retorno | Lista JSON de eventos; `[]` se não houve nenhum no período |

Tipos de evento:

| Tipo | O que é | Estado em 2026-11-14 | Campos úteis |
| --- | --- | --- | --- |
| `FLR` | Erupção solar (*flare*) | ❌ **devolve 404** para qualquer período. Alternativa em uso: `notifications?type=FLR` ([dados.md](dados.md)) | `flrID`, `beginTime`, `peakTime`, `classType` (`"X1.2"`), `sourceLocation` |
| `CME` | Ejeção de massa coronal: nuvem de plasma lançada pelo Sol | ✅ | `activityID`, `startTime`, `cmeAnalyses[].speed`, `cmeAnalyses[].type`, `linkedEvents[]`, `link` |
| `SEP` | Evento de partículas solares energéticas | ✅ | `sepID`, `eventTime`, `linkedEvents[]` |
| `GST` | Tempestade geomagnética (na Terra) | ✅ | `gstID`, `startTime`, `allKpIndex[].kpIndex` |

**Uso no jogo hoje:** as tempestades são erupções reais M5+ e X, extraídas das notificações do DONKI por `npm run fetch-data` e salvas em `public/data/donki-flares.json`. Coleta, cache e limitações: [dados.md](dados.md).

**Planejado:** as [missões históricas](game-design.md#calendário-da-missão-janelas-históricas-reais) usam CMEs, pelo tipo de velocidade: S e C = fraca, O = média, R e ER = forte. Os dados já estão em `public/data/missions.json` (ver [abaixo](#missões-históricas-npm-run-datamissions)).

Vale considerar também o `SEP`: as partículas solares energéticas são o que de fato aumenta a dose de radiação de um astronauta. Cinco das 6 missões têm eventos SEP no DONKI dentro dos 15 sóis (a missão 5 não tem); eles estão em `sepEvents` no `missions.json` e podem virar texto no relatório do sol.

Exemplo de leitura defensiva:

```ts
// Em script Node (o jogo não chama a API).
const key = process.env.NASA_API_KEY || 'DEMO_KEY';
const url = `https://api.nasa.gov/DONKI/CME?startDate=${start}&endDate=${end}&api_key=${key}`;

const res = await fetch(url);
if (!res.ok) throw new Error(`DONKI ${res.status}`);
const events: unknown = await res.json();
const cmes = Array.isArray(events) ? events : [];

const storms = cmes
  .map((e) => ({
    id: e.activityID as string,
    date: e.startTime as string,
    type: e.cmeAnalyses?.[0]?.type as string | undefined, // pode faltar
    link: e.link as string | undefined,
  }))
  .filter((s) => s.type);
```

Alternativa fora da NASA, se precisar de classes de erupção: o feed da NOAA com dados do satélite GOES (`https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json`) tem CORS liberado. Se usar, a fonte citada no jogo deve ser NOAA, não NASA.

### JPL Horizons (distância Terra-Marte)

Sistema do JPL que calcula a posição de planetas e sondas. Com ele, sabemos a distância real entre Terra e Marte em cada data e, portanto, quanto tempo uma mensagem de rádio leva.

| Item | Valor |
| --- | --- |
| Endpoint | `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='499'&CENTER='500@399'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&START_TIME='AAAA-MM-DD'&STOP_TIME='AAAA-MM-DD'&STEP_SIZE='1d'&QUANTITIES='20'` |
| Autenticação | Nenhuma |
| CORS | ❌ bloqueado |
| Retorno | JSON com `signature` e `result`, um **bloco de texto** com a tabela de efemérides entre `$$SOE` e `$$EOE` |

Parâmetros: `499` é Marte, `500@399` é o centro da Terra, e a quantidade `20` devolve a distância (`delta`, em UA) e a sua variação. O tempo de luz em minutos é `delta × 149.597.870,7 km ÷ 299.792,458 km/s ÷ 60`, ou cerca de `delta × 8,317`.

**Uso no jogo:** hoje o atraso das mensagens é sorteado entre 3 e 22 minutos. Com o Horizons, o alerta pode dizer "esta mensagem levou 14 minutos", com o atraso real para a data do evento. Isso reforça o objetivo de aprendizagem 3 ("A Terra está longe").

**Como integrar:** como não há CORS, um script baixa uma tabela com um valor por dia (por exemplo, um ano inteiro) e salva em `public/data/`. O texto em `result` precisa ser lido linha a linha entre `$$SOE` e `$$EOE`.

**Posição real do Sol em Jezero ([Art Bible, seção 5](art-bible.md#5-padrão-de-iluminação)).** O mesmo Horizons calcula a altura e a direção do Sol vistas da base. Isso pode guiar a luz direcional da cena e o horário do pôr do sol. Testado em 2026-11-14:

```
COMMAND='10'  CENTER='coord@499'  COORD_TYPE='GEODETIC'
SITE_COORD='-77.45,18.44,0'   (Marte usa longitude oeste positiva: 77,45° L vira -77,45)
EPHEM_TYPE='OBSERVER'  QUANTITIES='4'  STEP_SIZE='10m'
```

A resposta traz azimute e elevação do Sol (`Azi`, `Elev`) a cada passo. Elevação negativa = noite. Classificação: REAL.

### MEDA (clima do Perseverance)

Estação meteorológica do rover Perseverance, dentro da cratera Jezero, o mesmo local da base do jogo.

| Item | Valor |
| --- | --- |
| Endpoint | `https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json` |
| Autenticação | Nenhuma |
| CORS | ✅ liberado |
| Retorno | `sols[]` com `sol`, `terrestrial_date`, `ls`, `season`, `min_temp`, `max_temp` (°C), `pressure` (Pa), `sunrise`, `sunset` |

**Cuidados:** o feed traz **só 7 sóis** (1127 a 1133, de 21 a 27 de abril de 2024; conferido em 2026-11-14), então não é "ao vivo" e não cobre os 15 sóis de uma partida. Além disso, muitos sóis têm `"--"` no lugar do número. Trate `"--"` como ausente, nunca como zero.

**Uso no jogo:** no relatório do sol, frases como "Esta noite em Jezero: −80 °C. Os aquecedores gastam energia." e o horário real do pôr do sol. Selo: "dados reais baixados".

**Não usar como regra por enquanto.** Ligar a temperatura ao gasto da bateria mudaria o equilíbrio validado em 2.000 partidas. Comece só com texto.

### OSDR (pesquisas de biologia espacial)

Repositório de dados científicos da NASA sobre como o voo espacial afeta seres vivos: ossos, músculos, sono, imunidade.

| Item | Valor |
| --- | --- |
| Endpoint | `https://osdr.nasa.gov/osdr/data/search?term=PALAVRA&from=0&size=25` (ex.: `bone`, `muscle`, `sleep`) |
| Autenticação | Nenhuma |
| CORS | ❌ só libera o próprio `osdr.nasa.gov` |
| Retorno | Resposta do Elasticsearch: `hits.total` e `hits.hits[]._source`, com campos como `Study Title`, `Study Description`, `organism`, `Study Factor Name` e o identificador `OSD-NNN` |

**Uso no jogo:** três estudos reais na tela final, sempre rotulados como "pesquisas em biologia espacial", nunca como condição médica em Marte (Art Bible, seção 7).

**Atenção:** o GDD marca esta integração como "pronta, mas não testada". Do navegador ela **sempre vai falhar** por causa do CORS. A solução é baixar os estudos antes do deploy e manter o link para o OSDR como alternativa.

### Fotos brutas do Perseverance

Feed direto do JPL com as fotos que o Perseverance tira em Jezero, sem processamento.

| Item | Valor |
| --- | --- |
| Endpoint | `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&ver=1.2&num=25&page=0` |
| Autenticação | Nenhuma |
| CORS | ✅ liberado |
| Retorno | `images[]` com `sol`, `date_taken_utc`, `camera.instrument`, `caption` e `image_files` (`small`, `medium`, `large`, `full_res`) |

**Uso no jogo (opcional):** uma "foto de Jezero de verdade" na tela inicial ou no fim da missão. É um dos poucos dados que funcionam realmente ao vivo. Use o tamanho `small` ou `medium` para não pesar no celular.

**Uso na arte ([Art Bible, seção 7.2](art-bible.md#72-nasa-perseverance)):** o campo `camera.instrument` permite filtrar fotos do Mastcam-Z (`MCZ_*`) e do SuperCam (`SUPERCAM_RMI`) para referência de rochas, solo e do delta. Cada foto tem `imageid` e `sol`, que servem para registrar a fonte de um asset classificado como REAL ou INTERPRETADO ([seção 11](art-bible.md#11-padrão-de-classificação-científica)).

### Mars Trek (mapas de Marte)

Serviço de mapas em blocos (*tiles*) no padrão WMTS, compatível com Three.js.

| Item | Valor |
| --- | --- |
| Endpoint | `https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg` |
| Autenticação | Nenhuma |
| CORS | ✅ liberado |
| Retorno | Imagens `.jpg` ou `.png` por zoom (`z`), linha (`y`) e coluna (`x`) |

**Limite:** essa camada é uma imagem colorida do planeta inteiro, com 463 m por pixel. Não serve para modelar o relevo ao redor da base, que tem dezenas de metros. Para o terreno real (backlog #10), é preciso um modelo de elevação de Jezero, de maior resolução. Antes disso, a camada pode servir como minimapa mostrando onde fica Jezero.

**Terreno de Jezero ([Art Bible, seções 7.1 e 8](art-bible.md#71-nasa-mars-trek)).** O catálogo do Mars Trek tem um modelo de elevação de alta resolução da região: `NES_JEZ_MID_DEM_Mosaic_HiRISE_CTX_HRSC_GCS_MARS_07-10-2018` ("MRO HiRISE, DEM Jezero NE Syrtis Midway"), de 76,79° a 77,73° L e de 17,58° a 18,69° N. É um arquivo de cerca de 10 GB e **não** está disponível como *tiles* no mesmo padrão de URL da camada global (o `WMTSCapabilities.xml` devolveu 404). Para o jogo, recorte só a área da base em ferramenta de GIS, reduza para um *heightmap* pequeno e salve em `public/assets/`. Serve também para conferir as regiões conceituais da [seção 8.2](art-bible.md#82-regiões-conceituais-do-primeiro-ambiente) antes de marcá-las como reais. Busca no catálogo: `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?q=Jezero%20DEM&rows=50&proj=urn:ogc:def:crs:EPSG::104905`.

### RadLab (dose medida na ISS)

Medições de radiação feitas por dosímetros a bordo da Estação Espacial Internacional.

| Item | Valor |
| --- | --- |
| Endpoint | `https://visualization.osdr.nasa.gov/radlab/api/` (documentação: <https://visualization.osdr.nasa.gov/radlab/gui/data-api/>) |
| Autenticação | Nenhuma |
| CORS | ❌ bloqueado |
| Retorno | Tabelas de dose por tempo e instrumento. Sem parâmetros, devolve erro 500 ("No columns specified"); a consulta precisa indicar as colunas |

**Uso no jogo (backlog #9):** contexto, como "um astronauta na ISS recebe cerca de X por dia". Sempre rotulado "medido na ISS, em órbita da Terra", nunca como dose em Marte. Precisa de dado baixado antes do deploy.

### Biblioteca de imagens e vídeos da NASA

Catálogo de imagens já tratadas: panoramas, fotos de órbita, vídeos.

| Item | Valor |
| --- | --- |
| Endpoint | `https://images-api.nasa.gov/search?q=jezero&media_type=image` |
| Autenticação | Nenhuma |
| CORS | ✅ liberado |
| Retorno | `collection.items[]`, cada um com `data[]` (`nasa_id`, `title`, `description`, `date_created`) e `links[]` (`href` da imagem) |

**Uso:** arte de referência para a tela de título e o vídeo de apresentação. Cuidado com a regra de marca: nada de logo da NASA no jogo.

Exemplo útil para a Art Bible: a busca `q=Curiosity sunset Gale` devolve `PIA19400` ("Sunset in Mars Gale Crater"), a foto que fundamenta o pôr do sol com halo azulado ([seção 5](art-bible.md#5-padrão-de-iluminação)).

## Dados baixados antes do deploy

As erupções do jogo atual são coletadas por `npm run fetch-data`, documentado em [dados.md](dados.md). Para as outras APIs sem CORS, e como reserva para as que têm, os dados também são baixados por scripts em Node e salvos em `public/data/`, com a data em que foram baixados (para o selo "dados reais baixados em AAAA-MM-DD").

### Missões históricas: `npm run data:missions`

Script: [`scripts/fetch-missions.mjs`](../scripts/fetch-missions.mjs). Saída: [`public/data/missions.json`](../public/data/missions.json) (cerca de 30 KB).

1. Lê `NASA_API_KEY` do `.env` (ou usa `DEMO_KEY`).
2. Para cada uma das 6 missões do [GDD](game-design.md#calendário-da-missão-janelas-históricas-reais), busca no DONKI as CMEs e os SEPs da janela e, no Horizons, a distância Terra-Marte a cada 6 h.
3. Confere as regras: cada CME escolhida existe, tem tipo válido, cai entre os sóis 4 e 14 e fica a pelo menos 2 sóis da anterior. Se algo falhar, o script para com erro e não grava o arquivo.

As CMEs ficam fixas por ID no script, então rodar de novo gera o mesmo conteúdo (só muda `generatedAt`). Para trocar uma missão, edite a lista `MISSIONS` no script e a tabela do GDD juntas.

Formato (campos principais):

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-14T…Z",        // data do selo "dados reais baixados"
  "solSeconds": 88775.244,
  "sources": [{ "name": "…", "url": "…" }],
  "missions": [{
    "id": 4,
    "difficulty": "hard",                 // "medium" | "hard"
    "startUtc": "2024-05-06T00:00:00.000Z",
    "endUtc": "2024-05-21T09:53:48.660Z",
    "earthDelayMinutes": { "min": 15.8, "max": 16.3 },
    "storms": [{
      "sol": 14,
      "activityId": "2024-05-20T05:36:00-CME-001",
      "startTime": "2024-05-20T05:36:00.000Z",
      "cmeType": "R",                     // S, C, O, R ou ER
      "speedKmS": 2678,                   // pode ser null
      "strength": "strong",               // "weak" | "medium" | "strong"
      "link": "https://ccmc.gsfc.nasa.gov/DONKI/view/CME/31034/-1"
    }],
    "sols": [{ "sol": 1, "startUtc": "…", "earthDelayMinutes": 16.3 }],   // 15 itens
    "sepEvents": [{ "sol": 4, "sepId": "…", "eventTime": "…", "link": "…" }]  // pode ser []
  }]
}
```

A intensidade numérica de cada força (fraca 10, média 25, forte 45) **não** está no arquivo: é regra do jogo e fica na configuração da simulação.

### Pendentes

MEDA, OSDR e posição do Sol (Horizons) ainda não têm script. Quando tiverem, siga o mesmo padrão: um script por arquivo, validação antes de gravar e um comando `npm run data:*`.
