import * as THREE from 'three';

/**
 * Perfil de qualidade (desempenho no celular). No celular a tela tem densidade alta (iPhone: 3x) e a GPU é
 * menor: desenhar cada pixel 9 vezes, com centenas de peças fazendo sombra e contorno, deixa o jogo lento.
 * Nada aqui muda regra nem o que a criança vê de importante; só quanto custa desenhar.
 *
 * Técnicas (as mesmas de jogos de console e celular):
 * - densidade de pixels limitada e **resolução dinâmica** (baixa se o quadro demora, sobe se sobra folga);
 * - sem antialiasing quando a tela já é densa;
 * - mapa de sombra menor e **atualizado ~10 vezes por segundo** (o Sol anda devagar);
 * - **luzes pontuais e focos desligados** (cada pixel calculava todas as luzes);
 * - peças pequenas sem sombra e sem contorno (cada uma era desenhada mais uma ou duas vezes).
 */
export interface QualityProfile {
  name: 'high' | 'low';
  /** Densidade de pixels máxima e mínima (a resolução dinâmica anda entre as duas). */
  maxPixelRatio: number;
  minPixelRatio: number;
  antialias: boolean;
  shadowMapSize: number;
  /** Sombra recalculada a cada N segundos (0 = todo quadro). */
  shadowInterval: number;
  /** Luzes pontuais e focos (cabines, fibra óptica, LED). */
  extraLights: boolean;
  /** Peças menores que isto (raio em metros) não fazem sombra / não têm contorno. 0 = todas fazem. */
  shadowMinRadius: number;
  outlineMinRadius: number;
  /** Resolução dinâmica: média do quadro acima disto baixa a resolução; abaixo disto, sobe. */
  slowFrameMs: number;
  fastFrameMs: number;
}

const HIGH: QualityProfile = {
  name: 'high',
  maxPixelRatio: 2,
  minPixelRatio: 1,
  antialias: true,
  shadowMapSize: 2048,
  shadowInterval: 0,
  extraLights: true,
  shadowMinRadius: 0,
  outlineMinRadius: 0,
  slowFrameMs: 28,
  fastFrameMs: 12,
};

const LOW: QualityProfile = {
  name: 'low',
  maxPixelRatio: 1.5,
  minPixelRatio: 1,
  antialias: false,
  shadowMapSize: 1024,
  shadowInterval: 0.1,
  extraLights: false,
  shadowMinRadius: 0.35,
  outlineMinRadius: 0.4,
  slowFrameMs: 22,
  fastFrameMs: 13,
};

/** Celular ou tablet: toque como ponteiro principal e tela pequena, ou sistema móvel. `?quality=high|low` força. */
function detect(): QualityProfile {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'high') return HIGH;
  if (forced === 'low') return LOW;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobileOs = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  return coarse || mobileOs ? LOW : HIGH;
}

export const QUALITY: QualityProfile = detect();

/**
 * Aplica o perfil na cena já montada (chame de novo depois de carregar modelos .glb): desliga luzes extras
 * e tira sombra e contorno das peças pequenas. `keepOutline` protege grupos que devem manter o contorno
 * mesmo pequenos (a tripulação, que é o centro do jogo).
 */
export function applyQuality(root: THREE.Object3D, keepOutline: THREE.Object3D[] = []): void {
  if (QUALITY.name === 'high') return;
  const protectedSet = new Set<THREE.Object3D>();
  for (const g of keepOutline) g.traverse((o) => protectedSet.add(o));
  const lights: THREE.Light[] = [];
  const sphere = new THREE.Sphere();
  const scale = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!QUALITY.extraLights && ((o as THREE.PointLight).isPointLight || (o as THREE.SpotLight).isSpotLight)) {
      lights.push(o as THREE.Light);
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.isOutline || mesh.userData.qualityDone) return;
    mesh.userData.qualityDone = true;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    sphere.copy(mesh.geometry.boundingSphere!);
    mesh.getWorldScale(scale);
    const r = sphere.radius * Math.max(scale.x, scale.y, scale.z);
    if (r < QUALITY.shadowMinRadius) mesh.castShadow = false;
    if (r < QUALITY.outlineMinRadius && !protectedSet.has(mesh)) {
      for (const c of mesh.children) if (c.userData.isOutline) c.visible = false;
    }
  });
  // Tirar da cena (e não só apagar): luz apagada ainda entra na conta de cada pixel.
  for (const l of lights) l.removeFromParent();
}
