# Física (Rapier)

Usamos [Rapier](https://rapier.rs/docs/user_guides/javascript/getting_started_js) via
`@dimforge/rapier3d-compat`. Wrapper: [`src/core/Physics.ts`](../src/core/Physics.ts).

## Conceitos em 30 segundos

- **RigidBody** (corpo): tem posição, rotação e velocidade. Tipos:
  - `dynamic`: sofre gravidade e colisões (caixas, bolas, jogador).
  - `fixed`: nunca se move (chão, paredes).
  - `kinematicPositionBased`: você move por código e ele empurra os outros (plataformas móveis).
- **Collider**: a *forma* da colisão (cuboid, ball, capsule…), presa a um corpo.
  Collider sem corpo = estático no mundo.
- A forma do collider **não precisa** ser igual ao mesh. Use formas simples, que são mais rápidas e estáveis.

## Receita: objeto dinâmico

```ts
import * as THREE from 'three';
import { RAPIER } from '@/core/Physics';
import { toonMesh, PALETTE } from '@/render/toon';

const mesh = toonMesh(new THREE.BoxGeometry(1, 1, 1), PALETTE.red);
scene.add(mesh);

const body = physics.world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0),
);
// cuboid recebe METADE das dimensões
physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);

physics.link(body, mesh); // mesh passa a seguir o corpo
```

## Receita: objeto estático

```ts
physics.world.createCollider(
  RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z),
);
```

Se o mesh estiver rotacionado, aplique a mesma rotação ao collider (veja a rampa em
[`src/world/Level.ts`](../src/world/Level.ts)).

## Regras de ouro

1. **A física é dona da posição.** Nunca mude `mesh.position` de algo linkado; mova o corpo.
2. **Gameplay físico vai no `fixedUpdate()`**, nunca no `update()` de render.
3. **Metade das dimensões**: `cuboid(hx, hy, hz)` e `capsule(halfHeight, radius)` usam meias medidas.
4. **Unidade = metro.** Jogador tem ~1,7 m. Objetos muito pequenos (< 0,1) ou enormes (> 1000) ficam instáveis.
5. **Objetos rápidos** (projéteis, jogador) usam `.setCcdEnabled(true)` para não atravessar paredes.
6. **Prefira velocidades/impulsos** (`setLinvel`, `applyImpulse`) a `setTranslation` para mover,
   pois teleportar ignora colisões.

## Jogador

[`src/entities/Player.ts`](../src/entities/Player.ts): cápsula `dynamic` com **rotação travada**
(`lockRotations`) para não tombar. A cada passo:

- Define a velocidade horizontal pelo input e mantém a vertical (gravidade).
  O input vem do **teclado** ou do **clique/toque**, e vale o último usado ([ADR 0004](decisoes/0004-controle-por-teclado-e-clique-toque.md)):
  - Com teclado, a direção é `moveAxis()`. Apertar uma tecla cancela o alvo do clique.
  - Sem teclado, o jogador anda até `input.moveTarget` (o ponto clicado), desacelera a 1 m do ponto e para a 0,2 m.
  - O `Game` faz o raycast do clique e desenha o anel amarelo no destino. O anel é só visual e não tem corpo físico.
- Pulo: só se `isGrounded()`, que lança um raio para baixo (`castRay`) ignorando o próprio corpo.
- O visual (`model`) gira para a direção do movimento; o corpo físico não gira.

Se precisarmos de escadas/degraus e rampas mais precisas, o próximo passo é migrar para o
`KinematicCharacterController` do Rapier (registrar em ADR).

## Ajustes globais

[`src/core/constants.ts`](../src/core/constants.ts): `CELESTIAL_BODIES` / `gravityOf()` (gravidade real, abaixo),
`FIXED_DT`, `MAX_FRAME_DT`.

## Gravidade real

A gravidade do mundo é a **real** do corpo celeste da missão, com dados da NASA ([ADR 0005](decisoes/0005-gravidade-real-com-dados-da-nasa.md)).
Não existe mais gravidade "arcade". Classificação: **REAL** ([Art Bible, seção 11](art-bible.md#11-padrão-de-classificação-científica)).

| Corpo | Gravidade | Em relação à Terra | Fonte |
| --- | --- | --- | --- |
| Marte (padrão) | 3,7 m/s² | 0,37 g | [NASA Glenn: Mars](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/) |
| Lua | 1,624 m/s² (equador) | ~1/6 g | [NASA Science: Compare Earth and the Moon](https://science.nasa.gov/moon/by-the-numbers/) |
| Terra (comparação) | 9,80665 m/s² | 1 g | Mesma página da NASA Science |

Como usar:

```ts
const physics = await Physics.create();        // Marte (DEFAULT_BODY)
const lunar = await Physics.create('moon');    // Lua, quando a missão lunar existir
```

**O que muda por causa disso (e é o que o jogo ensina):**

- **Pulo:** `JUMP_SPEED` em [`Player.ts`](../src/entities/Player.ts) é **3,1 m/s**, a velocidade de impulso de um salto de ~0,5 m na Terra
  (√(2 × 9,81 × 0,5)). Com a mesma força, o astronauta sobe **~1,3 m em Marte** e **~3 m na Lua**, e fica mais tempo no ar.
  É uma simplificação que ignora a massa do traje (INTERPRETADO).
- **Queda de objetos:** caixas e bolas caem mais devagar; não "corrija" isso aumentando a gravidade.
- **Sem arrasto de ar:** o Rapier não simula atmosfera. Em Marte o ar é ~1% do da Terra e na Lua não há ar, então ignorar o arrasto é coerente.

**Regras:**

1. Número real de física só entra com **fonte da NASA aberta e citada** nesta tabela e no comentário da constante.
2. Mudou o valor? Atualize a tabela, o comentário em `constants.ts` e, se mudar o comportamento do jogo, o [`game-design.md`](game-design.md).
3. A ficha mais precisa (NSSDC, que dá 3,73 m/s² para Marte) estava fora do ar em 14/11/2026. Quando voltar, confira e, se preciso, atualize com fonte.
4. Velocidades de gameplay (ex.: `MOVE_SPEED`) **não** são dados reais; ficam como constantes de jogo, sem fingir precisão.

## Debug

Ainda não há visualização dos colliders. Quando precisar: `world.debugRender()` retorna
vértices e cores, que podem ser desenhados com `THREE.LineSegments`. É um bom candidato a PR.
