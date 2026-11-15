# Linguagem, leitura e UI/UX para crianças de 7 a 12 anos

> **Regra do projeto.** Todo texto, diálogo, botão, alerta ou tela do jogo segue este guia, em **PT e EN**.
> Vale para quem escreve e para o Claude (ver `CLAUDE.md`). Complementa [publico-e-impacto.md](publico-e-impacto.md),
> que tem o checklist de PR. Fatos científicos continuam vindo só de [ciencia-marte.md](ciencia-marte.md).

## Por que (leitura de 7 a 12 anos nos EUA)

Nos Estados Unidos, uma criança de **7 anos** está na passagem do *1st Grade* para o *2nd Grade* e **já lê sozinha**:
domina a decodificação fonética (*Phonics*), conhece de 150 a 300 *Sight Words* e lê de **50 a 90 palavras por minuto
(WCPM)**. Uma criança de **10 a 12 anos** (*5th–6th Grade*) já lê para aprender (*Reading to Learn*).

Para o jogo ser acessível aos 7 e interessante aos 12 (**"Low Floor, High Ceiling"**), os textos seguem as regras abaixo.

> Esses números de leitura são referência de redação do time, não fatos do jogo: não aparecem para a criança.

## 1. As 6 regras de ouro de redação (padrão Lexile 300L–500L)

1. **Frases curtas: de 8 a 12 palavras.** Nada de parágrafo longo ou oração subordinada complicada. Ideia longa vira
   duas frases curtas, com ponto final.
2. **No máximo 2 frases curtas por caixa:** alerta, *tooltip*, ajuda "?" ou balão de diálogo.
3. **Voz ativa e verbo no imperativo.** Instruções e alertas começam com um verbo de ação claro: *"Fix the solar
   panel"*, *"Send the rover"*, *"Melt the ice"*, *"Bring the astronaut inside"* ("Conserte o painel", "Mande o
   rover"). Evite voz passiva.
4. **Glossário vivo: termo real da NASA + explicação simples.** Mantenha o termo científico (é o valor educativo),
   mas **sempre explique entre parênteses ou logo ao lado**, com palavras de 1º/2º ano:
   - ✅ *"Collect **Regolith** (space dirt)"* · "Colete **regolito** (a terra de Marte)"
   - ✅ *"Start **EVA** (spacewalk)"* · "Comece a **EVA** (caminhada lá fora)"
   - ✅ *"Use **ISRU** (make water and air from Mars rocks)"*
   - ✅ *"Wait 1 **Sol** (one Mars day)"* · "Espere 1 **sol** (um dia de Marte)"
5. **Âncora visual: ícone/emoji + palavra-chave em negrito.** Todo alerta ou botão começa com um ícone claro e 2 a 3
   palavras em **negrito** que resumem a ação. Mesmo quem lê devagar entende a mecânica em 1 segundo.
6. **Camada dupla de dados (simples × modo cientista).**
   - **Visão padrão (7+):** barras coloridas de 0% a 100% e números inteiros pequenos (`80 kg of ice`,
     `6 hours left`, `38 rock tubes`).
   - ***Tooltip* / modo cientista (10–12 anos e juízes da NASA):** ao passar o mouse ou abrir "Dados da NASA", mostra a
     unidade física real (kPa, mSv, kW, τ de opacidade da atmosfera). A escala do jogo continua sendo do jogo: nunca
     diga à criança "você recebeu X mSv" ([ciencia-marte.md](ciencia-marte.md), regra 2).

## 2. Tabela de referência: como escrever os textos do jogo

Ao criar alertas, missões ou textos de interface, siga o modelo da coluna da direita (o mesmo vale para o PT).

| Evento / sistema | ❌ Proibido (complexo, acadêmico, passivo) | ✅ Obrigatório (7–12 anos, Lexile ~400L) |
| :--- | :--- | :--- |
| **Tempestade de poeira** | *"A severe Martian dust storm is approaching, which will reduce solar array efficiency by 80%."* | *"⚡ **Dust storm coming!** Solar panels will lose power. Charge the batteries now!"* |
| **Limite de EVA / radiação** | *"Extravehicular activity duration has exceeded safe ionizing radiation limits."* | *"☢️ **Too much radiation outside!** Bring your astronaut back inside the base."* |
| **Tempo dentro do habitat** | *"Crew members must remain inside the pressurized habitat for 85% of the week to recover."* | *"🏠 **Astronaut is tired!** People must stay inside the base most of the week to stay safe. Send a **Rover** instead!"* |
| **Rover atolado** | *"The rover’s wheels have lost traction in unconsolidated regolith; today’s science blocks were forfeited."* | *"🤖 **Rover is stuck!** Its wheels sank in soft sand. Today’s science is lost."* |
| **Rover científico (tubos)** | *"Perseverance-class rover has filled 10 of 38 titanium sample tubes."* | *"🧪 **New rock sample!** Your Science Rover has **10 of 38 tubes** full."* |
| **Luz do Sol por fibra óptica** | *"Optical fiber solar concentrators are closed due to high atmospheric optical depth."* | *"☀️ **Sun shield closed!** It is too dusty outside. Turning on the **LED lights** for the plants."* |
| **Falta de água / ISRU** | *"Hydroponic crops require additional water extracted from subsurface ice deposits."* | *"🌱 **Plants are thirsty!** Melt more Mars ice in the oven to make clean water."* |
| **Alerta solar (API DONKI)** | *"Coronal Mass Ejection detected. Immediate shelter protocol required for all EVA personnel."* | *"🚨 **Solar Storm Alert!** Dangerous sun waves are coming! Move everyone to the **shelter** now!"* |

> A tabela mostra o **tom e a forma**. Alguns sistemas dela (fibra óptica que fecha com poeira, ISRU com forno)
> ainda não existem no jogo; o número de um fato só entra num texto depois de estar em
> [ciencia-marte.md](ciencia-marte.md), com fonte (ex.: no jogo o abrigo é de **regolito**, e a conta do tempo dentro
> do habitat dá **pelo menos 86%**, no GDD). Nenhum exemplo pode contradizer um fato registrado: o rover de ciência
> **não volta à base** (F23) e guarda as amostras dentro dele (F25).

## 3. Acessibilidade e áudio (requisito técnico recomendado)

- Nos componentes de interface, incluir o botão de leitura em voz alta **🔊 Read to Me** (PT: **🔊 Ler para mim**),
  com a **Web Speech API** do navegador (`window.speechSynthesis`), em `en-US` (ou `pt-BR` no português), `rate: 0.95`.
  Dá reforço auditivo imediato às crianças de 7 anos.
- Ainda não implementado: ver a pendência em [publico-e-impacto.md](publico-e-impacto.md#6-pendências-para-implementar).

## Como conferir num PR

- [ ] Frases de 8 a 12 palavras; no máximo 2 por caixa; PT e EN.
- [ ] Começa com ícone + 2 ou 3 palavras em negrito; verbo no imperativo; voz ativa.
- [ ] Termo da NASA explicado entre parênteses na primeira vez.
- [ ] Número simples na tela; unidade real só no modo cientista ("Dados da NASA").
- [ ] Fato científico com fonte em [ciencia-marte.md](ciencia-marte.md).
