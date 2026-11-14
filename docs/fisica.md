# Física (Rapier)

> **Estado atual:** a física move a **tripulação** (setas, clique, pulo) com a gravidade de Marte.
> Ela é carregada **sob demanda** pelo módulo [`src/scene/crewMotion.ts`](../src/scene/crewMotion.ts),
> que vira um arquivo separado (~1,65 MB gzip) baixado depois que o jogo já está jogável
> ([ADR 0004](decisoes/0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md)).
> Se falhar, o jogo segue só com a interface.

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

## Tripulação

[`src/scene/crewMotion.ts`](../src/scene/crewMotion.ts):

- Cada astronauta é uma cápsula `dynamic` com **rotação travada**. Velocidade horizontal pelo input ou
  pelo alvo do clique; a vertical fica com a gravidade. O visual gira para a direção do movimento.
- Os obstáculos são as caixas de `MarsBase.obstacles` (módulos, cúpula, torre, painéis, bateria, abrigo).
  **Os postos (`POSTS`) precisam ficar fora dessas caixas**, senão o astronauta nasce preso.
- Clique no chão: anda em linha reta até o ponto. Não há busca de caminho; se ficar preso 1,5 s, desiste.
- **Piloto automático à noite** (`goInside`, `comeOut`): cada astronauta segue um caminho calculado por
  [`crewPath.ts`](../src/scene/crewPath.ts) (grafo de visibilidade sobre os cantos das caixas de `obstacles`,
  alargadas pelo raio da cápsula) até a porta em `ENTRANCES` (`MarsBase.ts`): habitat para dormir, abrigo na tempestade.
  Ao chegar, o corpo é **desativado** (`setEnabled(false)`) e escondido, para não bloquear a porta. De manhã, ele é
  reposicionado ao lado da porta (`setTranslation`, a única exceção ao "mova por velocidade") e volta ao posto.
  Preso por 1,5 s no piloto automático conta como "chegou". Seta ou clique do jogador cancela o piloto daquele astronauta.
  **`ENTRANCES` precisa ficar fora das caixas de `obstacles`**, como os `POSTS`.
- Velocidades da volta: `NIGHT_WALK_SPEED` e `STORM_RUN_SPEED` em [`constants.ts`](../src/core/constants.ts).
- Pulo só com os pés no chão (`castRay` para baixo, ignorando o próprio corpo). Espaço num botão focado aperta o botão, não pula.
- A tripulação não passa de 30 m do centro da base.
- Em teste automático no navegador, o jogo expõe `window.__jezero` **só em desenvolvimento**.
  No Chrome sem tela, use `Page.bringToFront` e `Emulation.setFocusEmulationEnabled`, senão os quadros param.

## Ajustes globais

[`src/core/constants.ts`](../src/core/constants.ts): `GRAVITY`, `FIXED_DT`, `MAX_FRAME_DT`.
`GRAVITY` é a de Marte: **38% da Terra** segundo a NASA/JPL
([Mars 2020 Quick Facts](https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/quick_facts/)),
ou seja 0,38 × 9,81 ≈ 3,73 m/s² (valor calculado a partir da fonte).

## Debug

Ainda não há visualização dos colliders. Quando precisar: `world.debugRender()` retorna
vértices e cores, que podem ser desenhados com `THREE.LineSegments`. É um bom candidato a PR.
