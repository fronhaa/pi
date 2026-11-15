/**
 * Versão nova do jogo (docs/pwa.md). A página vem da rede primeiro (vite.config.ts, `NetworkFirst`), então com internet
 * o jogo já abre na versão mais nova, sem Command+R e sem recarregar sozinho. Aqui só pedimos ao service worker para
 * procurar versão nova quando o jogo volta a aparecer na tela (app instalado que ficou em segundo plano): assim a
 * cópia guardada para jogar sem internet também fica em dia.
 *
 * Não importa nada do jogo (main.ts carrega o jogo só com import()).
 */
export function watchAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.update())
      .catch(() => undefined);
  });
}
