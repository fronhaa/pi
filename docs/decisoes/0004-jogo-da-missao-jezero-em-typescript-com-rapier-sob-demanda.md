# 0004. Jogo da Missão Jezero em TypeScript, com Rapier sob demanda

- **Status:** Aceito
- **Data:** 2026-11-14
- **Substitui em parte:** [0003](0003-manter-rapier-apesar-do-tamanho-do-bundle.md) (o Rapier continua, mas sai do pacote principal)

## Contexto

- O GDD do time ([game-design.md](../game-design.md)) define um jogo de **gestão da base**. A seção de
  tecnologia descreve um protótipo em JavaScript puro, sem Rapier, com ~160 KB; o código dele não está
  neste repositório.
- Este repositório tinha a base técnica (TypeScript + Three.js + Rapier, docs, CI), mas só uma cena de teste com física.
- O critério de aceite pede carregar em menos de 10 s numa conexão comum. O Rapier sozinho tem ~1,6 MB (gzip).
- O time quer **física** (tornar o jogo mais vivo) e **controle por clique e por setas**.
- Prazo: o hackathon termina em 2026-11-15.

## Opções consideradas

1. **Esperar o código do protótipo e portá-lo**: menos retrabalho em tese, mas bloqueia o time sem prazo.
2. **Implementar o GDD direto aqui, em TypeScript**: usa a base que já existe (docs, CI, tela de carregamento) e os números do GDD.
3. **Remover o Rapier de vez** e fazer movimento com colisão própria: mais leve, mas o time quer física.
4. **Rapier sob demanda**: o jogo principal não depende dele; ele carrega em segundo plano só para a movimentação.

## Decisão

Opções **2 e 4**.

- O jogo é implementado neste repositório a partir do GDD, mantendo o princípio central dele:
  **simulação pura** (`src/sim/`, sem DOM e sem Three.js) separada da cena (`src/scene/`) e da interface (`src/ui/`).
  A mesma simulação roda no Node para o teste de equilíbrio (`npm run balance`).
- O pacote principal **não importa o Rapier** (~160 KB gzip no total). A física entra na etapa de
  movimentação da tripulação, carregada com `import()` dinâmico depois que o jogo já está jogável,
  com gravidade de Marte. Se ela falhar, o jogo continua funcionando só com a interface (o GDD exige isso).

## Consequências

- O jogo fica jogável sem esperar a física; o carregamento inicial cumpre o critério de leveza.
- `src/core/Physics.ts` e `src/core/Input.ts` ficam no repositório, sem uso, até a etapa de movimentação.
- Se o código do protótipo aparecer, ele serve de referência (textos, balanceamento), não de base.
- Arquivos da simulação importam com extensão `.ts` (`allowImportingTsExtensions`) para o Node rodá-los direto.
