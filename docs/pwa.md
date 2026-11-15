# App instalável (PWA) e modo solo offline

O Artemis Quest pode ser instalado pelo Chrome como um app e, depois da primeira visita, o **modo solo funciona sem
internet**. Decisão: [ADR 0014](decisoes/0014-app-instalavel-e-modo-solo-offline-pwa.md).

## Como instalar (para professores e pais)

- **Computador (Chrome ou Edge):** abra <https://fronhaa.github.io/pi/> e clique no ícone de instalar, no fim da barra
  de endereço (ou menu ⋮ → "Transmitir, salvar e compartilhar" → "Instalar página como app").
- **Android (Chrome):** menu ⋮ → "Adicionar à tela inicial" → "Instalar".
- **iPhone/iPad (Safari):** botão Compartilhar → "Adicionar à Tela de Início".
- Abra o jogo uma vez com internet e espere carregar: é aí que ele fica guardado no aparelho.
- **Modo em grupo precisa de internet.** Sem internet, só o modo solo.

## Como funciona

| Peça | Onde | O que faz |
| --- | --- | --- |
| Plugin | `vite.config.ts` (`VitePWA`) | No `npm run build`, gera o manifesto, o service worker e a lista de arquivos |
| Manifesto | `dist/manifest.webmanifest` (gerado) | Nome, ícones, cores e `start_url`/`scope` relativos (`./`): funciona em `/pi/` (Pages) e em `/` (servidor coop) |
| Service worker | `dist/sw.js` (gerado, Workbox) | Guarda ~37 arquivos (~14 MB): código, física, modelos `.glb`, fotos e `public/data/` |
| Registro | `dist/registerSW.js` (injetado no `index.html`) | Script separado; `main.ts` não importa nada |
| Ícones | `public/icons/` | 192, 512, 512 *maskable* (Android recorta em círculo), Apple 180 e favicon 64 |
| Cores | manifesto e `<meta name="theme-color">` | Fundo `#e8b98c` (o da tela de carregamento) e barra `#473c3a` (`PALETTE.shadow`) |

- **Atualização (sem Command+R):** a página (`index.html`) não vai no cache fixo; ela vem **da rede primeiro**
  (`NetworkFirst`, espera até 4 s). Com internet, o jogo abre sempre na versão mais nova, direto, sem recarregar
  sozinho. Sem internet (ou rede muito lenta), abre a cópia guardada. O resto do jogo (código com nome versionado,
  modelos, fotos, dados) continua no cache; a versão nova do service worker baixa em segundo plano e assume na hora
  (`skipWaiting`, `clientsClaim`). `src/ui/appUpdate.ts` procura versão nova quando o app instalado volta a aparecer
  na tela. Não há aviso.
- **`?lang=pt` e `?coop=wss://…`** continuam funcionando: são a mesma página (o cache ignora o `?`).
- **Fonte Fredoka** (Google Fonts): guardada na primeira vez que carrega (`CacheFirst`). Sem ela, o jogo usa a fonte do
  sistema.
- **Dados da NASA** (`public/data/*.json`) vão no cache com o resto. Dado novo só chega com um deploy novo, como antes.
- O WebSocket do modo em grupo não passa pelo service worker.

## Regenerar os ícones

Os ícones saem do logo (`public/assets/ui/artemis-quest-logo.png`), centralizado num quadrado azul-escuro `#1B2230`.
O *maskable* deixa o logo menor (360 de 512) para caber no círculo seguro do Android.

```bash
L=public/assets/ui/artemis-quest-logo.png
gen(){ ffmpeg -loglevel error -y -f lavfi -i "color=c=0x1B2230:s=$1x$1" -i $L \
  -filter_complex "[1]scale=$2:-1:flags=lanczos[l];[0][l]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24" -frames:v 1 "$3"; }
gen 512 470 public/icons/icon-512.png
gen 192 176 public/icons/icon-192.png
gen 512 360 public/icons/icon-maskable-512.png
gen 180 166 public/icons/apple-touch-icon.png
ffmpeg -loglevel error -y -i $L -vf "scale=64:-1:flags=lanczos,pad=64:64:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba" public/icons/favicon-64.png
```

## Conferir

1. `npm run build && npx vite preview`, abra no Chrome.
2. DevTools → **Application → Manifest**: sem erros em "Installability", ícones aparecendo.
3. **Application → Service workers**: `sw.js` ativo. **Cache storage**: os arquivos do jogo.
4. **Network → Offline** e recarregue: o jogo abre e o modo solo funciona.
5. Lighthouse (aba do DevTools) também mostra se o app é instalável.

## Cuidados

- Arquivo maior que 8 MB não entra no cache (`maximumFileSizeToCacheInBytes`). Se o build avisar, suba o limite.
- Durante o desenvolvimento (`npm run dev`) o service worker fica desligado: nada muda no fluxo de sempre.
- Se algo der errado com o cache num aparelho: DevTools → Application → Storage → "Clear site data".
