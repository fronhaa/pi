import * as THREE from 'three';
import { PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { ROVER_DOCK, SHELTER_CENTER, distanceToRoverTrack, seededRandom, terrainHeight } from './layout';

/** Pedra no chão que o rover precisa evitar (posição e raio). */
export interface Rock {
  x: number;
  z: number;
  r: number;
}

/**
 * Chão, mesas no horizonte e pedras (GEO). Feitos com as cores de Marte; a cena troca as cores
 * do terreno pelas do cenário (src/scenarios/) ao mudar de lugar.
 */
export function buildTerrain(root: THREE.Object3D): { mesas: THREE.Object3D[]; rocks: Rock[] } {
  // Chão plano perto da base e dunas suaves longe dela (GEO, INTERPRETADO até o Mars Trek).
  const geo = new THREE.PlaneGeometry(320, 320, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, toonMaterial(PALETTE.soil));
  ground.receiveShadow = true;
  ground.name = 'ground';
  root.add(ground);
  return { mesas: buildMesas(root), rocks: buildRocks(root) };
}

function buildMesas(root: THREE.Object3D): THREE.Object3D[] {
  const rng = seededRandom(7);
  const mesas: THREE.Object3D[] = [];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rng() * 0.3;
    const dist = 95 + rng() * 45;
    const mesa = new THREE.Group();
    const r = 8 + rng() * 14;
    const layers = 2 + Math.floor(rng() * 2);
    let y = 0;
    for (let l = 0; l < layers; l++) {
      const h = 3 + rng() * 5;
      const color = [PALETTE.rock, PALETTE.lit, PALETTE.soil][l % 3];
      const m = toonMesh(new THREE.CylinderGeometry(r * (1 - l * 0.12), r * (1.08 - l * 0.12), h, 7), color, 0.012);
      m.position.y = y + h / 2;
      m.castShadow = false;
      y += h;
      mesa.add(m);
    }
    const mx = Math.cos(angle) * dist;
    const mz = Math.sin(angle) * dist;
    mesa.position.set(mx, terrainHeight(mx, mz) - 1, mz);
    mesa.rotation.y = rng() * Math.PI;
    mesas.push(mesa);
    root.add(mesa);
  }
  return mesas;
}

function buildRocks(root: THREE.Object3D): Rock[] {
  const rng = seededRandom(42);
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const rocks: Rock[] = [];
  for (let i = 0; i < 70; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 16 + rng() * 34;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const s = 0.25 + rng() * rng() * 1.6;
    const color = rng() > 0.5 ? PALETTE.rock : PALETTE.soil;
    const sx = s * (0.8 + rng() * 0.6);
    const sy = s * (0.5 + rng() * 0.4);
    const sz = s * (0.8 + rng() * 0.6);
    const r = Math.max(sx, sz);
    // Faixa sem pedras em volta da base (caminho de saída e volta do rover).
    if (distanceToRoverTrack(x, z) < r + 2) continue;
    // Caminho da garagem do rover (aproximação até o pé da rampa) sempre livre.
    if (Math.abs(x - ROVER_DOCK.approach.x) < r + 2.5 && z > ROVER_DOCK.foot.z - 1 && z < ROVER_DOCK.approach.z + 3) continue;
    // Nada de pedra em cima do abrigo de regolito e dos sacos em volta dele.
    if (Math.hypot(x - SHELTER_CENTER.x, z - SHELTER_CENTER.z) < r + 4.5) continue;
    rocks.push({ x, z, r });
    const rock = toonMesh(geo, color, 0.04);
    rock.scale.set(sx, sy, sz);
    rock.position.set(x, terrainHeight(x, z) + s * 0.2, z);
    rock.rotation.set(rng(), rng() * 3, rng());
    root.add(rock);
  }
  return rocks;
}
