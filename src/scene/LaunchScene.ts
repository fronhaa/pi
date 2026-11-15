import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, toonMaterial, toonMesh } from '@/render/toon';

/**
 * Intro da viagem em 3D cartoon (mesmo estilo toon com contorno do jogo): o foguete decola da Terra, atravessa as
 * nuvens, a Terra fica para trás e ele chega a Marte ou à Lua. Só visual. ~9 s, sincronizada com o texto por cima
 * (src/ui/LaunchIntro.ts: contagem, "Liftoff!", fato real e "Pular").
 *
 * Desenhada pelo renderizador do jogo (src/core/Game.ts): enquanto ela passa, a cena da base não é desenhada, então
 * não pesa mais no celular. O tempo é o relógio da própria cena (`update` lê performance.now).
 *
 * Mundo: Terra centrada em (0, -R, 0), base de lançamento no topo (y = 0), foguete sobe em +Y. O destino é
 * "trapaça de cinema": fica sempre um pouco acima e atrás do foguete, crescendo, como se ele se aproximasse.
 */
const R = 40; // raio da Terra no desenho
const ROCKET_BASE = 0.65; // altura do foguete parado na base
const DEST_Z = -60;
/** Destino um pouco à esquerda: a câmera fica à direita do foguete, então assim ele aparece no meio da tela. */
const DEST_X = -11;
export const LAUNCH_SECONDS = 9;

interface CamKey {
  t: number;
  /** Posição da câmera e ponto olhado, relativos ao foguete (só a altura dele). */
  pos: [number, number, number];
  look: [number, number, number];
}

