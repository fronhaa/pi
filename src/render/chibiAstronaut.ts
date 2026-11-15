import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addOutline, toonMaterial } from '@/render/toon';
import { buildPedalClip } from '@/render/chibiPedal';

/**
 * Astronauta chibi (CHR-001): modelo .glb com cores sólidas e três animações (walk, jump, interact).
 * Ao carregar, troca os materiais por toonMaterial (mantendo brilho e transparência) e põe o contorno.
 * Ver docs/estilo-visual.md ("Astronauta chibi") e docs/decisoes/0004-astronauta-em-glb-com-animacoes-por-articulacoes.md
 *
 * O modelo olha para +Z, tem 1,85 m e os pés em y = 0. As animações são no lugar:
 * quem move o personagem é a física (Player).
 */
export const CHIBI_ASTRONAUT_URL = `${import.meta.env.BASE_URL}assets/models/astronaut-chibi.glb`;

/** `pedal` não vem no .glb: é montado por código (chibiPedal.ts) para a bicicleta da academia. */
export type ChibiAction = 'walk' | 'jump' | 'interact' | 'pedal';

export interface ChibiAstronautInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** Troca para a animação (com transição suave). interact e jump tocam uma vez por padrão; walk e pedal em loop. */
  play(name: ChibiAction, opts?: { once?: boolean; fade?: number }): THREE.AnimationAction;
  /** Volta à pose parada. O tablet some sozinho (a escala dele só existe na animação interact). */
  stop(fade?: number): void;
  update(dt: number): void;
}

/** Peças sem contorno na arte: rosto, cabelo, luzes, vidro e detalhes pequenos. */
const NO_OUTLINE =
  /^(eye|brow|cheek|mouth|hair|visor|face_skin|helmet_lining|helmet_vent_slot|chest_light|chest_triangle|chest_panel_screen|backpack_light|backpack_led|backpack_screen|patch_|knee.*_strap|earcup.*_(disc|ring|core)|tablet_(screen|icon|line|bar|bumper|back))/;

/** Laranja de destaque do traje no .glb (pode ser trocado por papel com `accent`). */
const GLB_ACCENT = new THREE.Color(0xe8792b);

/** O .glb é baixado uma vez só; cada astronauta recebe um clone. */
const gltfCache = new Map<string, ReturnType<GLTFLoader['loadAsync']>>();

export async function loadChibiAstronaut(
  url = CHIBI_ASTRONAUT_URL,
  opts: { accent?: THREE.ColorRepresentation } = {},
): Promise<ChibiAstronautInstance> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url);
    gltfCache.set(url, pending);
    pending.catch(() => gltfCache.delete(url));
  }
  const gltf = await pending;
  // Peças rígidas sem esqueleto: um clone comum basta (geometria compartilhada, materiais trocados abaixo).
  const root = gltf.scene.clone(true) as unknown as THREE.Group;
  const accent = opts.accent !== undefined ? new THREE.Color(opts.accent) : null;

  // materiais toon, um por cor do .glb
  const cache = new Map<THREE.Material, THREE.MeshToonMaterial>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes.push(mesh);
    const src = mesh.material as THREE.MeshStandardMaterial;
    let mat = cache.get(src);
    if (!mat) {
      const isAccent = accent && colorClose(src.color, GLB_ACCENT);
      mat = toonMaterial(isAccent ? accent : src.color);
      mat.emissive.copy(src.emissive);
      mat.emissiveIntensity = src.emissiveIntensity;
      mat.transparent = src.transparent;
      mat.opacity = src.opacity;
      mat.depthWrite = src.depthWrite;
      cache.set(src, mat);
    }
    mesh.material = mat;
    mesh.castShadow = !src.transparent;
    mesh.receiveShadow = true;
  });
  // contorno: mais fino nas peças grandes (o contorno escala junto com o objeto)
  for (const m of meshes) {
    if (NO_OUTLINE.test(m.name)) continue;
    m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere?.radius ?? 0;
    addOutline(m, r > 0.2 ? 0.02 : 0.035);
  }

  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  clips.set('pedal', buildPedalClip(root));
  let current: THREE.AnimationAction | null = null;

  return {
    root,
    mixer,
    play(name, opts = {}) {
      const clip = clips.get(name);
      if (!clip) throw new Error(`Animação "${name}" não está no .glb`);
      const action = mixer.clipAction(clip);
      const once = opts.once ?? (name !== 'walk' && name !== 'pedal');
      action.reset();
      action.timeScale = 1;
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      const fade = opts.fade ?? 0.2;
      if (current && current !== action) action.crossFadeFrom(current, fade, false);
      action.play();
      current = action;
      return action;
    },
    stop(fade = 0.2) {
      if (!current) return;
      current?.fadeOut(fade);
      current = null;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}

function colorClose(a: THREE.Color, b: THREE.Color): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.06;
}
