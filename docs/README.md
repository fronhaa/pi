# Documentação do projeto

Esta pasta é a fonte da verdade sobre **como o jogo funciona e por que é assim**.
Ela vive junto com o código, então é versionada, revisada em PR e nunca fica "em outro lugar".

## Índice

| Documento | Para quem / quando ler |
| --- | --- |
| [desafio.md](desafio.md) | Todo mundo, antes de tudo. O que o desafio da NASA pede, em checklist. |
| [publico-e-impacto.md](publico-e-impacto.md) | **Todo mundo, antes de mexer em texto, interface ou mecânica.** Pilar crítico: crianças de 7 a 12 anos, simplicidade, impacto, pendências. |
| [linguagem-e-ui-criancas.md](linguagem-e-ui-criancas.md) | **Todo mundo que escreve texto, botão ou alerta.** As 6 regras de ouro de redação para 7–12 anos (frases de 8 a 12 palavras, ícone + negrito, imperativo, termo da NASA explicado, modo cientista) e a tabela de exemplos. |
| [game-design.md](game-design.md) | Todo mundo. GDD da Missão Jezero: loop, recursos, cartas, cooperativo, dados da NASA, backlog. |
| [art-bible.md](art-bible.md) | Artistas e quem gera concept art. Direção de arte oficial: estilo, paleta, escala, códigos de asset, aprovação. |
| [apis-nasa.md](apis-nasa.md) | Quem vai buscar dados reais. Quais APIs da NASA usar, CORS, formato da resposta e uso no jogo. |
| [servidor-coop.md](servidor-coop.md) | Quem mexe no coop online ou no VPS. Servidor Go, regras do coop, protocolo, deploy e como as regras de `src/sim` rodam no servidor. |
| [ciencia-marte.md](ciencia-marte.md) | Quem escreve texto educativo, ajuda "?" ou a apresentação. Fatos reais de Marte conferidos, com fonte, página e trecho original, e textos para a criança em PT/EN. |
| [dados.md](dados.md) | Quem mexe nos dados reais da NASA: fontes, coleta e como atualizar. |
| [arquitetura.md](arquitetura.md) | Todo mundo, no primeiro dia. Pastas, loop do jogo, quem é dono de quê. |
| [fisica.md](fisica.md) | Quem vai criar objetos, personagens ou fases. |
| [estilo-visual.md](estilo-visual.md) | Artistas e devs mexendo em materiais, modelos ou cores. |
| [convencoes.md](convencoes.md) | Antes do primeiro PR. Código, branches, commits, assets. |
| [decisoes/](decisoes/README.md) | Quando quiser entender *por que* algo foi escolhido, ou propor mudar. |

## Como a documentação funciona (o mecanismo)

São quatro tipos de documento, cada um com seu papel:

1. **Guias** (`docs/*.md`) descrevem *como as coisas são hoje*. Devem estar sempre corretos;
   se o código mudou e o guia ficou errado, o guia está com bug.
2. **Decisões / ADRs** (`docs/decisoes/NNNN-*.md`) registram *por que* escolhemos algo.
   São imutáveis: não se reescreve uma decisão antiga, cria-se uma nova que a **substitui**.
3. **Comentários no código** explicam o *porquê* local ("por que esse número?").
   O *o quê* o próprio código deve dizer.
4. **README raiz** é a porta de entrada: como rodar e onde achar o resto.

### Quando atualizar o quê

| Você fez… | Atualize |
| --- | --- |
| Mudou uma regra do jogo (recursos, eventos, balanceamento, fluxo) | `game-design.md` |
| Mudou como um sistema funciona (loop, física, input, render) | O guia correspondente |
| Escolheu/trocou biblioteca, técnica ou padrão importante | Novo ADR (`npm run docs:adr -- "título"`) |
| Criou uma pasta/módulo novo em `src/` | `arquitetura.md` (tabela de pastas) |
| Mudou direção de arte (estilo, paleta, escala, materiais) | `art-bible.md`, com nova versão no registro de alterações |
| Adicionou cor, material ou regra de arte no código | `estilo-visual.md` |
| Mudou comando, dependência de sistema ou setup | `README.md` raiz |

### Como garantimos que isso acontece

- **Template de PR** (`.github/pull_request_template.md`) tem o checklist "docs atualizadas".
  Quem revisa confere.
- **Mesmo PR**: doc e código mudam juntos. "Documento depois" não acontece.
- **CLAUDE.md** na raiz instrui o assistente de IA a seguir e atualizar estes docs também.

### Estilo de escrita

- Português, direto, frases curtas. Termos técnicos podem ficar em inglês (*rigid body*, *collider*).
- Prefira exemplos de código e tabelas a parágrafos longos.
- Linke arquivos com caminho relativo (`../src/core/Game.ts`) para funcionar no GitHub.
