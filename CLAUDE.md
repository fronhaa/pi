# CLAUDE.md

Jogo 3D cartoon no navegador para o desafio NASA Space Apps 2026 "Junior Astronaut Mission Trainer": crianças de 7–12 anos gerenciam uma base em Marte. Vite + TypeScript + Three.js (Rapier só sob demanda). Docs do time em `docs/`.

## Antes de mexer

- **Público: crianças de 7 a 12 anos.** Simplicidade, facilidade e caráter educativo são critério crítico: antes de mexer em texto, interface ou mecânica, leia `docs/publico-e-impacto.md` e passe no checklist dele.
- **Todo texto do jogo (PT e EN) segue `docs/linguagem-e-ui-criancas.md`:** frases de 8 a 12 palavras, no máximo 2 por caixa; alerta e botão começam com ícone + 2 ou 3 palavras em **negrito**; verbo no imperativo e voz ativa; termo da NASA com explicação simples entre parênteses ("**EVA** (caminhada lá fora)"); número simples na tela e unidade real só no modo cientista.
- Leia `docs/desafio.md` e `docs/game-design.md` (o que estamos construindo e por quê), depois `docs/arquitetura.md`. Para física, `docs/fisica.md`; para visual, `docs/art-bible.md` (direção de arte) e `docs/estilo-visual.md` (como está no código).
- Siga `docs/convencoes.md` (identificadores em inglês, comentários/docs em português, alias `@/`).
- **Onde mexer:** `docs/estrutura-do-projeto.md` tem o mapa por área e as receitas (cenário novo em `src/scenarios/`, personagem em `src/sim/crew.ts`, interação em `src/sim/actions.ts`, posições em `src/scene/base/layout.ts`, textos em `src/i18n/strings/<assunto>.ts`). Siga a receita inteira.

- Fato científico em texto do jogo, do professor ou da apresentação: use só o que está em `docs/ciencia-marte.md` (com fonte e trecho original). Fato novo entra lá primeiro, com link oficial aberto e lido.

## Regras do projeto

- `src/sim/` é simulação pura: sem DOM, sem Three.js; imports relativos com `.ts`. Todo número de jogo fica em `src/sim/config.ts`; mudou um, rode `npm run balance`.
- A cena (`src/scene/`) só desenha o estado; a interface (`src/ui/`) só mostra e repassa decisões. Regras nunca ficam nelas.
- Decisão que muda a missão é uma `MissionAction` (`src/sim/actions.ts`) mandada por `port.dispatch(...)` (`src/core/session.ts`): o mesmo caminho serve ao solo e ao grupo. Nada de chamar a `Mission` direto da interface.
- Textos sempre via `t()` de `src/i18n`, com a chave em PT e EN no arquivo do assunto em `src/i18n/strings/`.
- Honestidade de dados: nunca chamar de "ao vivo" o que é baixado; previsão é previsão; dose do jogo é escala INTERPRETADA.
- Física (quando voltar): é dona da posição; mova corpos Rapier, nunca `mesh.position` de objetos linkados. `Physics.ts` só via `import()`.
- Objetos visuais do jogo usam os helpers de `src/render/toon.ts` e cores de `PALETTE`.
- `main.ts` e `src/ui/LoadingScreen.ts` não podem importar estaticamente `core/`, `scene/`, `sim/` ou `render/` (o jogo é carregado via `import()` dinâmico).

## Documentação (obrigatório)

- Mudou uma regra do jogo, então atualize `docs/game-design.md`. Todo número real usado no jogo precisa de fonte registrada.
- Mudou `src/sim/`? Rode `npm run build` (ou `npm run sim:bundle`) e commite `server/internal/sim/simjs/sim.js` junto: o servidor coop (Go) roda essas mesmas regras. Só mexa em Go se surgir campo novo em `src/sim/types.ts` que o servidor use (ver `docs/servidor-coop.md`, ADR 0006).

