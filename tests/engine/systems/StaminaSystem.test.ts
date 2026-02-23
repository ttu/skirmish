import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { StaminaSystem } from '../../../src/engine/systems/StaminaSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { StaminaComponent, ActionPointsComponent } from '../../../src/engine/components';

describe('StaminaSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  function createUnit(stamina: number, exhausted: boolean = false) {
    const entity = world.createEntity();
    world.addComponent<StaminaComponent>(entity, {
      type: 'stamina',
      current: stamina,
      max: 10,
      exhausted,
    });
    world.addComponent<ActionPointsComponent>(entity, {
      type: 'actionPoints',
      current: 5,
      max: 5,
      baseValue: 5,
      armorPenalty: 0,
      experienceBonus: 0,
    });
    return entity;
  }

  describe('drainStamina', () => {
    it('reduces stamina by amount', () => {
      const entity = createUnit(10);

      StaminaSystem.drainStamina(world, eventBus, entity, 3, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(7);
    });

    it('sets exhausted when stamina reaches 0', () => {
      const entity = createUnit(2);

      StaminaSystem.drainStamina(world, eventBus, entity, 5, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(0);
      expect(stamina.exhausted).toBe(true);
    });

    it('emits StaminaDrained event', () => {
      const entity = createUnit(10);

      StaminaSystem.drainStamina(world, eventBus, entity, 3, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'StaminaDrained',
          entityId: entity,
        })
      );
    });

    it('emits Exhausted event when becoming exhausted', () => {
      const entity = createUnit(2);

      StaminaSystem.drainStamina(world, eventBus, entity, 5, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'Exhausted',
          entityId: entity,
        })
      );
    });
  });

  describe('recoverStamina', () => {
    it('recovers 3 stamina when not hit this turn', () => {
      const entity = createUnit(5);

      StaminaSystem.recoverStamina(world, entity, false);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(8);
    });

    it('recovers 1 stamina when hit this turn', () => {
      const entity = createUnit(5);

      StaminaSystem.recoverStamina(world, entity, true);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(6);
    });

    it('defaults to unhit recovery when wasHit not specified', () => {
      const entity = createUnit(5);

      StaminaSystem.recoverStamina(world, entity);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(8);
    });

    it('does not exceed max stamina', () => {
      const entity = createUnit(9);

      StaminaSystem.recoverStamina(world, entity, false);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(10);
    });

    it('clears exhausted when stamina recovered', () => {
      const entity = createUnit(0, true);

      StaminaSystem.recoverStamina(world, entity, false);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(3);
      expect(stamina.exhausted).toBe(false);
    });

    it('clears exhausted even with only 1 recovery when hit', () => {
      const entity = createUnit(0, true);

      StaminaSystem.recoverStamina(world, entity, true);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(1);
      expect(stamina.exhausted).toBe(false);
    });
  });

  describe('getStaminaDefensePenalty', () => {
    it('returns 0 at 75-100% stamina', () => {
      const entity = createUnit(10); // 100%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(0);

      const entity2 = createUnit(8); // 80%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(0);
    });

    it('returns -10 at 50-74% stamina', () => {
      const entity = createUnit(7); // 70%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-10);

      const entity2 = createUnit(5); // 50%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-10);
    });

    it('returns -20 at 25-49% stamina', () => {
      const entity = createUnit(4); // 40%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-20);

      const entity2 = createUnit(3); // 30%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-20);
    });

    it('returns -30 at 1-24% stamina', () => {
      const entity = createUnit(2); // 20%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-30);

      const entity2 = createUnit(1); // 10%
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-30);
    });

    it('returns -40 when exhausted (0 stamina)', () => {
      const entity = createUnit(0, true);
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-40);
    });

    it('returns 0 when entity has no stamina component', () => {
      const entity = world.createEntity();
      expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(0);
    });
  });

  describe('calculateArmorStaminaDrain', () => {
    it('drains half of absorbed damage rounded up', () => {
      expect(StaminaSystem.calculateArmorStaminaDrain(8)).toBe(4);
      expect(StaminaSystem.calculateArmorStaminaDrain(5)).toBe(3);
      expect(StaminaSystem.calculateArmorStaminaDrain(1)).toBe(1);
    });

    it('returns 0 when no damage absorbed', () => {
      expect(StaminaSystem.calculateArmorStaminaDrain(0)).toBe(0);
    });
  });

  describe('applyArmorStaminaDrain', () => {
    it('drains stamina based on absorbed damage', () => {
      const entity = createUnit(10);
      StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 8, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(6); // 10 - ceil(8/2) = 6
    });

    it('emits ArmorImpact event', () => {
      const entity = createUnit(10);
      StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 6, 1);

      const events = eventBus.getHistory().filter(e => e.type === 'ArmorImpact');
      expect(events).toHaveLength(1);
      expect(events[0].entityId).toBe(entity);
      expect(events[0].data.staminaDrain).toBe(3);
      expect(events[0].data.absorbed).toBe(6);
    });

    it('does nothing when absorbed is 0', () => {
      const entity = createUnit(10);
      StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 0, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(10);
    });

    it('can cause exhaustion from armor drain', () => {
      const entity = createUnit(1);
      StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 6, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.exhausted).toBe(true);
    });
  });

  describe('applyExhaustionPenalty', () => {
    it('reduces max AP by 1 when exhausted', () => {
      const entity = createUnit(0, true);

      StaminaSystem.applyExhaustionPenalty(world, entity);

      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.max).toBe(4); // 5 - 1 = 4
    });

    it('does not reduce AP when not exhausted', () => {
      const entity = createUnit(5);

      StaminaSystem.applyExhaustionPenalty(world, entity);

      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.max).toBe(5);
    });
  });
});
