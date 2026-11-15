import * as THREE from 'three';
import { toonMaterial } from '@/render/toon';
import { terrainHeight } from './layout';

/**
 * Rastros das rodas do rover no chão (só visual). Como os rastros do Curiosity vistos de órbita, eles duram **meses** e
 * o **vento** os apaga devagar; na tempestade de poeira global de 2007, os do Opportunity ficaram intactos
 * (docs/ciencia-marte.md, F26). Por isso aqui eles desbotam aos poucos com os sóis e a tempestade não acelera. Na Lua
 * não há vento: não desbotam.
 *
 * Cada marca é um retângulo plano no chão, de uma roda; o desbotar é a cor indo da marca escura até a cor do chão.
 */
/**
 * Marcas guardadas (2 por passo): 20 mil cobrem ~4 km de caminho, mais do que o rover anda numa missão, para o rastro
 * do começo não sumir de repente antes de desbotar.
 */
const MAX_MARKS = 20000;
/** Uma marca a cada tanto (m) que o rover anda; largura da marca de cada roda e distância de cada lado do centro. */
const MARK_STEP = 0.4;
const MARK_WIDTH = 0.26;
const WHEEL_SIDE = 0.82;
/** Quanto a marca nova escurece o chão (0 = igual ao chão, 1 = a cor do rastro). */
const TRACK_STRENGTH = 0.55;
const TRACK_COLOR = new THREE.Color(0x4a2a22);
/** "Meses" até o vento apagar (F26): aqui, 60 sóis para sumir. Numa missão de 15 sóis, o rastro do sol 1 ainda aparece. */
const FADE_SOLS = 60;

export class RoverTracks {
  readonly mesh: THREE.InstancedMesh;
  private readonly sols = new Float32Array(MAX_MARKS);
  private count = 0;
  private next = 0;
  private last: THREE.Vector2 | null = null;
  private ground = new THREE.Color(0x8e382b);
  private windy = true;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor() {
    const geo = new THREE.PlaneGeometry(MARK_STEP * 1.05, MARK_WIDTH).rotateX(-Math.PI / 2);
    const mat = toonMaterial(0xffffff);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_MARKS);
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** Cor do chão do lugar (as marcas desbotam até ela) e se há vento para apagá-las (Marte sim, Lua não). */
  setGround(color: number, windy: boolean): void {
    this.ground.setHex(color);
    this.windy = windy;
  }

  /** O rover está em (x, z), virado para `heading` (0 = +X): a cada MARK_STEP andados, uma marca de cada roda. */
  drive(x: number, z: number, heading: number, sol: number): void {
    const p = new THREE.Vector2(x, z);
    if (this.last && this.last.distanceTo(p) < MARK_STEP) return;
    if (!this.last) {
      this.last = p;
      return;
    }
    this.last = p;
    const side = new THREE.Vector2(Math.sin(heading), Math.cos(heading)).multiplyScalar(WHEEL_SIDE);
    for (const s of [-1, 1]) {
      const mx = x + side.x * s;
      const mz = z + side.y * s;
      this.dummy.position.set(mx, terrainHeight(mx, mz) + 0.02, mz);
      this.dummy.rotation.set(0, heading, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.next, this.dummy.matrix);
      // A marca nasce já com a cor do rastro: sem isso, ela fica com a cor padrão (branca) até o próximo fade().
      this.mesh.setColorAt(this.next, this.color.copy(this.ground).lerp(TRACK_COLOR, TRACK_STRENGTH));
      this.sols[this.next] = sol;
      this.next = (this.next + 1) % MAX_MARKS;
      this.count = Math.min(MAX_MARKS, this.count + 1);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Desbota pelos sóis passados (o vento apaga devagar). Chamado de vez em quando, não precisa ser a cada frame. */
  fade(sol: number, partOfSol: number): void {
    const now = sol + partOfSol;
    for (let i = 0; i < this.count; i++) {
      const age = this.windy ? Math.max(0, now - this.sols[i]) : 0;
      const k = TRACK_STRENGTH * Math.max(0, 1 - age / FADE_SOLS);
      this.color.copy(this.ground).lerp(TRACK_COLOR, k);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Quantas marcas há no chão (para testes). */
  get marks(): number {
    return this.count;
  }
}
