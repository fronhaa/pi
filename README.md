# Pi — Space Apps

Jogo 3D com visual cartoon que roda no navegador.
Stack: **Vite + TypeScript + Three.js** (render) **+ Rapier** (física).

## Rodar em 1 minuto

Requisitos: Node.js 20+ (testado com 22).

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Controles: **WASD / setas** para mover, **Espaço** para pular.

| Comando              | O que faz                                       |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento com hot reload      |
| `npm run typecheck`  | Checa os tipos (rode antes de abrir PR)         |
| `npm run build`      | Gera a versão de produção em `dist/`            |
| `npm run preview`    | Serve o `dist/` localmente                      |
| `npm run docs:adr -- "título"` | Cria um novo registro de decisão (ADR) |
| `npm run fetch-data` | Atualiza as tempestades solares reais (precisa de `NASA_API_KEY` no `.env`, ver [docs/dados.md](docs/dados.md)) |

## Documentação

Tudo fica em [`docs/`](docs/README.md). Comece por lá:

- [Arquitetura](docs/arquitetura.md): como o código está organizado e o loop do jogo
- [Física](docs/fisica.md): como criar objetos físicos e as regras de ouro
- [Estilo visual](docs/estilo-visual.md): paleta, toon shading e contornos
- [Convenções](docs/convencoes.md): código, git, PRs e assets
- [Decisões (ADRs)](docs/decisoes/README.md): o porquê das escolhas técnicas

> **Regra do time:** mudou o comportamento ou a arquitetura? Atualize a doc **no mesmo PR**.
