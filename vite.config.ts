import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true },
  // rapier3d-compat embute o WASM em base64 (~4 MB). Esperado — ver docs/decisoes/0001-stack.md
  build: { chunkSizeWarningLimit: 6000 },
});
