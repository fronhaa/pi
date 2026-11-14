/** Estado do teclado. Usa `KeyboardEvent.code` (independente do layout: WASD funciona em ABNT2/AZERTY). */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();

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

  /** Eixo de movimento no plano XZ, valores em [-1, 1]. */
  moveAxis(): { x: number; z: number } {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len };
  }
}
