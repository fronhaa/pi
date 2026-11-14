/** Ponto no chão (plano XZ, metros) escolhido por clique ou toque. */
export interface MoveTarget {
  x: number;
  z: number;
}

/**
 * Estado de entrada: teclado + clique/toque, sempre os dois ativos (ADR 0004).
 * Vale o último usado: apertar uma tecla de movimento cancela o alvo do clique,
 * e um novo clique define um alvo novo.
 * Teclado usa `KeyboardEvent.code` (independente do layout: WASD funciona em ABNT2/AZERTY).
 * O clique em si é convertido em ponto do mundo pelo `Game` (precisa da câmera e da cena).
 */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private target: MoveTarget | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** true apenas no primeiro passo após a tecla ser pressionada. */
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedThisFrame.has(c));
  }

  /** Chamar ao fim de cada passo fixo. */
  endStep(): void {
    this.pressedThisFrame.clear();
  }

  /** Eixo de movimento do TECLADO no plano XZ, valores em [-1, 1]. */
  moveAxis(): { x: number; z: number } {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }

  /** Alvo atual do clique/toque, ou null se não houver. */
  get moveTarget(): MoveTarget | null {
    return this.target;
  }

  /** Chamado pelo `Game` quando o jogador clica/toca no chão. */
  setMoveTarget(point: MoveTarget): void {
    this.target = { x: point.x, z: point.z };
  }

  /** Chegou ao alvo, ou o teclado assumiu o controle. */
  clearMoveTarget(): void {
    this.target = null;
  }
}
