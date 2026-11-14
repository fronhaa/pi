import * as THREE from 'three';
import { FIXED_DT, MAX_FRAME_DT } from './constants';
import { Input } from './Input';
import { Physics } from './Physics';
import { Player } from '@/entities/Player';
import { buildTestLevel } from '@/world/Level';
import { PALETTE, toonMesh } from '@/render/toon';

/**
 * Orquestra renderer, cena, física e loop.
 * Loop: acumula tempo real e roda a física em passos FIXOS (FIXED_DT); renderiza uma vez por frame.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  readonly input = new Input();
  readonly player: Player;

  private readonly timer = new THREE.Timer();
  private accumulator = 0;
  private readonly cameraOffset = new THREE.Vector3(0, 7, 11);
  private readonly cameraTarget = new THREE.Vector3();

  // Clique/toque para andar (ADR 0004)
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  /** Anel no chão mostrando o destino do clique. Só visual: não tem corpo físico. */
  private readonly targetMarker: THREE.Mesh;
  private markerY = 0;

  private constructor(
    container: HTMLElement,
    readonly physics: Physics,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 30, 80);
    this.setupLights();

    buildTestLevel(this.scene, physics);
    this.player = new Player(physics, this.input);
    this.scene.add(this.player.root);

    this.targetMarker = toonMesh(new THREE.RingGeometry(0.25, 0.4, 32), PALETTE.yellow, 0);
    this.targetMarker.rotation.x = -Math.PI / 2; // deitado no chão, virado para cima
    this.targetMarker.castShadow = false;
    this.targetMarker.visible = false;
    this.scene.add(this.targetMarker);

    // touch-action: none evita que o toque role/dê zoom na página em vez de mover o jogador.
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.timer.connect(document);
  }

  static async create(container: HTMLElement): Promise<Game> {
    const physics = await Physics.create();
    return new Game(container, physics);
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, PALETTE.ground, 1.2));

    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 25;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  /** Converte o clique/toque em um ponto do mundo e define como alvo de movimento. */
  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return; // só botão principal (o toque também chega como 0)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster
      .intersectObjects(this.scene.children, true)
      .find((h) => !this.isPlayerOrMarker(h.object));
    if (!hit) return;
    this.markerY = hit.point.y + 0.02; // um pouco acima da superfície para não piscar (z-fighting)
    this.input.setMoveTarget(hit.point);
  }

  private isPlayerOrMarker(object: THREE.Object3D): boolean {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (o === this.player.root || o === this.targetMarker) return true;
    }
    return false;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.physics.sync();
    this.cameraTarget.copy(this.player.root.position);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(time: number): void {
    this.timer.update(time);
    this.accumulator += Math.min(this.timer.getDelta(), MAX_FRAME_DT);

    while (this.accumulator >= FIXED_DT) {
      this.fixedUpdate();
      this.physics.step();
      this.input.endStep();
      this.accumulator -= FIXED_DT;
    }

    this.physics.sync();
    this.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Gameplay determinístico (input → velocidades/forças). */
  private fixedUpdate(): void {
    this.player.fixedUpdate();
  }

  /** Coisas puramente visuais por frame (câmera, animações, partículas). */
  private update(): void {
    this.cameraTarget.lerp(this.player.root.position, 0.1);
    this.camera.position.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.lookAt(this.cameraTarget);

    const target = this.input.moveTarget;
    this.targetMarker.visible = target !== null;
    if (target) this.targetMarker.position.set(target.x, this.markerY, target.z);
  }
}
