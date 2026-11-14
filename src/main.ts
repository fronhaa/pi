import { Game } from '@/core/Game';

// Ponto de entrada: inicializa o Rapier (WASM) e sobe o jogo.
Game.create(document.body).then((game) => game.start());
