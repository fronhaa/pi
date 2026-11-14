# 0004. Controle por teclado e clique/toque

- **Status:** Proposto
- **Data:** 2026-11-14
- **Autores:** time Missão Jezero

## Contexto

O jogo é para crianças de 7 a 12 anos e precisa funcionar no computador e no celular em pé (critério de aceite em [game-design.md](../game-design.md#critérios-de-aceite)).
O design pede "tocar no astronauta e depois no problema". O código inicial só lia teclado (WASD/setas), que não existe no celular.
O time decidiu permitir **alternar** entre teclado e clique.

## Opções consideradas

1. **Só clique/toque:** funciona em tudo e é simples para criança. Mas tira o teclado de quem prefere e já está acostumado (computador, sala de aula).
2. **Escolha nas configurações (um modo ou outro):** controle explícito. Mas é mais uma tela, e a criança pode ficar "presa" no modo errado.
3. **Os dois sempre ativos, vale o último usado:** nada a configurar e funciona em qualquer aparelho. Precisa de uma regra clara de prioridade.

## Decisão

Opção 3. O `Input` mantém teclado e um alvo de clique/toque ao mesmo tempo.
Uma tecla de movimento cancela o alvo; um novo clique define um alvo novo. O `Game` converte o clique em ponto do mundo (raycast) e mostra um anel no destino.

## Consequências

- Funciona no celular sem tela de configuração, e o teclado continua disponível no computador.
- O jogo inteiro continua utilizável só pela interface (requisito de acessibilidade).
- O clique hoje leva o jogador até o ponto em linha reta, sem desviar de obstáculos. Quando houver base com módulos, avaliar navegação (pathfinding) em ADR próprio.
- Pendente para o modo "tempo da tripulação": selecionar astronauta (toque no astronauta; teclas 1 a 4 no teclado).
