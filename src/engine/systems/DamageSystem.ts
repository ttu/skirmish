import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { HealthComponent, calculateWoundState } from '../components';
import { HitLocation } from './CombatResolver';

export class DamageSystem {
  static applyDamage(
    world: WorldImpl,
    eventBus: EventBusImpl,
    targetId: string,
    damage: number,
    location: HitLocation,
    turn: number,
    attackerId?: string,
    rawDamage?: number,
    armorAbsorbed?: number
  ): void {
    const health = world.getComponent<HealthComponent>(targetId, 'health');
    if (!health) return;

    const previousState = health.woundState;
    const newCurrent = Math.max(0, health.current - damage);
    const newWoundState = calculateWoundState(newCurrent, health.max);

    // Update health component
    world.addComponent<HealthComponent>(targetId, {
      ...health,
      current: newCurrent,
      woundState: newWoundState,
    });

    // Emit damage event (entityId = attacker, targetId = victim for combat log)
    eventBus.emit({
      type: 'DamageDealt',
      turn,
      timestamp: Date.now(),
      entityId: attackerId ?? targetId,
      targetId,
      data: {
        damage,
        location,
        newHealth: newCurrent,
        previousHealth: health.current,
        rawDamage: rawDamage ?? damage,
        armorAbsorbed: armorAbsorbed ?? 0,
      },
    });

    // Emit wound state change if applicable
    if (newWoundState !== previousState && newWoundState !== 'down') {
      eventBus.emit({
        type: 'UnitWounded',
        turn,
        timestamp: Date.now(),
        entityId: targetId,
        data: {
          previousState,
          newState: newWoundState,
        },
      });
    }

    // Emit unit down event
    if (newWoundState === 'down') {
      eventBus.emit({
        type: 'UnitDown',
        turn,
        timestamp: Date.now(),
        entityId: targetId,
        data: {
          finalHealth: newCurrent,
          killingBlow: location,
        },
      });
    }
  }
}
