import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';
import {
  AICommandSystem,
  AIControllerComponent,
  AIPersonality,
} from '../../../src/engine/systems/AICommandSystem';
import { TurnResolutionSystem } from '../../../src/engine/systems/TurnResolutionSystem';
import { UnitFactory } from '../../../src/engine/data/UnitFactory';
import {
  CommandQueueComponent,
  HealthComponent,
  PositionComponent,
  MoraleStateComponent,
} from '../../../src/engine/components';

describe('AICommandSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;
  let roller: DiceRoller;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
    roller = new DiceRoller(12345);
  });

  describe('generateCommands', () => {
    it('generates commands for all enemy units', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy1 = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);
      const enemy2 = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 2);

      AICommandSystem.assignDefaultControllers(world, 'enemy');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue1 = world.getComponent<CommandQueueComponent>(enemy1, 'commandQueue');
      const queue2 = world.getComponent<CommandQueueComponent>(enemy2, 'commandQueue');

      expect(queue1?.commands.length).toBeGreaterThan(0);
      expect(queue2?.commands.length).toBeGreaterThan(0);
    });

    it('skips downed units', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Down the enemy
      world.addComponent<HealthComponent>(enemy, {
        type: 'health',
        current: 0,
        max: 40,
        woundState: 'down',
      });

      AICommandSystem.assignDefaultControllers(world, 'enemy');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      expect(queue).toBeUndefined();
    });

    it('skips routed units', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Rout the enemy
      world.addComponent<MoraleStateComponent>(enemy, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      AICommandSystem.assignDefaultControllers(world, 'enemy');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      expect(queue).toBeUndefined();
    });
  });

  describe('battlefield analysis', () => {
    it('correctly identifies winning/losing state', () => {
      // Strong player vs weak enemies
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      const analysis = AICommandSystem.analyzeBattlefield(world, 'enemy');

      expect(analysis.ownStrength).toBeLessThan(analysis.enemyStrength);
      expect(analysis.isLosing).toBe(true);
    });

    it('assesses threats correctly', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 2, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      const analysis = AICommandSystem.analyzeBattlefield(world, 'enemy');

      // Knight should be higher threat than warrior
      expect(analysis.threats.length).toBe(2);
      expect(analysis.threats[0].entityId).toBe(knight); // Higher threat first
    });

    it('identifies wounded enemies as lower threat', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const woundedWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Wound one warrior
      world.addComponent<HealthComponent>(woundedWarrior, {
        type: 'health',
        current: 20,
        max: 100,
        woundState: 'critical',
      });

      const analysis = AICommandSystem.analyzeBattlefield(world, 'enemy');

      // Find the wounded warrior's threat
      const woundedThreat = analysis.threats.find((t) => t.entityId === woundedWarrior);
      const healthyThreat = analysis.threats.find((t) => t.entityId === warrior);

      expect(woundedThreat?.threatLevel).toBeLessThan(healthyThreat?.threatLevel || 0);
    });
  });

  describe('aggressive personality', () => {
    it('charges toward nearest enemy', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 10, 0);

      AICommandSystem.setPersonality(world, enemy, 'aggressive');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      expect(queue?.commands.some((c) => c.type === 'move')).toBe(true);
    });

    it('attacks when in range', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 1, 0); // In melee range

      AICommandSystem.setPersonality(world, enemy, 'aggressive');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      expect(queue?.commands.some((c) => c.type === 'attack')).toBe(true);
    });

    it('tries to rally when shaken', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 5, 0);

      // Shake the enemy
      world.addComponent<MoraleStateComponent>(enemy, {
        type: 'moraleState',
        status: 'shaken',
        modifiers: [],
      });

      AICommandSystem.setPersonality(world, enemy, 'aggressive');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      expect(queue?.commands.some((c) => c.type === 'rally')).toBe(true);
    });
  });

  describe('cunning personality', () => {
    it('targets wounded enemies first', () => {
      const healthyWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const woundedWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 1.5, 0); // Close to both

      // Wound one warrior
      world.addComponent<HealthComponent>(woundedWarrior, {
        type: 'health',
        current: 20,
        max: 100,
        woundState: 'critical',
      });

      AICommandSystem.setPersonality(world, enemy, 'cunning');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      const attackCommand = queue?.commands.find((c) => c.type === 'attack');

      if (attackCommand && 'targetId' in attackCommand) {
        expect(attackCommand.targetId).toBe(woundedWarrior);
      }
    });
  });

  describe('cautious personality', () => {
    it('retreats when losing', () => {
      // Strong player
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const veteran = UnitFactory.createUnit(world, 'veteran', 'player', 2, 0);
      // Weak enemy
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      AICommandSystem.setPersonality(world, goblin, 'cautious');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(goblin, 'commandQueue');
      // Should move away (retreat)
      expect(queue?.commands.some((c) => c.type === 'move')).toBe(true);

      if (queue?.commands[0].type === 'move') {
        // Should be moving away from players (x > 5)
        expect((queue.commands[0] as any).targetX).toBeGreaterThan(5);
      }
    });

    it('holds position when not losing', () => {
      const player = UnitFactory.createUnit(world, 'militia', 'player', 10, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_brute', 'enemy', 0, 0);

      AICommandSystem.setPersonality(world, enemy, 'cautious');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      // Should wait (enemy out of range, not losing)
      expect(queue?.commands.some((c) => c.type === 'wait')).toBe(true);
    });
  });

  describe('brutal personality', () => {
    it('targets weakest enemy', () => {
      const healthyWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const weakWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 2, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_brute', 'enemy', 1.5, 0);

      // Weaken one warrior severely
      world.addComponent<HealthComponent>(weakWarrior, {
        type: 'health',
        current: 5,
        max: 100,
        woundState: 'critical',
      });

      AICommandSystem.setPersonality(world, enemy, 'brutal');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      const attackCommand = queue?.commands.find((c) => c.type === 'attack');

      if (attackCommand && 'targetId' in attackCommand) {
        expect(attackCommand.targetId).toBe(weakWarrior);
      }
    });

    it('sprints to reach targets', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_brute', 'enemy', 10, 0);

      AICommandSystem.setPersonality(world, enemy, 'brutal');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      const moveCommand = queue?.commands.find((c) => c.type === 'move');

      if (moveCommand && 'mode' in moveCommand) {
        expect(moveCommand.mode).toBe('sprint');
      }
    });
  });

  describe('honorable personality', () => {
    it('targets strongest unengaged enemy', () => {
      const militia = UnitFactory.createUnit(world, 'militia', 'player', 0, 0);
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 2, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 1.5, 0);

      AICommandSystem.setPersonality(world, enemy, 'honorable');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      const attackCommand = queue?.commands.find((c) => c.type === 'attack');

      // Should target knight (stronger) over militia
      if (attackCommand && 'targetId' in attackCommand) {
        expect(attackCommand.targetId).toBe(knight);
      }
    });

    it('advances rather than sprints', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 10, 0);

      AICommandSystem.setPersonality(world, enemy, 'honorable');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      const queue = world.getComponent<CommandQueueComponent>(enemy, 'commandQueue');
      const moveCommand = queue?.commands.find((c) => c.type === 'move');

      if (moveCommand && 'mode' in moveCommand) {
        expect(moveCommand.mode).toBe('advance');
      }
    });
  });

  describe('controller assignment', () => {
    it('assigns default controllers to units', () => {
      const enemy = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);

      expect(world.hasComponent(enemy, 'aiController')).toBe(false);

      AICommandSystem.assignDefaultControllers(world, 'enemy');

      expect(world.hasComponent(enemy, 'aiController')).toBe(true);
    });

    it('allows setting personality', () => {
      const enemy = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);

      AICommandSystem.setPersonality(world, enemy, 'cunning');

      const controller = world.getComponent<AIControllerComponent>(enemy, 'aiController');
      expect(controller?.personality).toBe('cunning');
    });
  });

  describe('integration with turn resolution', () => {
    it('AI commands are executed during turn resolution', () => {
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemy = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 1, 0);

      // Give enemy aggressive personality
      AICommandSystem.setPersonality(world, enemy, 'aggressive');
      AICommandSystem.generateCommands(world, eventBus, 'enemy');

      // Player holds
      TurnResolutionSystem.queueCommand(world, player, {
        type: 'wait',
        apCost: 0,
        priority: 10,
      });

      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Enemy should have acted
      expect(result.entitiesActed).toContain(enemy);

      // Attack should have been declared
      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'AttackDeclared' && e.entityId === enemy)).toBe(true);
    });
  });
});
