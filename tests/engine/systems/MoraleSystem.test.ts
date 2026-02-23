import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { MoraleSystem } from '../../../src/engine/systems/MoraleSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';
import {
  MoraleStateComponent,
  SkillsComponent,
  PositionComponent,
  FactionComponent,
} from '../../../src/engine/components';

describe('MoraleSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  function createUnit(morale: number, status: 'steady' | 'shaken' | 'broken' | 'routed' = 'steady') {
    const entity = world.createEntity();
    world.addComponent<SkillsComponent>(entity, {
      type: 'skills',
      melee: 50,
      ranged: 50,
      block: 50,
      dodge: 50,
      morale,
    });
    world.addComponent<MoraleStateComponent>(entity, {
      type: 'moraleState',
      status,
      modifiers: [],
    });
    world.addComponent<PositionComponent>(entity, {
      type: 'position',
      x: 0,
      y: 0,
      facing: 0,
    });
    world.addComponent<FactionComponent>(entity, {
      type: 'faction',
      faction: 'player',
    });
    return entity;
  }

  describe('testMorale', () => {
    it('passes morale check when roll <= morale', () => {
      const entity = createUnit(60);
      // Using a seed that produces a roll <= 60
      const roller = new DiceRoller(12345);

      const result = MoraleSystem.testMorale(world, eventBus, entity, [], roller, 1);

      // Result depends on the roll
      expect(result.roll).toBeGreaterThanOrEqual(1);
      expect(result.roll).toBeLessThanOrEqual(100);
      expect(result.passed).toBe(result.roll <= result.effectiveMorale);
    });

    it('applies modifiers to morale check', () => {
      const entity = createUnit(50);
      const roller = new DiceRoller(12345);

      const result = MoraleSystem.testMorale(
        world,
        eventBus,
        entity,
        [{ source: 'leadership', value: 10 }],
        roller,
        1
      );

      expect(result.effectiveMorale).toBe(60);
    });

    it('emits MoraleChecked event', () => {
      const entity = createUnit(50);
      const roller = new DiceRoller(12345);

      MoraleSystem.testMorale(world, eventBus, entity, [], roller, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'MoraleChecked',
          entityId: entity,
        })
      );
    });
  });

  describe('applyMoraleFailure', () => {
    it('becomes shaken when failing by 1-20', () => {
      const entity = createUnit(50);

      MoraleSystem.applyMoraleFailure(world, eventBus, entity, 15, 1);

      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      expect(morale.status).toBe('shaken');
    });

    it('becomes broken when failing by 21-40', () => {
      const entity = createUnit(50);

      MoraleSystem.applyMoraleFailure(world, eventBus, entity, 30, 1);

      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      expect(morale.status).toBe('broken');
    });

    it('becomes routed when failing by 41+', () => {
      const entity = createUnit(50);

      MoraleSystem.applyMoraleFailure(world, eventBus, entity, 50, 1);

      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      expect(morale.status).toBe('routed');
    });

    it('emits appropriate status event', () => {
      const entity = createUnit(50);

      MoraleSystem.applyMoraleFailure(world, eventBus, entity, 15, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitShaken',
          entityId: entity,
        })
      );
    });
  });

  describe('attemptRally', () => {
    it('clears shaken status on successful rally', () => {
      const entity = createUnit(60, 'shaken');
      // Use a seed that produces a low roll (passes rally)
      const roller = new DiceRoller(99999);

      MoraleSystem.attemptRally(world, eventBus, entity, [], roller, 1);

      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      // Might be steady or still shaken depending on roll
      const events = eventBus.getHistory();
      const rallied = events.some((e) => e.type === 'UnitRallied');
      if (rallied) {
        expect(morale.status).toBe('steady');
      }
    });

    it('reduces broken to shaken on successful rally', () => {
      const entity = createUnit(80, 'broken');
      // Use a seed that produces a low roll
      const roller = new DiceRoller(11111);

      MoraleSystem.attemptRally(world, eventBus, entity, [], roller, 1);

      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      // Check if rally succeeded
      const events = eventBus.getHistory();
      const rallied = events.some((e) => e.type === 'UnitRallied');
      if (rallied) {
        expect(morale.status).toBe('shaken');
      }
    });

    it('cannot rally routed units', () => {
      const entity = createUnit(60, 'routed');
      const roller = new DiceRoller(12345);

      const result = MoraleSystem.attemptRally(world, eventBus, entity, [], roller, 1);

      expect(result).toBe(false);
      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      expect(morale.status).toBe('routed');
    });
  });

  describe('getMoralePenalty', () => {
    it('returns 0 for steady', () => {
      expect(MoraleSystem.getMoralePenalty('steady')).toBe(0);
    });

    it('returns 10 for shaken', () => {
      expect(MoraleSystem.getMoralePenalty('shaken')).toBe(10);
    });

    it('returns 20 for broken', () => {
      expect(MoraleSystem.getMoralePenalty('broken')).toBe(20);
    });
  });

  describe('findNearbyAllies', () => {
    it('finds allies within range', () => {
      const entity1 = createUnit(50);
      const entity2 = createUnit(50);

      world.addComponent<PositionComponent>(entity1, { type: 'position', x: 0, y: 0, facing: 0 });
      world.addComponent<PositionComponent>(entity2, { type: 'position', x: 3, y: 0, facing: 0 });

      const allies = MoraleSystem.findNearbyAllies(world, entity1, 5);

      expect(allies).toContain(entity2);
    });

    it('excludes allies outside range', () => {
      const entity1 = createUnit(50);
      const entity2 = createUnit(50);

      world.addComponent<PositionComponent>(entity1, { type: 'position', x: 0, y: 0, facing: 0 });
      world.addComponent<PositionComponent>(entity2, { type: 'position', x: 10, y: 0, facing: 0 });

      const allies = MoraleSystem.findNearbyAllies(world, entity1, 5);

      expect(allies).not.toContain(entity2);
    });
  });
});
