# Público e impacto: crianças de 7 a 12 anos

> **Pilar crítico do jogo.** Simplicidade, facilidade e caráter educativo não são extras: toda decisão de mecânica, interface, texto ou controle passa por este documento.
> Na dúvida entre "mais rico" e "mais simples para a criança", vence o mais simples.
> Regras do jogo: [game-design.md](game-design.md). Arte: [art-bible.md](art-bible.md). Física: [fisica.md](fisica.md).

## 1. Quem joga

| Faixa | Como lê e joga | O que isso exige do jogo |
| --- | --- | --- |
| **7 a 9 anos** | Leitura ainda lenta; frases longas cansam. Aprende tocando e vendo o resultado | Ícones e cena contam a história antes do texto. Uma decisão por vez. Nada de pressa |
| **10 a 12 anos** | Lê bem; gosta de estratégia, números e desafio | Números visíveis nas barras, "?" com a explicação, estrelas e rejogabilidade |
| Pais e professores | Jogam junto ou conduzem a turma | Modo de 2 jogadores e guia para a conversa depois do jogo |

O jogo é desenhado para **a criança de 7 anos conseguir jogar sozinha**; a de 12 encontra profundidade nas estratégias e nas estrelas.

## 2. Regras de simplicidade

### Texto

| Regra | Limite |
| --- | --- |
| Frase | Até **15 palavras** |
| Caixa de ajuda "?" | Até **2 frases** (~25 palavras) |
| Mensagem da Terra, alerta, relatório | Até **2 frases**; a primeira já diz o que fazer |
| Vocabulário | Palavras do dia a dia. Termo científico só com "?" na primeira vez que aparece |
| Tom | Ativo e direto: "Reforce a blindagem!", não "É recomendável que a blindagem seja reforçada" |

**Hoje, 10 dos 165 textos em português passam de 20 palavras** (contagem em `src/i18n/strings.ts`, hoje dividido em `src/i18n/strings/`, 14/11/2026). Os maiores:

| Chave | Palavras |
| --- | --- |
| `help.dose` | 39 |
| `data.donki.use` | 38 |
| `data.intro` | 30 |
| `tutorial.2.text` | 29 |
| `help.shield` | 28 |
| `end.lost.life.text` | 25 |
| `help.battery`, `help.life` | 22 |

Exemplo de como encurtar sem perder o conteúdo:

| Antes (39 palavras) | Depois (2 frases) |
| --- | --- |
| "Dose é quanta radiação a tripulação já recebeu. Ela sobe um pouco todo sol e muito nas tempestades solares. Em 100, a tripulação precisa voltar para a Terra. Este número é uma escala do jogo, não uma medição real." | "Dose é a radiação que a tripulação já recebeu. Em 100, todos voltam para a Terra." · O aviso "escala do jogo" fica na tela **Dados da NASA**. |

### Interface e controle

