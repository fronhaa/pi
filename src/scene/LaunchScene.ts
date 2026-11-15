import * as THREE from 'three';
import { MOON_PALETTE, PALETTE, addOutline, toonMaterial, toonMesh } from '@/render/toon';
import { t as tr, type StringKey } from '@/i18n';
import { heliocentric, moonAngle, orbitPath, type Vec2 } from './solarSystem';

/**
 * Tela de escolha e viagem em 3D cartoon (mesmo estilo toon com contorno do jogo). Dois jeitos de escolher:
 * - NO CELULAR (toque como ponteiro principal ou sistema móvel; `?map=0|1` força): a tela "clássica", com a Lua
 *   grande perto da Terra e Marte pequeno, lá no fundo, presos à câmera (`PICK_PORTRAIT`, `PICK_LANDSCAPE`); o
 *   foguete sai da órbita pela tangente, de onde estiver. Foi pedido pelo time: na tela pequena, o mapa ficava miúdo.
 * - NO COMPUTADOR: a tela de escolha é um MAPA DO SISTEMA SOLAR visto de cima, com as posições de HOJE calculadas (src/scene/solarSystem.ts; F38 e F39 em
 * docs/ciencia-marte.md): o Sol no meio, a órbita da Terra e a de Marte, Marte onde está hoje e a Lua em volta da
 * Terra, na fase de hoje. As distâncias ficam fora de escala (na escala real, ou a Lua cola na Terra ou Marte sai da
 * tela); a ordem, as órbitas e as direções são as de verdade. A luz vem do Sol: dá para ver o lado escuro de cada um.
 * O foguete JÁ ESTÁ NO ESPAÇO, em órbita da Terra (órbita de espera, F37): dá a volta na Terra com o motor desligado,
 * e a criança toca em Marte ou na Lua (botões por cima em src/ui/PlaceChoice.ts). Ao escolher (`begin`), o motor liga
 * e o empurra na direção do destino de verdade (a Lua ou Marte no mapa); a câmera desce até ele e o segue, passando
 * por fotos reais da NASA. Só visual. ~7 s, sincronizada com o texto por cima (src/ui/LaunchIntro.ts: "Motor
 * ligado!", fato real e "Pular").
 *
 * Desenhada pelo renderizador do jogo (src/core/Game.ts): enquanto ela passa, a cena da base não é desenhada, então
 * não pesa mais no celular. O tempo é o relógio da própria cena (`update` lê performance.now).
 *
 * Mundo: Terra centrada em (0, -R, 0); tudo no plano XY, que é o plano da eclíptica visto do norte (a câmera de longe
 * olha de +Z; os planetas giram no sentido anti-horário). O foguete sai da órbita de onde estiver e o motor o empurra
 * para o destino; a viagem é calculada num referencial que acompanha essa direção (`dir`, `right`).
 * O destino é "trapaça de cinema": fica sempre um pouco à frente e atrás do foguete, crescendo, como se ele se
 * aproximasse.
 */
const R = 40; // raio da Terra no desenho
/** Raio da órbita (desenho: bem mais alta que a real, para dar para ver). */
const ORBIT_R = R + 16;
/** Volta na Terra devagar (rad/s): dá para ver o foguete andando em volta. */
const OMEGA = 0.35;
/** Momentos da viagem (s, a partir da escolha): motor liga, destino aparece, chega ao destino. */
const T_BURN = 0.6;
const T_DEST = 1.1;
const T_ARRIVE = 5.2;
export const LAUNCH_SECONDS = 7;
/** Saída da órbita: velocidade inicial (a da órbita) e aceleração do motor, em unidades do desenho. */
const V0 = OMEGA * ORBIT_R;
const ACCEL = 22;
const DEST_Z = -60;
/** Destino um pouco à esquerda: a câmera fica à direita do foguete, então assim ele aparece no meio da tela. */
const DEST_X = -11;
/** Raio dos planetas como são montados (a escala ajusta para o mapa e para o destino). */
const PLANET_R = 14;
/**
 * Mapa do Sistema Solar (fora de escala, ver o topo do arquivo): 1 ua no desenho, distância e tamanho da Lua, de
 * Marte e do Sol. A Lua fica fora da órbita do foguete; Marte e Lua bem maiores que a proporção real, para tocar.
 */
