import * as THREE from 'three';

/**
 * Helpers do estilo cel-shading. Direção de arte: docs/art-bible.md; aplicação no código: docs/estilo-visual.md.
 * - toonMaterial: sombreamento em 4 faixas, sem sombra preta (Art Bible; GDD, alinhamento #6).
 * - addOutline: contorno escuro e fino pela técnica "inverted hull".
 */

/** Paleta oficial da Art Bible (7 cores) + cores de apoio documentadas em docs/estilo-visual.md. */
export const PALETTE = {
  // Oficiais (Art Bible)
  soil: 0x8e382b,
  rock: 0xc65b36,
  lit: 0xe58a51,
  dust: 0xe6b47a,
  shadow: 0x473c3a,
  tech: 0x718b9a,
  light: 0xc8d5d8,
  // Apoio (detalhes e estados)
  accent: 0xe8792b, // laranja: só em detalhes, como na referência do time
  outline: 0x473c3a,
  panel: 0x2f4a6e,
  plant: 0x6f9a4a,
  plantDead: 0x7a5434,
  alarm: 0xff3b2f,
  window: 0xffd27a,
  white: 0xffffff,
} as const;

/**
 * Base lunar: troca das cores de terreno da paleta de Marte por cinzas do regolito lunar
 * (docs/estilo-visual.md, "Base lunar"). Mesmas chaves das cores oficiais que mudam.
 */
export const MOON_PALETTE = {
  soil: 0x7d7c83,
  rock: 0xa3a2a9,
  lit: 0xc4c3c9,
  dust: 0xb1aea6,
  sky: 0x0b0d16,
  earth: 0x3f7fd6,
  earthLand: 0x5f9a4f,
} as const;

let gradientMap: THREE.DataTexture | null = null;

/** 4 tons, o mais escuro ainda claro o bastante para não virar "sombra preta". */
function getGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const tones = new Uint8Array([105, 160, 210, 255]);
  gradientMap = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toonMaterial(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...extra });
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

/**
 * Contorno: cópia levemente maior do mesh, só faces de trás, em cor escura.
 * Funciona bem em formas convexas/primitivas; ver limitações em docs/estilo-visual.md.
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.03): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.scale.setScalar(1 + thickness);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.userData.isOutline = true;
  mesh.add(outline);
  return outline;
}

/** Atalho: mesh toon com contorno e sombras. */
export function toonMesh(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  outline = 0.03,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial> {
  const mesh = new THREE.Mesh(geometry, toonMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline > 0) addOutline(mesh, outline);
  return mesh;
}
