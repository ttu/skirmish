import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { DamageSystem } from '../../../src/engine/systems/DamageSystem';
import { HealthComponent, calculateWoundState } from '../../../src/engine/components';
import { EventBusImpl } from '../../../src/engine/core/EventBus';

describe('DamageSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  describe('applyDamage', () => {
    it('reduces health by damage amount', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 25, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.current).toBe(75);
    });

    it('updates wound state when damaged', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 30, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.woundState).toBe('bloodied'); // 70% HP
    });

    it('sets unit to down when HP reaches 0', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 20,
        max: 100,
        woundState: 'critical',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 25, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.current).toBe(0);
      expect(health.woundState).toBe('down');
    });

    it('emits DamageDealt event', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 15, 'arms', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'DamageDealt',
          entityId: entity,
          data: expect.objectContaining({
            damage: 15,
            location: 'arms',
          }),
        })
      );
    });

    it('emits UnitDown event when unit goes down', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 10,
        max: 100,
        woundState: 'critical',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 15, 'torso', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitDown',
          entityId: entity,
        })
      );
    });

    it('emits UnitWounded event on wound state change', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 60, 'torso', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitWounded',
          entityId: entity,
          data: expect.objectContaining({
            newState: 'wounded',
          }),
        })
      );
    });
  });

  describe('calculateWoundState', () => {
    it('returns healthy for > 75%', () => {
      expect(calculateWoundState(80, 100)).toBe('healthy');
    });

    it('returns bloodied for 51-75%', () => {
      expect(calculateWoundState(75, 100)).toBe('bloodied');
      expect(calculateWoundState(51, 100)).toBe('bloodied');
    });

    it('returns wounded for 26-50%', () => {
      expect(calculateWoundState(50, 100)).toBe('wounded');
      expect(calculateWoundState(26, 100)).toBe('wounded');
    });

    it('returns critical for 1-25%', () => {
      expect(calculateWoundState(25, 100)).toBe('critical');
      expect(calculateWoundState(1, 100)).toBe('critical');
    });

    it('returns down for 0 or less', () => {
      expect(calculateWoundState(0, 100)).toBe('down');
      expect(calculateWoundState(-5, 100)).toBe('down');
    });
  });
});
