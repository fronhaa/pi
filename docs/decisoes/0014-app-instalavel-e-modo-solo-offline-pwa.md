# 0014. App instalável e modo solo offline (PWA)

- **Status:** Aceito
- **Data:** 2026-11-15
- **Autores:** @wnmonzine

## Contexto

O jogo roda no navegador (GitHub Pages), mas não podia ser instalado: não tinha manifesto, ícone nem service worker.
Escolas costumam ter internet fraca ou instável, e o professor quer abrir o jogo como um app, sem procurar o link.
O desafio pede baixa barreira de entrada ("browser-playable, no download or account").

## Opções consideradas

1. **Só manifesto e ícones**: o Chrome já mostra "Instalar" / sem internet, o app instalado abre uma tela de erro.
2. **Service worker escrito à mão**: sem dependência / precisa listar os arquivos com hash do build e cuidar da
   atualização; fácil errar e deixar a criança presa numa versão velha.
3. **`vite-plugin-pwa` (Workbox)**: gera o manifesto, o service worker e a lista de arquivos no build, com atualização
   automática / dependência de desenvolvimento a mais (o `workbox-build` aumenta o `package-lock.json`).

## Decisão

Opção 3, com `registerType: 'autoUpdate'`. O modo solo inteiro (código, física, modelos, fotos e dados da NASA) fica
guardado no aparelho na primeira visita (~14 MB). O modo em grupo continua precisando de internet.

## Consequências

- O Chrome (computador e Android) oferece "Instalar app"; o app abre sem a barra do navegador (`display: standalone`).
- Depois da primeira visita, o modo solo abre sem internet. A fonte Fredoka é guardada na primeira vez que carrega.
- Deploy novo: o service worker baixa a versão nova em segundo plano e ela entra na próxima vez que o jogo abrir.
- O registro é um script separado (`registerSW.js`, injetado no `index.html`): `main.ts` continua sem importar o jogo.
- Arquivo novo grande (acima de 8 MB) não entra no cache: subir `maximumFileSizeToCacheInBytes` em `vite.config.ts`.
- Ícones em `public/icons/`, gerados a partir do logo; como gerar de novo em [pwa.md](../pwa.md).
