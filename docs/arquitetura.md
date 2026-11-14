# Arquitetura

## Visão geral

```
main.ts ──► Game.create()
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
| [`public/assets/`](../public/assets) | Modelos (`.glb`), texturas, áudio. Servidos como estão. |
| [`docs/`](.) | Esta documentação. |

Import com alias: `import { Physics } from '@/core/Physics'` (`@` = `src/`).

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
