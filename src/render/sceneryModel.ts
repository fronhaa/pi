import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addOutline, toonMaterial } from '@/render/toon';

/**
 * Modelos .glb do cenário (base de pesquisa e rover, docs/rover-e-base-de-pesquisa.md; base de comunicação e
 * placas com bateria, docs/base-comunicacao-e-bateria.md).
 * Ao carregar, troca os materiais por toonMaterial (mantendo nome, brilho, transparência e textura)
 * e põe o contorno com a espessura gravada em `userData.outline` de cada peça (0 = sem contorno).
 */
export const SCENERY_MODELS = {
  researchBase: `${import.meta.env.BASE_URL}assets/models/research-base.glb`,
  rover: `${import.meta.env.BASE_URL}assets/models/rover.glb`,
  commBase: `${import.meta.env.BASE_URL}assets/models/comm-base.glb`,
  solarPanels: `${import.meta.env.BASE_URL}assets/models/solar-panels-battery.glb`,
} as const;

export interface SceneryModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** Toca um clipe do .glb em loop (ou uma vez) e devolve a ação. Nome desconhecido: não faz nada (null). */
  play(name: string, once?: boolean): THREE.AnimationAction | null;
}

export async function loadSceneryModel(url: string): Promise<SceneryModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene as unknown as THREE.Group;
  toonify(root);
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  return {
    root,
    mixer,
    play(name, once = false) {
      const clip = clips.get(name);
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      action.reset().play();
      return action;
    },
  };
}

/** Mesma troca de materiais de art-source/scenery/toonModel.ts (aquele arquivo não entra no build). */
function toonify(root: THREE.Object3D): void {
  const cache = new Map<THREE.Material, THREE.MeshToonMaterial>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    let m = cache.get(src);
    if (!m) {
      m = toonMaterial(src.color, {
        name: src.name,
        emissive: src.emissive,
        emissiveIntensity: src.emissiveIntensity,
        transparent: src.transparent,
        opacity: src.opacity,
        depthWrite: src.depthWrite,
        side: src.side,
        vertexColors: src.vertexColors,
        map: src.map,
        alphaTest: src.alphaTest,
      });
      cache.set(src, m);
    }
    mesh.material = m;
    mesh.castShadow = !m.transparent;
    mesh.receiveShadow = true;
    const t = (mesh.userData.outline as number | undefined) ?? 0.03;
    if (t > 0) addOutline(mesh, t);
  }
}
