import * as THREE from 'three';
import { PALETTE } from '@/render/toon';
import type { Scenario } from '@/scenarios';
import { seededRandom } from './layout';

/** O que o céu precisa saber a cada frame. */
export interface SkyFrame {
  /** 0 = dia, 1 = noite (já com a escuridão do cenário aplicada). */
  night: number;
  /** Poeira nos painéis, de 0 a 1 (em Marte, a mesma poeira escurece o céu). */
  dust: number;
  /**
   * Poeira NO AR (partículas), de 0 a 1: só durante a tempestade de poeira. A poeira que sobra nos painéis
   * depois dela não levanta partículas.
   */
  airborne: number;
  alert: boolean;
  /** Luz do Sol de hoje, de 0 a 1 (Lua; em Marte é sempre 1). */
  sunlight: number;
  time: number;
  dt: number;
  /** Hora do sol (dia): 0 = nascer, 0,5 = meio-dia, 1 = pôr; acima de 1, abaixo do horizonte (noite). */
  dayTime: number;
}

/** Distância do disco do Sol (m) e o raio dele: um pouco maior que o real, para a criança enxergar. */
const SUN_DISTANCE = 170;
const SUN_RADIUS = 4;
/** O Sol anda até a hora pedida aos poucos (fração do dia por segundo): o pôr do sol leva uns 2 s. */
const SUN_SPEED = 0.45;
/** Luz do Sol para posicionar a sombra (m do centro da base). */
const LIGHT_DISTANCE = 60;
/** Céu do pôr e do nascer do sol em Marte: alaranjado perto do horizonte. */
const SKY_LOW_SUN = new THREE.Color(0xd08a5a);

/**
 * Céu e luz: fundo e névoa, Sol e luz ambiente, estrelas, o pontinho da Terra (FX-002) e a poeira no ar.
 * As cores e a intensidade vêm do cenário (src/scenarios/); aqui só a mistura de dia, poeira, alerta e noite.
 */
export class Sky {
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly stars: THREE.Points;
  private readonly earthDot: THREE.Mesh;
  private readonly dustParticles: THREE.Points;
  /** Posições originais das partículas (as que caem dentro de um prédio são escondidas a cada quadro). */
  private readonly dustBase: Float32Array;
  /** Áreas dos prédios (caixas no chão): poeira não entra na base, nem com o casco transparente. */
  private dustExclusion: readonly { center: THREE.Vector3; half: THREE.Vector3 }[] = [];
  /** Prédios redondos (a cúpula da estufa): x, z, raio e altura. */
  private dustCircles: readonly { x: number; z: number; r: number; h: number }[] = [];
  /** Disco do Sol no céu e a hora atual dele (amortecida). */
  private readonly sunDisc: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private sunT = 0.2;
  private scenario!: Scenario;
  private readonly colors = { day: new THREE.Color(), dust: new THREE.Color(), alert: new THREE.Color(), night: new THREE.Color() };

  constructor(
    private readonly scene: THREE.Scene,
    root: THREE.Object3D,
    scenario: Scenario,
  ) {
    scene.background = new THREE.Color(scenario.sky.day);
    scene.fog = new THREE.Fog(new THREE.Color(scenario.sky.day), 45, 140);

    this.hemi = new THREE.HemisphereLight(0xfff1e0, PALETTE.soil, 1.3);
    root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    this.sun.position.set(-30, 40, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 130 });
    this.sun.shadow.bias = -0.0005;
    // Recomendado no doc dos modelos (docs/rover-e-base-de-pesquisa.md): evita manchas onde uma peça recebe a
    // própria sombra (como o casco da estufa).
    this.sun.shadow.normalBias = 0.05;
    root.add(this.sun);

