# Mars Exploration: Missão Jezero

Jogo de navegador para o desafio [Build a Junior Astronaut Mission Trainer](https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/)
(NASA Space Apps 2026). Crianças de 7 a 12 anos comandam uma base na cratera Jezero, em Marte, por 15 sóis,
dividindo uma energia limitada entre sobreviver e fazer ciência. Cada partida é uma **missão histórica real** de 15 sóis: as tempestades solares vêm do DONKI e o atraso das mensagens, do JPL Horizons (NASA).

Stack: **Vite + TypeScript + Three.js**, sem framework de interface; física (Rapier) só sob demanda.

## Rodar em 1 minuto

Requisitos: Node.js 20+ (testado com 22).

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

**Em grupo (online):** cada um no seu aparelho, com papéis (Terra, comandante, engenheiro, médico, cientista). Precisa do servidor coop: veja [docs/servidor-coop.md](docs/servidor-coop.md).

Como jogar: a cada sol, distribua os blocos de energia com **+** e **−** (mouse, toque ou teclado com Tab e Enter)
e clique em **Terminar o sol**. Leia as mensagens da Terra: elas avisam das tempestades solares.

| Comando              | O que faz                                       |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento com hot reload      |
| `npm run typecheck`  | Checa os tipos (rode antes de abrir PR)         |
| `npm run build`      | Gera a versão de produção em `dist/`            |
| `npm run preview`    | Serve o `dist/` localmente                      |
| `npm run docs:adr -- "título"` | Cria um novo registro de decisão (ADR) |
| `npm run sim:bundle` | Empacota `src/sim` para o servidor coop (já roda no `npm run build`; ver [docs/servidor-coop.md](docs/servidor-coop.md)) |
| `npm run balance` | Teste de equilíbrio: 2.000 partidas por estratégia com a simulação real |
| `npm run fetch-data` | Atualiza as tempestades solares reais (precisa de `NASA_API_KEY` no `.env`, ver [docs/dados.md](docs/dados.md)) |
| `npm run data:missions` | Baixa da NASA os dados das missões históricas para `public/data/missions.json` (precisa do `.env`, ver `.env.example`) |

## Documentação

Tudo fica em [`docs/`](docs/README.md). Comece por lá:

- [Desafio](docs/desafio.md) e [Game design (GDD)](docs/game-design.md): o que estamos construindo
- [Dados da NASA](docs/dados.md): de onde vêm os dados reais e como atualizar
- [Arquitetura](docs/arquitetura.md): como o código está organizado
- [Física](docs/fisica.md): como criar objetos físicos e as regras de ouro
- [Servidor do coop](docs/servidor-coop.md): servidor Go do modo cooperativo online, protocolo e deploy no VPS
- [Estilo visual](docs/estilo-visual.md): paleta, toon shading e contornos
- [Convenções](docs/convencoes.md): código, git, PRs e assets
- [Decisões (ADRs)](docs/decisoes/README.md): o porquê das escolhas técnicas

> **Regra do time:** mudou o comportamento ou a arquitetura? Atualize a doc **no mesmo PR**.
