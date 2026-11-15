# Registros de decisão (ADRs)

Um ADR (*Architecture Decision Record*) é um texto curto que registra **uma decisão técnica
importante, o contexto e o porquê**. Serve para que, daqui a 3 meses, ninguém precise
adivinhar por que usamos X em vez de Y.

## Quando criar

- Escolher ou trocar biblioteca/ferramenta.
- Adotar uma técnica que afeta várias partes (ex.: como fazer contornos, como salvar progresso).
- Mudar uma regra das [convenções](../convencoes.md).

Na dúvida: se alguém pode perguntar "por que fizemos assim?", vale um ADR.

## Como criar

```bash
npm run docs:adr -- "Usar KinematicCharacterController no jogador"
```

O comando cria `docs/decisoes/NNNN-titulo.md` a partir do [template](0000-template.md) e
adiciona a linha na tabela abaixo. Preencha, abra PR e discuta lá.

## Regras

- **Status:** `Proposto` → `Aceito` (ou `Rejeitado`). Mais tarde pode virar `Substituído por NNNN`.
- **Não reescreva** um ADR aceito. Se a decisão mudou, crie um novo e marque o antigo como substituído.
- Curto: 1 página no máximo.

## Índice

| # | Decisão | Status |
| --- | --- | --- |
| [0001](0001-stack.md) | Stack: Vite + TypeScript + Three.js + Rapier | Aceito |
| [0002](0002-estilo-toon.md) | Estilo visual toon com inverted hull | Aceito |
| [0003](0003-manter-rapier-apesar-do-tamanho-do-bundle.md) | Manter Rapier apesar do tamanho do bundle | Substituído em parte por [0004](0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md) |
| [0004](0004-jogo-da-missao-jezero-em-typescript-com-rapier-sob-demanda.md) | Jogo da Missão Jezero em TypeScript, com Rapier sob demanda | Aceito |
| [0005](0005-servidor-coop-em-go-com-as-regras.md) | Servidor coop em Go com as regras | Substituído em parte por [0006](0006-servidor-roda-as-regras-do-typescript-goja.md) |
| [0006](0006-servidor-roda-as-regras-do-typescript-goja.md) | Servidor roda as regras do TypeScript (goja) | Proposto |
| [0007](0007-base-lunar-como-segundo-lugar-location-na-simulacao-e-textos.md) | Base lunar como segundo lugar: location na simulação e textos por lugar | Proposto |
| [0008](0008-projeto-dividido-por-areas-cenarios-personagens-e-interacoes.md) | Projeto dividido por áreas: cenários, personagens e interações como dados | Proposto |
| [0009](0009-modulos-da-base-em-100-de-escala-com-medidas-da-nasa.md) | Módulos da base em 100% de escala, com medidas da NASA | Aceito |
<!-- adr-index:fim (não remova, usado pelo scripts/new-adr.mjs) -->
