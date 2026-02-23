import { describe, it, expect } from 'vitest';
import { CombatResolver } from '../../../src/engine/systems/CombatResolver';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';

describe('CombatResolver', () => {
  describe('resolveAttackRoll', () => {
    it('hit when roll <= skill', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(55, [], roller);

      expect(result.roll).toBeGreaterThanOrEqual(1);
      expect(result.roll).toBeLessThanOrEqual(100);
      expect(result.hit).toBe(result.roll <= result.effectiveSkill);
    });

    it('applies positive modifiers', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(50, [
        { source: 'flanking', value: 10 },
        { source: 'height', value: 10 },
      ], roller);

      expect(result.effectiveSkill).toBe(70);
    });

    it('applies negative modifiers', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(50, [
        { source: 'wounded', value: -10 },
      ], roller);

      expect(result.effectiveSkill).toBe(40);
    });

    it('caps effective skill at 95', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(90, [
        { source: 'flanking', value: 20 },
      ], roller);

      expect(result.effectiveSkill).toBe(95);
    });

    it('floors effective skill at 5', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(10, [
        { source: 'penalty', value: -50 },
      ], roller);

      expect(result.effectiveSkill).toBe(5);
    });
  });

  describe('resolveDefenseRoll', () => {
    it('successful defense when roll <= skill', () => {
      const roller = new DiceRoller(54321);
      const result = CombatResolver.resolveDefenseRoll('block', 60, [], roller);

      expect(result.success).toBe(result.roll <= result.effectiveSkill);
    });

    it('records defense type', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveDefenseRoll('dodge', 50, [], roller);

      expect(result.defenseType).toBe('dodge');
    });
  });

  describe('resolveHitLocation', () => {
    it('returns head for rolls 1-15', () => {
      expect(CombatResolver.getLocationFromRoll(1)).toBe('head');
      expect(CombatResolver.getLocationFromRoll(15)).toBe('head');
    });

    it('returns torso for rolls 16-35', () => {
      expect(CombatResolver.getLocationFromRoll(16)).toBe('torso');
      expect(CombatResolver.getLocationFromRoll(35)).toBe('torso');
    });

    it('returns arms for rolls 36-55', () => {
      expect(CombatResolver.getLocationFromRoll(36)).toBe('arms');
      expect(CombatResolver.getLocationFromRoll(55)).toBe('arms');
    });

    it('returns legs for rolls 56-80', () => {
      expect(CombatResolver.getLocationFromRoll(56)).toBe('legs');
      expect(CombatResolver.getLocationFromRoll(80)).toBe('legs');
    });

    it('returns weapon for rolls 81-100', () => {
      expect(CombatResolver.getLocationFromRoll(81)).toBe('weapon');
      expect(CombatResolver.getLocationFromRoll(100)).toBe('weapon');
    });
  });

  describe('calculateDamage', () => {
    it('subtracts armor from damage', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.calculateDamage(
        { dice: 1, sides: 6, bonus: 4 },
        5, // armor
        roller
      );

      expect(result.rawDamage).toBeGreaterThanOrEqual(5); // 1d6+4 = 5-10
      expect(result.armorAbsorbed).toBe(5);
      expect(result.finalDamage).toBe(Math.max(0, result.rawDamage - 5));
    });

    it('minimum damage is 0', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.calculateDamage(
        { dice: 1, sides: 4, bonus: 0 },
        100, // massive armor
        roller
      );

      expect(result.finalDamage).toBe(0);
    });
  });

  describe('getArmorClass', () => {
    it('returns unarmored for total armor 0-4', () => {
      expect(CombatResolver.getArmorClass({ head: 0, torso: 1, arms: 0, legs: 0 })).toBe('unarmored');
      expect(CombatResolver.getArmorClass({ head: 1, torso: 1, arms: 1, legs: 1 })).toBe('unarmored');
    });

    it('returns light for total armor 5-8', () => {
      expect(CombatResolver.getArmorClass({ head: 1, torso: 2, arms: 1, legs: 1 })).toBe('light');
      expect(CombatResolver.getArmorClass({ head: 2, torso: 2, arms: 2, legs: 2 })).toBe('light');
    });

    it('returns medium for total armor 9-14', () => {
      expect(CombatResolver.getArmorClass({ head: 2, torso: 4, arms: 2, legs: 2 })).toBe('medium');
      expect(CombatResolver.getArmorClass({ head: 3, torso: 5, arms: 3, legs: 3 })).toBe('medium');
    });

    it('returns heavy for total armor 15+', () => {
      expect(CombatResolver.getArmorClass({ head: 6, torso: 8, arms: 5, legs: 5 })).toBe('heavy');
      expect(CombatResolver.getArmorClass({ head: 4, torso: 6, arms: 4, legs: 4 })).toBe('heavy');
    });
  });

  describe('getDodgePenalty', () => {
    it('returns 0 for unarmored', () => {
      expect(CombatResolver.getDodgePenalty('unarmored')).toBe(0);
    });

    it('returns -15 for light armor', () => {
      expect(CombatResolver.getDodgePenalty('light')).toBe(-15);
    });

    it('returns -30 for medium armor', () => {
      expect(CombatResolver.getDodgePenalty('medium')).toBe(-30);
    });

    it('returns null for heavy armor (cannot dodge)', () => {
      expect(CombatResolver.getDodgePenalty('heavy')).toBeNull();
    });
  });

  describe('getHeadDamageMultiplier', () => {
    it('returns 3 for head hits', () => {
      expect(CombatResolver.getLocationDamageMultiplier('head')).toBe(3);
    });

    it('returns 1 for other locations', () => {
      expect(CombatResolver.getLocationDamageMultiplier('torso')).toBe(1);
      expect(CombatResolver.getLocationDamageMultiplier('arms')).toBe(1);
      expect(CombatResolver.getLocationDamageMultiplier('legs')).toBe(1);
    });
  });
});
