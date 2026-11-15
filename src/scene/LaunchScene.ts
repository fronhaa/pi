import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, toonMaterial, toonMesh } from '@/render/toon';
import { t as tr, type StringKey } from '@/i18n';

/**
 * Tela de escolha e viagem em 3D cartoon (mesmo estilo toon com contorno do jogo). O foguete JÁ ESTÁ NO ESPAÇO, em
 * órbita da Terra (órbita de espera, F37 em docs/ciencia-marte.md): na tela de escolha ele dá a volta na Terra, com
 * o motor desligado, e Marte e Lua aparecem em 3D para a criança tocar (botões por cima em src/ui/PlaceChoice.ts).
 * Ao escolher (`begin`), o motor liga, o foguete acelera em volta da Terra até o ponto de saída (sempre o mesmo, para
 * a viagem ir "para cima" na tela, sem girar a câmera) e sai da órbita rumo ao destino, passando por fotos reais da
 * NASA. Só visual. ~6 a 8 s, sincronizada com o texto por cima (src/ui/LaunchIntro.ts: "Motor ligado!", fato real e
 * "Pular").
 *
 * Desenhada pelo renderizador do jogo (src/core/Game.ts): enquanto ela passa, a cena da base não é desenhada, então
 * não pesa mais no celular. O tempo é o relógio da própria cena (`update` lê performance.now).
 *
 * Mundo: Terra centrada em (0, -R, 0); órbita no plano XY (a câmera de longe olha de +Z). O foguete sai da órbita
 * no ponto mais à esquerda, onde a tangente aponta para +Y; a viagem segue para cima (`dir`, `right`).
 * O destino é "trapaça de cinema": fica sempre um pouco à frente e atrás do foguete, crescendo, como se ele se
 * aproximasse.
 */
const R = 40; // raio da Terra no desenho
/** Raio da órbita (desenho: bem mais alta que a real, para dar para ver). */
const ORBIT_R = R + 16;
/** Volta na Terra devagar (rad/s): dá para ver o foguete andando em volta. */
const OMEGA = 0.35;
/**
 * Momentos da viagem (s, contados da SAÍDA da órbita; antes disso, tempo negativo: o foguete acelera em volta da
 * Terra até o ponto de saída). Destino aparece, chega ao destino, fim.
 */
// Devagar de propósito: a criança precisa de tempo para ler o aviso, as fotos e o fato (7 a 12 anos).
const T_DEST = 1;
const T_ARRIVE = 10;
export const LAUNCH_SECONDS = 12.2;
/**
 * Ponto de saída da órbita: o mais à esquerda (ângulo 3/4 de volta), onde a tangente aponta para cima. Assim a
 * viagem é sempre "para cima" na tela e a câmera nunca gira (girar de ponta-cabeça ficava ruim no celular).
 */
const THETA_DEPART = 1.5 * Math.PI;
/** Velocidade (rad/s na órbita) na hora da saída e aceleração do motor depois dela, em unidades do desenho. */
const OMEGA_DEPART = 0.6;
const ACCEL = 12;
const DEST_Z = -60;
/** Destino um pouco à esquerda: a câmera fica à direita do foguete, então assim ele aparece no meio da tela. */
const DEST_X = -11;
/** Planetas da tela de escolha: presos à câmera, a esta distância dela. */
const PICK_DIST = 40;
/** Raio dos planetas como são montados (a escala ajusta para a tela de escolha e para o destino). */
const PLANET_R = 14;
/**
 * Onde ficam Marte e Lua na tela de escolha (ver `layoutPicker`). A Terra fica embaixo, no meio; a Lua ao lado dela,
 * grande; Marte pequeno, no alto do outro lado, bem mais fundo.
 */
const PICK_PORTRAIT = {
  moon: { x: 0.55, y: 0.22, r: 0.11, depth: 1 },
  mars: { x: -0.45, y: 0.6, r: 0.07, depth: 9 },
};
const PICK_LANDSCAPE = {
  moon: { x: 0.5, y: 0.08, r: 0.17, depth: 1 },
  mars: { x: -0.55, y: 0.45, r: 0.1, depth: 9 },
};
/** De longe o foguete fica maior que o real (cartoon), senão vira um pontinho. */
const ORBIT_BOOST = 3.5;

