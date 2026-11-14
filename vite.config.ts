import { defineConfig } from 'vite';
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
});
