# Convenções

## Código

- **TypeScript estrito.** `npm run typecheck` e `npm test` precisam passar antes de abrir PR.
- **Onde cada coisa mora** (regra, cenário, personagem, interação, texto): [estrutura-do-projeto.md](estrutura-do-projeto.md).
- Identificadores (classes, funções, variáveis) **em inglês**; comentários e docs **em português**.
- Um arquivo por classe principal, com nome igual à classe em `PascalCase` (`BaseScene.ts`).
  Helpers soltos em `camelCase` (`toon.ts`).
- Imports internos via alias `@/` (`@/core/Physics`), não `../../`.
- Números mágicos de gameplay viram constantes nomeadas no topo do arquivo (`MOVE_SPEED`)
  ou em `src/core/constants.ts` se forem globais.
- Comentário explica **por quê**, não o quê.

## Git

### Branches

`main` sempre roda. Trabalhe em branches curtas:

| Prefixo | Uso | Exemplo |
| --- | --- | --- |
| `feat/` | Funcionalidade nova | `feat/coletaveis` |
| `fix/` | Correção | `fix/pulo-duplo` |
| `docs/` | Só documentação | `docs/guia-fisica` |
| `art/` | Assets e visual | `art/modelo-nave` |
| `chore/` | Config, deps, build | `chore/atualiza-three` |

### Commits

Formato curto no imperativo, com prefixo:

```
feat: adiciona moedas coletáveis
fix: impede pulo duplo na rampa
docs: explica receita de objeto estático
```

### Pull Requests

- PR pequeno > PR gigante. Um assunto por PR.
- Preencha o template, **incluindo o checklist de documentação**.
- Mudou algo visual? Coloque screenshot ou gif.
- Pelo menos 1 aprovação antes de mergear na `main`.

## Assets

| Tipo | Pasta | Formato | Nome |
| --- | --- | --- | --- |
| Modelos 3D | `public/assets/models/` | `.glb` | `kebab-case.glb` |
| Texturas | `public/assets/textures/` | `.png` / `.webp` (potência de 2) | `kebab-case.png` |
| Áudio | `public/assets/audio/` | `.ogg` + `.mp3` | `kebab-case.ogg` |

- Mantenha arquivos leves: o jogo baixa tudo pelo navegador. Modelos de até ~1 MB cada é um bom alvo.
- Arquivos-fonte pesados (`.blend`, `.psd`) **não** vão para o repositório; ficam no drive do time.