- **Uma decisão por vez.** A tela nunca pede carta e plano de energia ao mesmo tempo (o GDD já ordena: carta primeiro).
- **Tudo funciona por toque.** Toda ação do teclado precisa ter um equivalente na tela (hoje falta o pulo; ver [pendências](#6-pendências-para-implementar)).
- **Alvos de toque grandes:** no mínimo **44 × 44 px** (os botões + e − já seguem isso).
- **Sem pressa obrigatória.** Tudo que corre em tempo real pode ser pausado e desacelerado (já está no GDD).
- **A cor nunca é o único sinal:** número, ícone e texto junto (já está no GDD).
- **Aprende jogando:** tutorial de no máximo 3 passos; cada regra nova é explicada na hora em que aparece, não antes.

### Carga de informação

O desafio recomenda **2 a 3 recursos centrais**. Hoje a tela mostra 5 barras (bateria, suporte de vida, blindagem, dose, ciência) mais a poeira. Proposta em [pendências](#6-pendências-para-implementar): revelar as barras aos poucos.

## 3. Segurança emocional

- **Ninguém morre.** Sem morte, sangue ou tom de catástrofe. Radiação demais = "a tripulação volta para a Terra para se cuidar" (os textos atuais já seguem isso).
- **Derrota não é castigo.** A tela final explica o que aconteceu, o que astronautas reais também enfrentam e convida a tentar de novo na hora (já está no GDD).
- **Medo não ensina.** Alertas são urgentes, mas não assustadores: luz piscando e "Reforce a blindagem!", sem sirene contínua nem tela tremendo.
- **Elogie a estratégia, não só o resultado:** "Você guardou energia antes da tempestade: foi isso que salvou a base."

## 4. Representatividade

- A tripulação tem **diversidade de gênero e de tom de pele**. Os astronautas CHR-001 a CHR-004 ainda estão em CONCEPT ([registro de assets](game-design.md#registro-de-assets-do-protótipo)): é a hora de definir isso.
- Os nomes dos papéis aparecem de forma neutra ou nas duas formas quando possível (ex.: "Oficial médica/médico" no PT).
- A criança se vê no jogo: o astronauta inicial selecionado não deve ser sempre o mesmo perfil.

## 5. Impacto: o que queremos e como medir

| Dimensão | Meta | Como medir |
| --- | --- | --- |
| **Aprendizado** | Explicar pelo menos 1 das [4 trocas](game-design.md#objetivos-de-aprendizagem) com as próprias palavras | Pergunta antes e depois, dentro do jogo (abaixo) + teste com crianças |
| **Emocional** | Sair curiosa e confiante, não com medo | Observação no teste: a criança quer jogar de novo? |
| **Inspiração** | Querer saber mais sobre ciência e espaço | Tela final com "O que aprendemos" e links das fontes |
| **Alcance** | Funcionar em escola pública e em casa | Navegador, sem conta, ~160 KB iniciais; guia para professor |

### Pergunta antes e depois (dentro do jogo)

- Antes do sol 1 e depois do fim: **a mesma pergunta**, com 3 respostas ilustradas. Ex.: "Por que guardar energia na bateria?" → (a) para a noite · (b) para o rover andar mais rápido · (c) não precisa.
- Se a resposta melhorar, o jogo mostra "Você aprendeu algo que astronautas de verdade precisam saber!".
- **Nada sai do aparelho.** Sem conta, sem telemetria, sem dado pessoal: são crianças, e a LGPD exige consentimento dos pais para tratar dados delas.

### Teste com crianças reais

- Pelo menos **3 crianças**, incluindo uma de 7 a 8 anos, jogando **sozinhas** uma partida.
- Anotar: onde travaram, que texto pularam, se pediram ajuda, o que explicaram no fim.
- Resultado vira ajuste de texto e entra no texto de entrega para os juízes.

### Guia para professor (1 página)

- Os 4 objetivos de aprendizagem, em linguagem de professor.
- 3 perguntas para a conversa depois do jogo.
- Ligação com a BNCC de Ciências (unidade temática **Terra e Universo**).
- Como jogar em dupla (modo Terra e Marte) numa sala com poucos computadores.

## 6. Pendências para implementar

Para quem implementa (inicialmente o Marcelo). **Corrigir** = problema encontrado no que já existe. **Decidir** = proposta que precisa do time antes.

| # | Tipo | O quê | Por quê | Pronto quando |
| --- | --- | --- | --- | --- |
| 1 | Corrigir | **Botão "Pular" no toque** quando há astronauta selecionado | No celular não há como pular, então a lição da gravidade (aviso do primeiro pulo) nunca aparece | Tocando só na tela, a criança pula e vê o aviso dos 38% |
| 2 | Corrigir | **Conferir a altura do pulo.** Teoria: 2,2 m/s em 3,73 m/s² dá ~0,65 m; o teste do PR #9 mediu ~0,4 m | A tela afirma para a criança que o pulo sobe 2,6× mais; o jogo precisa mostrar isso | Altura medida por passo de física fica a menos de 10% da teoria, ou o texto/valor é ajustado |
| 3 | Corrigir | **Encurtar os 10 textos com mais de 20 palavras** (lista na [seção 2](#texto)), nos dois idiomas | Leitura de 7 a 9 anos | Nenhum texto de jogo passa de 2 frases / ~25 palavras |
| 4 | Corrigir | Incluir o pulo na dica de toque (`crew.hint.touch`) quando o item 1 existir | A dica precisa mostrar tudo o que dá para fazer | A dica cita andar e pular |
| 5 | Decidir | **Revelar as barras aos poucos:** sol 1 mostra bateria, vida e blindagem; dose aparece no primeiro alerta de tempestade; ciência quando a criança põe o primeiro bloco nela | 5 barras + poeira de uma vez é muito para 7 anos; o desafio pede 2 a 3 recursos | Sol 1 com no máximo 3 barras; cada barra nova chega com o "?" aberto uma vez |
| 6 | Decidir | **Pergunta antes e depois** ([seção 5](#pergunta-antes-e-depois-dentro-do-jogo)) | Dá um número de impacto para o pitch, sem coletar dados | As duas telas existem, nos dois idiomas, sem nada salvo fora do aparelho |
| 7 | Decidir | **Tempo da tripulação mais tarde:** problemas pela base só a partir do sol 5 (hoje o GDD diz sol 3), ou como opção "desafio" | Tempo real + energia + cartas no mesmo sol sobrecarrega 7 anos | Sóis 1 a 4 têm uma decisão principal só |
| 8 | Decidir | **Cooperativo:** modo de 2 jogadores (Terra e Marte) é o padrão em sala; 4 papéis viram opção avançada | 4 papéis negociando é ótimo para 10 a 12, pesado para 7 | Menu de cooperativo abre em 2 jogadores |
| 9 | Decidir | **Diversidade da tripulação** ([seção 4](#4-representatividade)) na Art Bible e nos modelos | Toda criança se ver no jogo | CHR-001 a 004 definidos com diversidade de gênero e tom de pele |
| 10 | Decidir | **Guia para professor** ([seção 5](#guia-para-professor-1-página)) | Alcance em escola | Página publicada junto com o jogo |

## 7. Checklist de revisão (todo PR que mexe em texto, interface ou mecânica)

- [ ] Uma criança de 7 anos entenderia sem ajuda de adulto?
- [ ] Textos novos com até 15 palavras por frase e 2 frases por caixa, nos dois idiomas?
- [ ] Funciona só com toque?
- [ ] Termo científico novo tem "?"?
- [ ] Nada assusta: sem morte, sem castigo, derrota explica e convida a tentar de novo?
- [ ] A mudança reforça pelo menos um dos [4 objetivos de aprendizagem](game-design.md#objetivos-de-aprendizagem), ou ao menos não atrapalha?
