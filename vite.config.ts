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
        // O chunk da física (Rapier com WASM embutido) tem ~4,3 MB.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // ?lang=pt e ?coop=wss://… abrem o mesmo index.html guardado.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