const AU = 220;
const MOON_DIST = 85;
const MOON_R = 15;
const MARS_R = 30;
const SUN_R = 44;
/** Tela clássica (celular): planetas presos à câmera, a esta distância dela. */
const PICK_DIST = 40;
/**
 * Onde ficam Marte e Lua na tela clássica (ver `layoutPicker`). A Terra fica embaixo, no meio; a Lua ao lado dela,
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

/** Celular ou tablet: toque como ponteiro principal ou sistema móvel. `?map=1` (ou `0`) força o mapa (ou a clássica). */
function wantsMap(): boolean {
  const forced = new URLSearchParams(location.search).get('map');
  if (forced === '1') return true;
  if (forced === '0') return false;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobileOs = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  return !(coarse || mobileOs);
}

/** Margens da tela na escolha (fração da altura/largura): título no alto; nome, dica e níveis embaixo dos planetas. */
const MAP_TOP = 0.2;
const MAP_BOTTOM = 0.3;
const MAP_SIDE = 0.08;
/** De longe o foguete fica maior que o real (cartoon), senão vira um pontinho. */
const ORBIT_BOOST = 3.5;

/**
 * Fotos reais da NASA que passam ao lado do foguete na trajetória (cartões de foto). O crédito não vai no cartão
 * (ADR 0013): fica em docs/fontes-nasa.md, com fontes e trechos originais em docs/ciencia-marte.md (F34 a F36). Arquivos em public/assets/images/.
 */
const PHOTOS = {
  earth: { file: 'earth-apollo17-AS17-148-22727.jpg' },
  mars: { file: 'mars-viking-PIA00407.jpg' },
  moon: { file: 'moon-apollo11-AS11-44-6667.jpg' },
} as const;
type PhotoId = keyof typeof PHOTOS;

