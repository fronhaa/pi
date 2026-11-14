import * as THREE from 'three';

/**
 * Helpers do estilo cartoon. Ver docs/estilo-visual.md
 * - toonMaterial: sombreamento em faixas (cel shading) via gradientMap.
 * - addOutline: contorno escuro pela técnica "inverted hull".
 */

export const PALETTE = {
  outline: 0x1a1a2e,
  sky: 0x8ecae6,
  ground: 0x95d5b2,
  player: 0xff8c42,
  red: 0xef476f,
  yellow: 0xffd166,
  green: 0x06d6a0,
  blue: 0x118ab2,
  white: 0xffffff,
} as const;

let gradientMap: THREE.DataTexture | null = null;

/** Textura 3x1 com 3 tons: define quantas "faixas" de luz o toon tem. */
function getGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const tones = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() });
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

/**
 * Adiciona contorno a um mesh: uma cópia levemente maior, só com as faces de trás, em cor escura.
 * Funciona bem para formas convexas/primitivas. Para modelos complexos, ver alternativas em docs/estilo-visual.md.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.05): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.scale.setScalar(1 + thickness);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

/** Atalho: mesh toon com contorno e sombras ligadas. */
export function toonMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  outline = 0.05,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, toonMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline > 0) addOutline(mesh, outline);
  return mesh;
}
