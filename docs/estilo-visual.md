# Estilo visual: cartoon

Código: [`src/render/toon.ts`](../src/render/toon.ts). Decisão: [ADR 0002](decisoes/0002-estilo-toon.md).

## Os três ingredientes

1. **Toon shading (cel shading).** `MeshToonMaterial` com um `gradientMap` de **3 tons**.
   A luz vira faixas chapadas em vez de degradê. Mudar os tons em `getGradientMap()` muda o
   estilo do jogo todo (mais faixas = mais suave; 2 faixas = mais "quadrinho").
2. **Contorno escuro (inverted hull).** Uma cópia do mesh, levemente maior, renderizando só as
   faces de trás em cor escura. Barato e funciona bem em primitivas e modelos arredondados.
3. **Paleta limitada e saturada**, com céu claro e névoa da cor do céu.

## Como usar

```ts
import { toonMesh, toonMaterial, addOutline, PALETTE } from '@/render/toon';

const bola = toonMesh(new THREE.SphereGeometry(0.5), PALETTE.yellow);       // com contorno 5%
const chao = toonMesh(new THREE.BoxGeometry(10, 1, 10), PALETTE.ground, 0); // sem contorno
```

Não use `MeshStandardMaterial` / `MeshPhongMaterial` em objetos do jogo: quebra a consistência.

## Paleta

| Nome | Hex | Uso |
| --- | --- | --- |
| `outline` | `#1a1a2e` | Contornos, pupilas, texto do HUD |
| `sky` | `#8ecae6` | Céu e névoa |
| `ground` | `#95d5b2` | Chão |
| `player` | `#ff8c42` | Personagem principal (só ele usa) |
| `red` | `#ef476f` | Destaques, perigo |
| `yellow` | `#ffd166` | Coletáveis, destaques |
| `green` | `#06d6a0` | Objetos neutros |
| `blue` | `#118ab2` | Objetos neutros, plataformas |
| `white` | `#ffffff` | Olhos, brilhos |

Cor nova? Adicione em `PALETTE` **e** nesta tabela.

## Espessura do contorno

| Objeto | `thickness` |
| --- | --- |
| Personagens / objetos pequenos | `0.05` (padrão) |
| Detalhes pequenos (olhos) | `0.10`–`0.12` |
| Objetos grandes (plataformas) | `0.02`–`0.03` |
| Chão / cenário de fundo | `0` |

O contorno escala junto com o objeto, por isso objetos grandes usam valores menores.

## Modelos 3D (`.glb`)

- Exportar do Blender em **glTF Binary (.glb)**, eixo Y para cima, escala em metros.
- Low-poly com normais suaves funcionam melhor com o contorno.
- Cores sólidas por material (sem texturas realistas). Ao carregar, trocamos os materiais por
  `toonMaterial(cor)`.
- Coloque em `public/assets/models/` com nome em `kebab-case` (`nave-principal.glb`).

## Limitações conhecidas

- O inverted hull falha em quinas muito agudas e em malhas não fechadas (aparecem "buracos" no contorno).
  Alternativa futura: pós-processamento por detecção de bordas (normal/depth), via ADR.
