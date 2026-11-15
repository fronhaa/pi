# Astronauta chibi (CHR-001): modelo 3D e animações

Entrega de arte: o astronauta chibi da folha de conceito, em `.glb`, com três animações prontas.
**Ainda não está ligado ao jogo.** Este documento explica como quem for integrar deve fazer isso.

## O que veio nesta entrega

| Arquivo | O que é |
| --- | --- |
| `public/assets/models/astronaut-chibi.glb` | O modelo, com as animações `walk`, `jump` e `interact`. |
| `src/render/chibiAstronaut.ts` | Carregador: lê o `.glb`, troca os materiais por `toonMaterial`, põe o contorno e controla as animações. |
| `art-source/astronaut-chibi/` | Código que gera o modelo e as animações (só referência, não entra no build). |

Nada aqui altera arquivos que já existiam.

## Como usar

```ts
import { loadChibiAstronaut } from '@/render/chibiAstronaut';

const astro = await loadChibiAstronaut(); // lê o .glb padrão
scene.add(astro.root);
astro.play('walk');        // 'walk' em loop; 'jump' e 'interact' tocam uma vez
astro.stop();              // volta à pose parada
// a cada frame, em update(dt):
astro.update(dt);
```

- O carregador usa só `toonMaterial` e `addOutline` de `src/render/toon.ts`.
- Carregue com `import()` dinâmico a partir do jogo, nunca de `main.ts` ou `LoadingScreen.ts`.

## Regras do modelo

- Altura de 1,85 m (escolha de design do time), proporção chibi, pés em `y = 0`.
- A frente do modelo é **+Z**. Se o personagem andar para −Z, gire `root` em 180° em torno de Y.
- As animações são **no lugar**: não movem o personagem pelo mundo. Quem move é a física
  (corpo Rapier); a animação só deve ser escolhida conforme o estado (parado, andando, no ar, interagindo).
- Cores sólidas no próprio `.glb` (traje branco, laranja `#e8792b`, cinza-chumbo, pele, cabelo, ciano das luzes,
  marinho do emblema). Elas não estão na `PALETTE`: são do personagem. As luzes mantêm brilho (`emissive`)
  e o vidro do visor continua transparente.
- Contorno: `0.02` nas peças grandes e `0.035` nas pequenas. Rosto, cabelo, luzes, vidro e detalhes
  pequenos ficam sem contorno (lista em `NO_OUTLINE`).

## Animações

| Nome | Duração | Como tocar |
| --- | --- | --- |
| `walk` | 0,9 s | Loop. O passo fica sem escorregar a ~1,15 m/s; para andar mais rápido, aumente o `timeScale` da ação. |
| `jump` | 1,35 s | Uma vez: agacha (0,28 s), impulsiona (0,42 s), topo (0,62 s), toca o chão (0,92 s) e amortece. |
| `interact` | 3,2 s | Uma vez, parando no fim: puxa o tablet do bolso do cinto e o segura com as duas mãos, na frente do corpo. |
| `pedal` | 1 s | Loop. **Não vem no `.glb`:** é montado por código ao carregar (`src/render/chibiPedal.ts`). Sentado, pés no círculo do pedal (IK de duas juntas) e mãos no guidão. A bicicleta da academia é montada com as mesmas medidas (`BIKE_FIT`); mudou a pose, mude as medidas. |
| `sit` | parado | **Não vem no `.glb`:** montado por código (`src/render/chibiSit.ts`). Sentado na beirada da cama: coxas para a frente, canelas para baixo e um pouco à frente, mãos perto dos joelhos. Quem deita controla o quanto está sentado pelo peso da ação (`Astronaut.bedBlend`). |

O tablet some fora da `interact` com escala ~0 (glTF não anima visibilidade).

## Articulações com nome

`body`, `spine`, `head`, `helmet`, `face`, `hair`, `torso`, `backpack`, `armL`/`armR`, `forearmL`/`forearmR`,
`gloveL`/`gloveR`, `legL`/`legR`, `shinL`/`shinR` e `tablet`. `L` e `R` são do ponto de vista do personagem
(direita = −X). Animações novas precisam dessas articulações: o modelo é feito de peças rígidas, sem esqueleto
nem skinning, então cotovelos e joelhos são juntas aparentes cobertas por faixas e joelheiras.

## O que falta para integrar

1. Escolher onde entra: o `Astronaut` de `src/scene/Crew.ts` (CHR-001 a CHR-004) ou o jogador.
   O modelo tem o traje branco com detalhes laranja da folha de conceito. Se cada papel precisar de uma cor
   (como o `ROLE_COLORS` faz hoje), troque a cor de destaque no carregador depois de ler o `.glb`.
2. Ligar as animações ao movimento (`crewMotion.ts` ou o `Player`), escolhendo `walk`, `jump` e `interact` pelo estado.
3. Ter uma cápsula ou o modelo antigo de reserva caso o `.glb` falhe ao carregar.
4. Registrar a decisão: `npm run docs:adr -- "Astronauta em .glb com animações por articulações"`.
   Pontos para o ADR: modelo de peças rígidas com articulações nomeadas em vez de esqueleto com skinning
   (leve, combina com o estilo chibi, gerado por código e fácil de refazer), animações no lugar com a física dona da posição.
5. Atualizar `docs/estilo-visual.md` e `docs/art-bible.md` com este modelo, e conferir `npm run typecheck` e `npm run build`.

## Limitações conhecidas

- O `.glb` tem ~2,2 MB, acima da meta de ~1 MB das convenções. A maior parte são as peças arredondadas do capacete
  e do traje; dá para reduzir a resolução das esferas em `art-source/` e exportar de novo.
- O `walk` foi desenhado para ~1,15 m/s. Se o jogo andar bem mais rápido, os pés escorregam.
- O inverted hull (contorno) pode falhar em quinas agudas; no resto do modelo ficou limpo.

## Como regerar o `.glb`

Os arquivos em `art-source/astronaut-chibi/` montam o modelo com Three.js (`ChibiAstronaut.ts`), criam os clipes
(`chibiAnimations.ts`) e exportam com `GLTFExporter` (`export.ts`). A exportação roda no navegador, então é preciso
empacotar o `export.ts` (alias `@/` apontando para essa pasta, mais `@/render/toon`) e executá-lo numa página.
