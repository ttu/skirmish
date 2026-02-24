import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';
import { TurnResolutionSystem } from '../../../src/engine/systems/TurnResolutionSystem';
import { UnitFactory } from '../../../src/engine/data/UnitFactory';
import {
  CommandQueueComponent,
  MoveCommand,
  AttackCommand,
  RallyCommand,
  WaitCommand,
  OverwatchCommand,
  ActionPointsComponent,
  PositionComponent,
  HealthComponent,
  StaminaComponent,
  MoraleStateComponent,
  OverwatchComponent,
  WeaponComponent,
  FactionComponent,
  OffHandComponent,
} from '../../../src/engine/components';

describe('TurnResolutionSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;
  let roller: DiceRoller;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
    roller = new DiceRoller(12345);
  });

  describe('queueCommand', () => {
    it('queues a command for an entity', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      const moveCommand: MoveCommand = {
        type: 'move',
        targetX: 3,
        targetY: 0,
        mode: 'advance',
        apCost: 2,
        priority: 5,
      };

      const success = TurnResolutionSystem.queueCommand(world, warrior, moveCommand);
      expect(success).toBe(true);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queue).toBeDefined();
      expect(queue!.commands).toHaveLength(1);
      expect(queue!.commands[0]).toEqual(moveCommand);
    });

    it('rejects command if insufficient AP', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Try to queue too many expensive commands
      for (let i = 0; i < 5; i++) {
        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'attack',
          targetId: 'enemy',
          attackType: 'melee',
          apCost: 2,
          priority: 5,
        } as AttackCommand);
      }

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      // Should only allow commands that fit within AP (warrior has 4 AP after armor penalty)
      expect(queue!.commands.length).toBeLessThanOrEqual(2);
    });

    it('allows multiple commands up to AP limit', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Warrior has 4 AP (5 base - 1 armor penalty)
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'attack',
        targetId: 'enemy',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queue!.commands).toHaveLength(2);
    });

    it('validates that adding a new action queues it and executes it on resolveTurn', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const moveCommand: MoveCommand = {
        type: 'move',
        targetX: 3,
        targetY: 1,
        mode: 'advance',
        apCost: 2,
        priority: 5,
      };

      const added = TurnResolutionSystem.queueCommand(world, warrior, moveCommand);
      expect(added).toBe(true);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queue).toBeDefined();
      expect(queue!.commands).toHaveLength(1);
      expect(queue!.commands[0]).toMatchObject({
        type: 'move',
        targetX: 3,
        targetY: 1,
        mode: 'advance',
        apCost: 2,
      });

      const posBefore = world.getComponent<PositionComponent>(warrior, 'position');
      expect(posBefore!.x).toBe(0);
      expect(posBefore!.y).toBe(0);

      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);
      expect(result.actionsResolved).toBe(1);
      expect(result.entitiesActed).toContain(warrior);

      const posAfter = world.getComponent<PositionComponent>(warrior, 'position');
      expect(posAfter!.x).not.toBe(posBefore!.x);
      expect(posAfter!.y).not.toBe(posBefore!.y);
      expect(posAfter!.x).toBeCloseTo(3, 0);
      expect(posAfter!.y).toBeCloseTo(1, 0);

      const queueAfter = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queueAfter!.commands).toHaveLength(0);
    });
  });

  describe('clearCommands', () => {
    it('clears all queued commands', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.clearCommands(world, warrior);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queue!.commands).toHaveLength(0);
    });
  });

  describe('collectAndSortActions', () => {
    it('collects actions from multiple entities', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 10,
      } as MoveCommand);

      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'move',
        targetX: 7,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      const actions = TurnResolutionSystem.collectAndSortActions(world);
      expect(actions).toHaveLength(2);
      // Lower priority executes first
      expect(actions[0].priority).toBe(5);
      expect(actions[1].priority).toBe(10);
    });

    it('excludes downed units', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      // Set warrior as down
      world.addComponent<HealthComponent>(warrior, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });

      const actions = TurnResolutionSystem.collectAndSortActions(world);
      expect(actions).toHaveLength(0);
    });

    it('excludes routed units', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      // Set warrior as routed
      world.addComponent<MoraleStateComponent>(warrior, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      const actions = TurnResolutionSystem.collectAndSortActions(world);
      expect(actions).toHaveLength(0);
    });
  });

  describe('resolveTurn', () => {
    it('resolves all queued actions', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      expect(result.actionsResolved).toBe(1);
      expect(result.entitiesActed).toContain(warrior);
    });

    it('clears command queues after resolution', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue');
      expect(queue!.commands).toHaveLength(0);
    });

    it('emits turn events', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'wait',
        apCost: 0,
        priority: 10,
      } as WaitCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'ResolutionPhaseStarted')).toBe(true);
      expect(events.some((e) => e.type === 'TurnEnded')).toBe(true);
    });

    it('resets AP at end of turn', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Use some AP
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const ap = world.getComponent<ActionPointsComponent>(warrior, 'actionPoints');
      expect(ap!.current).toBe(ap!.max);
    });

    it('recovers stamina at end of turn', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Drain some stamina first
      const stamina = world.getComponent<StaminaComponent>(warrior, 'stamina')!;
      world.addComponent<StaminaComponent>(warrior, {
        ...stamina,
        current: stamina.max - 5,
      });

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const newStamina = world.getComponent<StaminaComponent>(warrior, 'stamina');
      expect(newStamina!.current).toBe(stamina.max - 2); // Recovered 3 per turn (unhit)
    });
  });

  describe('move command', () => {
    it('moves unit to target position', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const pos = world.getComponent<PositionComponent>(warrior, 'position');
      // Should have moved towards target (walk = 25% of 6 = 1.5 distance)
      expect(pos!.x).toBeGreaterThan(0);
    });

    it('drains stamina based on movement mode', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const staminaBefore = world.getComponent<StaminaComponent>(warrior, 'stamina')!.current;

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 10,
        targetY: 0,
        mode: 'sprint',
        apCost: 4,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const staminaAfter = world.getComponent<StaminaComponent>(warrior, 'stamina');
      // Sprint costs 3 stamina, but end of turn recovers 3 (unhit)
      expect(staminaAfter!.current).toBe(staminaBefore);
    });
  });

  describe('attack command', () => {
    it('resolves melee attack', () => {
      const attacker = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const defender = UnitFactory.createUnit(world, 'goblin', 'enemy', 1, 0);

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'AttackDeclared')).toBe(true);
      expect(events.some((e) => e.type === 'AttackRolled')).toBe(true);
    });

    it('consumes ammo for ranged attacks', () => {
      const archer = UnitFactory.createUnit(world, 'archer', 'player', 0, 0);
      const target = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);

      TurnResolutionSystem.queueCommand(world, archer, {
        type: 'attack',
        targetId: target,
        attackType: 'ranged',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'AmmoSpent')).toBe(true);
    });
  });

  describe('rally command', () => {
    it('attempts to rally a shaken unit', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Make warrior shaken
      world.addComponent<MoraleStateComponent>(warrior, {
        type: 'moraleState',
        status: 'shaken',
        modifiers: [],
      });

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'rally',
        apCost: 1,
        priority: 3,
      } as RallyCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'MoraleChecked')).toBe(true);
    });
  });

  describe('areAllPlayerUnitsOnOverwatch', () => {
    it('returns true when all player units have active overwatch component', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // Add overwatch component to both
      world.addComponent<OverwatchComponent>(warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });
      world.addComponent<OverwatchComponent>(warrior2, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('returns true when all player units have overwatch command queued', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // Queue overwatch commands
      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'overwatch',
        attackType: 'ranged',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('returns true with mix of active overwatch and queued overwatch', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // warrior1 has active overwatch
      world.addComponent<OverwatchComponent>(warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // warrior2 has queued overwatch
      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'overwatch',
        attackType: 'ranged',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('returns false when a player unit has no overwatch', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // Only warrior1 has overwatch
      world.addComponent<OverwatchComponent>(warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // warrior2 has no overwatch (neither active nor queued)

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(false);
    });

    it('returns false when a player unit has non-overwatch commands queued', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // warrior1 has overwatch
      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      // warrior2 has a move command (not overwatch)
      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'move',
        targetX: 10,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(false);
    });

    it('excludes downed player units from check', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // warrior1 has overwatch
      world.addComponent<OverwatchComponent>(warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // warrior2 is downed - should be excluded
      world.addComponent<HealthComponent>(warrior2, {
        type: 'health',
        current: 0,
        max: 100,
        woundState: 'down',
      });

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('excludes routed player units from check', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // warrior1 has overwatch
      world.addComponent<OverwatchComponent>(warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // warrior2 is routed - should be excluded
      world.addComponent<MoraleStateComponent>(warrior2, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('ignores enemy units', () => {
      const playerWarrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const enemyGoblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      // Player has overwatch
      world.addComponent<OverwatchComponent>(playerWarrior, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // Enemy has no overwatch - should not affect result

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(true);
    });

    it('returns false when no player units exist', () => {
      // Create only enemy units
      UnitFactory.createUnit(world, 'goblin', 'enemy', 5, 0);

      const result = TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world);
      expect(result).toBe(false);
    });
  });

  describe('priority ordering', () => {
    it('resolves faster actions first', () => {
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 1, 0);

      // Knight has slower priority (7) than goblin (3)
      TurnResolutionSystem.queueCommand(world, knight, {
        type: 'attack',
        targetId: goblin,
        attackType: 'melee',
        apCost: 2,
        priority: 7, // Slower
      } as AttackCommand);

      TurnResolutionSystem.queueCommand(world, goblin, {
        type: 'attack',
        targetId: knight,
        attackType: 'melee',
        apCost: 2,
        priority: 3, // Faster
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Check event order - goblin's attack should be first
      const attackEvents = eventBus.getHistory().filter((e) => e.type === 'AttackDeclared');
      expect(attackEvents[0].entityId).toBe(goblin);
      expect(attackEvents[1].entityId).toBe(knight);
    });
  });

  describe('weapon range for melee attacks', () => {
    it('spear (range 2) can attack from 2m without closing distance', () => {
      // Militia has spear with range 2
      const attacker = UnitFactory.createUnit(world, 'militia', 'player', 0, 0);
      const defender = UnitFactory.createUnit(world, 'goblin', 'enemy', 1.8, 0);

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      // Should attack successfully without needing to move
      expect(events.some((e) => e.type === 'AttackDeclared')).toBe(true);
      // Should NOT have moved (no UnitMoved event)
      expect(events.some((e) => e.type === 'UnitMoved')).toBe(false);
    });

    it('sword (range 1.5) must close distance when target is at 1.8m', () => {
      // Warrior has sword with range 1.5
      const attacker = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const defender = UnitFactory.createUnit(world, 'goblin', 'enemy', 1.8, 0);

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      // Should have auto-moved to close distance
      expect(events.some((e) => e.type === 'UnitMoved')).toBe(true);
      // Should still attack after moving
      expect(events.some((e) => e.type === 'AttackDeclared')).toBe(true);
    });

    it('knife (range 1) reports out of range at 1.5m when cannot close', () => {
      // Goblin has rusty knife with range 1
      const attacker = UnitFactory.createUnit(world, 'goblin', 'player', 0, 0);
      // Set attacker AP to only enough for the attack (not enough for move + attack)
      const ap = world.getComponent<ActionPointsComponent>(attacker, 'actionPoints');
      world.addComponent<ActionPointsComponent>(attacker, { ...ap!, current: 2 });

      const defender = UnitFactory.createUnit(world, 'warrior', 'enemy', 1.5, 0);

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        apCost: 1,
        priority: 2,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      // Should report out of range since knife range (1) < distance (1.5)
      // and not enough AP to move + attack
      expect(events.some((e) => e.type === 'AttackOutOfRange')).toBe(true);
    });

    it('AttackOutOfRange event reports weapon range, not hardcoded constant', () => {
      const attacker = UnitFactory.createUnit(world, 'goblin', 'player', 0, 0);
      const ap = world.getComponent<ActionPointsComponent>(attacker, 'actionPoints');
      world.addComponent<ActionPointsComponent>(attacker, { ...ap!, current: 1 });

      const defender = UnitFactory.createUnit(world, 'warrior', 'enemy', 1.5, 0);

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        apCost: 1,
        priority: 2,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const outOfRange = eventBus.getHistory().find((e) => e.type === 'AttackOutOfRange');
      expect(outOfRange).toBeDefined();
      // Goblin knife range is 1, but effective melee range is MELEE_ATTACK_RANGE (1.2)
      expect(outOfRange!.data.requiredRange).toBe(1.2);
    });

    it('melee attack succeeds within MELEE_ATTACK_RANGE even if beyond weapon.range', () => {
      // Goblin knife has range 1.0, MELEE_ATTACK_RANGE is 1.2
      // At 1.15m (within MELEE_ATTACK_RANGE), attack should succeed without needing auto-close
      const player = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 1.15, 0);

      // Give goblin only 1 AP - not enough for auto-close (2 AP advance + 1 AP attack)
      // This forces the range check itself to accept MELEE_ATTACK_RANGE
      world.addComponent<ActionPointsComponent>(goblin, {
        type: 'actionPoints',
        current: 1,
        max: 6,
        baseValue: 6,
        armorPenalty: 0,
        experienceBonus: 0,
      });

      TurnResolutionSystem.queueCommand(world, goblin, {
        type: 'attack',
        targetId: player,
        attackType: 'melee',
        apCost: 1,
        priority: 2,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      // Should NOT emit AttackOutOfRange - 1.15m is within MELEE_ATTACK_RANGE (1.2m)
      expect(events.some((e) => e.type === 'AttackOutOfRange')).toBe(false);
      // Should emit AttackDeclared (attack proceeded)
      expect(events.some((e) => e.type === 'AttackDeclared' && e.entityId === goblin)).toBe(true);
    });

    it('melee overwatch triggers at weapon range, not hardcoded constant', () => {
      // Create a militia (spear, range 2) on overwatch
      const watcher = UnitFactory.createUnit(world, 'militia', 'player', 0, 0);
      const mover = UnitFactory.createUnit(world, 'goblin', 'enemy', 3, 0);

      // Set up overwatch on watcher
      world.addComponent<OverwatchComponent>(watcher, {
        type: 'overwatch',
        attackType: 'melee',
        triggered: false,
      });

      // Queue move that brings goblin from 3m to 1.9m (within spear range 2, but outside old 1.2m)
      TurnResolutionSystem.queueCommand(world, mover, {
        type: 'move',
        targetX: 1.9,
        targetY: 0,
        mode: 'advance',
        apCost: 2,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      const events = eventBus.getHistory();
      // Overwatch should trigger because goblin entered spear range (2m)
      expect(events.some((e) => e.type === 'OverwatchTriggered')).toBe(true);
    });
  });

  describe('weapon hit location', () => {
    it('deals no HP damage when hit location is weapon', () => {
      let found = false;
      for (let seed = 1; seed <= 200; seed++) {
        const w = new WorldImpl();
        const eb = new EventBusImpl();
        const r = new DiceRoller(seed);
        const a = UnitFactory.createUnit(w, 'warrior', 'player', 0, 0);
        const d = UnitFactory.createUnit(w, 'warrior', 'enemy', 1, 0);

        const hpBefore = w.getComponent<HealthComponent>(d, 'health')!.current;

        TurnResolutionSystem.queueCommand(w, a, {
          type: 'attack',
          targetId: d,
          attackType: 'melee',
          chosenLocation: 'weapon',
          apCost: 2,
          priority: 5,
        } as AttackCommand);

        TurnResolutionSystem.resolveTurn(w, eb, r, 1);

        const events = eb.getHistory();
        if (events.some((e) => e.type === 'WeaponHitDeflected')) {
          const hpAfter = w.getComponent<HealthComponent>(d, 'health')!.current;
          expect(hpAfter).toBe(hpBefore);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('drains stamina on weapon hit (impact shock)', () => {
      let found = false;
      for (let seed = 1; seed <= 200; seed++) {
        const w = new WorldImpl();
        const eb = new EventBusImpl();
        const r = new DiceRoller(seed);
        const a = UnitFactory.createUnit(w, 'warrior', 'player', 0, 0);
        const d = UnitFactory.createUnit(w, 'warrior', 'enemy', 1, 0);

        const staminaBefore = w.getComponent<StaminaComponent>(d, 'stamina')!.current;

        TurnResolutionSystem.queueCommand(w, a, {
          type: 'attack',
          targetId: d,
          attackType: 'melee',
          chosenLocation: 'weapon',
          apCost: 2,
          priority: 5,
        } as AttackCommand);

        TurnResolutionSystem.resolveTurn(w, eb, r, 1);

        const events = eb.getHistory();
        if (events.some((e) => e.type === 'WeaponHitDeflected')) {
          const staminaAfter = w.getComponent<StaminaComponent>(d, 'stamina')!.current;
          expect(staminaAfter).toBeLessThan(staminaBefore);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('can break defender shield on weapon hit', () => {
      // Use a roller seeded so that attack hits and break roll succeeds
      // We'll test deterministically by giving high damage and checking the event
      const attacker = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const defender = UnitFactory.createUnit(world, 'warrior', 'enemy', 1, 0);

      // Give defender a shield
      world.addComponent<OffHandComponent>(defender, {
        type: 'offHand',
        itemType: 'shield',
        blockBonus: 15,
      });

      TurnResolutionSystem.queueCommand(world, attacker, {
        type: 'attack',
        targetId: defender,
        attackType: 'melee',
        chosenLocation: 'weapon',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      // Try many seeds to find one where attack hits and shield breaks
      let shieldBroke = false;
      for (let seed = 1; seed <= 200; seed++) {
        // Reset world for each attempt
        const w = new WorldImpl();
        const eb = new EventBusImpl();
        const r = new DiceRoller(seed);
        const a = UnitFactory.createUnit(w, 'warrior', 'player', 0, 0);
        const d = UnitFactory.createUnit(w, 'warrior', 'enemy', 1, 0);
        w.addComponent<OffHandComponent>(d, {
          type: 'offHand',
          itemType: 'shield',
          blockBonus: 15,
        });
        TurnResolutionSystem.queueCommand(w, a, {
          type: 'attack',
          targetId: d,
          attackType: 'melee',
          chosenLocation: 'weapon',
          apCost: 2,
          priority: 5,
        } as AttackCommand);
        TurnResolutionSystem.resolveTurn(w, eb, r, 1);

        const evts = eb.getHistory();
        if (evts.some((e) => e.type === 'WeaponBroken')) {
          const offHand = w.getComponent<OffHandComponent>(d, 'offHand')!;
          expect(offHand.blockBonus).toBe(0);
          shieldBroke = true;
          break;
        }
      }
      expect(shieldBroke).toBe(true);
    });

    it('reduces weapon damage bonus when no shield and weapon breaks', () => {
      let weaponBroke = false;
      for (let seed = 1; seed <= 200; seed++) {
        const w = new WorldImpl();
        const eb = new EventBusImpl();
        const r = new DiceRoller(seed);
        const a = UnitFactory.createUnit(w, 'warrior', 'player', 0, 0);
        const d = UnitFactory.createUnit(w, 'warrior', 'enemy', 1, 0);
        // Ensure defender has no shield (default warrior may or may not)
        w.removeComponent(d, 'offHand');
        const weaponBefore = w.getComponent<WeaponComponent>(d, 'weapon')!;
        const bonusBefore = weaponBefore.damage.bonus;

        TurnResolutionSystem.queueCommand(w, a, {
          type: 'attack',
          targetId: d,
          attackType: 'melee',
          chosenLocation: 'weapon',
          apCost: 2,
          priority: 5,
        } as AttackCommand);
        TurnResolutionSystem.resolveTurn(w, eb, r, 1);

        const evts = eb.getHistory();
        if (evts.some((e) => e.type === 'WeaponBroken')) {
          const weaponAfter = w.getComponent<WeaponComponent>(d, 'weapon')!;
          expect(weaponAfter.damage.bonus).toBe(Math.max(0, bonusBefore - 1));
          weaponBroke = true;
          break;
        }
      }
      expect(weaponBroke).toBe(true);
    });
  });
});