- Mudou como um sistema funciona, então atualize o guia correspondente em `docs/` na mesma mudança.
- Decisão técnica importante (lib, técnica, padrão): crie um ADR com `npm run docs:adr -- "título"` e preencha.
- Nunca reescreva um ADR aceito; crie um novo que o substitua.

## Modo em grupo (servidor coop)

Guia completo: `docs/servidor-coop.md`. Decisões: ADR 0005 e 0006.

- **Regras num lugar só:** o servidor Go (`server/`) roda o próprio `src/sim`, empacotado em `server/internal/sim/simjs/sim.js` (goja). Nunca escreva regra de jogo em Go.
- **Mudou o protocolo** (ação nova, campo novo para os jogadores)? Mude os dois lados juntos: `src/net/protocol.ts` (cliente) e `server/internal/coop/` (servidor), mais a tabela do protocolo em `docs/servidor-coop.md`.
- **Mudou algo que roda no dia ou no plano** (`src/core/Game.ts`, `src/ui/Hud.ts`)? Confira o modo em grupo: ali o estado vem do servidor (`this.coop.view`, em `src/core/coop/CoopMode.ts`), não de `this.mission`. Use `this.port` / `this.current`, que já escolhem.
- **Crianças / LGPD:** o servidor não guarda nome, conta nem nenhum dado pessoal. Não acrescente.
- **Verificar o servidor:** `cd server && go vet ./... && go test ./...` (Go 1.27+).

### Atualizar o servidor no VPS (Coder `sisgeon/devs`)

Só quando pedirem. Roda no Docker do workspace (`DOCKER_HOST=tcp://dind-devs:2375`), na pasta `~/jezero-coop`, porta `18095`.
Da raiz do repositório, já na `main` atualizada:

```bash
git archive main | coder ssh devs -- 'rm -rf ~/jezero-coop.new && mkdir ~/jezero-coop.new && tar -x -C ~/jezero-coop.new && rm -rf ~/jezero-coop && mv ~/jezero-coop.new ~/jezero-coop'
coder ssh devs -- 'cd ~/jezero-coop/server && COOP_BIND=0.0.0.0 COOP_PORT=18095 ALLOWED_ORIGINS="fronhaa.github.io,*.trycloudflare.com,localhost:*" docker compose up -d --build --no-deps jezero-coop'
coder ssh devs -- 'docker logs jezero-coop-tunnel 2>&1 | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1'   # link do jogo
```

- O `ALLOWED_ORIGINS` precisa ter `fronhaa.github.io`: sem ele, o jogo do GitHub Pages leva 403 ao conectar.
- Use sempre `--no-deps jezero-coop`: recria só o servidor e **o link do Cloudflare continua o mesmo**. Reiniciar o `jezero-coop-tunnel` troca o link, e o time precisa ser avisado do novo.
- Confira com `curl <link>/healthz` (deve trazer `realFlares` e `historicalMissions` maiores que zero).
- **Link novo do túnel?** Atualize a variável `COOP_URL` do repositório (`gh variable set COOP_URL --body wss://<link>/ws`) e rode de novo o workflow do Pages (`gh workflow run pages.yml`). Até lá, o jogo funciona com `?coop=wss://<link>` na URL.
- **Não mexa** no `nginx-staging`, no `webjasper-cloudflare` nem em outros containers daquele Docker: são o staging compartilhado da Web Jasper. A porta 8080 já é do `nginx-staging`.

## Git e PRs

- Trabalhe em branch (`feat/`, `fix/`, `docs/`…) e abra PR; nunca commite direto na `main`.
- Antes de abrir PR, traga a `main` atualizada (outras pessoas mergeiam rápido) e resolva conflitos mantendo o modo em grupo funcionando.
- Merge só com 1 aprovação ou quando a pessoa pedir explicitamente.

## Verificação

- `npm run typecheck`, `npm test` e `npm run build` devem passar; `npm run balance` se mexer em `src/sim/`.
- Mexeu em `server/` ou no protocolo: `go test ./...` em `server/`.
