import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { WoundEffectsSystem } from '../../../src/engine/systems/WoundEffectsSystem';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';
import {
  HealthComponent,
  ArmorComponent,
  WeaponComponent,
  WoundEffectsComponent,
  SkillsComponent,
} from '../../../src/engine/components';
import { HitLocation } from '../../../src/engine/systems/CombatResolver';

describe('WoundEffectsSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  function createUnit(overrides?: {
    armor?: Partial<ArmorComponent>;
    health?: Partial<HealthComponent>;
  }): string {
    const id = world.createEntity();
    world.addComponent<HealthComponent>(id, {
      type: 'health',
      current: 100,
      max: 100,
      woundState: 'healthy',
      ...overrides?.health,
    });
    world.addComponent<ArmorComponent>(id, {
      type: 'armor',
      head: 3,
      torso: 5,
      arms: 3,
      legs: 3,
      apPenalty: 1,
      staminaPenalty: 1,
      ...overrides?.armor,
    });
    world.addComponent<SkillsComponent>(id, {
      type: 'skills',
      melee: 50,
      ranged: 40,
      block: 50,
      dodge: 30,
      morale: 50,
      perception: 45,
    });
    return id;
  }

  describe('threshold calculation', () => {
    it('should return threshold of 2x armor', () => {
      expect(WoundEffectsSystem.getWoundThreshold(0)).toBe(0);
      expect(WoundEffectsSystem.getWoundThreshold(2)).toBe(4);
      expect(WoundEffectsSystem.getWoundThreshold(5)).toBe(10);
    });
  });

  describe('severity determination', () => {
    it('should return minor for 1-3 excess damage', () => {
      expect(WoundEffectsSystem.getSeverity(1)).toBe('minor');
      expect(WoundEffectsSystem.getSeverity(3)).toBe('minor');
    });

    it('should return moderate for 4-7 excess damage', () => {
      expect(WoundEffectsSystem.getSeverity(4)).toBe('moderate');
      expect(WoundEffectsSystem.getSeverity(7)).toBe('moderate');
    });

    it('should return severe for 8+ excess damage', () => {
      expect(WoundEffectsSystem.getSeverity(8)).toBe('severe');
      expect(WoundEffectsSystem.getSeverity(20)).toBe('severe');
    });

    it('should return null for 0 or negative excess', () => {
      expect(WoundEffectsSystem.getSeverity(0)).toBeNull();
      expect(WoundEffectsSystem.getSeverity(-5)).toBeNull();
    });
  });

  describe('checkAndApplyWoundEffect', () => {
    it('should apply wound effect when damage exceeds 2x armor on arms', () => {
      const unit = createUnit({ armor: { arms: 2 } });
      // armor 2, threshold 4, damage 6 → excess 2 → minor
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 6, 2, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds).toBeDefined();
      expect(wounds!.effects).toHaveLength(1);
      expect(wounds!.effects[0].location).toBe('arms');
      expect(wounds!.effects[0].severity).toBe('minor');
      expect(wounds!.effects[0].skillPenalty).toBe(5);
    });

    it('should apply moderate arm wound for 4-7 excess', () => {
      const unit = createUnit({ armor: { arms: 1 } });
      // armor 1, threshold 2, damage 8 → excess 6 → moderate
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 8, 1, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].severity).toBe('moderate');
      expect(wounds!.effects[0].skillPenalty).toBe(15);
    });

    it('should apply severe arm wound with disablesTwoHanded', () => {
      const unit = createUnit({ armor: { arms: 0 } });
      // armor 0, threshold 0, damage 10 → excess 10 → severe
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 10, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].severity).toBe('severe');
      expect(wounds!.effects[0].skillPenalty).toBe(30);
      expect(wounds!.effects[0].disablesTwoHanded).toBe(true);
    });

    it('should apply leg wound effects with movement penalty', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      // Minor leg wound
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 2, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].location).toBe('legs');
      expect(wounds!.effects[0].movementPenalty).toBe(1);
    });

    it('should apply moderate leg wound with halvesMovement', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      // armor 0, threshold 0, damage 5 → excess 5 → moderate
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 5, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].halvesMovement).toBe(true);
    });

    it('should apply severe leg wound with restrictsMoveMode', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      // armor 0, threshold 0, damage 9 → excess 9 → severe
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 9, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].restrictsMoveMode).toBe(true);
    });

    it('should apply torso wound with bleeding', () => {
      const unit = createUnit({ armor: { torso: 0 } });
      // armor 0, threshold 0, damage 2 → excess 2 → minor
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 2, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].location).toBe('torso');
      expect(wounds!.effects[0].bleedingPerTurn).toBe(1);
    });

    it('should apply severe torso wound with bleeding and skill penalty', () => {
      const unit = createUnit({ armor: { torso: 0 } });
      // armor 0, threshold 0, damage 10 → excess 10 → severe
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 10, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects[0].bleedingPerTurn).toBe(5);
      expect(wounds!.effects[0].skillPenalty).toBe(10);
    });

    it('should not apply wound effect for head hits', () => {
      const unit = createUnit({ armor: { head: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'head', 10, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds).toBeUndefined();
    });

    it('should not apply wound effect for weapon hits', () => {
      const unit = createUnit();
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'weapon', 10, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds).toBeUndefined();
    });

    it('should not apply wound when damage does not exceed threshold', () => {
      const unit = createUnit({ armor: { arms: 5 } });
      // armor 5, threshold 10, damage 8 → excess -2 → no wound
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 8, 5, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds).toBeUndefined();
    });

    it('should stack multiple wounds', () => {
      const unit = createUnit({ armor: { arms: 0, legs: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 3, 0, 1);
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 5, 0, 1);

      const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
      expect(wounds!.effects).toHaveLength(2);
      expect(wounds!.effects[0].location).toBe('arms');
      expect(wounds!.effects[1].location).toBe('legs');
    });

    it('should emit WoundEffectApplied event', () => {
      const unit = createUnit({ armor: { arms: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 3, 0, 1);

      const events = eventBus.getHistory().filter((e) => e.type === 'WoundEffectApplied');
      expect(events).toHaveLength(1);
      expect(events[0].entityId).toBe(unit);
      expect(events[0].data.location).toBe('arms');
      expect(events[0].data.severity).toBe('minor');
    });
  });

  describe('query helpers', () => {
    it('getSkillPenalty should sum all skill penalties', () => {
      const unit = createUnit({ armor: { arms: 0, torso: 0 } });
      // Minor arm wound: -5 skill
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 2, 0, 1);
      // Severe torso wound: -10 skill
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 10, 0, 1);

      expect(WoundEffectsSystem.getSkillPenalty(world, unit)).toBe(15);
    });

    it('getSkillPenalty should return 0 with no wounds', () => {
      const unit = createUnit();
      expect(WoundEffectsSystem.getSkillPenalty(world, unit)).toBe(0);
    });

    it('getMovementPenalty should return flat speed reduction', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      // Minor leg wound: -1 speed
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 2, 0, 1);

      expect(WoundEffectsSystem.getMovementPenalty(world, unit)).toBe(1);
    });

    it('halvesMovement should return true for moderate+ leg wound', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 5, 0, 1);

      expect(WoundEffectsSystem.halvesMovement(world, unit)).toBe(true);
    });

    it('halvesMovement should return false with no leg wounds', () => {
      const unit = createUnit({ armor: { arms: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 5, 0, 1);

      expect(WoundEffectsSystem.halvesMovement(world, unit)).toBe(false);
    });

    it('canUseTwoHanded should return false with severe arm wound', () => {
      const unit = createUnit({ armor: { arms: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 10, 0, 1);

      expect(WoundEffectsSystem.canUseTwoHanded(world, unit)).toBe(false);
    });

    it('canUseTwoHanded should return true with no arm wounds', () => {
      const unit = createUnit();
      expect(WoundEffectsSystem.canUseTwoHanded(world, unit)).toBe(true);
    });

    it('canSprint should return false with severe leg wound', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 9, 0, 1);

      expect(WoundEffectsSystem.canSprint(world, unit)).toBe(false);
      expect(WoundEffectsSystem.canRun(world, unit)).toBe(false);
    });

    it('canSprint should return true with minor leg wound', () => {
      const unit = createUnit({ armor: { legs: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'legs', 2, 0, 1);

      expect(WoundEffectsSystem.canSprint(world, unit)).toBe(true);
      expect(WoundEffectsSystem.canRun(world, unit)).toBe(true);
    });
  });

  describe('applyBleeding', () => {
    it('should reduce HP by total bleeding per turn', () => {
      const unit = createUnit({ armor: { torso: 0 } });
      // Minor torso wound: 1 bleed/turn
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 2, 0, 1);

      WoundEffectsSystem.applyBleeding(world, eventBus, unit, 2);

      const health = world.getComponent<HealthComponent>(unit, 'health');
      expect(health!.current).toBe(99);
    });

    it('should stack bleeding from multiple torso wounds', () => {
      const unit = createUnit({ armor: { torso: 0 } });
      // Minor torso wound: 1 bleed + moderate torso wound: 3 bleed = 4 total
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 2, 0, 1);
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 5, 0, 1);

      WoundEffectsSystem.applyBleeding(world, eventBus, unit, 2);

      const health = world.getComponent<HealthComponent>(unit, 'health');
      expect(health!.current).toBe(96);
    });

    it('should not reduce HP below 0', () => {
      const unit = createUnit({ armor: { torso: 0 }, health: { current: 2 } });
      // Severe torso wound: 5 bleed/turn
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 10, 0, 1);

      WoundEffectsSystem.applyBleeding(world, eventBus, unit, 2);

      const health = world.getComponent<HealthComponent>(unit, 'health');
      expect(health!.current).toBe(0);
      expect(health!.woundState).toBe('down');
    });

    it('should emit BleedingDamage event', () => {
      const unit = createUnit({ armor: { torso: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'torso', 2, 0, 1);

      WoundEffectsSystem.applyBleeding(world, eventBus, unit, 2);

      const events = eventBus.getHistory().filter((e) => e.type === 'BleedingDamage');
      expect(events).toHaveLength(1);
      expect(events[0].entityId).toBe(unit);
      expect(events[0].data.damage).toBe(1);
    });

    it('should do nothing if no bleeding wounds', () => {
      const unit = createUnit({ armor: { arms: 0 } });
      WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 3, 0, 1);

      WoundEffectsSystem.applyBleeding(world, eventBus, unit, 2);

      const health = world.getComponent<HealthComponent>(unit, 'health');
      expect(health!.current).toBe(100);
    });
  });
});
