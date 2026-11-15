import { DIFFICULTIES, type Difficulty } from '@/sim/config';
import { isFirstGame } from './missions';

const LEVEL_KEY = 'jezero.level';

/**
 * Nível marcado na tela "Escolha a missão": o último que a criança jogou neste navegador. Na primeira partida, a
 * Primeira missão (Fácil), para a criança de 7 anos começar sem ler. Só conveniência: sem localStorage, vale o padrão.
 */
export function preferredLevel(): Difficulty {
  try {
    const saved = localStorage.getItem(LEVEL_KEY) as Difficulty | null;
    if (saved && DIFFICULTIES.includes(saved)) return saved;
  } catch {
    /* ignora */
  }
  return isFirstGame() ? 'easy' : 'medium';
}

export function saveLevel(level: Difficulty): void {
  try {
    localStorage.setItem(LEVEL_KEY, level);
  } catch {
    /* ignora */
  }
}
