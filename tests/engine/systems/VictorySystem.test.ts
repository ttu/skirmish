import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { VictorySystem, VictoryCondition } from '../../../src/engine/systems/VictorySystem';
import { UnitFactory } from '../../../src/engine/data/UnitFactory';
import {
  HealthComponent,
  MoraleStateComponent,
  PositionComponent,
} from '../../../src/engine/components';

describe('VictorySystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  describe('elimination condition', () => {
    it('player wins when all enemies are down', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Set goblin as down
      world.addComponent<HealthComponent>(goblin, {
        type: 'health',
        current: 0,
        max: 40,
        woundState: 'down',
      });

      const conditions = VictorySystem.createEliminationConditions();
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('player wins when all enemies are routed', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Set goblin as routed
      world.addComponent<MoraleStateComponent>(goblin, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      const conditions = VictorySystem.createEliminationConditions();
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('enemy wins when all players are down', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Set warrior as down
      world.addComponent<HealthComponent>(warrior, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });

      const conditions = VictorySystem.createEliminationConditions();
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('enemy');
    });

    it('game continues when units remain on both sides', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      const conditions = VictorySystem.createEliminationConditions();
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('handles mix of down and routed enemies', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin1 = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);
      const goblin2 = UnitFactory.createUnit(world, 'goblin', 'enemy', 6, 0);

      // First goblin down, second routed
      world.addComponent<HealthComponent>(goblin1, {
        type: 'health',
        current: 0,
        max: 40,
        woundState: 'down',
      });
      world.addComponent<MoraleStateComponent>(goblin2, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      const conditions = VictorySystem.createEliminationConditions();
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });
  });

  describe('morale break condition', () => {
    it('triggers when majority broken and casualty threshold met', () => {
      // Setup: 4 enemies, 3 broken/down
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const orc1 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 5, 0);
      const orc2 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 6, 0);
      const orc3 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 7, 0);
      const orc4 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 8, 0);

      // 2 down, 1 broken = 3/4 = 75%
      world.addComponent<HealthComponent>(orc1, {
        type: 'health',
        current: 0,
        max: 120,
        woundState: 'down',
      });
      world.addComponent<HealthComponent>(orc2, {
        type: 'health',
        current: 0,
        max: 120,
        woundState: 'down',
      });
      world.addComponent<MoraleStateComponent>(orc3, {
        type: 'moraleState',
        status: 'broken',
        modifiers: [],
      });

      const conditions: VictoryCondition[] = [
        {
          type: 'morale_break',
          faction: 'player',
          description: 'Enemy morale broken',
          casualtyThreshold: 50,
        },
      ];

      const result = VictorySystem.checkVictory(world, eventBus, conditions, 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('requires leader death when specified', () => {
      const knight = UnitFactory.createUnit(world, 'knight', 'enemy', 5, 0);
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const orc1 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 6, 0);
      const orc2 = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 7, 0);

      // Orcs broken but knight alive
      world.addComponent<MoraleStateComponent>(orc1, {
        type: 'moraleState',
        status: 'broken',
        modifiers: [],
      });
      world.addComponent<MoraleStateComponent>(orc2, {
        type: 'moraleState',
        status: 'broken',
        modifiers: [],
      });

      const conditions: VictoryCondition[] = [
        {
          type: 'morale_break',
          faction: 'player',
          description: 'Kill enemy leader and break morale',
          requireLeaderDead: true,
        },
      ];

      let result = VictorySystem.checkVictory(world, eventBus, conditions, 1);
      expect(result.gameOver).toBe(false);

      // Now kill the knight
      world.addComponent<HealthComponent>(knight, {
        type: 'health',
        current: 0,
        max: 120,
        woundState: 'down',
      });

      result = VictorySystem.checkVictory(world, eventBus, conditions, 1);
      expect(result.gameOver).toBe(true);
    });
  });

  describe('objective hold condition', () => {
    it('requires holding position for specified turns', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 5, 5);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 20, 20);

      const condition: VictoryCondition = {
        type: 'objective_hold',
        faction: 'player',
        description: 'Hold the bridge for 3 turns',
        position: { x: 5, y: 5 },
        radius: 2,
        turnsRequired: 3,
      };

      // Turn 1
      let result = VictorySystem.checkVictory(world, eventBus, [condition], 1);
      expect(result.gameOver).toBe(false);

      // Turn 2
      result = VictorySystem.checkVictory(world, eventBus, [condition], 2);
      expect(result.gameOver).toBe(false);

      // Turn 3
      result = VictorySystem.checkVictory(world, eventBus, [condition], 3);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('resets counter when unit leaves area', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 5, 5);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 20, 20);

      const condition: VictoryCondition = {
        type: 'objective_hold',
        faction: 'player',
        description: 'Hold position',
        position: { x: 5, y: 5 },
        radius: 2,
        turnsRequired: 3,
      };

      // Turn 1 - in position
      VictorySystem.checkVictory(world, eventBus, [condition], 1);

      // Turn 2 - move away
      world.addComponent<PositionComponent>(warrior, {
        type: 'position',
        x: 15,
        y: 15,
        facing: 0,
      });
      VictorySystem.checkVictory(world, eventBus, [condition], 2);

      // Turn 3 - back in position
      world.addComponent<PositionComponent>(warrior, {
        type: 'position',
        x: 5,
        y: 5,
        facing: 0,
      });
      const result = VictorySystem.checkVictory(world, eventBus, [condition], 3);

      expect(result.gameOver).toBe(false); // Counter reset
    });
  });

  describe('objective reach condition', () => {
    it('triggers when unit reaches destination', () => {
      const healer = UnitFactory.createUnit(world, 'healer', 'player', 10, 10);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);

      const condition: VictoryCondition = {
        type: 'objective_reach',
        faction: 'player',
        description: 'Reach the village',
        position: { x: 10, y: 10 },
        radius: 2,
      };

      const result = VictorySystem.checkVictory(world, eventBus, [condition], 1);

      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('requires specific unit type when specified', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 10, 10);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);

      const condition: VictoryCondition = {
        type: 'objective_reach',
        faction: 'player',
        description: 'Escort healer to village',
        position: { x: 10, y: 10 },
        radius: 2,
        unitType: 'healer',
      };

      // Warrior is there but not healer
      let result = VictorySystem.checkVictory(world, eventBus, [condition], 1);
      expect(result.gameOver).toBe(false);

      // Add healer at destination
      const healer = UnitFactory.createUnit(world, 'healer', 'player', 10, 10);
      result = VictorySystem.checkVictory(world, eventBus, [condition], 1);
      expect(result.gameOver).toBe(true);
    });
  });

  describe('objective kill condition', () => {
    it('triggers when target is killed', () => {
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const troll = UnitFactory.createUnit(world, 'troll', 'enemy', 5, 0);

      const conditions = VictorySystem.createAssassinationConditions('troll');

      // Troll alive
      let result = VictorySystem.checkVictory(world, eventBus, conditions, 1);
      expect(result.gameOver).toBe(false);

      // Kill the troll
      world.addComponent<HealthComponent>(troll, {
        type: 'health',
        current: 0,
        max: 250,
        woundState: 'down',
      });

      result = VictorySystem.checkVictory(world, eventBus, conditions, 1);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });
  });

  describe('survival condition', () => {
    it('triggers after specified turns', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);

      const conditions = VictorySystem.createSurvivalConditions(5);

      // Turns 1-4
      for (let turn = 1; turn <= 4; turn++) {
        const result = VictorySystem.checkVictory(world, eventBus, conditions, turn);
        expect(result.gameOver).toBe(false);
      }

      // Turn 5
      const result = VictorySystem.checkVictory(world, eventBus, conditions, 5);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });
  });

  describe('point threshold condition', () => {
    it('triggers when faction has enough points', () => {
      // Knight = 100, Veteran = 75
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const veteran = UnitFactory.createUnit(world, 'veteran', 'player', 2, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);

      const condition: VictoryCondition = {
        type: 'point_threshold',
        faction: 'player',
        description: 'Maintain 150 points',
        threshold: 150,
      };

      const result = VictorySystem.checkVictory(world, eventBus, [condition], 1);
      expect(result.gameOver).toBe(true);
      expect(result.winner).toBe('player');
    });

    it('does not count downed units', () => {
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const veteran = UnitFactory.createUnit(world, 'veteran', 'player', 2, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);

      // Down the knight
      world.addComponent<HealthComponent>(knight, {
        type: 'health',
        current: 0,
        max: 120,
        woundState: 'down',
      });

      const condition: VictoryCondition = {
        type: 'point_threshold',
        faction: 'player',
        description: 'Maintain 150 points',
        threshold: 150,
      };

      // Only veteran remains (75 points < 150)
      const result = VictorySystem.checkVictory(world, eventBus, [condition], 1);
      expect(result.gameOver).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('calculates faction points correctly', () => {
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0); // 100
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0); // 50
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0); // 15

      const playerPoints = VictorySystem.calculateFactionPoints(world, 'player');
      const enemyPoints = VictorySystem.calculateFactionPoints(world, 'enemy');

      expect(playerPoints).toBe(150);
      expect(enemyPoints).toBe(15);
    });

    it('counts remaining units correctly', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const warrior3 = UnitFactory.createUnit(world, 'warrior', 'player', 4, 0);

      // One down, one routed
      world.addComponent<HealthComponent>(warrior2, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });
      world.addComponent<MoraleStateComponent>(warrior3, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      const remaining = VictorySystem.getRemainingUnitCount(world, 'player');
      expect(remaining).toBe(1);
    });

    it('calculates casualty rate correctly', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const warrior3 = UnitFactory.createUnit(world, 'warrior', 'player', 4, 0);
      const warrior4 = UnitFactory.createUnit(world, 'warrior', 'player', 6, 0);

      // 2 of 4 down = 50%
      world.addComponent<HealthComponent>(warrior1, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });
      world.addComponent<HealthComponent>(warrior2, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });

      const casualtyRate = VictorySystem.getCasualtyRate(world, 'player');
      expect(casualtyRate).toBe(50);
    });
  });

  describe('events', () => {
    it('emits VictoryAchieved event on player win', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      world.addComponent<HealthComponent>(goblin, {
        type: 'health',
        current: 0,
        max: 40,
        woundState: 'down',
      });

      const conditions = VictorySystem.createEliminationConditions();
      VictorySystem.checkVictory(world, eventBus, conditions, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'VictoryAchieved')).toBe(true);
    });

    it('emits DefeatSuffered event on player loss', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      world.addComponent<HealthComponent>(warrior, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });

      const conditions = VictorySystem.createEliminationConditions();
      VictorySystem.checkVictory(world, eventBus, conditions, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'DefeatSuffered')).toBe(true);
    });
  });
});
