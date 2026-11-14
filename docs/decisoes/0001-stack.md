# 0001. Stack: Vite + TypeScript + Three.js + Rapier

- **Status:** Aceito
- **Data:** 2026-11-14

## Contexto

Jogo 3D cartoon rodando no navegador, feito por um time, com prazo curto. Precisamos de
renderização 3D, física com colisões confiáveis e um setup que qualquer pessoa rode com `npm install`.

## Opções consideradas

**Render:**
1. **Three.js**: biblioteca mais usada, enorme quantidade de exemplos, `MeshToonMaterial` pronto. Não é engine completa (montamos loop, cenas etc.).
2. **Babylon.js**: engine completa, com física Havok e inspector. Mais pesada e opinativa; menos exemplos para estilo toon.
3. **React Three Fiber**: produtivo para quem já sabe React; adiciona uma camada a mais para quem não sabe.

**Física:**
1. **Rapier** (`rapier3d-compat`): Rust/WASM, rápido, determinístico, mantido ativamente, com character controller pronto.
2. **cannon-es**: JS puro, simples, porém mais lento e com manutenção baixa.
3. **Ammo.js** (Bullet): poderoso, mas API verbosa e difícil de depurar.

## Decisão

**Vite + TypeScript + Three.js + Rapier**, sem framework de UI. Física em **passo fixo de 1/60 s**
com acumulador, e a física é a dona das posições.

## Consequências

- Setup mínimo e rápido; TypeScript pega erros de API cedo.
- Precisamos escrever nós mesmos o loop, o sync física→render e o carregamento de cenas.
- O `rapier3d-compat` embute o WASM em base64: **bundle de ~4,8 MB (~1,8 MB gzip)**. Aceitável
  para um jogo. Se virar problema, trocar para `@dimforge/rapier3d` (WASM separado) exige plugin de WASM no Vite.
- TypeScript 7: não aceita mais `baseUrl` no tsconfig, por isso usamos `paths` com `./src/*`.
