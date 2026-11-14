# Arquitetura

## Visão geral

```
index.html  (tela de carregamento em HTML/CSS: aparece na hora, sem JS)
main.ts     (~1,5 KB gzip)
  └── import('@/core/Game')  ← carregado sob demanda (~1,8 MB: Three + Rapier)
        └── Game.create()
              ├── Physics.create()   (carrega o WASM do Rapier)
              ├── Renderer / Scene / Camera / Luzes (Three.js)
              ├── Input
              ├── buildTestLevel()   (fase)
              └── Player
```

O `Game` é o orquestrador: cria tudo e roda o loop. Sistemas não se conhecem diretamente;
recebem o que precisam pelo construtor (ex.: `Player` recebe `Physics` e `Input`).

## Pastas

| Pasta | Responsabilidade |
| --- | --- |
| [`src/core/`](../src/core) | Infra do motor: loop (`Game`), física (`Physics`), teclado (`Input`), constantes. |
| [`src/render/`](../src/render) | Visual: materiais toon, contornos, paleta. Nada de física aqui. |
| [`src/entities/`](../src/entities) | Coisas com comportamento: jogador, inimigos, itens. |
| [`src/world/`](../src/world) | Fases/cenários: chão, plataformas, objetos do mapa. |
| [`src/ui/`](../src/ui) | Interface em HTML por cima do canvas (tela de carregamento, futuramente menus/HUD). Sem framework. |
| [`public/assets/`](../public/assets) | Modelos (`.glb`), texturas, áudio. Servidos como estão. |
| [`docs/`](.) | Esta documentação. |

Import com alias: `import { Physics } from '@/core/Physics'` (`@` = `src/`).

## Inicialização e tamanho

O Rapier é pesado ([ADR 0003](decisoes/0003-manter-rapier-apesar-do-tamanho-do-bundle.md)), por isso:

1. `index.html` já contém a tela de carregamento (HTML/CSS inline), que aparece instantaneamente.
2. `main.ts` é mínimo e só importa `ui/LoadingScreen`.
3. O jogo inteiro (`core/Game` e tudo que ele importa) vem por `import()` dinâmico, num chunk separado.
4. Se o carregamento falhar, a tela mostra erro e um botão "Tentar de novo".

**Regra:** não importe nada de `core/`, `entities/`, `world/` ou `render/` em `main.ts` ou `ui/LoadingScreen.ts`.
Um import estático ali puxa o Three/Rapier para o arquivo inicial e anula a tela de carregamento.
Confira com `npm run build`: o `index-*.js` deve ter poucos KB.

## O loop do jogo

Arquivo: [`src/core/Game.ts`](../src/core/Game.ts)

```
a cada frame do navegador:
  acumulador += tempo real desde o último frame (máx. 0,25 s)
  enquanto acumulador >= FIXED_DT (1/60 s):
      fixedUpdate()      ← gameplay: input → velocidades/forças
      physics.step()     ← Rapier avança 1/60 s
      input.endStep()
      acumulador -= FIXED_DT
  physics.sync()         ← copia posição/rotação dos corpos para os meshes
  update()               ← só visual: câmera, animações, partículas
  render()
```

**Por que passo fixo?** A física fica igual em 30, 60 ou 144 FPS. Pulo, velocidade e
colisões não mudam conforme a máquina de quem joga. Ver [ADR 0001](decisoes/0001-stack.md).

### Onde colocar cada código

| Tipo de lógica | Método |
| --- | --- |
| Ler input e mover algo, aplicar força, checar chão | `fixedUpdate()` |
| Câmera, efeitos visuais, interpolação, UI | `update()` |

## Dono da posição: a física

Se um objeto tem corpo físico, **a física é dona da posição dele**. Não altere `mesh.position`
de algo ligado com `physics.link()`, porque será sobrescrito no próximo `sync()`. Mova pelo corpo
(`setLinvel`, `applyImpulse`, `setTranslation`). Detalhes em [fisica.md](fisica.md).

## Próximos passos previstos

- Carregamento de modelos `.glb` (GLTFLoader) com material toon aplicado.
- Interpolação visual entre passos de física, para suavizar em telas de 120 Hz+.
- Sistema de cenas/fases (menu → fase → fim).
