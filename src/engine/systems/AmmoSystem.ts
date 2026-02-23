import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { EntityId } from '../types';
import { AmmoComponent } from '../components';

export interface AmmoStats {
  ammoType: string;
  quantity: number;
  armorPiercing: number;
  damageBonus: number;
}

export class AmmoSystem {
  static consumeAmmo(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    turn: number
  ): boolean {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return false;

    const currentSlot = ammo.slots[ammo.currentSlot];
    if (!currentSlot || currentSlot.quantity <= 0) return false;

    // Create new slots array with updated quantity
    const newSlots = ammo.slots.map((slot, index) =>
      index === ammo.currentSlot ? { ...slot, quantity: slot.quantity - 1 } : slot
    );

    world.addComponent<AmmoComponent>(entityId, {
      ...ammo,
      slots: newSlots,
    });

    eventBus.emit({
      type: 'AmmoSpent',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        ammoType: currentSlot.ammoType,
        remaining: currentSlot.quantity - 1,
      },
    });

    return true;
  }

  static switchAmmoSlot(world: WorldImpl, entityId: EntityId, slotIndex: number): boolean {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return false;

    if (slotIndex < 0 || slotIndex >= ammo.slots.length) return false;

    world.addComponent<AmmoComponent>(entityId, {
      ...ammo,
      currentSlot: slotIndex,
    });

    return true;
  }

  static getCurrentAmmoStats(world: WorldImpl, entityId: EntityId): AmmoStats | null {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return null;

    const currentSlot = ammo.slots[ammo.currentSlot];
    if (!currentSlot) return null;

    return {
      ammoType: currentSlot.ammoType,
      quantity: currentSlot.quantity,
      armorPiercing: currentSlot.armorPiercing,
      damageBonus: currentSlot.damageBonus,
    };
  }

  static hasAmmo(world: WorldImpl, entityId: EntityId): boolean {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return false;

    const currentSlot = ammo.slots[ammo.currentSlot];
    return currentSlot ? currentSlot.quantity > 0 : false;
  }

  static getTotalAmmo(world: WorldImpl, entityId: EntityId): number {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return 0;

    return ammo.slots.reduce((total, slot) => total + slot.quantity, 0);
  }

  static findSlotWithAmmo(world: WorldImpl, entityId: EntityId): number {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return -1;

    return ammo.slots.findIndex((slot) => slot.quantity > 0);
  }

  static autoSwitchIfEmpty(world: WorldImpl, entityId: EntityId): boolean {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return false;

    const currentSlot = ammo.slots[ammo.currentSlot];
    if (currentSlot && currentSlot.quantity > 0) return false; // Current slot has ammo

    const nextSlot = this.findSlotWithAmmo(world, entityId);
    if (nextSlot === -1) return false; // No ammo anywhere

    return this.switchAmmoSlot(world, entityId, nextSlot);
  }
}
