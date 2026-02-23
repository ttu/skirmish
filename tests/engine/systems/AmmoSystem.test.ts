import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { AmmoSystem } from '../../../src/engine/systems/AmmoSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { AmmoComponent } from '../../../src/engine/components';

describe('AmmoSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  function createArcher() {
    const entity = world.createEntity();
    world.addComponent<AmmoComponent>(entity, {
      type: 'ammo',
      slots: [
        { ammoType: 'standard', quantity: 12, maxQuantity: 12, armorPiercing: 0, damageBonus: 0 },
        { ammoType: 'bodkin', quantity: 6, maxQuantity: 6, armorPiercing: 2, damageBonus: 0 },
        { ammoType: 'broadhead', quantity: 6, maxQuantity: 6, armorPiercing: -2, damageBonus: 3 },
      ],
      currentSlot: 0,
    });
    return entity;
  }

  describe('consumeAmmo', () => {
    it('reduces ammo by 1', () => {
      const entity = createArcher();

      AmmoSystem.consumeAmmo(world, eventBus, entity, 1);

      const ammo = world.getComponent<AmmoComponent>(entity, 'ammo')!;
      expect(ammo.slots[0].quantity).toBe(11);
    });

    it('emits AmmoSpent event', () => {
      const entity = createArcher();

      AmmoSystem.consumeAmmo(world, eventBus, entity, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'AmmoSpent',
          entityId: entity,
          data: expect.objectContaining({
            ammoType: 'standard',
            remaining: 11,
          }),
        })
      );
    });

    it('returns false when out of ammo', () => {
      const entity = world.createEntity();
      world.addComponent<AmmoComponent>(entity, {
        type: 'ammo',
        slots: [{ ammoType: 'standard', quantity: 0, maxQuantity: 12, armorPiercing: 0, damageBonus: 0 }],
        currentSlot: 0,
      });

      const result = AmmoSystem.consumeAmmo(world, eventBus, entity, 1);

      expect(result).toBe(false);
    });
  });

  describe('switchAmmoType', () => {
    it('switches to different ammo slot', () => {
      const entity = createArcher();

      AmmoSystem.switchAmmoSlot(world, entity, 1);

      const ammo = world.getComponent<AmmoComponent>(entity, 'ammo')!;
      expect(ammo.currentSlot).toBe(1);
    });

    it('does not switch to invalid slot', () => {
      const entity = createArcher();

      AmmoSystem.switchAmmoSlot(world, entity, 99);

      const ammo = world.getComponent<AmmoComponent>(entity, 'ammo')!;
      expect(ammo.currentSlot).toBe(0);
    });
  });

  describe('getCurrentAmmoStats', () => {
    it('returns current ammo slot stats', () => {
      const entity = createArcher();

      const stats = AmmoSystem.getCurrentAmmoStats(world, entity);

      expect(stats).toEqual({
        ammoType: 'standard',
        quantity: 12,
        armorPiercing: 0,
        damageBonus: 0,
      });
    });

    it('returns bodkin stats when switched', () => {
      const entity = createArcher();
      AmmoSystem.switchAmmoSlot(world, entity, 1);

      const stats = AmmoSystem.getCurrentAmmoStats(world, entity);

      expect(stats).toEqual({
        ammoType: 'bodkin',
        quantity: 6,
        armorPiercing: 2,
        damageBonus: 0,
      });
    });
  });

  describe('hasAmmo', () => {
    it('returns true when ammo available', () => {
      const entity = createArcher();

      expect(AmmoSystem.hasAmmo(world, entity)).toBe(true);
    });

    it('returns false when current slot empty', () => {
      const entity = world.createEntity();
      world.addComponent<AmmoComponent>(entity, {
        type: 'ammo',
        slots: [{ ammoType: 'standard', quantity: 0, maxQuantity: 12, armorPiercing: 0, damageBonus: 0 }],
        currentSlot: 0,
      });

      expect(AmmoSystem.hasAmmo(world, entity)).toBe(false);
    });
  });

  describe('getTotalAmmo', () => {
    it('returns sum of all ammo slots', () => {
      const entity = createArcher();

      expect(AmmoSystem.getTotalAmmo(world, entity)).toBe(24); // 12 + 6 + 6
    });
  });
});