/** Quando cada cartão passa (segundos da viagem) e de que lado da tela. */
const PHOTO_TIMES: { from: number; to: number; side: 1 | -1 }[] = [
  { from: 1.3, to: 3.3, side: -1 },
  { from: 3.2, to: 5.4, side: 1 },
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

type Place = 'mars' | 'moon';

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

export class LaunchScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 8000);
  private readonly created = performance.now();
  /** Quando a viagem começou (null = ainda na tela de escolha). */
  private started: number | null = null;
  private reduced = false;
  private aspect = 1;
  private height = 1;
  /** Ângulo do foguete na órbita quando a criança escolheu (a saída parte dele). */
  private thetaStart = 0;
  /** Direção da saída da órbita (tangente) e a direita dela, no plano XY. */
  private readonly dir = new THREE.Vector3(0, 1, 0);
  private readonly right = new THREE.Vector3(1, 0, 0);
  private readonly rocket = new THREE.Group();
  private readonly flame = new THREE.Group();
  private readonly stars: THREE.Points;
  private readonly streaks: THREE.LineSegments;
  private readonly streakBase: Float32Array;
  private readonly orbitLine: THREE.Line;
  private readonly dest = new THREE.Group();
  private readonly cards: PhotoCard[] = [];
  /** Mapa do Sistema Solar (Sol, órbitas, Marte e Lua): só na tela de escolha. */
  private readonly map = new THREE.Group();
  /** true = mapa do Sistema Solar (computador); false = tela clássica (celular). */
  readonly isMap = wantsMap();
  /** Tela clássica: Marte e Lua presos à câmera, e o raio de cada um na tela (fração da meia-altura). */
  private readonly picker = new THREE.Group();
  private readonly planetScreenR = { mars: 0.1, moon: 0.1 };
  private readonly planets: Record<Place, THREE.Group>;
  /** Centro de cada corpo no mapa (mundo) e raio desenhado. */
  private readonly bodies: Record<Place | 'sun' | 'earth', { pos: THREE.Vector3; r: number }>;
  /** Enquadramento da câmera na escolha (recalculado a cada tamanho de tela). */
  private readonly view = { x: 0, y: 0, dist: 300 };
  /** Quanto o foguete anda na órbita (rad) até o ponto de saída, entre a escolha e o motor ligar. */
  private thetaSweep = 0;
  private hover: Place | null = null;
  private readonly path = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor() {
    this.scene.background = new THREE.Color(0x1b1630);
    // Luz ambiente forte (sem sombra preta, Art Bible). No mapa a luz principal sai do Sol; na clássica, de cima.
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b6f8a, this.isMap ? 1.1 : 1.4));
    this.scene.add(this.camera); // cartões de foto (e, na clássica, os planetas da escolha) ficam presos a ela

    this.scene.add(this.buildEarth());
    this.buildRocket();
    this.stars = this.buildStars();
    const s = this.buildStreaks();
    this.streaks = s.lines;
    this.streakBase = s.base;
    this.orbitLine = this.buildOrbitLine();

    // Posições de hoje (calculadas; ver src/scene/solarSystem.ts). Tudo em volta da Terra, que fica em (0, -R).
    const now = new Date();
    const earthAu = heliocentric('earth', now);
    const earthW = new THREE.Vector3(0, -R, 0);
    const sun = new THREE.Vector3(earthW.x - earthAu.x * AU, earthW.y - earthAu.y * AU, 0);
    const marsAu = heliocentric('mars', now);
    const moonA = moonAngle(now, earthAu);
    this.bodies = {
      sun: { pos: sun, r: SUN_R },
      earth: { pos: earthW, r: R },
      mars: { pos: new THREE.Vector3(sun.x + marsAu.x * AU, sun.y + marsAu.y * AU, 0), r: MARS_R },
      moon: { pos: new THREE.Vector3(earthW.x + Math.cos(moonA) * MOON_DIST, earthW.y + Math.sin(moonA) * MOON_DIST, 0), r: MOON_R },
    };
    this.planets = { mars: makePlanet('mars'), moon: makePlanet('moon') };
    if (!this.isMap) {
      const light = new THREE.DirectionalLight(0xfff0dc, 2.2);
      light.position.set(6, 10, 8);
      this.scene.add(light);
      this.picker.add(this.planets.mars, this.planets.moon);
      this.camera.add(this.picker);
      this.update();
      return;
    }
    const light = new THREE.PointLight(0xfff0dc, 2.4, 0, 0);
    light.position.copy(sun);
    this.scene.add(light);
    for (const place of ['mars', 'moon'] as const) {
      this.planets[place].position.copy(this.bodies[place].pos);
      this.planets[place].scale.setScalar(this.bodies[place].r / PLANET_R);
      this.map.add(this.planets[place]);
    }
    this.map.add(this.buildSun(sun));
    this.map.add(this.buildMapOrbit(orbitPath('earth', now), sun, 0x8fb8e8));
    this.map.add(this.buildMapOrbit(orbitPath('mars', now), sun, 0xe58a51));
    this.map.add(this.buildMoonOrbit(earthW));
    this.scene.add(this.map);
    this.update();
  }

  /** Planeta sob o dedo ou o mouse (cresce um pouco). */
  setHover(place: Place | null): void {
    this.hover = place;
  }

  /** Onde cada planeta do mapa aparece na tela (pixels CSS): centro e raio, para os botões por cima. */
  planetScreen(place: Place): { x: number; y: number; r: number } {
    if (this.isMap) return this.bodyScreen(place);
    const p = this.planets[place].getWorldPosition(this.tmpB).project(this.camera);
    const w = this.height * this.aspect;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * this.height, r: this.planetScreenR[place] * (this.height / 2) };
  }

  /** Centro e raio na tela (pixels CSS) do Sol, da Terra, de Marte ou da Lua no mapa (para os nomes por cima). */
  bodyScreen(body: Place | 'sun' | 'earth'): { x: number; y: number; r: number } {
    const { pos, r } = this.bodies[body];
    const grow = body === this.hover ? 1.12 : 1;
    const c = this.tmpB.copy(pos).project(this.camera);
    const e = this.tmpC.copy(pos).setY(pos.y + r * grow).project(this.camera);
    const w = this.height * this.aspect;
    return { x: ((c.x + 1) / 2) * w, y: ((1 - c.y) / 2) * this.height, r: Math.abs(e.y - c.y) * (this.height / 2) };
  }

  /** Escolheu: o motor liga e o foguete sai da órbita, de onde estiver, rumo ao destino. */
  begin(place: Place, reduced = false): void {
    if (this.started !== null) return;
    this.thetaStart = this.idleTheta();
    if (this.isMap) {
      // Destino de verdade: a Lua ou Marte onde estão hoje no mapa.
      this.dir.copy(this.bodies[place].pos).sub(this.bodies.earth.pos).setZ(0).normalize();
      // Ponto de saída: onde a órbita (sentido horário, tangente = (cos θ, −sen θ)) já aponta para o destino. Até o
      // motor ligar, o foguete corre na órbita até lá; dali sai em linha reta, sempre se afastando da Terra.
      const depart = Math.atan2(-this.dir.y, this.dir.x);
      this.thetaSweep = (((depart - this.thetaStart) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    } else {
      // Clássica: segue na órbita no mesmo ritmo e sai pela tangente, de onde estiver.
      this.thetaSweep = OMEGA * T_BURN;
      const theta = this.thetaStart + this.thetaSweep;
      this.dir.set(Math.cos(theta), -Math.sin(theta), 0);
    }
    this.right.set(this.dir.y, -this.dir.x, 0);
    this.buildDestination(place);
    this.buildPhotoCards(['earth', place]);
    this.reduced = reduced;
    this.hover = null;
    this.started = performance.now();
  }

  /** Tamanho da tela: no celular em pé, ângulo maior. */
  resize(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    this.aspect = aspect;
    this.height = h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 62 : 46;
    this.camera.updateProjectionMatrix();
    if (this.isMap) this.frameMap();
  }

  /**
   * Enquadra o mapa: o Sol, a Terra com a Lua e Marte (as órbitas podem passar da borda), com espaço no alto para o
   * título e embaixo para o nome, a dica e os níveis de cada planeta.
   */
  private frameMap(): void {
    const b = this.bodies;
    const pts: [THREE.Vector3, number][] = [
      [b.sun.pos, SUN_R * 1.6],
      [b.earth.pos, MOON_DIST + MOON_R + 6],
      [b.mars.pos, MARS_R * 1.4],
    ];
    const minX = Math.min(...pts.map(([p, r]) => p.x - r));
    const maxX = Math.max(...pts.map(([p, r]) => p.x + r));
    const minY = Math.min(...pts.map(([p, r]) => p.y - r));
    const maxY = Math.max(...pts.map(([p, r]) => p.y + r));
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.aspect;
    const dist = Math.max((maxY - minY) / (2 * tanV * (1 - MAP_TOP - MAP_BOTTOM)), (maxX - minX) / (2 * tanH * (1 - 2 * MAP_SIDE)));
    const visibleH = 2 * tanV * dist;
    this.view.dist = dist;
    this.view.x = (minX + maxX) / 2;
    // O meio do conteúdo fica acima ou abaixo do meio da tela, conforme as margens de cima e de baixo.
    this.view.y = (minY + maxY) / 2 - ((MAP_BOTTOM - MAP_TOP) / 2) * visibleH;
  }

  /** Ângulo do foguete na órbita enquanto a criança escolhe (começa no alto, à esquerda). */
  private idleTheta(): number {
    return -0.6 + ((performance.now() - this.created) / 1000) * OMEGA;
  }

  /** Posição do foguete: na órbita até T_BURN; depois, pela tangente, acelerando. */
  private rocketPath(t: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.started === null) {
      const theta = this.idleTheta() + t * OMEGA;
      return out.set(Math.sin(theta) * ORBIT_R, -R + Math.cos(theta) * ORBIT_R, 0);
    }
    if (t < T_BURN) {
      const k = this.isMap ? smooth(t / T_BURN) : t / T_BURN;
      const theta = this.thetaStart + this.thetaSweep * k;
      return out.set(Math.sin(theta) * ORBIT_R, -R + Math.cos(theta) * ORBIT_R, 0);
    }
    // Motor ligado no ponto de saída: a tangente já é a direção do destino; acelera em linha reta.
    const u = t - T_BURN;
    const theta = this.thetaStart + this.thetaSweep;
    return out
      .set(Math.sin(theta) * ORBIT_R, -R + Math.cos(theta) * ORBIT_R, 0)
      .addScaledVector(this.dir, V0 * u + ACCEL * u * u);
  }

  /**
   * Avança a animação pelo relógio (ou num instante dado, para teste). Antes de `begin`: tela de escolha.
   * Com "reduzir movimento", vai direto para perto da chegada.
   */
  update(at?: number): void {
    const idle = this.started === null && at === undefined;
    const elapsed = this.started === null ? 0 : (performance.now() - this.started) / 1000;
    const t = idle ? 0 : (at ?? (this.reduced ? 4.6 : Math.min(LAUNCH_SECONDS, elapsed)));
    const path = this.rocketPath(t, this.path);
    /** 0 = vista de longe (Terra e órbita), 1 = câmera atrás do foguete, olhando o destino. */
    const chase = idle ? 0 : this.isMap ? smooth((t - 0.1) / 1.5) : smooth((t - T_BURN) / 1);

    // Foguete: aponta para onde vai; no fim entra no destino, diminuindo.
    const arrive = smooth((t - T_ARRIVE) / 1.4);
    const destH = destHeight(t);
    this.rocket.position
      .copy(path)
      .addScaledVector(this.dir, arrive * destH * 0.92)
      .addScaledVector(this.right, arrive * DEST_X * 0.92)
      .setZ(arrive * DEST_Z * 0.92);
    const ahead = this.rocketPath(t + 0.02, this.tmpC).sub(this.rocketPath(t - 0.02, this.tmpB));
    this.rocket.rotation.z = -Math.atan2(ahead.x, ahead.y);
    // No mapa a câmera fica bem longe: o foguete cresce junto, para continuar visível dando a volta na Terra.
    const boost = this.isMap ? Math.max(ORBIT_BOOST, this.view.dist / 160) : ORBIT_BOOST;
    this.rocket.scale.setScalar((1 - arrive * 0.8) * (1 + (boost - 1) * (1 - chase)));

    // Chama: apagada na órbita (só dá a volta); acende forte para sair dela.
    const fire = idle ? 0 : smooth((t - (T_BURN - 0.3)) / 0.3) * (1 + 0.4 * (1 - smooth((t - (T_BURN + 1)) / 0.6)));
    this.flame.visible = fire > 0.01;
    this.flame.scale.set(fire, fire * (1 + 0.25 * Math.sin(t * 40 + elapsed)), fire);

    // Órbita tracejada em volta da Terra, enquanto a câmera está longe.
    (this.orbitLine.material as THREE.LineDashedMaterial).opacity = 0.7 * (1 - chase);
    this.orbitLine.visible = chase < 0.98;

    // Destino: sempre à frente e atrás do foguete, crescendo enquanto ele "se aproxima".
    const appear = smooth((t - T_DEST) / 1);
    this.dest.visible = appear > 0.01;
    this.dest.position.copy(path).addScaledVector(this.dir, destH).addScaledVector(this.right, DEST_X).setZ(DEST_Z);
    this.dest.scale.setScalar(0.35 + 0.95 * smooth((t - T_DEST) / 4.4) * appear);
    this.dest.rotation.y = t * 0.15;

    // Linhas de velocidade depois de sair da órbita (no referencial da viagem).
    const speed = smooth((t - T_BURN) / 0.6) * (1 - smooth((t - T_ARRIVE) / 0.8));
    this.streaks.visible = speed > 0.01;
    if (this.streaks.visible) this.moveStreaks(t, path, speed);

    // Câmera: de longe (mapa do Sistema Solar, ou a Terra embaixo na clássica) -> atrás do foguete, olhando o destino.
    if (this.isMap) {
      this.camera.position.set(this.view.x, this.view.y, this.view.dist);
      this.tmpA.set(this.view.x, this.view.y, 0);
    } else {
      const portrait = this.aspect < 0.8;
      const far = portrait ? 300 : 185;
      const farH = far * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      // Na escolha, a Terra fica na parte de baixo da tela (no celular em pé, os planetas ocupam o alto).
      const shift = portrait ? 0.32 * farH : 0.18 * farH;
      this.camera.position.set(0, -R + shift, far);
      this.tmpA.set(0, -R + shift, 0);
    }
    this.tmpB.copy(path).addScaledVector(this.right, 5).addScaledVector(this.dir, -4).setZ(24);
    this.camera.position.lerp(this.tmpB, chase);
    this.tmpB.copy(path).addScaledVector(this.dir, 9);
    this.tmpA.lerp(this.tmpB, chase);
    // Atrás do foguete, o "para cima" da tela é a direção da viagem (o foguete sobe na tela).
    this.up.set(0, 1, 0).lerp(this.dir, chase);
    // Destino bem embaixo no mapa: no meio da troca o "para cima" zeraria; aí vale o lado da viagem.
    if (this.up.lengthSq() < 1e-4) this.up.copy(this.right);
    this.camera.up.copy(this.up.normalize());
    this.camera.lookAt(this.tmpA);
    this.stars.position.copy(this.camera.position);

    if (this.isMap) this.layoutMap(idle, chase);
    else this.layoutPicker(idle ? 1 : 1 - smooth(t / 0.4));
    this.placeCards(t);
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
   * Tela clássica (celular): Marte e Lua com noção de profundidade, a Lua perto da Terra (grande, na frente) e Marte
   * bem longe (pequeno, no alto e lá no fundo). `x`, `y` e `r` em fração da meia-tela (r pela altura); `depth`
   * multiplica a distância da câmera. Somem (encolhem) quando a criança escolhe.
   */
  private layoutPicker(show: number): void {
    this.picker.visible = show > 0.01;
    if (!this.picker.visible) return;
    const time = (performance.now() - this.created) / 1000;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const spots = this.aspect < 0.8 ? PICK_PORTRAIT : PICK_LANDSCAPE;
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

  /**
   * Mapa da escolha: os planetas giram devagar e crescem um pouco sob o dedo ou o mouse. Some quando a câmera desce
   * até o foguete (lá as distâncias do mapa não valem mais).
   */
  private layoutMap(idle: boolean, chase: number): void {
    this.map.visible = idle || chase < 0.45;
    if (!this.map.visible) return;
    const time = (performance.now() - this.created) / 1000;
    for (const place of ['mars', 'moon'] as const) {
      const g = this.planets[place];
      const target = (this.bodies[place].r / PLANET_R) * (this.hover === place ? 1.12 : 1);
      g.scale.setScalar(g.scale.x + (target - g.scale.x) * 0.2);
      g.rotation.y = time * 0.25;
    }
  }

  private moveStreaks(t: number, path: THREE.Vector3, speed: number): void {
    const pos = this.streaks.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const shift = (t * 60) % 40;
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
        drawCard(canvas, img, tr('launch.photo.badge'), tr(`launch.photo.${id}` as StringKey));
        map.needsUpdate = true;
        card.ready = true;
      };
      img.src = `${import.meta.env.BASE_URL}assets/images/${PHOTOS[id].file}`;
    });
  }

  // ---------- montagem ----------

  /** Sol do mapa: bola amarela que brilha sozinha (não recebe luz), com contorno e um halo. */
  private buildSun(at: THREE.Vector3): THREE.Object3D {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 48, 32), new THREE.MeshBasicMaterial({ color: PALETTE.window }));
    addOutline(ball, 0.03);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(SUN_R * 1.08, SUN_R * 1.5, 64),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    g.add(ball, halo);
    g.position.copy(at);
    return g;
  }

  /** Órbita de um planeta em volta do Sol (pontos em ua do solarSystem.ts), tracejada. */
  private buildMapOrbit(points: Vec2[], sun: THREE.Vector3, color: number): THREE.Line {
    const pts = points.map((p) => new THREE.Vector3(sun.x + p.x * AU, sun.y + p.y * AU, -1));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color, dashSize: 10, gapSize: 7, transparent: true, opacity: 0.75 }),
    );
    line.computeLineDistances();
    return line;
  }

  /** Órbita da Lua em volta da Terra (círculo tracejado, fora da órbita do foguete). */
  private buildMoonOrbit(earth: THREE.Vector3): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(earth.x + Math.cos(a) * MOON_DIST, earth.y + Math.sin(a) * MOON_DIST, -1));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xc4c3c9, dashSize: 4, gapSize: 4, transparent: true, opacity: 0.6 }),
    );
    line.computeLineDistances();
    return line;
  }

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

  /** Destino da viagem: o mesmo planeta da tela de escolha. */
  private buildDestination(place: Place): void {
    const planet = makePlanet(place);
    planet.scale.setScalar(14 / PLANET_R);
    this.dest.add(planet);
    this.dest.rotation.z = 0.35;
    this.dest.visible = false;
    this.scene.add(this.dest);
  }
}

/** Quanto o destino está à frente do foguete: começa longe e chega perto. */
function destHeight(t: number): number {
  return 46 - 18 * smooth((t - T_DEST) / 4);
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

/** Cartão de foto cartoon: papel claro com contorno escuro, a foto, o selo "foto real" e a legenda (crédito em docs/fontes-nasa.md). */
function drawCard(canvas: HTMLCanvasElement, img: HTMLImageElement, badge: string, caption: string): void {
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
  // Legenda (até 2 linhas).
  ctx.fillStyle = ink;
  ctx.font = `700 30px ${font}`;
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, caption, pw);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, px, py + ph + 46 + i * 36));
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
