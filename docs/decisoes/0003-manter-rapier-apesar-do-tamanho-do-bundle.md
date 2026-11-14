# 0003. Manter Rapier apesar do tamanho do bundle

- **Status:** Aceito; substituído em parte por [0004](0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md) (Rapier fora do pacote principal)
- **Data:** 2026-11-14

## Contexto

Requisito do projeto: o jogo deve ser **o mais leve possível**. Medimos o build de produção
(Rapier 0.21, Three.js 0.187):

| Parte | Download (gzip) |
| --- | --- |
| Total | ~1,8 MB (~1,3 MB com brotli) |
| Rapier (`rapier3d-compat`, WASM embutido em base64) | ~1,6 MB |
| Three.js + código do jogo | ~0,2 MB |

O framework de UI não é o problema: não usamos React/Vue (ver [0001](0001-stack.md)).

## Opções consideradas

1. **Trocar para cannon-es**: ~36 KB gzip, total ~0,23 MB (≈8× menor). Física JS mais simples,
   mais lenta com muitos objetos, sem atualização desde 2022.
2. **Rapier sem `-compat`** (WASM em arquivo separado): ~1,17 MB gzip só o WASM, total ~1,35 MB.
   Exige plugin de WASM no Vite. Ganho pequeno.
3. **Física própria mínima**: ~0 KB extra, mas muito trabalho e bugs; só serve para física trivial.
4. **Manter Rapier** e atacar a *percepção* de peso e o resto do bundle.

## Decisão

**Manter o Rapier (`rapier3d-compat`).** Priorizamos física robusta, mantida e com recursos
(CCD, character controller, juntas) sobre ~1,5 MB de download.

Para compensar:
- **Tela de carregamento**: o jogo (Three + Rapier) é carregado sob demanda (`import()` dinâmico)
  depois que a página já apareceu. Ver `src/main.ts` e `src/ui/LoadingScreen.ts`.
- **Brotli** na hospedagem (≈ −0,5 MB sem mudar código).
- Assets leves (ver [convenções](../convencoes.md#assets)).

## Consequências

- Primeiro acesso baixa ~1,3–1,8 MB; acessos seguintes vêm do cache.
- Não reabrir a troca de motor de física sem novos números (ex.: público com internet muito lenta
  ou alvo de tamanho definido). Se reabrir, criar novo ADR que substitua este.
- Se o tamanho virar problema, a opção 2 é o próximo passo de menor risco.
