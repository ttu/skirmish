import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import {
  HealthComponent,
  WoundEffectsComponent,
  WoundEffect,
  WoundSeverity,
  WoundLocation,
  calculateWoundState,
} from '../components';
import { HitLocation } from './CombatResolver';

const WOUND_EFFECTS_TABLE: Record<WoundLocation, Record<WoundSeverity, Omit<WoundEffect, 'location' | 'severity'>>> = {
  arms: {
    minor:    { skillPenalty: 5,  movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
    moderate: { skillPenalty: 15, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
    severe:   { skillPenalty: 30, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: true,  restrictsMoveMode: false, halvesMovement: false },
  },
  legs: {
    minor:    { skillPenalty: 0, movementPenalty: 1, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
    moderate: { skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: true  },
    severe:   { skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: true,  halvesMovement: true  },
  },
  torso: {
    minor:    { skillPenalty: 0,  movementPenalty: 0, bleedingPerTurn: 1, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
    moderate: { skillPenalty: 0,  movementPenalty: 0, bleedingPerTurn: 3, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
    severe:   { skillPenalty: 10, movementPenalty: 0, bleedingPerTurn: 5, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
  },
};

export class WoundEffectsSystem {
  /** Wound threshold = 2x the location's armor value */
  static getWoundThreshold(locationArmor: number): number {
    return locationArmor * 2;
  }

  /** Determine severity from excess damage over threshold. Returns null if no wound. */
  static getSeverity(excess: number): WoundSeverity | null {
    if (excess <= 0) return null;
    if (excess <= 3) return 'minor';
    if (excess <= 7) return 'moderate';
    return 'severe';
  }

  /**
   * Check if a hit should cause a wound effect and apply it.
   * Called after DamageSystem.applyDamage in the combat flow.
   */
  static checkAndApplyWoundEffect(
    world: WorldImpl,
    eventBus: EventBusImpl,
    targetId: string,
    location: HitLocation,
    finalDamage: number,
    locationArmor: number,
    turn: number
  ): void {
    // Only arms, legs, torso can have wound effects
    if (location === 'head' || location === 'weapon') return;

    const threshold = this.getWoundThreshold(locationArmor);
    const excess = finalDamage - threshold;
    const severity = this.getSeverity(excess);
    if (!severity) return;

    const woundLocation = location as WoundLocation;
    const effectTemplate = WOUND_EFFECTS_TABLE[woundLocation][severity];
    const effect: WoundEffect = {
      location: woundLocation,
      severity,
      ...effectTemplate,
    };

    // Get or create wound effects component
    const existing = world.getComponent<WoundEffectsComponent>(targetId, 'woundEffects');
    const effects = existing ? [...existing.effects, effect] : [effect];

    world.addComponent<WoundEffectsComponent>(targetId, {
      type: 'woundEffects',
      effects,
    });

    eventBus.emit({
      type: 'WoundEffectApplied',
      turn,
      timestamp: Date.now(),
      entityId: targetId,
      data: {
        location: woundLocation,
        severity,
        skillPenalty: effect.skillPenalty,
        bleedingPerTurn: effect.bleedingPerTurn,
        disablesTwoHanded: effect.disablesTwoHanded,
        restrictsMoveMode: effect.restrictsMoveMode,
        halvesMovement: effect.halvesMovement,
      },
    });
  }

  /** Total skill penalty from all active wound effects */
  static getSkillPenalty(world: WorldImpl, entityId: string): number {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return 0;
    return wounds.effects.reduce((sum, e) => sum + e.skillPenalty, 0);
  }

  /** Flat movement speed reduction from wound effects */
  static getMovementPenalty(world: WorldImpl, entityId: string): number {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return 0;
    return wounds.effects.reduce((sum, e) => sum + e.movementPenalty, 0);
  }

  /** Whether any wound halves movement speed */
  static halvesMovement(world: WorldImpl, entityId: string): boolean {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return false;
    return wounds.effects.some((e) => e.halvesMovement);
  }

  /** Whether the entity can use two-handed weapons */
  static canUseTwoHanded(world: WorldImpl, entityId: string): boolean {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return true;
    return !wounds.effects.some((e) => e.disablesTwoHanded);
  }

  /** Whether the entity can sprint */
  static canSprint(world: WorldImpl, entityId: string): boolean {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return true;
    return !wounds.effects.some((e) => e.restrictsMoveMode);
  }

  /** Whether the entity can run */
  static canRun(world: WorldImpl, entityId: string): boolean {
    return this.canSprint(world, entityId);
  }

  /** Apply bleeding damage from torso wounds at end of turn */
  static applyBleeding(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: string,
    turn: number
  ): void {
    const wounds = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
    if (!wounds) return;

    const totalBleeding = wounds.effects.reduce((sum, e) => sum + e.bleedingPerTurn, 0);
    if (totalBleeding <= 0) return;

    const health = world.getComponent<HealthComponent>(entityId, 'health');
    if (!health || health.woundState === 'down') return;

    const newCurrent = Math.max(0, health.current - totalBleeding);
    const newWoundState = calculateWoundState(newCurrent, health.max);

    world.addComponent<HealthComponent>(entityId, {
      ...health,
      current: newCurrent,
      woundState: newWoundState,
    });

    eventBus.emit({
      type: 'BleedingDamage',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        damage: totalBleeding,
        newHealth: newCurrent,
      },
    });

    if (newWoundState === 'down') {
      eventBus.emit({
        type: 'UnitDown',
        turn,
        timestamp: Date.now(),
        entityId,
        data: {
          reason: 'bleeding',
          finalHealth: newCurrent,
        },
      });
    }
  }
}
