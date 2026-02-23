import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { EntityId } from '../types';
import { StaminaComponent, ActionPointsComponent } from '../components';

const STAMINA_RECOVERY_UNHIT = 3;
const STAMINA_RECOVERY_HIT = 1;
const EXHAUSTION_AP_PENALTY = 1;

export class StaminaSystem {
  static drainStamina(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    amount: number,
    turn: number
  ): void {
    const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
    if (!stamina) return;

    const newCurrent = Math.max(0, stamina.current - amount);
    const becameExhausted = !stamina.exhausted && newCurrent <= 0;

    world.addComponent<StaminaComponent>(entityId, {
      ...stamina,
      current: newCurrent,
      exhausted: newCurrent <= 0,
    });

    eventBus.emit({
      type: 'StaminaDrained',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        amount,
        newStamina: newCurrent,
      },
    });

    if (becameExhausted) {
      eventBus.emit({
        type: 'Exhausted',
        turn,
        timestamp: Date.now(),
        entityId,
        data: {},
      });
    }
  }

  static recoverStamina(world: WorldImpl, entityId: EntityId, wasHit: boolean = false): void {
    const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
    if (!stamina) return;

    const recovery = wasHit ? STAMINA_RECOVERY_HIT : STAMINA_RECOVERY_UNHIT;
    const newCurrent = Math.min(stamina.max, stamina.current + recovery);

    world.addComponent<StaminaComponent>(entityId, {
      ...stamina,
      current: newCurrent,
      exhausted: false, // Clear exhaustion when recovering
    });
  }

  static getStaminaDefensePenalty(world: WorldImpl, entityId: EntityId): number {
    const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
    if (!stamina) return 0;

    if (stamina.exhausted || stamina.current <= 0) return -40;

    const pct = (stamina.current / stamina.max) * 100;
    if (pct < 25) return -30;
    if (pct < 50) return -20;
    if (pct < 75) return -10;
    return 0;
  }

  static calculateArmorStaminaDrain(absorbed: number): number {
    if (absorbed <= 0) return 0;
    return Math.ceil(absorbed / 2);
  }

  static applyArmorStaminaDrain(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    absorbed: number,
    turn: number
  ): void {
    const drain = this.calculateArmorStaminaDrain(absorbed);
    if (drain <= 0) return;

    this.drainStamina(world, eventBus, entityId, drain, turn);

    eventBus.emit({
      type: 'ArmorImpact',
      turn,
      timestamp: Date.now(),
      entityId,
      data: { staminaDrain: drain, absorbed },
    });
  }

  static applyExhaustionPenalty(world: WorldImpl, entityId: EntityId): void {
    const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');

    if (!stamina || !ap) return;

    if (stamina.exhausted) {
      world.addComponent<ActionPointsComponent>(entityId, {
        ...ap,
        max: ap.baseValue + ap.experienceBonus - ap.armorPenalty - EXHAUSTION_AP_PENALTY,
      });
    }
  }

  static getStaminaCostForAction(action: string, hasHeavyArmor: boolean): number {
    const baseCost = {
      walk: 0,
      advance: 0,
      run: 1,
      sprint: 3,
      meleeAttack: 1,
      powerAttack: 2,
      rangedAttack: 0,
      block: 0,
      dodge: 1,
    }[action] ?? 0;

    return hasHeavyArmor ? baseCost + 1 : baseCost;
  }
}
