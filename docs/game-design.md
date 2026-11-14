# Game design: Base Marte Pi

> Documento vivo. Descreve **o que o jogo é e como funciona** para o jogador.
> Mudou uma regra do jogo? Atualize aqui no mesmo PR. Requisitos do desafio: [desafio.md](desafio.md).

## Pitch

A criança é a **comandante de uma pequena base em Marte**. A cada *sol* (o dia marciano), ela decide
para onde vai a pouca energia que os painéis solares geram. Tempestades solares **reais**, registradas
pela NASA, chegam sem pedir licença. Quem protegeu a tripulação, mas deixou a estufa sem luz, vai ter
menos comida amanhã. **Nenhuma escolha é de graça.**

## Público

- Crianças de **7 a 12 anos**. Texto curto, frases simples, ícones grandes.
- Todo termo técnico ganha uma explicação de uma linha na hora em que aparece.
- Jogo em **português e inglês** (os juízes avaliam em inglês).
- Partida curta: **10 a 15 minutos**, para caber numa aula.

## Por que Marte

- Mais trade-offs naturais: atmosfera fina, **sem campo magnético global** (mais radiação),
  **menos luz do sol** que na Terra e **tempestades de poeira** que cobrem os painéis.
- **Atraso de comunicação** com a Terra de vários minutos: a Terra não pode salvar a base em tempo real.
- Dados reais do terreno pelo Mars Trek, para a base ficar num lugar de verdade.

## Loop principal (um sol)

```
1. AMANHECER   Painéis geram energia (menos se houver poeira).
               Chegam alertas (alguns com atraso de comunicação).
2. DECISÃO     O jogador distribui as unidades de energia entre os módulos.
3. O DIA PASSA O astronauta anda pela base; módulos funcionam conforme a energia recebida.
               Pode acontecer um EVENTO (tempestade solar, poeira, falha).
4. RELATÓRIO   O que mudou e por quê, com um cartão "Você sabia?" quando cabe.
```

Uma missão tem um número fixo de sóis (ex.: 15). Objetivo: **chegar ao fim com a tripulação bem**
e, como bônus, completar experimentos científicos.

## Recursos (seguindo o limite de 2 a 3 do desafio)

| Barra | Sobe com | Desce com | Se zerar |
| --- | --- | --- | --- |
| **Oxigênio** | Energia no módulo de oxigênio | Consumo diário da tripulação | Missão encerrada |
| **Comida** | Energia na estufa (luz para as plantas) | Consumo diário | Tripulação enfraquece, depois missão encerrada |
| **Saúde (radiação)** | Lentamente, com descanso | Dose de radiação, maior em tempestades e com escudo fraco | Missão encerrada |

**Energia não é barra:** é a "moeda" de cada sol. Nunca dá para alimentar tudo no máximo.

### Módulos

| Módulo | O que faz | Inspiração real |
| --- | --- | --- |
| Oxigênio | Transforma o CO₂ do ar de Marte em O₂ | Experimento MOXIE, do rover Perseverance |
| Estufa | Planta comida; precisa de luz | Estufa Veggie da ISS + kit da CSA sobre produção de alimentos |
| Escudo | Reduz a dose de radiação da tripulação | Dados do DONKI e de dose (RadLab) |
| *Antena* (fase 2) | Recebe alertas da Terra mais cedo | Atraso de comunicação Terra–Marte |

## Exemplos de trade-off (o coração do jogo)

- **Tempestade solar avisada:** reforçar o escudo protege a saúde, mas a estufa fica sem luz e a comida cai amanhã.
- **Tempestade de poeira:** os painéis geram menos por vários sóis. Melhor guardar oxigênio antes?
- **Experimento científico:** gasta energia extra hoje e dá pontos de ciência, mas tira margem de segurança.
- **Atraso de comunicação (fase 2):** com a antena fraca, o alerta da Terra chega depois da tempestade.

Regra de design: **toda decisão deve mexer em pelo menos duas barras**, uma para cima e outra para baixo.

## Dados reais da NASA

| Dado | Fonte | Como aparece no jogo | Status |
| --- | --- | --- | --- |
| Tempestades solares, CMEs e eventos de partículas | DONKI | Eventos sorteados de uma lista de **eventos reais**, com data: "Isso aconteceu de verdade em …" | A coletar |
| Doses de radiação na ISS | RadLab | Comparação no relatório: "na Estação Espacial seria …" | A coletar |
| Achados de saúde no espaço | OSDR | Cartões "Você sabia?" após consequências (ossos, músculos, sono) | A coletar |
| Terreno do local da base | Mars Trek | Relevo 3D do chão em volta da base | A avaliar |

Regras:
- Dados **embutidos e curados** no jogo (funcionam offline e sem chave de API).
  Se um dia buscarmos ao vivo, a interface diz claramente "ao vivo"; caso contrário, mostra a data do dado.
- Tela **"Dados da NASA"** acessível no menu: lista cada fonte, link e como foi usada.
- Números do jogo podem ser **escalados** para caber na jogabilidade, mas a tela de dados mostra o valor real e explica a escala.
- Todo número real citado no jogo precisa ter fonte registrada no código de dados.

## Rejogabilidade e falha

- Cada partida **sorteia** eventos reais diferentes da lista curada.
- Fim de missão não é "game over": é **"Relatório da missão: o que aprendemos"**, com a decisão que mais pesou.
- Botão "Tentar outra estratégia" volta ao sol 1 na hora.

## Visual e controle

- 3D cartoon (ver [estilo-visual.md](estilo-visual.md)), com paleta marciana a definir.
- Base vista de cima e de lado, com módulos grandes e coloridos; o estado de cada módulo é **visível**
  (luzes da estufa, brilho do escudo, poeira nos painéis).
- Controle principal por **clique/toque** (painel de energia). Andar com o astronauta é opcional e serve de ambientação.

## Escopo do MVP (para a entrega)

1. Base 3D com 3 módulos (Oxigênio, Estufa, Escudo) e painéis solares.
2. Painel de distribuição de energia por sol.
3. As 3 barras com consumo diário.
4. Eventos: tempestade solar (DONKI real) e tempestade de poeira.
5. Relatório por sol e relatório final.
6. Tela "Dados da NASA".
7. PT/EN.

**Fase 2:** antena e atraso de comunicação, experimentos científicos, terreno real (Mars Trek), sala de aula/multijogador.

## Questões em aberto

- **Física:** com controle por clique e o astronauta só como ambientação, o Rapier ainda se justifica?
  Decidir quando o MVP estiver mais claro (ver [ADR 0003](decisoes/0003-manter-rapier-apesar-do-tamanho-do-bundle.md),
  na branch da tela de carregamento).
- **Local exato da base:** cratera Jezero (Perseverance) ou cratera Gale (Curiosity)?
- **Duração da missão e balanceamento:** quantos sóis, quanta energia por sol. Ajustar com testes com crianças.
- **Nome do jogo.**
