import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { MOON_G } from '@/core/constants';
import { seededRandom, terrainHeight } from '@/scene/base/layout';
import type { Scenario } from './types';

/**
 * Polo sul da Lua (docs/game-design.md, "Base lunar"): céu preto até de dia, Sol baixo no horizonte com
 * sombras compridas, chão cinza. Os prédios da base são os mesmos de Marte (só visual).
 */
export const MOON: Scenario = {
  id: 'moon',
  gravity: MOON_G,
  terrain: { soil: MOON_PALETTE.soil, rock: MOON_PALETTE.rock, lit: MOON_PALETTE.lit, dust: MOON_PALETTE.dust },
  sky: { day: MOON_PALETTE.sky, dust: MOON_PALETTE.sky, alert: 0x3a1418, night: 0x050609 },
  // Polo sul da Lua: o Sol fica sempre baixo no horizonte, com sombras compridas.
  sun: { color: 0xffffff, position: [-30, 16, 34], intensity: 2.6 },
  hemiIntensity: 1.05,
  // As mesas de Marte viram bordas de cratera baixas.
  mesaHeight: 0.45,
  airless: true,
  restDarkness: 0.12,
  buildExtras: buildMoonExtras,
};

/**
 * A Terra grande e baixa no horizonte (no polo sul da Lua ela fica sempre perto do horizonte)
 * e algumas crateras longe da trilha do rover.
 */
function buildMoonExtras(): THREE.Object3D {
  const group = new THREE.Group();
  const earth = new THREE.Group();
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: MOON_PALETTE.earth, fog: false })));
  const rng = seededRandom(19);
  for (let i = 0; i < 7; i++) {
    const land = i < 3;
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(land ? 2.6 : 1.8, 12, 8),
      new THREE.MeshBasicMaterial({ color: land ? MOON_PALETTE.earthLand : PALETTE.white, fog: false }),
    );
    const a = rng() * Math.PI * 1.2 - 0.6;
    const b = rng() * 1.4 - 0.7;
    blob.position.set(Math.sin(a) * 6.7, Math.sin(b) * 6.7, Math.cos(a) * Math.cos(b) * 6.7);
    blob.scale.set(1, land ? 0.7 : 0.35, 0.45);
    blob.lookAt(0, 0, 0);
    earth.add(blob);
  }
  earth.position.set(-75, 16, -150);
  earth.lookAt(0, 0, 0);
  group.add(earth);

  const craterRng = seededRandom(23);
  for (let i = 0; i < 9; i++) {
    const angle = craterRng() * Math.PI * 2;
    const dist = 42 + craterRng() * 40;
    const r = 3 + craterRng() * 6;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const rim = toonMesh(new THREE.TorusGeometry(r, r * 0.22, 6, 20), MOON_PALETTE.rock, 0.02);
    rim.rotation.x = -Math.PI / 2;
    rim.scale.z = 0.45;
    rim.position.set(x, terrainHeight(x, z) + 0.1, z);
    rim.castShadow = false;
    group.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 20), toonMaterial(MOON_PALETTE.soil));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, terrainHeight(x, z) + 0.05, z);
    floor.receiveShadow = true;
    group.add(floor);
  }
  return group;
}
