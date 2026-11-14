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
- Pulo: só se `isGrounded()`, que lança um raio para baixo (`castRay`) ignorando o próprio corpo.
- O visual (`model`) gira para a direção do movimento; o corpo físico não gira.

Se precisarmos de escadas/degraus e rampas mais precisas, o próximo passo é migrar para o
`KinematicCharacterController` do Rapier (registrar em ADR).

## Ajustes globais

[`src/core/constants.ts`](../src/core/constants.ts): `GRAVITY` (−20, mais "arcade" que os −9,81 reais),
`FIXED_DT`, `MAX_FRAME_DT`.

## Debug

Ainda não há visualização dos colliders. Quando precisar: `world.debugRender()` retorna
vértices e cores, que podem ser desenhados com `THREE.LineSegments`. É um bom candidato a PR.
