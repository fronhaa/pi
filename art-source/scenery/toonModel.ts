import * as THREE from 'three';
import { addOutline, toonMaterial } from '@/render/toon';

/**
 * Troca os materiais de um modelo .glb do cenário por toonMaterial (mantendo nome, brilho e transparência)
 * e põe o contorno com a espessura gravada em `userData.outline` de cada peça (0 = sem contorno).
 */
export function toonify(root: THREE.Object3D): void {
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
