import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../src/engine/core/GameEngine';
import { scenarios } from '../../src/data/scenarios';
import { getSelectionAfterUnitClick } from '../../src/game/selection';

describe('Selection', () => {
  let engine: GameEngine;
  let playerId: string;
  let enemyId: string;

  beforeEach(() => {
    engine = new GameEngine({ seed: 42 });
    const loaded = engine.loadScenario(scenarios[0]);
    playerId = loaded.playerUnitIds[0];
    enemyId = loaded.enemyUnitIds[0];
  });

  it('allows selecting both a player unit and an enemy unit', () => {
    // Selecting a player unit sets selection to that unit
    const afterSelectPlayer = getSelectionAfterUnitClick(null, playerId, 'player');
    expect(afterSelectPlayer).toBe(playerId);

    // Selecting an enemy unit sets selection to that unit
    const afterSelectEnemy = getSelectionAfterUnitClick(null, enemyId, 'enemy');
    expect(afterSelectEnemy).toBe(enemyId);
  });

  it('allows switching selection from player to enemy and back', () => {
    // Select player first
    let selection = getSelectionAfterUnitClick(null, playerId, 'player');
    expect(selection).toBe(playerId);

    // Then select enemy — only one selected at a time
    selection = getSelectionAfterUnitClick(selection, enemyId, 'enemy');
    expect(selection).toBe(enemyId);

    // Back to player
    selection = getSelectionAfterUnitClick(selection, playerId, 'player');
    expect(selection).toBe(playerId);
  });
});
