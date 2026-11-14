# Servidor do modo cooperativo (Go)

**Para jogar em grupo agora:** abra o link do servidor (seção [Onde está rodando](#onde-está-rodando)). Uma pessoa toca em **Jogar em grupo → Criar sala** e passa o código de 4 letras; as outras tocam em **Jogar em grupo**, digitam o código e escolhem um papel; quem criou a sala toca em **Começar a missão**.

O servidor em [`server/`](../server) manda nas partidas cooperativas online: guarda as salas, aplica as **mesmas regras do jogo solo** e manda para cada jogador só o que o papel dele pode ver.
Decisão e alternativas: [ADR 0005](decisoes/0005-servidor-coop-em-go-com-as-regras.md). Regras do coop: [game-design.md](game-design.md#modo-cooperativo).

```mermaid
flowchart LR
    T["Aparelho da Terra<br/>Controle da Missão"] <-- "wss://" --> S
    M1["Aparelho de Marte<br/>comandante"] <-- "wss://" --> S
    M2["Aparelho de Marte<br/>engenheiro, médico, cientista"] <-- "wss://" --> S
    subgraph VPS["VPS · container"]
        P["Proxy com HTTPS<br/>(Caddy ou Nginx)"] --> S["jezero-server (Go)<br/>salas em memória<br/>regras = src/sim"]
    end
```

## Pastas

| Pasta | O quê |
| --- | --- |
| `server/internal/sim/` | Porta das regras de `src/sim/` (mesmos números, mesmo sorteio). **Precisa ficar idêntica ao TS.** |
| `server/internal/coop/` | Modo coop: `game.go` (regras puras: papéis, vez da Terra, mensagens com atraso), `room.go` (sala, permissões, o que cada um vê), `hub.go` (salas abertas), `ws.go` (WebSocket). |
| `server/cmd/jezero-server/` | O programa: lê variáveis de ambiente, sobe o HTTP. |
| `server/Dockerfile`, `server/compose.yaml` | Container para o VPS. A imagem também compila e **serve o jogo**: um endereço só para jogo e coop. |
| `src/net/` | Cliente: `CoopClient.ts` (conexão, reconexão automática com token) e `protocol.ts` (tipos iguais aos do Go). |
| `src/ui/coop.ts` | Telas: escolher o modo, sala de espera (código, papéis, começar) e a vez da Terra. |

## Cliente (o jogo no navegador)

- O botão **Jogar em grupo** só aparece se o jogo souber o endereço do servidor, nesta ordem:
  1. `?coop=wss://…` na URL (útil com link temporário);
  2. `VITE_COOP_URL` no build: um `wss://…` fixo, ou `same-origin` (o jogo foi servido pelo próprio servidor coop; é o que a imagem Docker usa).
- Sem endereço, o jogo funciona só no modo solo, como antes.
- No modo em grupo, o jogo **não roda regras**: mostra o que o servidor manda e repassa decisões. A noite, o relatório e a tela final são os mesmos do solo.
- Cada jogador só mexe na parte da energia do seu papel; os outros botões ficam travados. "Terminar o sol" só para o comandante.
- Se a internet cair ou a página recarregar, o jogo volta sozinho para a mesma sala e o mesmo papel (token guardado na aba, `sessionStorage`).

## Regras do coop implementadas no servidor

| Regra | Como ficou |
| --- | --- |
| Papéis | `earth` (Terra), `commander`, `engineer` (blindagem), `medic` (vida), `scientist` (ciência). |
| Quem joga | O anfitrião (quem criou a sala) começa a partida. Precisa ter **comandante**. Papéis de Marte sem dono vão para o comandante. |
| Sem jogador na Terra | A Terra é automática: Marte recebe os avisos como no jogo solo. |
| Com jogador na Terra | Cada sol começa na **vez da Terra**: ela vê a previsão (hoje + **2 sóis**) e manda 1 mensagem da lista (`storm`, `dust`, `science`, `life`, `none`). A mensagem chega a Marte **no sol seguinte**, com atraso sorteado de 3 a 22 min. |
| Avisos em Marte com jogador na Terra | O aviso **antecipado** só vem da Terra. No dia da tempestade ou da poeira, o **alarme da base** dispara sozinho (`stormToday`, `dustNow`). *Decisão nossa: mantém a Terra essencial sem deixar a criança de Marte sem nenhum aviso. Ajustável em `MarsMessages()`.* |
| Energia | Cada papel só muda a sua parte. O total nunca passa dos blocos do sol. Se uma carta reduz os blocos, o plano é cortado (ciência, depois blindagem, depois vida). |
| Cartas e fim do sol | Só o comandante. |
| O que cada um vê | A Terra vê previsão, recursos e o relatório, **não** o plano. Marte vê o plano e as mensagens, **não** a previsão nem a agenda das tempestades (revelada no fim). |
| Dados pessoais | Nenhum: sem nome, sem conta, sem banco. Na tela, "Jogador 1..5". Tudo em memória; a sala some 15 min depois que todos saem. |

## Protocolo (WebSocket, JSON)

Endereço: `wss://<host>/ws`. Cada mensagem é um objeto com `t` (tipo).

**Cliente → servidor**

| `t` | Campos | Quem |
| --- | --- | --- |
| `create` | — | Qualquer um (vira anfitrião) |
| `join` | `code` (4 letras, sem vogais) | Qualquer um |
| `rejoin` | `code`, `token` | Quem caiu (o `token` veio no `welcome`) |
| `claim` / `release` | `role` | Na sala de espera |
| `start` | — | Anfitrião (também recomeça após o fim) |
| `earth` | `option` | Terra, na vez da Terra |
| `card` | `option` | Comandante |
| `blocks` | `key` (`life`, `shield`, `science`), `value` | Dono do papel da parte |
| `end_sol` | — | Comandante |

**Servidor → cliente**

| `t` | Conteúdo |
| --- | --- |
| `welcome` | `code`, `playerId`, `token` (guarde para reconectar) |
| `state` | A cada mudança: `phase` (`lobby`, `earth`, `mars`, `ended`), `you`, `players`, `autoEarth`, e `mars` e/ou `earth` conforme os papéis. O relatório do último sol vem em `mars.lastReport` / `earth.lastReport`. |
| `error` | `code`: `room_not_found`, `room_full`, `role_taken`, `need_commander`, `not_your_role`, `wrong_phase`, `card_pending`, `invalid`, `bad_token`, `server_full`, `too_fast` |

Limites: 5 jogadores por sala, 1.000 salas, mensagens de até 4 KB, 20 ações por segundo por conexão.

## Rodar no computador

Requisitos: Go 1.27+.

```bash
cd server
go test -race ./...                                  # regras, paridade com o TS, coop, WebSocket
FLARES_PATH=../public/data/donki-flares.json go run ./cmd/jezero-server
curl localhost:8080/healthz                          # {"ok":true,"rooms":0,"realFlares":305}
```

| Variável | Padrão | O quê |
| --- | --- | --- |
| `PORT` | `8080` | Porta HTTP |
| `FLARES_PATH` | `data/donki-flares.json` | Erupções reais do DONKI (sem o arquivo, usa simuladas) |
| `ALLOWED_ORIGINS` | `localhost:*,127.0.0.1:*` | Hosts de onde o jogo pode conectar, separados por vírgula. Em produção, o host onde o jogo está publicado (ex.: `fronhaa.github.io`) |

## Link temporário (Cloudflare Quick Tunnel)

Para testar e demonstrar sem domínio próprio, o `compose.yaml` tem um túnel opcional do Cloudflare, sem conta:

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | grep trycloudflare.com    # o link do jogo
```

- O link (`https://<palavras>.trycloudflare.com`) abre o **jogo** e já conecta no coop.
- O link **muda** sempre que o container do túnel reinicia. Depois de reiniciar, pegue o link novo.
- Não tem garantia de disponibilidade: bom para hackathon e testes; para uso contínuo, use domínio próprio (abaixo).

## Onde está rodando

| O quê | Valor (14/11/2026) |
| --- | --- |
| Máquina | Workspace Coder `sisgeon/devs` (acesso: `coder ssh devs`) |
| Docker | Container separado `dind-devs` (variável `DOCKER_HOST`); a porta 8080 já é de outro serviço |
| Pasta | `~/jezero-coop` (cópia de `server/`, `src/`, `public/` e arquivos do Vite) |
| Containers | `jezero-coop` (porta `18095` no `dind-devs`) e `jezero-coop-tunnel` |
| Link | Ver no túnel: `docker logs jezero-coop-tunnel 2>&1 \| grep trycloudflare.com` |

Atualizar com o código da `main` (do seu computador, na raiz do repositório):

```bash
git archive main | coder ssh devs -- 'rm -rf ~/jezero-coop.new && mkdir ~/jezero-coop.new && tar -x -C ~/jezero-coop.new && rm -rf ~/jezero-coop && mv ~/jezero-coop.new ~/jezero-coop'
coder ssh devs -- 'cd ~/jezero-coop/server && COOP_BIND=0.0.0.0 COOP_PORT=18095 ALLOWED_ORIGINS="*.trycloudflare.com,localhost:*" docker compose up -d --build jezero-coop'
```

Assim só o `jezero-coop` é recriado; o túnel continua de pé e **o link não muda**.

## Subir no VPS (container)

```bash
git clone https://github.com/fronhaa/pi.git && cd pi/server
# Edite ALLOWED_ORIGINS em compose.yaml com o endereço onde o jogo está publicado.
docker compose up -d --build
docker compose ps            # deve aparecer "healthy"
```

O container escuta só em `127.0.0.1:8080`. Para o jogo conectar de uma página **https** (GitHub Pages), o navegador exige **`wss://`**: coloque um proxy com HTTPS na frente. Com Caddy, que pega o certificado sozinho:

```caddyfile
coop.seu-dominio.com.br {
    reverse_proxy 127.0.0.1:8080
}
```

Com Nginx, lembre dos cabeçalhos de WebSocket (`Upgrade` e `Connection "upgrade"`) e de um `proxy_read_timeout` de alguns minutos.

**Atualizar:** `git pull && docker compose up -d --build`. As salas abertas se perdem ao reiniciar (estão em memória), então atualize fora do horário de jogo.

## Regra de ouro: as regras são as mesmas do TypeScript

As regras existem em dois lugares (`src/sim/` e `server/internal/sim/`). O **teste de paridade** garante que são idênticas:

1. Mudou algo em `src/sim/`? Faça a mesma mudança em `server/internal/sim/`.
2. Rode `npm run sim:golden` na raiz: ele joga 240 partidas com o TS e grava um hash do estado a cada passo.
3. Rode `go test ./...` em `server/`: o Go repete as partidas e precisa dar o mesmo hash em todos os passos.
4. O CI faz os dois e falha se divergir.

Cuidados que o teste já pegou:

- **`Math.round` ≠ `math.Round`:** o JS arredonda .5 para cima (−2,5 → −2); use `jsRound()`.
- **Fusão de float (FMA):** o Go pode calcular a*b+c sem arredondar no meio; o JS sempre arredonda. Toda multiplicação de float em `server/internal/sim` passa por `mul()`.
- **Ordem dos sorteios:** mudar a ordem das chamadas ao gerador muda todas as partidas.
