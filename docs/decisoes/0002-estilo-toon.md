# 0002. Estilo visual toon com inverted hull

- **Status:** Aceito
- **Data:** 2026-11-14

## Contexto

O jogo tem visual cartoon. Precisamos de um jeito consistente e barato de obter sombreamento
"chapado" e contornos, que funcione em máquinas modestas (navegador, notebooks).

## Opções consideradas

1. **`MeshToonMaterial` + contorno por inverted hull**: nativo do Three, sem pós-processamento, barato. Contorno falha em quinas agudas/malhas abertas.
2. **`OutlineEffect` (addons do Three)**: mesma ideia aplicada à cena inteira; menos controle por objeto.
3. **Pós-processamento por detecção de bordas (depth/normal)**: contornos melhores e uniformes; custo de GPU maior e mais complexidade.

## Decisão

Opção 1. `MeshToonMaterial` com `gradientMap` de 3 tons e contorno por inverted hull, via
helpers em `src/render/toon.ts` (`toonMesh`, `toonMaterial`, `addOutline`).

## Consequências

- Todo objeto do jogo deve ser criado pelos helpers, para manter a consistência.
- Modelos devem ser fechados e com normais suaves (ver `docs/estilo-visual.md`).
- Se a qualidade do contorno virar problema, reavaliar a opção 3 em um novo ADR.
