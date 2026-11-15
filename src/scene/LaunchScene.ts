import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { t as tr, type StringKey } from '@/i18n';

/**
 * Intro da viagem em 3D cartoon (mesmo estilo toon com contorno do jogo): o foguete decola da Terra, atravessa as
 * nuvens, a Terra fica para trás e ele chega a Marte ou à Lua. Só visual. ~9 s, sincronizada com o texto por cima
 * (src/ui/LaunchIntro.ts: contagem, "Liftoff!", fato real e "Pular").
 *
 * Antes da escolha, a mesma cena é a tela de escolha: um "palco" no espaço com o foguete flutuando, Marte e Lua em 3D
 * (a criança toca no planeta; botões por cima em src/ui/PlaceChoice.ts) e a Terra embaixo. Ao escolher (`begin`),
 * a câmera desce até a base na Terra e começa a contagem.
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
/** Tela de escolha: palco no espaço bem acima da Terra, câmera a esta distância dele. */
const STAGE_Y = 600;
const STAGE_DIST = 40;
/** Raio dos planetas como são montados (a escala ajusta para a tela de escolha e para o destino). */
const PLANET_R = 14;
/** Descida da câmera, da Terra vista do espaço (tela de escolha) até a base, antes da contagem. */
export const LAUNCH_ZOOM_SECONDS = 1.6;

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

/**
 * Fotos reais da NASA que passam ao lado do foguete na trajetória (cartões de foto), com crédito no próprio cartão.
 * Fontes e trechos originais em docs/ciencia-marte.md (F32 a F36). Arquivos em public/assets/images/.
 */
const PHOTOS = {
  launchMars: { file: 'launch-perseverance-KSC-20200730-PH-FMX01_0042.jpg', credit: 'NASA/Frank Michaux' },
  launchMoon: { file: 'launch-apollo11-S69-39961.jpg', credit: 'NASA' },
  earth: { file: 'earth-apollo17-AS17-148-22727.jpg', credit: 'NASA' },
  mars: { file: 'mars-viking-PIA00407.jpg', credit: 'NASA/JPL/USGS' },
  moon: { file: 'moon-apollo11-AS11-44-6667.jpg', credit: 'NASA' },
} as const;
type PhotoId = keyof typeof PHOTOS;

/** Quando cada cartão passa (segundos da viagem) e de que lado da tela. Depois do "Liftoff!", antes da chegada. */
const PHOTO_TIMES: { from: number; to: number; side: 1 | -1 }[] = [
  { from: 3.0, to: 4.9, side: 1 },
  { from: 4.8, to: 6.7, side: -1 },
  { from: 6.6, to: 8.6, side: 1 },
];
const CARD_W = 512;
const CARD_H = 560;

