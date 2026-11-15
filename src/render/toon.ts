import * as THREE from 'three';

/**
 * Helpers do estilo cel-shading. Direção de arte: docs/art-bible.md; aplicação no código: docs/estilo-visual.md.
 * - toonMaterial: sombreamento em 4 faixas, sem sombra preta (Art Bible; GDD, alinhamento #6).
 * - addOutline: contorno escuro e fino pela técnica "inverted hull".
 */

/**
 * Casco visto por dentro (cápsulas e estufa): todas as peças do casco ficam translúcidas para a câmera, para ver a
 * tripulação lá dentro sem nada opaco na frente. Para o sol continuam metal: fazem sombra (o sol não entra) e a luz
 * de dentro é das luminárias (na estufa, LED e fibra óptica).
 */
export function seeThroughHull<M extends THREE.Material>(mat: M, opacity: number): M {
  const m = mat.clone();
  m.transparent = true;
  m.opacity = opacity;
  // Escreve profundidade mesmo transparente: as peças do casco são desenhadas em camadas (renderOrder: casca, faixas,
  // anéis, janelas...) e, sem isto, as janelas do lado de TRÁS eram desenhadas por cima da casca da frente. No "See
  // inside" elas surgiam de uma vez, com o casco ainda quase opaco (a troca brusca). O que está dentro (opaco, e os
  // fachos de luz, desenhados antes do casco) continua aparecendo através dele.
  m.depthWrite = true;
  m.side = THREE.FrontSide;
  // Sombra pelos dois lados: por padrão o three.js só desenha a face de trás na sombra, e num casco fechado
  // ela fica atrás de quem está dentro; aí o sol "atravessava" o metal.
  m.shadowSide = THREE.DoubleSide;
  // Opacidade "aberta" (vista por dentro): a cena pode fechar o casco (opaco) e abrir de novo (src/scene/BaseScene.ts).
  m.userData.hullOpacity = opacity;
  return m;
}

/**
 * Abre ou fecha um casco feito com `seeThroughHull`: `open` 0 = fechado (opaco, como é de verdade), 1 = aberto
 * (transparente, para ver por dentro). Devolve false se o material não é de casco.
 */
export function setHullOpen(mat: THREE.Material, open: number): boolean {
  const target = mat.userData.hullOpacity as number | undefined;
  if (target === undefined) return false;
  const transparent = open > 0.01;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = THREE.MathUtils.lerp(1, target, open);
  return true;
}

/** Cores do casco dos módulos (research-base.glb): painéis, faixa escura e faixa laranja. */
export const HULL_COLORS = { shell: 0xf3f1ed, bandDark: 0x48444b, bandOrange: 0xe7782f } as const;

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
