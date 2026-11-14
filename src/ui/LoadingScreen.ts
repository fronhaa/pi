/**
 * Controla a tela de carregamento definida em index.html (HTML/CSS puro, aparece antes do JS).
 * A barra é indeterminada: o navegador não informa o progresso de download de um import().
 */
export class LoadingScreen {
  private readonly root = document.getElementById('loading')!;
  private readonly status = document.getElementById('loading-status')!;

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  hide(): void {
    document.body.classList.remove('loading');
    this.root.classList.add('hidden');
    // Timer em vez de 'transitionend': o evento pode não disparar (aba em background, reduced motion).
    setTimeout(() => this.root.remove(), 500);
  }

  showError(text: string): void {
    this.root.classList.add('error');
    this.root.setAttribute('role', 'alert');
    this.setStatus(text);
  }
}
