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
4. **Unidade = metro.** A cápsula do astronauta tem ~1,74 m (a [Art Bible](art-bible.md#41-escala-global) pede ~1,85 m com traje; migração no backlog #14). Objetos muito pequenos (< 0,1) ou enormes (> 1000) ficam instáveis.
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
- **Piloto automático** (`goInside` à noite; `exit` e `enter` na EVA): cada astronauta segue um caminho calculado por
  [`crewPath.ts`](../src/scene/crewPath.ts) (grafo de visibilidade sobre os cantos das caixas de `obstacles`,
  alargadas pelo raio da cápsula) até a porta em `ENTRANCES` (`MarsBase.ts`): habitat para dormir, abrigo na tempestade.
  Ao chegar, o corpo é **desativado** (`setEnabled(false)`) e escondido, para não bloquear a porta. A tripulação fica
  dentro por padrão: só numa EVA o corpo é reposicionado ao lado da porta do habitat (`exit`, com `setTranslation`, a única
  exceção ao "mova por velocidade"). Quem decide quem sai e quando é `src/core/CrewTasks.ts`.
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

| Dado | Valor | Fonte |
| --- | --- | --- |
| Gravidade de Marte (usada) | 0,38 g ≈ 3,73 m/s² | [NASA/JPL, Mars 2020 Quick Facts](https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/quick_facts/) (a página recusa acesso automático; confira no navegador) |
| Gravidade de Marte (confirmação) | 3,7 m/s² = 0,37 g | [NASA Glenn, Beginner's Guide: Mars](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/) (aberta em 14/11/2026) |
| Gravidade da Lua (para a missão lunar, se entrar) | 1,624 m/s² no equador | [NASA Science, Compare Earth and the Moon](https://science.nasa.gov/moon/by-the-numbers/) (aberta em 14/11/2026) |

As duas fontes de Marte concordam: a diferença (3,7 × 3,73) é arredondamento.

### Pulo

`JUMP_SPEED` em [`crewMotion.ts`](../src/scene/crewMotion.ts) é **2,2 m/s**: um pulo baixo, de astronauta de traje, que subiria ~0,25 m na Terra.
A altura vem de h = v² / (2g): **~0,65 m em Marte**, 1/0,38 ≈ **2,6×** a da Terra. É esse número que o aviso do primeiro pulo mostra para a criança,
então o jogo **precisa** reproduzi-lo. O teste do PR #9 mediu ~0,4 m: conferir ([pendência 2](publico-e-impacto.md#6-pendências-para-implementar)).

Regra: **velocidades de jogo** (`WALK_SPEED`, `JUMP_SPEED`) não são dados reais e não ganham fonte; **constantes da natureza** (gravidade) só entram com fonte da NASA citada aqui e no comentário da constante.

## Debug

Ainda não há visualização dos colliders. Quando precisar: `world.debugRender()` retorna
vértices e cores, que podem ser desenhados com `THREE.LineSegments`. É um bom candidato a PR.
