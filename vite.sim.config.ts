import { defineConfig } from 'vite';

/**
 * Empacota a simulação (src/sim) para o servidor coop em Go: `npm run sim:bundle`.
 * Saída: server/internal/sim/simjs/sim.js (um IIFE que cria a global `JezeroSim`).
 * Roda também no `npm run build`, então o pacote acompanha toda mudança de regra.
 * Ver docs/servidor-coop.md e ADR 0006.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'server/internal/sim/simjs',
    emptyOutDir: false,
    // goja (o motor JS do Go) entende ES2015+; transpilar para ES2015 tira ?. e ?? por segurança.
    target: 'es2015',
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/sim/bridge.ts',
      name: 'JezeroSim',
      formats: ['iife'],
      fileName: () => 'sim.js',
    },
  },
});
