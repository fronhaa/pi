# O desafio: Build a Junior Astronaut Mission Trainer

NASA Space Apps Challenge 2026. Página oficial (texto completo, em inglês):
<https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/?tab=details>

> Este é um **resumo do time**, não o texto oficial. Em caso de dúvida, vale a página oficial.
> Última conferência: 2026-11-14 (a página foi atualizada em 2026-11-13; podem entrar mais recursos).

## Em uma frase

Criar um jogo ou app em que **crianças de 7 a 12 anos administram um posto na Lua ou em Marte**,
equilibrando suporte de vida, blindagem contra radiação, energia, comida e atraso de comunicação, e
**sentindo na prática que toda decisão tem um custo**.

## O problema que o desafio aponta

Conteúdo de espaço para crianças costuma ser abstrato demais (pôsteres, curiosidades) ou técnico demais.
Raramente a criança vê **a lógica da decisão** por trás de uma missão, só o resultado.
Conteúdo só educativo não prende a atenção; conteúdo só divertido perde a precisão.

## Requisitos e recomendações

### Obrigatório (objetivo)

- [ ] Jogo/app interativo, **protótipo funcionando**.
- [ ] Jogador gerencia um posto (Lua, Marte ou interpretação criativa).
- [ ] Decisões reais sobre: suporte de vida, blindagem de radiação, energia, comida, atraso de comunicação.
- [ ] As escolhas se desenrolam **ao longo de uma missão simulada**.
- [ ] A criança sai **entendendo uma restrição real** da sobrevivência no espaço, não só tendo jogado.

### Público e acessibilidade

- [ ] Linguagem simples. Termo científico inevitável (dose de radiação, microgravidade, *sol*) explicado no contexto.
- [ ] Baixa barreira: **navegador, sem download e sem conta**.
- [ ] Desejável: funcionar também para irmãos mais velhos, pais e sala de aula.

### Dados reais

- [ ] Usar APIs/dados abertos da NASA em vez de números inventados. **Até um pouco de dado real já vale.**
- [ ] **Atribuir as fontes dentro do jogo.**
- [ ] Dado embutido (curado) é aceito, mas **não pode ser apresentado como "ao vivo"**.

### Armadilhas a evitar

- [ ] Nenhuma escolha "segura" sem custo.
- [ ] Visual bonito não substitui mecânica correta.
- [ ] Não sobrecarregar: **2 a 3 recursos centrais** funcionam melhor que 5 ou 6.

### O que faz uma solução se destacar

- [ ] Ligar a decisão do jogador a **dado real atual** (ex.: blindagem ↔ clima espacial real).
- [ ] **Rejogabilidade**: eventos variam entre partidas; falhar ensina sem ser punitivo.
- [ ] **Explicação curta dos datasets usados e por quê**, para os juízes conferirem.

## Recursos oficiais

### NASA

| Recurso | O que tem | Uso provável no nosso jogo |
| --- | --- | --- |
| [NASA Open APIs](https://api.nasa.gov/) | Portal de APIs (APOD, DONKI etc.). Chave grátis. | Acesso ao DONKI e imagens. |
| [DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) | Erupções solares, ejeções de massa coronal (CME), eventos de partículas | **Eventos de radiação** do jogo |
| [OSDR](https://osdr.nasa.gov/bio/repo/) ([busca](https://osdr.nasa.gov/osdr/data/search?term=KEYWORD)) | Estudos de saúde em voo espacial: ossos, músculos, imunidade, sono | Cartões **"Você sabia?"** |
| [RadLab](https://visualization.osdr.nasa.gov/radlab/gui/data-api/) | Doses de radiação medidas na ISS | Comparação de doses ("na Estação Espacial é…") |
| [Mars Trek](https://trek.nasa.gov/mars/) | Imagens, relevo e terreno reais de Marte | **Terreno 3D real** do local da base |

### Agência Espacial Canadense (CSA)

| Recurso | Uso provável |
| --- | --- |
| [Recursos de STEM para jovens](https://www.asc-csa.gc.ca/eng/youth-educators/resources-stem-and-youth-organizations.asp) | Referência de linguagem e atividades para a faixa etária |
| [Produção de alimentos na Lua e em áreas remotas](https://www.asc-csa.gc.ca/eng/youth-educators/toolkits/food-production/) | Mecânica da **estufa** |

Os termos de uso de cada site externo devem ser respeitados (aviso da própria página do desafio).

## Nossas escolhas

- **Local:** Marte. Ver [game-design.md](game-design.md).
- **Formato:** jogo 3D cartoon no navegador, gestão por turnos (sóis).