/** Câmera: perto da base na contagem, segue a decolagem, se afasta para ver a Terra, e olha para o destino. */
const CAM: CamKey[] = [
  { t: 0, pos: [4.5, 1.6, 9.5], look: [0, 1.6, 0] },
  { t: 1.5, pos: [4, 1.4, 8.5], look: [0, 1.6, 0] },
  { t: 2.7, pos: [5, -1.5, 12], look: [0, 1.5, 0] },
  { t: 4.3, pos: [12, -20, 52], look: [0, -14, 0] },
  { t: 5.6, pos: [5, -4, 24], look: [0, 9, 0] },
  { t: 9, pos: [4, -3, 22], look: [0, 10, 0] },
];

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export class LaunchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly start = performance.now();
  private readonly rocket = new THREE.Group();
  private readonly flame = new THREE.Group();
  private readonly puffs: { mesh: THREE.Mesh; born: number; dir: THREE.Vector3 }[] = [];
  private readonly stars: THREE.Points;
  private readonly streaks: THREE.LineSegments;
  private readonly streakBase: Float32Array;
  private readonly dest = new THREE.Group();
  private readonly skyDay = new THREE.Color(0x8ec5ee);
  private readonly skySpace = new THREE.Color(0x1b1630);
  private readonly bg = new THREE.Color();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(
    place: 'mars' | 'moon',
    private readonly reduced = false,
  ) {
    this.scene.background = this.bg.copy(this.skyDay);
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6f8a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(6, 10, 8);
    this.scene.add(sun);

    this.scene.add(this.buildEarth());
    this.buildPad();
    this.buildClouds();
    this.buildRocket();
    this.buildSmoke();
    this.stars = this.buildStars();
    const s = this.buildStreaks();
    this.streaks = s.lines;
    this.streakBase = s.base;
    this.buildDestination(place);
    this.update();
  }

  /** Tamanho da tela: no celular em pé, ângulo maior para caber a torre e o foguete inteiros. */
  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  /** Avança a animação pelo relógio (ou num instante dado, para teste). Com "reduzir movimento", fica parada na chegada. */
  update(at?: number): void {
    const t = at ?? (this.reduced ? 7.2 : Math.min(LAUNCH_SECONDS, (performance.now() - this.start) / 1000));
    const y = rocketHeight(t);

    // Foguete: treme antes de sair, sobe, e no fim voa para dentro do destino (diminuindo).
    const shake = t > 0.9 && t < 2.2 ? Math.sin(t * 90) * 0.03 * (1 - Math.abs(t - 1.55) / 0.7) : 0;
    const arrive = smooth((t - 7.4) / 1.5);
    const destH = destHeight(t);
    this.rocket.position.set(shake + arrive * DEST_X * 0.92, y + arrive * destH * 0.92, arrive * DEST_Z * 0.92);
    this.rocket.scale.setScalar(1 - arrive * 0.8);
    this.rocket.rotation.x = -arrive * 0.5;

    // Chama: acende pouco antes do "Liftoff!" e tremula.
    const fire = smooth((t - 1.1) / 0.4);
    this.flame.visible = fire > 0.01;
    this.flame.scale.set(fire, fire * (1 + 0.25 * Math.sin(t * 40)), fire);

    // Fumaça na base: bolinhas que crescem e somem (cartoon, sem transparência).
    for (const p of this.puffs) {
      const age = t - p.born;
      const life = 1.8;
      p.mesh.visible = age > 0 && age < life;
      if (!p.mesh.visible) continue;
      const k = age / life;
      p.mesh.scale.setScalar(Math.sin(Math.PI * Math.min(1, k * 1.3)) * 1.3 + 0.05);
      p.mesh.position.copy(p.dir).multiplyScalar(0.8 + k * 3.2).setY(0.4 + k * 0.6);
    }

    // Céu: azul até ~12 de altura (passa pelas nuvens ainda de dia), depois espaço; estrelas aparecem junto.
    const space = smooth((y - 12) / 36);
    this.bg.copy(this.skyDay).lerp(this.skySpace, space);
    (this.stars.material as THREE.PointsMaterial).opacity = space;
    this.stars.visible = space > 0.02;

    // Destino: sempre acima e atrás do foguete, crescendo enquanto ele "se aproxima".
    const appear = smooth((t - 4.4) / 1.2);
    this.dest.visible = appear > 0.01;
    this.dest.position.set(DEST_X, y + destH, DEST_Z);
    this.dest.scale.setScalar(0.35 + 0.95 * smooth((t - 4.4) / 4.4) * appear);
    this.dest.rotation.y = t * 0.15;

    // Linhas de velocidade na viagem.
    const speed = smooth((t - 3.6) / 0.8) * (1 - smooth((t - 7.8) / 0.8));
    this.streaks.visible = speed > 0.01;
    if (this.streaks.visible) {
      const pos = this.streaks.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const shift = (t * 60) % 40;
      for (let i = 0; i < arr.length; i += 6) {
        const yy = ((this.streakBase[i + 1] - shift + 40) % 40) - 20;
        arr[i] = this.streakBase[i];
        arr[i + 2] = this.streakBase[i + 2];
        arr[i + 3] = this.streakBase[i + 3];
        arr[i + 5] = this.streakBase[i + 5];
        arr[i + 1] = y + yy;
        arr[i + 4] = y + yy + 3;
      }
      pos.needsUpdate = true;
      (this.streaks.material as THREE.LineBasicMaterial).opacity = 0.55 * speed;
    }

    // Câmera.
    const { pos, look } = cameraAt(t);
    this.camera.position.set(pos[0], y + pos[1], pos[2]);
    this.tmpA.set(look[0], y + look[1], look[2]);
    this.camera.lookAt(this.tmpA);
    this.stars.position.copy(this.camera.position);
  }

  /** Libera geometrias e materiais (o material do contorno é compartilhado pelo jogo: fica). */
  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.geometry) return;
      mesh.geometry.dispose();
      if (mesh.userData.isOutline) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m?.dispose();
    });
  }

  // ---------- montagem ----------

  /** Terra: oceano azul com continentes verdes (cores por vértice) e a base no topo, em terra. */
  private buildEarth(): THREE.Object3D {
    const geo = new THREE.SphereGeometry(R, 72, 48);
    const ocean = new THREE.Color(0x3e7cc8);
    const land = new THREE.Color(PALETTE.plant);
    const colors: number[] = [];
    const n = new THREE.Vector3();
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(p, i).normalize();
      const v = Math.sin(n.x * 5) + Math.sin(n.y * 4 + 1) + Math.sin(n.z * 6 + 2) + 0.5 * Math.sin((n.x + n.z) * 9);
      const c = v > 0.7 || n.y > 0.97 ? land : ocean;
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const earth = toonMesh(geo, 0xffffff, 0.006);
    earth.material.vertexColors = true;
    earth.position.y = -R;
    return earth;
  }

  private surfaceY(x: number, z: number): number {
    return Math.sqrt(R * R - x * x - z * z) - R;
  }

  /** Base de lançamento, torre e árvores. */
  private buildPad(): void {
    const pad = toonMesh(new THREE.CylinderGeometry(1.8, 2, 0.3, 32), 0x7a838c, 0.04);
    pad.position.y = 0.15;
    this.scene.add(pad);
    const tower = toonMesh(new THREE.BoxGeometry(0.35, 4.4, 0.35), 0x9aa3ad, 0.05);
    tower.position.set(1.55, 2.5, 0);
    this.scene.add(tower);
    for (const h of [1.6, 2.8]) {
      const arm = toonMesh(new THREE.BoxGeometry(0.95, 0.14, 0.14), 0x9aa3ad, 0.06);
      arm.position.set(1.05, h, 0);
      this.scene.add(arm);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.alarm }));
    lamp.position.set(1.55, 4.8, 0);
    this.scene.add(lamp);

    const trees: [number, number, number][] = [
      [-4, -2, 1], [-6.5, 1.5, 1.3], [4.5, -3, 1.1], [6.5, 1.8, 0.9], [-3, -6, 1.2], [3.5, -7, 1.4], [-8, -4, 1], [8, -5, 1.2],
    ];
    for (const [x, z, s] of trees) {
      const tree = new THREE.Group();
      const trunk = toonMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), 0x7a5434, 0);
      trunk.position.y = 0.3;
      const top = toonMesh(new THREE.SphereGeometry(0.7, 16, 12), 0x5a8a3c, 0.06);
      top.position.y = 1.05;
      tree.add(trunk, top);
      tree.scale.setScalar(s);
      tree.position.set(x, this.surfaceY(x, z), z);
      this.scene.add(tree);
    }
  }

  /** Nuvens fofas no caminho do foguete: passar por elas dá a sensação de subir rápido. */
  private buildClouds(): void {
    const spots: [number, number, number][] = [
      [-5, 7, -3], [5.5, 10, -6], [-3.5, 14, 2], [4, 18, 1], [-6, 21, -8], [2, 25, -5],
    ];
    for (const [x, y, z] of spots) {
      const cloud = new THREE.Group();
      for (const [dx, dy, r] of [[0, 0, 1.1], [1.1, -0.2, 0.8], [-1.1, -0.25, 0.75], [0.4, 0.5, 0.7]] as const) {
        const puff = toonMesh(new THREE.SphereGeometry(r, 16, 12), 0xffffff, 0.05);
        puff.position.set(dx, dy, 0);
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      this.scene.add(cloud);
    }
  }

  /** Foguete cartoon: corpo branco, bico e aletas laranja, janelinha e motor. Origem na base do corpo. */
  private buildRocket(): void {
    const body = toonMesh(
      new THREE.LatheGeometry(
        [[0.001, 0], [0.5, 0], [0.6, 0.45], [0.63, 1.3], [0.53, 2.3], [0.001, 2.3]].map(([x, y]) => new THREE.Vector2(x, y)),
        32,
      ),
      0xf7f3ee,
      0.04,
    );
    const nose = toonMesh(new THREE.ConeGeometry(0.535, 1, 32), PALETTE.accent, 0.04);
    nose.position.y = 2.8;
    const band = toonMesh(new THREE.CylinderGeometry(0.615, 0.6, 0.2, 32), PALETTE.accent, 0.03);
    band.position.y = 0.55;
    const window_ = toonMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 24), 0x7fe6ea, 0.12);
    window_.rotation.x = Math.PI / 2;
    window_.position.set(0, 1.55, 0.6);
    const bell = toonMesh(new THREE.CylinderGeometry(0.3, 0.44, 0.35, 20), PALETTE.tech, 0.05);
    bell.position.y = -0.17;
    this.rocket.add(body, nose, band, window_, bell);

    const finShape = new THREE.Shape();
    finShape.moveTo(0, 1.1);
    finShape.lineTo(0.65, -0.1);
    finShape.lineTo(0.65, -0.35);
    finShape.lineTo(0, 0);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false });
    finGeo.translate(0.45, 0, -0.05);
    for (let i = 0; i < 3; i++) {
      const fin = toonMesh(finGeo, PALETTE.accent, 0.05);
      const holder = new THREE.Group();
      holder.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 2;
      holder.add(fin);
      this.rocket.add(holder);
    }

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 20), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    outer.rotation.x = Math.PI;
    outer.position.y = -0.9;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 16), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    inner.rotation.x = Math.PI;
    inner.position.y = -0.65;
    this.flame.add(outer, inner);
    this.flame.position.y = -0.3;
    this.rocket.add(this.flame);

    this.rocket.position.y = ROCKET_BASE;
    this.scene.add(this.rocket);
  }

  private buildSmoke(): void {
    const geo = new THREE.SphereGeometry(0.6, 14, 10);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.3;
      const mesh = toonMesh(geo, 0xf3ede6, 0.05);
      mesh.visible = false;
      this.scene.add(mesh);
      this.puffs.push({ mesh, born: 1.3 + (i % 7) * 0.18, dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) });
    }
  }

  private buildStars(): THREE.Points {
    let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pts: number[] = [];
    for (let i = 0; i < 500; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pts.push(Math.cos(a) * r * 900, u * 900, Math.sin(a) * r * 900);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xf3e9df, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false }),
    );
    stars.renderOrder = -1;
    this.scene.add(stars);
    return stars;
  }

  private buildStreaks(): { lines: THREE.LineSegments; base: Float32Array } {
    let s = 3;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const base = new Float32Array(36 * 6);
    for (let i = 0; i < 36; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.5 + rnd() * 9;
      const y = rnd() * 40;
      base.set([Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * r, y + 3, Math.sin(a) * r], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf3e9df, transparent: true }));
    lines.frustumCulled = false;
    this.scene.add(lines);
    return { lines, base };
  }

  /** Marte (vermelho, crateras e calota polar) ou Lua (cinza, crateras). */
  private buildDestination(place: 'mars' | 'moon'): void {
    const r = 14;
    const mars = place === 'mars';
    const planet = toonMesh(new THREE.SphereGeometry(r, 48, 32), mars ? PALETTE.rock : MOON_PALETTE.rock, 0.025);
    this.dest.add(planet);
    const craterColor = mars ? 0xa84a2c : 0x8a8890;
    const craterMat = toonMaterial(craterColor);
    const craterGeo = new THREE.SphereGeometry(1, 16, 8);
    let s = 11;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 16; i++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.6 - 0.8, rnd() * 2 - 1).normalize();
      const size = 1 + rnd() * 2.2;
      const c = new THREE.Mesh(craterGeo, craterMat);
      c.position.copy(dir).multiplyScalar(r - size * 0.15);
      c.lookAt(this.tmpB.copy(dir).multiplyScalar(2 * r));
      c.scale.set(size, size, size * 0.3);
      this.dest.add(c);
    }
    if (mars) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 32, 8, 0, Math.PI * 2, 0, 0.42), toonMaterial(0xf2ede6));
      this.dest.add(cap);
    }
    this.dest.rotation.z = 0.35;
    this.dest.visible = false;
    this.scene.add(this.dest);
  }
}

/** Altura do foguete: parado na contagem, acelera na decolagem, vai rápido na viagem. */
function rocketHeight(t: number): number {
  if (t < 1.5) return ROCKET_BASE;
  if (t < 4) {
    const k = (t - 1.5) / 2.5;
    return ROCKET_BASE + 30 * k * k;
  }
  const u = t - 4;
  return ROCKET_BASE + 30 + 24 * u + u * u;
}

/** Quanto o destino está acima do foguete: começa longe e chega perto. */
function destHeight(t: number): number {
  return 46 - 18 * smooth((t - 4.4) / 4);
}

function cameraAt(t: number): { pos: [number, number, number]; look: [number, number, number] } {
  let i = 0;
  while (i < CAM.length - 2 && t > CAM[i + 1].t) i++;
  const a = CAM[i];
  const b = CAM[i + 1];
  const k = smooth((t - a.t) / (b.t - a.t));
  const lerp3 = (p: number[], q: number[]) => p.map((v, j) => v + (q[j] - v) * k) as [number, number, number];
  return { pos: lerp3(a.pos, b.pos), look: lerp3(a.look, b.look) };
}
