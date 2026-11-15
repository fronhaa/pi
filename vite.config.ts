import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer host estático, inclusive em subpasta (GitHub Pages).
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true },
  // rapier3d-compat embute o WASM em base64 (~4 MB). Esperado — ver docs/decisoes/0003-manter-rapier-apesar-do-tamanho-do-bundle.md
  build: { chunkSizeWarningLimit: 6000 },
  plugins: [
    // App instalável pelo Chrome e modo solo sem internet (ADR 0014, docs/pwa.md).
    VitePWA({
      registerType: 'autoUpdate', // versão nova é baixada e entra na próxima vez que o jogo abrir
      injectRegister: 'script', // registerSW.js separado: main.ts continua sem importar nada do jogo
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Artemis Quest',
        short_name: 'Artemis Quest',
        description: 'Run a base on Mars or the Moon. Every block of power you save today keeps your crew alive tonight.',
        lang: 'en',
        // Relativos ao manifesto: o jogo mora em /pi/ no GitHub Pages e em / no servidor coop.
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#e8b98c', // mesmo fundo da tela de carregamento
        theme_color: '#473c3a', // PALETTE.shadow (contorno do jogo)
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tudo o que o modo solo precisa: código, modelos 3D, fotos, texturas e os dados baixados da NASA.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,glb,json,wasm,webmanifest}'],
        // A página (index.html) NÃO vai no cache fixo: ela vem da rede primeiro (abaixo). Assim, com internet, o jogo
        // abre sempre a versão mais nova, sem Command+R e sem recarregar sozinho; sem internet, usa a cópia guardada.
        globIgnores: ['index.html'],
        // Sem isto o plugin serviria a página guardada em toda navegação (o padrão é 'index.html').
        navigateFallback: null,
        // O chunk da física (Rapier com WASM embutido) tem ~4,3 MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // A versão nova do service worker assume na hora (o resto do jogo novo é baixado em segundo plano).
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // A página: rede primeiro (versão nova na hora); sem internet ou rede lenta (4 s), a cópia guardada.
            // ?lang=pt e ?coop=wss://… são a mesma página.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              matchOptions: { ignoreSearch: true },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Fonte Fredoka: guardada na primeira vez, para o jogo offline continuar com a mesma letra.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
