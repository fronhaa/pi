import { LoadingScreen } from '@/ui/LoadingScreen';

/**
 * Ponto de entrada. Este arquivo é propositalmente pequeno: o jogo (Three.js + Rapier, ~1,7 MB)
 * é carregado sob demanda com import(), então a tela de carregamento aparece na hora.
 * Ver docs/decisoes/0003-manter-rapier-apesar-do-tamanho-do-bundle.md
 */
async function boot(): Promise<void> {
  const loading = new LoadingScreen();
  try {
    loading.setStatus('Downloading the game…');
    const { Game } = await import('@/core/Game');

    loading.setStatus('Starting the physics…');
    const game = await Game.create(document.body);

    game.start();
    loading.hide();
  } catch (err) {
    console.error(err);
    loading.showError('The game could not load. Check your connection.');
  }
}

boot();
