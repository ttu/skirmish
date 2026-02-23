import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { EventBusImpl } from '../../src/engine/core/EventBus';
import { DiceRoller } from '../../src/engine/core/DiceRoller';
import { GameEngine } from '../../src/engine/core/GameEngine';
import { UnitFactory } from '../../src/engine/data/UnitFactory';
import { TurnResolutionSystem } from '../../src/engine/systems/TurnResolutionSystem';
import { AICommandSystem } from '../../src/engine/systems/AICommandSystem';
import { MovementSystem } from '../../src/engine/systems/MovementSystem';
import {
  MoveCommand,
  AttackCommand,
  RallyCommand,
  OverwatchCommand,
  PositionComponent,
  HealthComponent,
  ActionPointsComponent,
  StaminaComponent,
  MoraleStateComponent,
  AmmoComponent,
} from '../../src/engine/components';
import { scenarios } from '../../src/data/scenarios';

describe('Full Turn Integration', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;
  let roller: DiceRoller;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
    roller = new DiceRoller(42); // Fixed seed for reproducibility
  });

  describe('Basic Turn Sequence', () => {
    it('completes a full turn with multiple units', () => {
      // Setup: 2 player warriors vs 2 enemy goblins (warrior2 at 5,0 so >1.5 from warrior1's dest (3,0) to avoid engagement)
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);
      const goblin1 = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 0);
      const goblin2 = UnitFactory.createUnit(world, 'goblin', 'enemy', 10, 2);

      // Planning Phase: Queue commands
      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'move',
        targetX: 5,
        targetY: 0,
        mode: 'advance',
        apCost: 2,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'move',
        targetX: 5,
        targetY: 2,
        mode: 'run',
        apCost: 4,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.queueCommand(world, goblin1, {
        type: 'move',
        targetX: 7,
        targetY: 0,
        mode: 'run',
        apCost: 4,
        priority: 3, // Goblins are faster
      } as MoveCommand);

      TurnResolutionSystem.queueCommand(world, goblin2, {
        type: 'move',
        targetX: 7,
        targetY: 2,
        mode: 'run',
        apCost: 4,
        priority: 3,
      } as MoveCommand);

      // Resolution Phase
      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Verify turn resolved
      expect(result.actionsResolved).toBe(4);
      expect(result.entitiesActed).toHaveLength(4);

      // Verify all units moved
      const pos1 = world.getComponent<PositionComponent>(warrior1, 'position')!;
      const pos2 = world.getComponent<PositionComponent>(warrior2, 'position')!;
      const gpos1 = world.getComponent<PositionComponent>(goblin1, 'position')!;
      const gpos2 = world.getComponent<PositionComponent>(goblin2, 'position')!;

      expect(pos1.x).toBeGreaterThan(0);
      expect(pos2.x).toBeGreaterThanOrEqual(5);
      expect(pos2.y).toBeGreaterThan(0); // moved toward (5,2)
      expect(gpos1.x).toBeLessThan(10);
      expect(gpos2.x).toBeLessThan(10);

      // Verify AP was reset at end of turn
      const ap1 = world.getComponent<ActionPointsComponent>(warrior1, 'actionPoints')!;
      expect(ap1.current).toBe(ap1.max);

      // Verify events were emitted
      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'ResolutionPhaseStarted')).toBe(true);
      expect(events.some((e) => e.type === 'UnitMoved')).toBe(true);
      expect(events.some((e) => e.type === 'TurnEnded')).toBe(true);
    });
  });

  describe('Combat Turn Sequence', () => {
    it('resolves melee combat between adjacent units', () => {
      // Setup: Knight vs Orc Warrior in melee range
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const orc = UnitFactory.createUnit(world, 'orc_warrior', 'enemy', 1, 0);

      const orcHealthBefore = world.getComponent<HealthComponent>(orc, 'health')!.current;

      // Knight attacks orc
      TurnResolutionSystem.queueCommand(world, knight, {
        type: 'attack',
        targetId: orc,
        attackType: 'melee',
        apCost: 2,
        priority: 6, // Knight's longsword speed
      } as AttackCommand);

      // Orc attacks knight
      TurnResolutionSystem.queueCommand(world, orc, {
        type: 'attack',
        targetId: knight,
        attackType: 'melee',
        apCost: 2,
        priority: 6, // Cleaver speed
      } as AttackCommand);

      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      expect(result.actionsResolved).toBe(2);

      // Verify combat events
      const events = eventBus.getHistory();
      expect(events.filter((e) => e.type === 'AttackDeclared').length).toBe(2);
      expect(events.filter((e) => e.type === 'AttackRolled').length).toBe(2);
    });

    it('resolves ranged combat', () => {
      // Setup: Archer at range vs Goblin
      const archer = UnitFactory.createUnit(world, 'archer', 'player', 0, 0);
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 15, 0);

      const ammoBefore = world.getComponent<AmmoComponent>(archer, 'ammo')!;
      const initialArrowCount = ammoBefore.slots[0].quantity;

      // Archer shoots goblin
      TurnResolutionSystem.queueCommand(world, archer, {
        type: 'attack',
        targetId: goblin,
        attackType: 'ranged',
        apCost: 2,
        priority: 4, // Bow speed
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Verify ammo was consumed
      const ammoAfter = world.getComponent<AmmoComponent>(archer, 'ammo')!;
      expect(ammoAfter.slots[0].quantity).toBe(initialArrowCount - 1);

      // Verify ranged attack events
      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'AmmoSpent')).toBe(true);
    });
  });

  describe('Morale and Rally', () => {
    it('allows shaken units to attempt rally', () => {
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
        priority: 2,
      } as RallyCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Verify morale check was performed
      const events = eventBus.getHistory();
      expect(events.some((e) => e.type === 'MoraleChecked')).toBe(true);
    });

    it('routed units cannot act', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Make warrior routed
      world.addComponent<MoraleStateComponent>(warrior, {
        type: 'moraleState',
        status: 'routed',
        modifiers: [],
      });

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 5,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      const result = TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Routed unit should not have acted
      expect(result.actionsResolved).toBe(0);
      expect(result.entitiesActed).toHaveLength(0);
    });
  });

  describe('Multi-Turn Scenario', () => {
    it('simulates multiple turns of combat', () => {
      // Setup: Simple 1v1
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const troll = UnitFactory.createUnit(world, 'troll', 'enemy', 3, 0);

      const turns: { knightHealth: number; trollHealth: number }[] = [];

      // Simulate 5 turns
      for (let turn = 1; turn <= 5; turn++) {
        // Knight and troll attack each other
        TurnResolutionSystem.queueCommand(world, knight, {
          type: 'attack',
          targetId: troll,
          attackType: 'melee',
          apCost: 2,
          priority: 6,
        } as AttackCommand);

        TurnResolutionSystem.queueCommand(world, troll, {
          type: 'attack',
          targetId: knight,
          attackType: 'melee',
          apCost: 2,
          priority: 7,
        } as AttackCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);

        const knightHealth = world.getComponent<HealthComponent>(knight, 'health')!;
        const trollHealth = world.getComponent<HealthComponent>(troll, 'health')!;

        turns.push({
          knightHealth: knightHealth.current,
          trollHealth: trollHealth.current,
        });

        // Check if either combatant is down
        if (knightHealth.woundState === 'down' || trollHealth.woundState === 'down') {
          break;
        }
      }

      // Verify multiple turns occurred
      expect(turns.length).toBeGreaterThan(0);

      // Verify AP was reset each turn (by checking it's at max at end of test)
      const knightAP = world.getComponent<ActionPointsComponent>(knight, 'actionPoints')!;
      expect(knightAP.current).toBe(knightAP.max);
    });
  });

  describe('Speed-Based Priority', () => {
    it('faster weapons strike first', () => {
      // Goblin with fast knife vs Knight with slow longsword
      const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 1, 0);

      TurnResolutionSystem.queueCommand(world, goblin, {
        type: 'attack',
        targetId: knight,
        attackType: 'melee',
        apCost: 1,
        priority: 2, // Rusty knife speed
      } as AttackCommand);

      TurnResolutionSystem.queueCommand(world, knight, {
        type: 'attack',
        targetId: goblin,
        attackType: 'melee',
        apCost: 2,
        priority: 6, // Longsword speed
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Verify goblin attacked first
      const attackEvents = eventBus.getHistory().filter((e) => e.type === 'AttackDeclared');
      expect(attackEvents[0].entityId).toBe(goblin);
      expect(attackEvents[1].entityId).toBe(knight);
    });
  });

  describe('Resource Management', () => {
    it('tracks stamina across turns', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const staminaMax = world.getComponent<StaminaComponent>(warrior, 'stamina')!.max;

      // Turn 1: Sprint (costs 3 stamina, recover 3 unhit = net 0)
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 10,
        targetY: 0,
        mode: 'sprint',
        apCost: 4,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      let stamina = world.getComponent<StaminaComponent>(warrior, 'stamina')!;
      expect(stamina.current).toBe(staminaMax); // 3 drained, 3 recovered (unhit)

      // Turn 2: Sprint again
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 20,
        targetY: 0,
        mode: 'sprint',
        apCost: 4,
        priority: 5,
      } as MoveCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 2);

      stamina = world.getComponent<StaminaComponent>(warrior, 'stamina')!;
      expect(stamina.current).toBe(staminaMax); // Net 0 again
    });

    it('archer runs out of ammo over multiple turns', () => {
      const archer = UnitFactory.createUnit(world, 'archer', 'player', 0, 0);
      const target = UnitFactory.createUnit(world, 'goblin', 'enemy', 15, 0);

      const initialAmmo = world.getComponent<AmmoComponent>(archer, 'ammo')!.slots[0].quantity;

      // Fire arrows until empty
      for (let turn = 1; turn <= initialAmmo + 2; turn++) {
        TurnResolutionSystem.queueCommand(world, archer, {
          type: 'attack',
          targetId: target,
          attackType: 'ranged',
          apCost: 2,
          priority: 4,
        } as AttackCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn);

        const ammo = world.getComponent<AmmoComponent>(archer, 'ammo')!;
        if (ammo.slots[0].quantity === 0) break;
      }

      const finalAmmo = world.getComponent<AmmoComponent>(archer, 'ammo')!;
      expect(finalAmmo.slots[0].quantity).toBe(0);
    });
  });

  describe('Overwatch Auto-Resolve Detection', () => {
    it('detects when all player units are on overwatch', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);
      UnitFactory.createUnit(world, 'goblin', 'enemy', 15, 0);

      // Both player units set overwatch
      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      // Should detect all player units are on overwatch
      expect(TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world)).toBe(true);
    });

    it('does not trigger auto-resolve when a player unit has other commands', () => {
      const warrior1 = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const warrior2 = UnitFactory.createUnit(world, 'warrior', 'player', 5, 0);

      // Only warrior1 sets overwatch
      TurnResolutionSystem.queueCommand(world, warrior1, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      // warrior2 has a move command
      TurnResolutionSystem.queueCommand(world, warrior2, {
        type: 'move',
        targetX: 10,
        targetY: 0,
        mode: 'walk',
        apCost: 1,
        priority: 5,
      } as MoveCommand);

      expect(TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world)).toBe(false);
    });

    it('resolves overwatch commands and emits OverwatchSet event', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      UnitFactory.createUnit(world, 'goblin', 'enemy', 15, 0);

      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'overwatch',
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as OverwatchCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, roller, 1);

      // Verify OverwatchSet event was emitted during resolution
      // (Note: overwatch component is cleared at end of turn, so we check via event)
      const events = eventBus.getHistory();
      const overwatchEvent = events.find((e) => e.type === 'OverwatchSet');
      expect(overwatchEvent).toBeDefined();
      expect(overwatchEvent!.entityId).toBe(warrior);
      expect(overwatchEvent!.data.attackType).toBe('melee');
    });
  });

  describe('Scenario Turn Resolution (with pathfinding)', () => {
    it('resolves a full turn with loaded scenario and AI pathfinding', () => {
      const engine = new GameEngine({ seed: 42 });
      const scenario = scenarios.find(s => s.id === 'quick_skirmish')!;
      const loaded = engine.loadScenario(scenario);
      const world = engine.getWorld();

      // Queue a player move command
      const playerId = loaded.playerUnitIds[0];
      const pos = world.getComponent<PositionComponent>(playerId, 'position')!;
      const baseSpeed = UnitFactory.getBaseSpeed(world, playerId);
      const mode = 'advance' as const;
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
      const dest = MovementSystem.getClampedDestination(
        world, playerId, pos.x, pos.y, pos.x + 3, pos.y,
        loaded.mapSize, maxDist
      );
      const apCost = MovementSystem.getMovementApCost(
        pos.x, pos.y, dest.x, dest.y, mode, baseSpeed
      );
      engine.queueCommand(playerId, {
        type: 'move', targetX: dest.x, targetY: dest.y, mode, apCost, priority: 2,
      } as MoveCommand);

      // AI generates commands with mapSize (triggers pathfinding)
      AICommandSystem.generateCommands(world, engine.getEventBus(), 'enemy', loaded.mapSize);

      // Resolve turn through the engine (passes mapSize to TurnResolutionSystem)
      engine.endPlanningPhase();
      engine.resolvePhase();

      // Player unit should have moved
      const posAfter = world.getComponent<PositionComponent>(playerId, 'position')!;
      expect(posAfter.x).not.toBe(pos.x);

      // At least one enemy should have moved
      const enemyMoved = loaded.enemyUnitIds.some(id => {
        const ePos = world.getComponent<PositionComponent>(id, 'position');
        const scenario_unit = scenario.enemyUnits.find((_, idx) => loaded.enemyUnitIds[idx] === id);
        return ePos && scenario_unit && (
          ePos.x !== scenario_unit.position.x || ePos.y !== scenario_unit.position.z
        );
      });
      expect(enemyMoved).toBe(true);
    });
  });

  describe('Snapshot and Replay', () => {
    it('deterministic combat with same seed produces same results', () => {
      function runScenario(seed: number): { finalHealth: number; events: number } {
        const w = new WorldImpl();
        const eb = new EventBusImpl();
        const r = new DiceRoller(seed);

        const attacker = UnitFactory.createUnit(w, 'warrior', 'player', 0, 0);
        const defender = UnitFactory.createUnit(w, 'goblin', 'enemy', 1, 0);

        TurnResolutionSystem.queueCommand(w, attacker, {
          type: 'attack',
          targetId: defender,
          attackType: 'melee',
          apCost: 2,
          priority: 5,
        } as AttackCommand);

        TurnResolutionSystem.resolveTurn(w, eb, r, 1);

        return {
          finalHealth: w.getComponent<HealthComponent>(defender, 'health')!.current,
          events: eb.getHistory().length,
        };
      }

      const run1 = runScenario(12345);
      const run2 = runScenario(12345);

      expect(run1.finalHealth).toBe(run2.finalHealth);
      expect(run1.events).toBe(run2.events);

      // Different seed should produce different results (with high probability)
      const run3 = runScenario(54321);
      // We can't guarantee different results, but track that the system works
      expect(run3.events).toBeGreaterThan(0);
    });
  });
});
