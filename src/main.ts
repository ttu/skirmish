import { TurnBasedGame } from './game/TurnBasedGame';

document.addEventListener('DOMContentLoaded', () => {
  const game = new TurnBasedGame();
  game.start();
});