    this.stars = buildStars();
    root.add(this.stars);
    // Visto de Marte, a Terra é só um pontinho azul (FX-002).
    this.earthDot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0, fog: false }));
    this.earthDot.position.set(-60, 70, -150);
    root.add(this.earthDot);
    this.dustParticles = buildDustParticles();
    this.dustBase = (this.dustParticles.geometry.getAttribute('position').array as Float32Array).slice();
    root.add(this.dustParticles);
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false }));
    root.add(this.sunDisc);
    root.add(this.sun.target);
    this.setScenario(scenario);
  }

  setScenario(s: Scenario): void {
    this.scenario = s;
    this.colors.day.setHex(s.sky.day);
    this.colors.dust.setHex(s.sky.dust);
    this.colors.alert.setHex(s.sky.alert);
    this.colors.night.setHex(s.sky.night);
    // Sem ar, a Terra não é um pontinho: ela aparece grande (nos extras do cenário).
    this.earthDot.visible = !s.airless;
    this.hemi.groundColor.setHex(s.terrain.soil);
    this.sun.color.setHex(s.sun.color);
    this.sunDisc.material.color.setHex(s.sun.color).lerp(new THREE.Color(0xffffff), 0.5);
    this.placeSun();
    (this.dustParticles.material as THREE.PointsMaterial).color.setHex(s.terrain.dust);
  }

  /**
   * Onde o Sol está agora (direção, a partir do centro da base), pelo caminho do cenário e a hora `sunT`.
   * Acima de 1 (noite em Marte), continua descendo abaixo do horizonte; na Lua ele não se põe.
   */
  private sunDirection(): { dir: THREE.Vector3; elevation: number } {
    const { azimuth, elevation } = this.scenario.sun.path;
    const t = this.scenario.sun.sets ? this.sunT : THREE.MathUtils.clamp(this.sunT, 0, 1);
    const az = THREE.MathUtils.lerp(azimuth[0], azimuth[1], t);
    // Altura: das pontas ao meio-dia pelo seno; depois do pôr (t > 1), negativa.
    const el = elevation[0] + (elevation[1] - elevation[0]) * Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) - (t > 1 ? (t - 1) * 1.5 : 0) - (t < 0 ? -t * 1.5 : 0);
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    return { dir, elevation: el };
  }

  /** Para onde está o Sol agora (vetor unitário a partir da base). */
  get sunVector(): THREE.Vector3 {
    return this.sun.position.clone().normalize();
  }

  private placeSun(): { elevation: number } {
    const { dir, elevation } = this.sunDirection();
    this.sun.position.copy(dir).multiplyScalar(LIGHT_DISTANCE);
    this.sun.target.position.set(0, 0, 0);
    this.sunDisc.position.copy(dir).multiplyScalar(SUN_DISTANCE);
    this.sunDisc.visible = elevation > -0.05;
    return { elevation };
  }

  update(f: SkyFrame): void {
    const s = this.scenario;
    const n = f.night;
    // O Sol anda até a hora do jogo. Começou um sol novo (a hora voltou para a manhã)? Ele nasce de novo do
    // lado certo, em vez de voltar para trás pelo céu.
    if (f.dayTime < this.sunT - 0.5) this.sunT = s.sun.sets ? -0.1 : f.dayTime;
    this.sunT += THREE.MathUtils.clamp(f.dayTime - this.sunT, -SUN_SPEED * f.dt, SUN_SPEED * f.dt);
    const { elevation } = this.placeSun();
    // Sol baixo: menos luz (nascer e pôr), e em Marte o céu fica alaranjado perto do horizonte.
    const low = 1 - THREE.MathUtils.smoothstep(elevation, 0.05, 0.45);
    const sunUp = THREE.MathUtils.smoothstep(elevation, -0.05, 0.12);
    // `f.dust` passa de 1 só no treino da introdução (névoa mais fechada); cor, Sol e partículas param em 1.
    const dust = Math.min(1, f.dust);
    const sky = this.colors.day.clone().lerp(this.colors.dust, dust);
    if (!s.airless) sky.lerp(SKY_LOW_SUN, low * 0.35);
    if (f.alert) sky.lerp(this.colors.alert, 0.45);
    sky.lerp(this.colors.night, n);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    // Sem ar: quase sem névoa (só esconde a borda do mapa) e a poeira não sobe no céu.
    fog.near = s.airless ? 150 : THREE.MathUtils.lerp(45, 14, f.dust);
    fog.far = s.airless ? 300 : THREE.MathUtils.lerp(140, 70, f.dust);

    // Sem ar, a poeira fica nos painéis, mas não escurece o céu (não há vento para levantá-la).
    const skyDust = s.airless ? 0 : dust;
    this.sun.intensity = THREE.MathUtils.lerp(s.sun.intensity * (1 - skyDust * 0.5) * (0.2 + 0.8 * f.sunlight) * (0.35 + 0.65 * sunUp), 0.15, n);
    this.hemi.intensity = THREE.MathUtils.lerp(s.hemiIntensity, 0.35, n);
    // Sem ar, as estrelas aparecem até de dia.
    (this.stars.material as THREE.PointsMaterial).opacity = s.airless ? Math.max(0.75, n) : n;
    (this.earthDot.material as THREE.MeshBasicMaterial).opacity = n;

    const dp = this.dustParticles;
    const airborne = s.airless ? 0 : Math.min(1, f.airborne);
    const opacity = THREE.MathUtils.lerp(0, 0.7, Math.min(1, airborne * 1.5)) * (1 - n * 0.6);
    (dp.material as THREE.PointsMaterial).opacity = opacity;
    // Sem tempestade, nada é desenhado (antes ficavam partículas invisíveis passando por dentro da base).
    dp.visible = opacity > 0.01;
    dp.position.x = ((f.time * 3) % 20) - 10;
    if (dp.visible) this.hideDustInsideBuildings(dp.position.x);
  }

  /** Áreas dos prédios onde a poeira não aparece (as caixas de colisão da base). */
  setDustExclusion(boxes: readonly { center: THREE.Vector3; half: THREE.Vector3 }[], circles: readonly { x: number; z: number; r: number; h: number }[] = []): void {
    this.dustExclusion = boxes;
    this.dustCircles = circles;
  }

  /** Esconde (joga para baixo do chão) as partículas que, com o vento de agora, caem dentro de um prédio. */
  private hideDustInsideBuildings(offsetX: number): void {
    const attr = this.dustParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pos = attr.array as Float32Array;
    const base = this.dustBase;
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i] + offsetX;
      const y = base[i + 1];
      const z = base[i + 2];
      let inside = false;
      for (const b of this.dustExclusion) {
        if (Math.abs(x - b.center.x) < b.half.x + 0.5 && Math.abs(z - b.center.z) < b.half.z + 0.5 && y < b.center.y + b.half.y + 1.5) {
          inside = true;
          break;
        }
      }
      if (!inside) {
        for (const c of this.dustCircles) {
          if (y < c.h && Math.hypot(x - c.x, z - c.z) < c.r) {
            inside = true;
            break;
          }
        }
      }
      pos[i + 1] = inside ? -50 : y;
    }
    attr.needsUpdate = true;
  }
}

function buildStars(): THREE.Points {
  const rng = seededRandom(11);
  const n = 600;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = rng() * Math.PI * 0.42;
    const r = 200;
    arr[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    arr[i * 3 + 1] = Math.cos(phi) * r;
    arr[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
}

function buildDustParticles(): THREE.Points {
  const rng = seededRandom(5);
  const n = 900;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (rng() - 0.5) * 80;
    arr[i * 3 + 1] = rng() * 12;
    arr[i * 3 + 2] = (rng() - 0.5) * 80;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: PALETTE.dust, size: 0.18, transparent: true, opacity: 0 }));
}
