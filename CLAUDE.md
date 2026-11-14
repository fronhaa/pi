# CLAUDE.md

Jogo 3D cartoon no navegador para o desafio NASA Space Apps 2026 "Junior Astronaut Mission Trainer": crianças de 7–12 anos gerenciam uma base em Marte. Vite + TypeScript + Three.js + Rapier. Docs do time em `docs/`.

## Antes de mexer

- Leia `docs/desafio.md` e `docs/game-design.md` (o que estamos construindo e por quê), depois `docs/arquitetura.md`. Para física, `docs/fisica.md`; para visual, `docs/estilo-visual.md`.
- Siga `docs/convencoes.md` (identificadores em inglês, comentários/docs em português, alias `@/`).

## Regras do projeto

- A física é dona da posição: mova corpos Rapier, nunca `mesh.position` de objetos linkados.
- Gameplay físico em `fixedUpdate()`; só visual em `update()`.
- Objetos visuais do jogo usam os helpers de `src/render/toon.ts` e cores de `PALETTE`.
- `main.ts` e `src/ui/LoadingScreen.ts` não podem importar estaticamente `core/`, `entities/`, `world/` ou `render/` (o jogo é carregado via `import()` dinâmico).

## Documentação (obrigatório)

- Mudou uma regra do jogo, então atualize `docs/game-design.md`. Todo número real usado no jogo precisa de fonte registrada.

- Mudou como um sistema funciona, então atualize o guia correspondente em `docs/` na mesma mudança.
- Decisão técnica importante (lib, técnica, padrão): crie um ADR com `npm run docs:adr -- "título"` e preencha.
- Nunca reescreva um ADR aceito; crie um novo que o substitua.

## Verificação

- `npm run typecheck` e `npm run build` devem passar.
