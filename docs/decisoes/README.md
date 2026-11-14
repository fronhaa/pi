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
| [0003](0003-manter-rapier-apesar-do-tamanho-do-bundle.md) | Manter Rapier apesar do tamanho do bundle | Aceito |
<!-- adr-index:fim (não remova, usado pelo scripts/new-adr.mjs) -->
