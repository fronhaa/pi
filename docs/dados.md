# Dados reais da NASA

O desafio pede dados reais, com fonte visível e verificável ([desafio.md](desafio.md)).
Aqui fica **de onde vem cada dado, como foi coletado e como atualizar**.

Regras:
- Ordem de carregamento (ver [game-design.md](game-design.md#dados-reais-da-nasa)): **ao vivo** → **dados reais baixados** (`public/data/`, com a data) → **simulado**. A interface mostra um selo honesto com qual deles está em uso; dado baixado nunca é chamado de "ao vivo".
- Todo evento guarda o `link` para a página original na NASA, para qualquer pessoa conferir.
- O jogo pode **escalar** números para a jogabilidade, mas a tela "Dados da NASA" mostra o valor real.
- **Previsão é previsão:** se o dado vem de modelo, o jogo diz "a NASA previu", nunca "aconteceu em Marte".

## Tempestades solares: DONKI

| | |
| --- | --- |
| Fonte | [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) (NASA / CCMC) via [api.nasa.gov](https://api.nasa.gov/) |
| Arquivo do jogo | `public/data/donki-flares.json`: erupções M e X, só os campos usados (~42 KB; **~5 KB com gzip**) |
| Dataset completo | `data/donki-solar-events.json`: SEP, FLR e CME-MARS com todos os campos (~400 KB). **Não vai no build**; serve para consulta, verificação e ideias futuras |
| Script | [`scripts/fetch-donki.mjs`](../scripts/fetch-donki.mjs) |
| Período | 2016-01-01 até a data da coleta (`fetchedAt` no arquivo) |

### Como atualizar

1. Pegue uma chave grátis em <https://api.nasa.gov/> (sai na hora, por e-mail).
2. Copie `.env.example` para `.env` e preencha `NASA_API_KEY=...`. O `.env` **não** vai para o git.
3. Rode `npm run fetch-data` e confira o resumo impresso (quantidade de eventos e requisições usadas).
4. Commite os arquivos gerados **e o cache** (`data/cache/donki/`).

### Limite da API e cache

A api.nasa.gov tem limite de requisições por hora (por chave; a `DEMO_KEY` pública é compartilhada e
quase sempre está esgotada). Como ela aceita **no máximo 60 dias por requisição**, baixar 2016 até hoje
custa **~200 requisições**. Para não gastar isso toda vez, o script guarda cada bloco de 60 dias em
`data/cache/donki/<tipo>/<início>.json` (só os campos usados; ~370 KB no total) e **reaproveita**:

| Situação | O que o script faz |
| --- | --- |
| Bloco antigo, baixado quando já estava "assentado" (30 dias depois do fim) | Usa o cache, **sem requisição** |
| Bloco recente (o DONKI ainda corrige eventos) | Baixa de novo e atualiza o cache |
| Limite estourou no meio (HTTP 429) | O que já veio fica salvo; rode de novo depois e ele continua dali |
| `DONKI_FORCE=1 npm run fetch-data` | Ignora o cache e baixa tudo (~200 requisições) |

Medido em 2026-11-14: a primeira coleta fez 201 requisições; **a segunda fez 6** (2 blocos recentes × 3 tipos)
e gerou arquivos idênticos.

**O jogo nunca chama a API.** Ele só lê `public/data/donki-flares.json`. Assim, nenhum jogador gasta
o limite. Se um dia houver busca "ao vivo" no navegador, ela precisa de cache no próprio navegador e
continuar caindo para os dados baixados quando a API falhar ou recusar.

### O que é coletado

| `type` | O que é | Por que importa no jogo | Critério |
| --- | --- | --- | --- |
| **`SEP`** (*Solar Energetic Particle*) | Chuva de partículas muito rápidas vindas do Sol | É o que **aumenta a dose de radiação** fora da proteção da Terra | Todos os eventos (359 na coleta de 2026-11-14) |
| **`FLR`** (*Solar Flare*) | Erupção solar, um clarão de raio-X | **Dispara as tempestades do jogo**; a classe define a intensidade (M = média, X = forte) | A partir de **M5.0**: 194 M e 111 X |
| **`CME-MARS`** (*Coronal Mass Ejection*) | Nuvem gigante de plasma lançada pelo Sol | O modelo da NASA **previu que ela atingiria Marte**, com data e hora | Impacto em Marte previsto pelo WSA-ENLIL (642) |

### Campos

| Campo | Tipos | Significado |
| --- | --- | --- |
| `id`, `time`, `link` | todos | Identificador e data no DONKI; `link` abre a página do evento na NASA |
| `instruments` | SEP | Instrumentos que detectaram (todos perto da Terra ou em órbita do Sol, ver limitações) |
| `linkedFlareClass` | SEP | Classe da erupção X ligada ao evento, se houver |
| `classType` | FLR | Intensidade: A < B < C < M < X; cada letra é 10× a anterior. X9 é 9× mais forte que X1 |
| `activeRegion` | FLR | Número da mancha solar de origem |
| `causedSEP` | FLR | Se o DONKI ligou essa erupção a um evento de partículas |
| `speedKmS` | CME-MARS | Velocidade da nuvem, em km/s |
| `predictedArrivalAtMars` | CME-MARS | Chegada prevista em Marte pelo modelo |
| `glancingBlow` | CME-MARS | `true` = previsão de impacto "de raspão" (mais fraco) |

### Eventos de destaque (candidatos a eventos especiais no jogo)

Extraídos da coleta de 2026-11-14. Confira sempre pelo `link` no JSON.

| Data | Evento | Por que é bom para o jogo |
| --- | --- | --- |
| 2017-09-06 | Erupção **X9.3**, a mais forte do período | "A maior erupção em 10 anos" |
| 2017-09-10 | Erupção **X8.2** + partículas + CME de 2.650 km/s prevista para Marte em 13/09 | Fecha a história completa: clarão → partículas → nuvem chegando em Marte. *Candidato a evento-estrela:* a NASA divulgou na época observações desse evento em Marte (sonda MAVEN e rover Curiosity); **falta localizar e linkar a fonte oficial** antes de usar no jogo |
| 2024-02-12 | CME de **3.180 km/s**, a mais rápida prevista para Marte, chegada em 2 dias | Mostra quão pouco tempo há para reagir |
| 2024-05 | **21 erupções X** em um mês, incluindo X8.7 em 14/05 | "Mês de tempestade": várias decisões seguidas |
| 2024-10-03 | Erupção **X9.0** | Evento recente e muito forte |

### Limitações conhecidas

- **Nenhum evento SEP do DONKI foi medido em Marte.** Os instrumentos do catálogo (GOES, SOHO, ACE,
  STEREO-A) ficam perto da Terra ou em órbita do Sol. Por isso a ligação com Marte vem das
  previsões `CME-MARS`, que são **modelo**, não medição.
- O DONKI só emite notificação para erupções a partir de **M5.0**. Por isso não há erupções C
  (intensidade "fraca" do GDD) nem M1–M4 nos dados reais; a intensidade fraca só aparece no modo simulado.
- O endpoint `DONKI/FLR` da api.nasa.gov respondia **404** na coleta (2026-11-14), inclusive para
  chamadas do navegador. A busca **ao vivo** do jogo deve usar `DONKI/notifications?type=FLR`
  (testado: responde 200 e permite CORS). Com `DEMO_KEY` responde 429 na maior parte do tempo. As erupções são
  extraídas das **notificações** do DONKI (linhas "Flare intensity" e "Activity ID"), que só existem
  para erupções significativas. Se o endpoint voltar, vale trocar.
- Uma CME pode ter várias simulações; usamos a mais recente. Simulações com várias CMEs são
  atribuídas à mais rápida.
- Ausência de registro no DONKI não prova ausência de evento.
- O endpoint direto `kauai.ccmc.gsfc.nasa.gov` (sem chave) não respondia da rede de desenvolvimento.
  Se funcionar na sua rede: `DONKI_BASE_URL=https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get`.
