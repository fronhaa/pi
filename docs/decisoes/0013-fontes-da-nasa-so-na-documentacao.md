# 0013. Fontes da NASA só na documentação

- **Status:** Aceito
- **Data:** 2026-11-15
- **Autores:** @wnmonzine

## Contexto

O jogo mostrava as referências em vários lugares: a tela "Dados da NASA" (no fim do "Como jogar"), a linha "Fonte: …"
embaixo dos balões de fato e da janela "📅 Sua missão", o link "ver no DONKI" nos alertas de tempestade, na mensagem
"O Sol ultimamente" e na tela final, e o crédito completo da foto do Perseverance.

Para uma criança de 7 a 12 anos, isso é texto que ela não lê: nomes de banco de dados (DONKI, JPL Horizons, OSDR),
siglas (CME, mSv, Mastcam-Z) e links que levam para páginas técnicas em inglês, fora do jogo. A tela "Dados da NASA"
quebrava a regra de no máximo 2 frases curtas por caixa ([linguagem-e-ui-criancas.md](../linguagem-e-ui-criancas.md)).

O desafio coloca "atribuir as fontes dentro da ferramenta" em *Potential Considerations* ("you may, but are not required
to"). O que ele valoriza é a ciência **rastreável e verificável pelos juízes**, com "uma explicação curta de quais dados
da NASA foram usados e por quê" junto do protótipo.

## Opções consideradas

1. **Manter as fontes no jogo**: atende à sugestão do desafio ao pé da letra / polui a tela e fala com adultos, não com
   a criança.
2. **Fontes só na documentação**: o jogo fica limpo para 7 a 12 anos e os juízes e professores conferem tudo num lugar
   só / a criança não vê o nome da fonte (continua vendo que o dado é real: "Tempestade real: data", o selo "FOTO REAL" nos cartões da viagem).

## Decisão

Opção 2. O jogo não mostra referências, links nem nomes de bases de dados. Tudo fica em
[fontes-nasa.md](../fontes-nasa.md), com link, o que é real e onde aparece no jogo; os fatos continuam com fonte e trecho
original em [ciencia-marte.md](../ciencia-marte.md).

## Consequências

- Saem do jogo: a tela "Dados da NASA" (`showNasaData`), o botão de fontes do "Como jogar", as linhas "Fonte: …" dos
  balões e da janela da missão, os links "ver no DONKI" e as chaves `data.*` (menos `data.badge.snapshot`).
- Também saem a linha "Fonte: NASA…" da intro da viagem (`launch.source.*`) e o crédito escrito nos cartões de foto
  (`LaunchScene.ts`); os créditos ficam em `fontes-nasa.md`.
- Continuam no jogo, porque são o conteúdo e a honestidade, não a referência: "Tempestade real: data" / "Erupção
  simulada", "dados reais baixados em…" na mensagem "O Sol ultimamente" (nunca "ao vivo") e o selo "FOTO REAL" com a
  legenda curta nos cartões da viagem ("A Terra vista pela Apollo 17 (1972)").
- O "modo cientista" (unidade real) fica só na dica do mouse.
- O estudo do OSDR (OSD-342) e a medição do RAD do Curiosity deixam de aparecer no jogo: ficam só na documentação e no pitch.
- Todo dado ou fato novo entra primeiro em `ciencia-marte.md` ou `fontes-nasa.md`; a linha "Fonte:" não volta para o jogo.