interface PhotoCard {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  from: number;
  to: number;
  side: 1 | -1;
  ready: boolean;
}

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export class LaunchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly created = performance.now();
  /** Quando a viagem começou (null = ainda na tela de escolha). */
  private started: number | null = null;
  private reduced = false;
  private aspect = 1;
  private height = 1;
  /** Tela de escolha, longe da Terra no espaço: foguete flutuando, Marte e Lua para tocar e a Terra embaixo. */
  private readonly stage = new THREE.Group();
  private readonly stageRocket: THREE.Object3D;
  private readonly stageEarth: THREE.Object3D;
  private readonly planets: Record<'mars' | 'moon', THREE.Group>;
  private readonly planetRadius = { mars: 1, moon: 1 };
  private hover: 'mars' | 'moon' | null = null;
  private hh = 1;
  private readonly rocket = new THREE.Group();
  private readonly flame = new THREE.Group();
  private readonly puffs: { mesh: THREE.Mesh; born: number; dir: THREE.Vector3 }[] = [];
  private readonly stars: THREE.Points;
  private readonly streaks: THREE.LineSegments;
  private readonly streakBase: Float32Array;
  private readonly dest = new THREE.Group();
  private readonly clouds = new THREE.Group();
  private readonly cards: PhotoCard[] = [];
  private readonly skyDay = new THREE.Color(0x8ec5ee);
  private readonly skySpace = new THREE.Color(0x1b1630);
  private readonly bg = new THREE.Color();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor() {
    this.scene.background = this.bg.copy(this.skyDay);
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6f8a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(6, 10, 8);
    this.scene.add(sun);

    const earth = this.buildEarth();
    this.scene.add(earth);
    this.buildPad();
    this.buildClouds();
    this.buildRocket();
    this.buildSmoke();
    this.stars = this.buildStars();
    const s = this.buildStreaks();
    this.streaks = s.lines;
    this.streakBase = s.base;

    // Tela de escolha: cópias do foguete e da Terra (mesmas peças) e os dois planetas.
    this.stageRocket = this.rocket.clone(true);
    this.stageEarth = earth.clone(true);
    this.planets = { mars: makePlanet('mars'), moon: makePlanet('moon') };
    this.stage.add(this.stageRocket, this.stageEarth, this.planets.mars, this.planets.moon);
    this.stage.position.y = STAGE_Y;
    this.scene.add(this.stage);
    this.update();
  }

  /** Planeta sob o dedo ou o mouse (cresce um pouco). */
  setHover(place: 'mars' | 'moon' | null): void {
    this.hover = place;
  }

  /** Onde cada planeta da tela de escolha aparece na tela (pixels CSS): centro e raio, para os botões por cima. */
  planetScreen(place: 'mars' | 'moon'): { x: number; y: number; r: number } {
    const p = this.tmpB.copy(this.planets[place].position).add(this.stage.position).project(this.camera);
    const w = this.height * this.aspect;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * this.height, r: (this.planetRadius[place] / this.hh) * (this.height / 2) };
  }

  /** Arruma a tela de escolha pelo tamanho da tela (celular em pé: planetas em cima, lado a lado). */
  private layoutStage(time: number): void {
    const hh = STAGE_DIST * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hw = hh * this.aspect;
    this.hh = hh;
    const portrait = this.aspect < 0.8;
    const r = portrait ? Math.min(0.34 * hw, 0.2 * hh) : Math.min(0.2 * hw, 0.27 * hh);
    const py = portrait ? 0.22 * hh : 0.12 * hh;
    // Perto do meio no computador: nas bordas da tela a perspectiva achata as esferas.
    const px = portrait ? 0.5 * hw : 0.42 * hw;
    for (const [place, sx] of [['mars', -1], ['moon', 1]] as const) {
      const g = this.planets[place];
      this.planetRadius[place] = r * (this.hover === place ? 1.12 : 1);
      const target = this.planetRadius[place] / PLANET_R;
      g.scale.setScalar(g.scale.x + (target - g.scale.x) * 0.2);
      g.position.set(sx * px, py + Math.sin(time * 1.3 + sx) * 0.02 * hh, 0);
      g.rotation.y = time * 0.25;
    }
    // Foguete flutuando no meio, um pouco inclinado, com a chama baixa.
    const rocketH = (portrait ? 0.3 : 0.38) * hh;
    this.stageRocket.scale.setScalar(rocketH / 3.3);
    this.stageRocket.position.set(0, (portrait ? -0.38 : -0.22) * hh + Math.sin(time * 1.8) * 0.03 * hh, 0);
    this.stageRocket.rotation.z = Math.sin(time * 0.9) * 0.08;
    const flame = this.stageRocket.getObjectByName('flame');
    flame?.scale.set(0.7, 0.7 * (1 + 0.25 * Math.sin(time * 30)), 0.7);
    // A Terra embaixo, de onde o foguete saiu (só o alto dela aparece).
    const er = (portrait ? 1.1 : 0.45) * hw;
    this.stageEarth.scale.setScalar(er / R);
    this.stageEarth.position.set(0, -hh - (portrait ? 0.55 : 0.6) * er, -er * 0.5);
    this.stageEarth.rotation.y = time * 0.05;
  }

  /** Começa a viagem: a câmera desce até a base e, depois de LAUNCH_ZOOM_SECONDS, a contagem. */
  begin(place: 'mars' | 'moon', reduced = false): void {
    if (this.started !== null) return;
    this.buildDestination(place);
    this.buildPhotoCards(place === 'mars' ? ['launchMars', 'earth', 'mars'] : ['launchMoon', 'earth', 'moon']);
    this.reduced = reduced;
    this.hover = null;
    this.started = performance.now();
  }

  /** Tamanho da tela: no celular em pé, ângulo maior para caber a torre e o foguete inteiros. */
  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    this.aspect = aspect;
    this.height = h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Avança a animação pelo relógio (ou num instante dado, para teste). Antes de `begin`: tela de escolha.
   * Tempo negativo = descida da câmera até a base. Com "reduzir movimento", vai direto para a chegada.
   */
  update(at?: number): void {
    const idle = this.started === null && at === undefined;
    const elapsed = this.started === null ? 0 : (performance.now() - this.started) / 1000;
    const t = at ?? (idle ? -LAUNCH_ZOOM_SECONDS : this.reduced ? 7.2 : Math.min(LAUNCH_SECONDS, elapsed - LAUNCH_ZOOM_SECONDS));
    const y = rocketHeight(t);
    /** 1 = vista do espaço (tela de escolha), 0 = na base. */
    const away = idle ? 1 : 1 - smooth((t + LAUNCH_ZOOM_SECONDS) / LAUNCH_ZOOM_SECONDS);

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
    // Na descida da tela de escolha o céu só clareia perto do chão.
    const space = Math.max(smooth(away * 3), smooth((y - 12) / 36));
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
    const { pos, look } = cameraAt(Math.max(0, t));
    this.camera.position.set(pos[0], y + pos[1], pos[2]);
    this.tmpA.set(look[0], y + look[1], look[2]);
    if (away > 0) {
      // Tela de escolha: câmera de frente para o palco no espaço. Ao escolher, desce até a base na Terra.
      this.tmpB.set(0, STAGE_Y, STAGE_DIST);
      this.camera.position.lerp(this.tmpB, away);
      // O olhar vira para a base antes da câmera chegar: na descida a Terra aparece e cresce (sem céu vazio).
      this.tmpB.set(0, STAGE_Y, 0);
      this.tmpA.lerp(this.tmpB, idle ? 1 : away ** 4);
    }
    this.stage.visible = away > 0.5;
    if (this.stage.visible) this.layoutStage((performance.now() - this.created) / 1000);
    this.camera.lookAt(this.tmpA);
    this.placeCards(t);
    // Vistas do espaço, as nuvens viravam uma "torre" esquisita em cima da base.
    this.clouds.visible = away < 0.5;
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
      for (const m of mats) {
        (m as THREE.MeshToonMaterial | undefined)?.map?.dispose();
        m?.dispose();
      }
    });
  }

  /** Cartões de foto presos à câmera: entram no alto, descem devagar (o foguete "passa" por eles) e somem. */
  private placeCards(t: number): void {
    const portrait = this.aspect < 0.8;
    const dist = 10;
    const hh = dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hw = hh * this.aspect;
    // Largura do cartão: quase metade da tela no celular em pé, um quarto no computador; nunca mais alto que 70% da tela.
    const w = Math.min((portrait ? 0.88 : 0.5) * hw, (1.4 * hh) / (CARD_H / CARD_W));
    for (const c of this.cards) {
      const k = (t - c.from) / (c.to - c.from);
      c.mesh.visible = c.ready && k > 0 && k < 1;
      if (!c.mesh.visible) continue;
      const pop = smooth(k / 0.12) * (1 - smooth((k - 0.88) / 0.12));
      c.mesh.scale.set(w * pop, w * pop, 1);
      // Fora do meio da tela, onde está o foguete.
      c.mesh.position.set(c.side * (portrait ? 0.56 : 0.55) * hw, (0.5 - 0.35 * k) * hh, -dist);
      c.mesh.rotation.z = -c.side * 0.06 + Math.sin(t * 2.2 + c.from) * 0.02;
    }
  }

  private buildPhotoCards(ids: PhotoId[]): void {
    if (!this.camera.parent) this.scene.add(this.camera);
    ids.forEach((id, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, CARD_H / CARD_W),
        new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false }),
      );
      mesh.renderOrder = 10;
      mesh.visible = false;
      this.camera.add(mesh);
      const card: PhotoCard = { mesh, ...PHOTO_TIMES[i], ready: false };
      this.cards.push(card);
      const img = new Image();
      img.onload = async () => {
        await document.fonts?.load('700 28px Fredoka').catch(() => undefined);
        drawCard(canvas, img, tr('launch.photo.badge'), tr(`launch.photo.${id}` as StringKey), PHOTOS[id].credit);
        map.needsUpdate = true;
        card.ready = true;
      };
      img.src = `${import.meta.env.BASE_URL}assets/images/${PHOTOS[id].file}`;
    });
  }

  // ---------- montagem ----------

  /**
   * Terra: oceano azul com continentes verdes e a base no topo, em terra. Os continentes são pintados numa textura
   * pequena (bordas lisas; por vértice ficavam em degraus).
   */
  private buildEarth(): THREE.Object3D {
    const w = 512;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const ocean = [0x3e, 0x7c, 0xc8];
    const land = [0x6f, 0x9a, 0x4a];
    for (let j = 0; j < h; j++) {
      const th = ((j + 0.5) / h) * Math.PI;
      for (let i = 0; i < w; i++) {
        const ph = ((i + 0.5) / w) * Math.PI * 2;
        // Mesma conta de direção da SphereGeometry do three.js (u = longitude, v = latitude).
        const x = -Math.cos(ph) * Math.sin(th);
        const y = Math.cos(th);
        const z = Math.sin(ph) * Math.sin(th);
        const v = Math.sin(x * 5) + Math.sin(y * 4 + 1) + Math.sin(z * 6 + 2) + 0.5 * Math.sin((x + z) * 9);
        const k = Math.max(smooth((v - 0.66) / 0.08), smooth((y - 0.965) / 0.01));
        const o = (j * w + i) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = ocean[c] + (land[c] - ocean[c]) * k;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const earth = toonMesh(new THREE.SphereGeometry(R, 96, 64), 0xffffff, 0.006);
    earth.material.map = map;
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
    this.scene.add(this.clouds);
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
      this.clouds.add(cloud);
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
    this.flame.name = 'flame';
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

  /** Destino da viagem: o mesmo planeta da tela de escolha. */
  private buildDestination(place: 'mars' | 'moon'): void {
    const planet = makePlanet(place);
    planet.scale.setScalar(14 / PLANET_R);
    this.dest.add(planet);
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

/** Cartão de foto cartoon: papel claro com contorno escuro, a foto, o selo "foto real", a legenda e o crédito. */
function drawCard(canvas: HTMLCanvasElement, img: HTMLImageElement, badge: string, caption: string, credit: string): void {
  const ctx = canvas.getContext('2d')!;
  const ink = '#473C3A';
  const font = "'Fredoka', ui-rounded, system-ui, sans-serif";
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#FBF4EC';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(5, 5, CARD_W - 10, CARD_H - 10, 28);
  ctx.fill();
  ctx.stroke();
  // Foto cortada para preencher (como object-fit: cover).
  const px = 24;
  const py = 24;
  const pw = CARD_W - 48;
  const ph = 340;
  const scale = Math.max(pw / img.width, ph / img.height);
  const sw = pw / scale;
  const sh = ph / scale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px, py, pw, ph);
  ctx.restore();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.stroke();
  // Selo "FOTO REAL" em cima da foto.
  ctx.font = `700 22px ${font}`;
  const bw = ctx.measureText(badge).width + 28;
  ctx.fillStyle = '#E8792B';
  ctx.beginPath();
  ctx.roundRect(px + 12, py + 12, bw, 38, 19);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, px + 26, py + 32);
  // Legenda (até 2 linhas) e crédito.
  ctx.fillStyle = ink;
  ctx.font = `700 30px ${font}`;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, caption, pw);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, px, py + ph + 46 + i * 36));
  ctx.font = `500 20px ${font}`;
  ctx.fillStyle = '#7A6C68';
  ctx.fillText(credit, px, CARD_H - 30);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Marte (vermelho, crateras e calota polar) ou Lua (cinza, crateras), com raio PLANET_R. */
function makePlanet(place: 'mars' | 'moon'): THREE.Group {
  const g = new THREE.Group();
  const r = PLANET_R;
  const mars = place === 'mars';
  g.add(toonMesh(new THREE.SphereGeometry(r, 48, 32), mars ? PALETTE.rock : MOON_PALETTE.rock, 0.025));
  const craterMat = toonMaterial(mars ? 0xa84a2c : 0x8a8890);
  const craterGeo = new THREE.SphereGeometry(1, 16, 8);
  const out = new THREE.Vector3();
  let s = mars ? 11 : 23;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 16; i++) {
    const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.6 - 0.8, rnd() * 2 - 1).normalize();
    const size = (1 + rnd() * 2.2) * (r / 14);
    const c = new THREE.Mesh(craterGeo, craterMat);
    c.position.copy(dir).multiplyScalar(r - size * 0.15);
    c.lookAt(out.copy(dir).multiplyScalar(2 * r));
    c.scale.set(size, size, size * 0.3);
    g.add(c);
  }
  if (mars) g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 32, 8, 0, Math.PI * 2, 0, 0.42), toonMaterial(0xf2ede6)));
  return g;
}
