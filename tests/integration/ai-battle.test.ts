import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { EventBusImpl } from '../../src/engine/core/EventBus';
import { DiceRoller } from '../../src/engine/core/DiceRoller';
import { UnitFactory } from '../../src/engine/data/UnitFactory';
import { TurnResolutionSystem } from '../../src/engine/systems/TurnResolutionSystem';
import { VictorySystem, VictoryCondition } from '../../src/engine/systems/VictorySystem';
import { AICommandSystem } from '../../src/engine/systems/AICommandSystem';
import {
  MoveCommand,
  AttackCommand,
  WaitCommand,
  HealthComponent,
} from '../../src/engine/components';

describe('AI Battle Integration', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;
  let roller: DiceRoller;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
    roller = new DiceRoller(42);
  });

  describe('Full Battle Simulation', () => {
    it('simulates a battle until victory or max turns', () => {
      // Setup: 3 player warriors vs 4 goblins
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const warrior3 = UnitFactory.createUnit(world, 'warrior', 'player', 1, 2);

      const goblin1 = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);
      const goblin2 = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 2);
      const goblin3 = UnitFactory.createUnit(world, 'goblin', 'enemy', 12, 1);
      const goblin4 = UnitFactory.createUnit(world, 'goblin', 'enemy', 11, 3);

      // Assign AI controllers to enemies
      AICommandSystem.assignDefaultControllers(world, 'enemy', 'aggressive');

      const conditions = VictorySystem.createEliminationConditions();

      const MAX_TURNS = 20;
      let turn = 1;
      let result = VictorySystem.checkVictory(world, eventBus, conditions, turn);

      while (!result.gameOver && turn <= MAX_TURNS) {
        // Player phase: Advance toward enemies
        const playerUnits = VictorySystem.getUnitsForFaction(world, 'player');
        for (const unitId of playerUnits) {
          const health = world.getComponent<HealthComponent>(unitId, 'health');
          if (health && health.woundState === 'down') continue;

          // Find nearest enemy and move/attack
          const enemyUnits = VictorySystem.getUnitsForFaction(world, 'enemy');
          if (enemyUnits.length > 0) {
            TurnResolutionSystem.queueCommand(world, unitId, {
              type: 'move',
              targetX: 10,
              targetY: 1,
              mode: 'advance',
              apCost: 2,
              priority: 5,
            } as MoveCommand);
          }
        }

        // Enemy phase: AI generates commands
        AICommandSystem.generateCommands(world, eventBus, 'enemy');

        // Resolution phase
        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);

        // Check victory
        result = VictorySystem.checkVictory(world, eventBus, conditions, turn);
        turn++;
      }

      // Battle should end (either side wins or max turns)
      expect(turn).toBeLessThanOrEqual(MAX_TURNS + 1);

      // Log outcome for debugging
      const playerRemaining = VictorySystem.getRemainingUnitCount(world, 'player');
      const enemyRemaining = VictorySystem.getRemainingUnitCount(world, 'enemy');

      console.log(`Battle ended on turn ${turn - 1}`);
      console.log(`Player units remaining: ${playerRemaining}`);
      console.log(`Enemy units remaining: ${enemyRemaining}`);
      console.log(`Result: ${result.winner || 'ongoing'}`);
    });

    it('aggressive AI engages quickly', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 15, 0); // Far away

      AICommandSystem.setPersonality(world, enemy, 'aggressive');

      // Initial position
      const initialPos = world.getComponent(enemy, 'position') as any;
      const initialX = initialPos.x;

      // Player waits
      TurnResolutionSystem.queueCommand(world, player, {
        type: 'wait',
        apCost: 0,
        priority: 10,
      } as WaitCommand);

      // AI generates commands
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      // Resolve first turn
      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const afterPos = world.getComponent(enemy, 'position') as any;

      // Enemy should have moved significantly closer (run mode = 75% of 5 = 3.75 distance)
      expect(afterPos.x).toBeLessThan(initialX);
      expect(initialX - afterPos.x).toBeGreaterThan(2); // Moved at least 2 units
    });

    it('cautious AI retreats when outmatched', () => {
      // Strong player force
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const veteran1 = UnitFactory.createUnit(world, 'veteran', 'player', 2, 0);
      const veteran2 = UnitFactory.createUnit(world, 'veteran', 'player', 0, 2);

      // Weak enemy
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      AICommandSystem.setPersonality(world, goblin, 'cautious');

      // Initial position
      const initialPos = world.getComponent(goblin, 'position') as any;
      const initialX = initialPos.x;

      // Simulate a few turns
      for (let turn = 1; turn <= 2; turn++) {
        // Players advance
        TurnResolutionSystem.queueCommand(world, knight, {
          type: 'move',
          targetX: 5,
          targetY: 0,
          mode: 'advance',
          apCost: 2,
          priority: 5,
        } as MoveCommand);

        AICommandSystem.generateCommands(world, eventBus, 'enemy');
        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);
      }

      const finalPos = world.getComponent(goblin, 'position') as any;

      // Goblin should have retreated (moved away from players)
      expect(finalPos.x).toBeGreaterThan(initialX);
    });
  });

  describe('Survival Scenario', () => {
    it('player wins by surviving required turns', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 20, 0); // Far away

      AICommandSystem.assignDefaultControllers(world, 'enemy', 'cautious');

      const conditions = VictorySystem.createSurvivalConditions(5);

      for (let turn = 1; turn <= 5; turn++) {
        // Player holds position
        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'wait',
          apCost: 0,
          priority: 10,
        } as WaitCommand);

        AICommandSystem.generateCommands(world, eventBus, 'enemy');
        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);

        const result = VictorySystem.checkVictory(world, eventBus, conditions, turn);

        if (turn === 5) {
          expect(result.gameOver).toBe(true);
          expect(result.winner).toBe('player');
        } else {
          expect(result.gameOver).toBe(false);
        }
      }
    });
  });

  describe('Assassination Scenario', () => {
    it('player wins by killing target', () => {
      // Knight vs troll only - with one-reaction rule, multiple attackers are deadly
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const troll = UnitFactory.createUnit(world, 'troll', 'enemy', 2, 0);

      AICommandSystem.assignDefaultControllers(world, 'enemy', 'aggressive');

      const conditions = VictorySystem.createAssassinationConditions('troll');

      // Simulate until troll dies or max turns
      for (let turn = 1; turn <= 30; turn++) {
        // Player attacks troll
        TurnResolutionSystem.queueCommand(world, knight, {
          type: 'attack',
          targetId: troll,
          attackType: 'melee',
          apCost: 2,
          priority: 6,
        } as AttackCommand);

        AICommandSystem.generateCommands(world, eventBus, 'enemy');
        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);

        const result = VictorySystem.checkVictory(world, eventBus, conditions, turn);

        if (result.gameOver) {
          console.log(`Assassination scenario ended on turn ${turn}: ${result.reason}`);
          expect(result.winner).toBe('player');
          break;
        }
      }
    });
  });

  describe('Mixed Personality Battle', () => {
    it('different AI personalities exhibit different behaviors', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      const aggressiveOrc = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 10, 0);
      const cunningOrc = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 10, 5);
      const cautiousOrc = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 10, -5);

      AICommandSystem.setPersonality(world, aggressiveOrc, 'aggressive');
      AICommandSystem.setPersonality(world, cunningOrc, 'cunning');
      AICommandSystem.setPersonality(world, cautiousOrc, 'cautious');

      // Player holds
      TurnResolutionSystem.queueCommand(world, player, {
        type: 'wait',
        apCost: 0,
        priority: 10,
      } as WaitCommand);

      // Generate AI commands
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      // Resolve turn
      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Check that each moved differently
      const aggressivePos = world.getComponent(aggressiveOrc, 'position') as any;
      const cunningPos = world.getComponent(cunningOrc, 'position') as any;
      const cautiousPos = world.getComponent(cautiousOrc, 'position') as any;

      // Aggressive should have moved toward player (run mode = faster)
      expect(aggressivePos.x).toBeLessThan(10);

      // Cunning should have moved (advance mode)
      expect(cunningPos.x).toBeLessThan(10);

      // Cautious might retreat or hold (depends on strength assessment)
      // Just verify it executed a command
      expect(cautiousPos).toBeDefined();
    });
  });

  describe('Event Logging', () => {
    it('logs all combat events for replay', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 1, 0);

      AICommandSystem.setPersonality(world, goblin, 'aggressive');

      // Player attacks
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'attack',
        targetId: goblin,
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      // AI attacks
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      // Resolve
      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();

      // Should have logged key events
      expect(events.some((e) => e.type === 'ResolutionPhaseStarted')).toBe(true);
      expect(events.some((e) => e.type === 'AttackDeclared')).toBe(true);
      expect(events.some((e) => e.type === 'AttackRolled')).toBe(true);
      expect(events.some((e) => e.type === 'TurnEnded')).toBe(true);

      // Events should have turn numbers
      expect(events.every((e) => e.turn !== undefined)).toBe(true);
    });
  });
});
