# Física (Rapier)

> **Estado atual:** o jogo da Missão Jezero ainda **não carrega o Rapier**. A física volta na etapa de
> movimentação da tripulação (setas e clique), carregada sob demanda e com a gravidade de Marte
> ([ADR 0004](decisoes/0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md)).
> As receitas abaixo continuam valendo para essa etapa.

Usamos [Rapier](https://rapier.rs/docs/user_guides/javascript/getting_started_js) via
`@dimforge/rapier3d-compat`. Wrapper: [`src/core/Physics.ts`](../src/core/Physics.ts).
**Nunca importe `Physics.ts` estaticamente**; use `import()` para ele não entrar no pacote principal.

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

Se o mesh estiver rotacionado, aplique a mesma rotação ao collider
(`collider.setRotation(mesh.quaternion)`).

## Regras de ouro

1. **A física é dona da posição.** Nunca mude `mesh.position` de algo linkado; mova o corpo.
2. **Gameplay físico vai no `fixedUpdate()`**, nunca no `update()` de render.
3. **Metade das dimensões**: `cuboid(hx, hy, hz)` e `capsule(halfHeight, radius)` usam meias medidas.
4. **Unidade = metro.** Jogador tem ~1,7 m. Objetos muito pequenos (< 0,1) ou enormes (> 1000) ficam instáveis.
5. **Objetos rápidos** (projéteis, jogador) usam `.setCcdEnabled(true)` para não atravessar paredes.
6. **Prefira velocidades/impulsos** (`setLinvel`, `applyImpulse`) a `setTranslation` para mover,
   pois teleportar ignora colisões.

## Tripulação (próxima etapa)

Os astronautas ([`src/scene/Crew.ts`](../src/scene/Crew.ts)) vão virar cápsulas `dynamic` com rotação
travada, como na receita acima. Os obstáculos estáticos da base já estão em `MarsBase.obstacles`.
Controles combinados: ver [game-design.md](game-design.md).

## Ajustes globais

[`src/core/constants.ts`](../src/core/constants.ts): `GRAVITY`, `FIXED_DT`, `MAX_FRAME_DT`.
Hoje `GRAVITY` é −20 (valor "arcade" da cena de teste). Na etapa de movimentação ele passa a ser a
gravidade de Marte, com fonte da NASA registrada no código.

## Debug

Ainda não há visualização dos colliders. Quando precisar: `world.debugRender()` retorna
vértices e cores, que podem ser desenhados com `THREE.LineSegments`. É um bom candidato a PR.