/**
 * Fotos reais da NASA que passam ao lado do foguete na trajetória (cartões de foto), com crédito no próprio cartão.
 * Fontes e trechos originais em docs/ciencia-marte.md (F34 a F36). Arquivos em public/assets/images/.
 */
const PHOTOS = {
  earth: { file: 'earth-apollo17-AS17-148-22727.jpg', credit: 'NASA' },
  mars: { file: 'mars-viking-PIA00407.jpg', credit: 'NASA/JPL/USGS' },
  moon: { file: 'moon-apollo11-AS11-44-6667.jpg', credit: 'NASA' },
} as const;
type PhotoId = keyof typeof PHOTOS;

/** Quando cada cartão passa (segundos da viagem) e de que lado da tela. */
const PHOTO_TIMES: { from: number; to: number; side: 1 | -1 }[] = [
  { from: 1, to: 5.2, side: -1 },
  { from: 5, to: 9.6, side: 1 },
];
const CARD_W = 512;
const CARD_H = 560;

interface PhotoCard {
  id: PhotoId;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  from: number;
  to: number;
  side: 1 | -1;
  ready: boolean;
}

type Place = 'mars' | 'moon';

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export class LaunchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly created = performance.now();
  /** Quando a criança escolheu (null = ainda na tela de escolha). */
  private started: number | null = null;
  /** Segundos da escolha até a saída da órbita (o foguete acelera em volta da Terra até o ponto de saída). */
  private tGo = 0;
  /** Quanto falta girar até o ponto de saída (rad). */
  private delta = 0;
  private reduced = false;
  private aspect = 1;
  private height = 1;
  /** Ângulo do foguete na órbita quando a criança escolheu (a saída parte dele). */
  private thetaStart = 0;
  /** Direção da viagem depois da saída (para cima) e a direita dela. */
  private readonly dir = new THREE.Vector3(0, 1, 0);
  private readonly right = new THREE.Vector3(1, 0, 0);
  /** Destinos prontos desde o começo (montar na hora do toque travava o celular). */
  private readonly destPlanets: Record<Place, THREE.Group>;
  private readonly rocket = new THREE.Group();
  private readonly flame = new THREE.Group();
  private readonly stars: THREE.Points;
  private readonly streaks: THREE.LineSegments;
  private readonly streakBase: Float32Array;
  private readonly orbitLine: THREE.Line;
  private readonly dest = new THREE.Group();
  private readonly cards: PhotoCard[] = [];
  /** Marte e Lua da tela de escolha (presos à câmera). */
  private readonly picker = new THREE.Group();
  private readonly planets: Record<Place, THREE.Group>;
  /** Raio de cada planeta da escolha na tela, em fração da meia-altura. */
  private readonly planetScreenR = { mars: 0.1, moon: 0.1 };
  private hover: Place | null = null;
  private readonly path = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();

  constructor() {
    this.scene.background = new THREE.Color(0x1b1630);
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6f8a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(6, 10, 8);
    this.scene.add(sun);
    this.scene.add(this.camera); // cartões de foto e planetas da escolha ficam presos a ela

    this.scene.add(this.buildEarth());
    this.buildRocket();
    this.stars = this.buildStars();
    const s = this.buildStreaks();
    this.streaks = s.lines;
    this.streakBase = s.base;
    this.orbitLine = this.buildOrbitLine();

    this.planets = { mars: makePlanet('mars'), moon: makePlanet('moon') };
    this.picker.add(this.planets.mars, this.planets.moon);
    this.camera.add(this.picker);
    // Tudo o que a viagem usa fica pronto já na tela de escolha: destinos e cartões de foto (imagem, texto, textura).
    this.destPlanets = { mars: makePlanet('mars'), moon: makePlanet('moon') };
    for (const g of Object.values(this.destPlanets)) {
      g.scale.setScalar(14 / PLANET_R);
      g.visible = false;
      this.dest.add(g);
    }
    this.dest.rotation.z = 0.35;
    this.dest.visible = false;
    this.scene.add(this.dest);
    this.buildPhotoCards(['earth', 'mars', 'moon']);
    this.update();
  }

  /**
   * Prepara TODOS os desenhos da escolha e da viagem antes de aparecer (na tela de carregamento): mostra por um
   * instante o que fica escondido, espera os shaders ficarem prontos de verdade e desenha uma vez (envia texturas e
   * formas para a placa de vídeo). No celular, preparar um shader na primeira vez que ele aparece travava a viagem.
   */
  async warmUp(renderer: THREE.WebGLRenderer): Promise<void> {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    await renderer.compileAsync(this.scene, this.camera);
    renderer.render(this.scene, this.camera);
    for (const o of hidden) o.visible = false;
  }

  /** Planeta sob o dedo ou o mouse (cresce um pouco). */
  setHover(place: Place | null): void {
    this.hover = place;
  }

  /** Onde cada planeta da tela de escolha aparece na tela (pixels CSS): centro e raio, para os botões por cima. */
  planetScreen(place: Place): { x: number; y: number; r: number } {
    const p = this.planets[place].getWorldPosition(this.tmpB).project(this.camera);
    const w = this.height * this.aspect;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * this.height, r: this.planetScreenR[place] * (this.height / 2) };
  }

  /**
   * Escolheu: o motor liga, o foguete acelera em volta da Terra até o ponto de saída e sai da órbita rumo ao destino.
   * Devolve quantos segundos faltam para a saída (o texto por cima entra nessa hora).
   */
  begin(place: Place, reduced = false): number {
    if (this.started !== null) return 0;
    this.thetaStart = this.idleTheta();
    const turn = Math.PI * 2;
    const delta = (((THETA_DEPART - this.thetaStart) % turn) + turn) % turn;
    this.tGo = reduced ? 0 : Math.min(2.6, Math.max(0.8, delta / 2.2));
    this.delta = delta;
    if (reduced) this.thetaStart = THETA_DEPART;
    this.destPlanets[place].visible = true;
    const slots = PHOTO_TIMES;
    for (const c of this.cards) {
      const slot = c.id === 'earth' ? slots[0] : c.id === place ? slots[1] : null;
      Object.assign(c, slot ?? { from: -1, to: -1 });
    }
    this.reduced = reduced;
    this.hover = null;
    this.started = performance.now();
    return this.tGo;
  }

  /** Tamanho da tela: no celular em pé, ângulo maior. */
  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    this.aspect = aspect;
    this.height = h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  /** Ângulo do foguete na órbita enquanto a criança escolhe (começa no alto, à esquerda). */
  private idleTheta(): number {
    return -0.6 + ((performance.now() - this.created) / 1000) * OMEGA;
  }

  /** Posição do foguete: na órbita (devagar na escolha, acelerando depois do toque); da saída em diante, para cima. */
  private rocketPath(t: number, out: THREE.Vector3): THREE.Vector3 {
    let theta: number;
    if (this.started === null) theta = this.idleTheta() + t * OMEGA;
    else if (t < 0) {
      theta = this.thetaStart + this.sweep(t + this.tGo);
    } else return out.set(-ORBIT_R, -R + OMEGA_DEPART * ORBIT_R * t + ACCEL * t * t, 0);
    return out.set(Math.sin(theta) * ORBIT_R, -R + Math.cos(theta) * ORBIT_R, 0);
  }

  /**
   * Volta acelerada até o ponto de saída (curva de Hermite): começa na velocidade da órbita, corre no meio e chega
   * na velocidade de saída, moderada, para a câmera conseguir acompanhar.
   */
  private sweep(s: number): number {
    const T = this.tGo;
    if (T <= 0) return 0;
    const x = Math.min(1, Math.max(0, s / T));
    const x2 = x * x;
    const x3 = x2 * x;
    const h10 = x3 - 2 * x2 + x;
    const h01 = -2 * x3 + 3 * x2;
    const h11 = x3 - x2;
    // Antes do toque (s < 0, só nas contas da direção do foguete): segue na velocidade da órbita.
    if (s < 0) return OMEGA * s;
    return h10 * OMEGA * T + h01 * this.delta + h11 * OMEGA_DEPART * T;
  }

  /**
   * Avança a animação pelo relógio (ou num instante dado, para teste). Antes de `begin`: tela de escolha.
   * Com "reduzir movimento", vai direto para perto da chegada.
   */
  update(at?: number): void {
    const idle = this.started === null && at === undefined;
    const elapsed = this.started === null ? 0 : (performance.now() - this.started) / 1000;
    const t = idle ? 0 : (at ?? (this.reduced ? 8 : Math.min(LAUNCH_SECONDS, elapsed - this.tGo)));
    const path = this.rocketPath(t, this.path);
    /** 0 = vista de longe (Terra e órbita), 1 = câmera atrás do foguete, olhando o destino. */
    const chase = idle ? 0 : smooth(t / 1.8);

    // Foguete: aponta para onde vai; no fim entra no destino, diminuindo.
    const arrive = smooth((t - T_ARRIVE) / 1.8);
    const destH = destHeight(t);
    this.rocket.position
      .copy(path)
      .addScaledVector(this.dir, arrive * destH * 0.92)
      .addScaledVector(this.right, arrive * DEST_X * 0.92)
      .setZ(arrive * DEST_Z * 0.92);
    const ahead = this.rocketPath(t + 0.02, this.tmpC).sub(this.rocketPath(t - 0.02, this.tmpB));
    this.rocket.rotation.z = -Math.atan2(ahead.x, ahead.y);
    this.rocket.scale.setScalar((1 - arrive * 0.8) * (1 + (ORBIT_BOOST - 1) * (1 - chase)));

    // Chama: apagada na órbita (só dá a volta); acende forte quando a criança escolhe.
    const fire = idle ? 0 : smooth((t + this.tGo) / 0.25) * (1 + 0.4 * (1 - smooth((t - 1) / 0.6)));
    // Sempre desenhada (bem pequena na escolha): o celular prepara o desenho dela antes do toque, sem engasgo.
    this.flame.visible = true;
    if (fire < 0.01) {
      this.flame.scale.setScalar(0.001);
    } else
      this.flame.scale.set(fire, fire * (1 + 0.25 * Math.sin(t * 40 + elapsed)), fire);

    // Órbita tracejada em volta da Terra, enquanto a câmera está longe.
    (this.orbitLine.material as THREE.LineDashedMaterial).opacity = 0.7 * (1 - chase);
    this.orbitLine.visible = chase < 0.98;

    // Destino: sempre à frente e atrás do foguete, crescendo enquanto ele "se aproxima".
    const appear = smooth((t - T_DEST) / 1.5);
    this.dest.visible = appear > 0.01;
    this.dest.position.copy(path).addScaledVector(this.dir, destH).addScaledVector(this.right, DEST_X).setZ(DEST_Z);
    this.dest.scale.setScalar(0.35 + 0.95 * smooth((t - T_DEST) / (T_ARRIVE - T_DEST)) * appear);
    this.dest.rotation.y = t * 0.15;

    // Linhas de velocidade depois de sair da órbita (no referencial da viagem).
    const speed = idle ? 0 : smooth(t / 1) * (1 - smooth((t - T_ARRIVE) / 0.8));
    // Na escolha ficam desenhadas, mas invisíveis (opacidade 0): o mesmo "preparo" da chama.
    this.streaks.visible = idle || speed > 0.01;
    this.moveStreaks(t, path, speed);

    // Câmera: de longe (Terra embaixo, planetas da escolha em cima) -> atrás do foguete, olhando o destino.
    const portrait = this.aspect < 0.8;
    const far = portrait ? 300 : 185;
    const farH = far * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Na escolha, a Terra fica na parte de baixo da tela (no celular em pé, os planetas ocupam o alto).
    const shift = portrait ? 0.32 * farH : 0.18 * farH;
    this.camera.position.set(0, -R + shift, far);
    this.tmpA.set(0, -R + shift, 0);
    this.tmpB.copy(path).addScaledVector(this.right, 5).addScaledVector(this.dir, -4).setZ(24);
    this.camera.position.lerp(this.tmpB, chase);
    this.tmpB.copy(path).addScaledVector(this.dir, 9);
    this.tmpA.lerp(this.tmpB, chase);
    this.camera.lookAt(this.tmpA);
    this.stars.position.copy(this.camera.position);

    this.layoutPicker(idle ? 1 : 1 - smooth((t + this.tGo) / 0.4));
    this.placeCards(t, idle);
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

  /**
   * Marte e Lua da tela de escolha, com noção de profundidade: a Lua perto da Terra (grande, na frente) e Marte bem
   * longe (pequeno, no alto e lá no fundo). `x`, `y` e `r` em fração da meia-tela (r pela altura); `depth` multiplica
   * a distância da câmera (mais longe = a perspectiva faz o resto). Somem (encolhem) quando a criança escolhe.
   */
  private layoutPicker(show: number): void {
    this.picker.visible = show > 0.01;
    if (!this.picker.visible) return;
    const time = (performance.now() - this.created) / 1000;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.aspect < 0.8;
    const spots = portrait ? PICK_PORTRAIT : PICK_LANDSCAPE;
    for (const place of ['mars', 'moon'] as const) {
      const { x, y, r, depth } = spots[place];
      const d = PICK_DIST * depth;
      const hh = d * tan;
      const g = this.planets[place];
      this.planetScreenR[place] = r * (this.hover === place ? 1.12 : 1);
      const target = ((this.planetScreenR[place] * hh) / PLANET_R) * show;
      g.scale.setScalar(g.scale.x + (target - g.scale.x) * 0.2);
      g.position.set(x * hh * this.aspect, (y + Math.sin(time * 1.3 + depth) * 0.01) * hh, -d);
      g.rotation.y = time * 0.25;
    }
  }

  private moveStreaks(t: number, path: THREE.Vector3, speed: number): void {
    const pos = this.streaks.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const shift = (t * 35) % 40;
    const p = this.tmpC;
    for (let i = 0; i < arr.length; i += 6) {
      const along = ((this.streakBase[i + 1] - shift + 40) % 40) - 20;
      for (const [o, extra] of [[0, 0], [3, 3]] as const) {
        p.copy(path)
          .addScaledVector(this.right, this.streakBase[i + o])
          .addScaledVector(this.dir, along + extra)
          .setZ(this.streakBase[i + o + 2]);
        arr[i + o] = p.x;
        arr[i + o + 1] = p.y;
        arr[i + o + 2] = p.z;
      }
    }
    pos.needsUpdate = true;
    (this.streaks.material as THREE.LineBasicMaterial).opacity = 0.55 * speed;
  }

  /** Cartões de foto presos à câmera: entram no alto, descem devagar (o foguete "passa" por eles) e somem. */
  private placeCards(t: number, idle: boolean): void {
    const portrait = this.aspect < 0.8;
    const dist = 10;
    const hh = dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hw = hh * this.aspect;
    // Largura do cartão: quase metade da tela no celular em pé, um quarto no computador; nunca mais alto que 70% da tela.
    const w = Math.min((portrait ? 0.88 : 0.5) * hw, (1.4 * hh) / (CARD_H / CARD_W));
    for (const c of this.cards) {
      // Na escolha, desenhados minúsculos (preparo da textura e do desenho no celular, sem engasgo no meio da viagem).
      if (idle) {
        c.mesh.visible = c.ready;
        c.mesh.scale.setScalar(0.0001);
        c.mesh.position.set(0, 0, -dist); // na frente da câmera (na posição dela, ficava fora da vista e não era desenhado)
        continue;
      }
      const k = c.to > c.from ? (t - c.from) / (c.to - c.from) : -1;
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
      const card: PhotoCard = { id, mesh, from: -1, to: -1, side: PHOTO_TIMES[Math.min(i, 1)].side, ready: false };
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

  /** Órbita tracejada em volta da Terra (plano XY). */
  private buildOrbitLine(): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * ORBIT_R, -R + Math.cos(a) * ORBIT_R, 0));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xf3e9df, dashSize: 4, gapSize: 3, transparent: true }),
    );
    line.computeLineDistances();
    this.scene.add(line);
    return line;
  }

  /**
   * Terra: oceano azul com continentes verdes. Os continentes são pintados numa textura pequena (bordas lisas; por
   * vértice ficavam em degraus).
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
        const k = smooth((v - 0.66) / 0.08);
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
    this.scene.add(this.rocket);
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
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf3e9df, size: 2.2, sizeAttenuation: false, depthWrite: false }));
    stars.renderOrder = -1;
    this.scene.add(stars);
    return stars;
  }

  /** Linhas de velocidade: base no referencial da viagem (x = para a direita, y = ao longo da viagem, z). */
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
    lines.visible = false;
    this.scene.add(lines);
    return { lines, base };
  }

}

/** Quanto o destino está à frente do foguete: começa longe e chega perto. */
function destHeight(t: number): number {
  return 46 - 18 * smooth((t - T_DEST) / (T_ARRIVE - T_DEST));
}

/** Marte (vermelho, crateras e calota polar) ou Lua (cinza, crateras), com raio PLANET_R. */
function makePlanet(place: Place): THREE.Group {
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
