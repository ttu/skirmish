import { describe, it, expect } from 'vitest';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';

describe('DiceRoller', () => {
  describe('deterministic behavior', () => {
    it('produces same results with same seed', () => {
      const roller1 = new DiceRoller(12345);
      const roller2 = new DiceRoller(12345);

      expect(roller1.rollD100()).toBe(roller2.rollD100());
      expect(roller1.rollD100()).toBe(roller2.rollD100());
      expect(roller1.rollD100()).toBe(roller2.rollD100());
    });

    it('produces different results with different seeds', () => {
      const roller1 = new DiceRoller(12345);
      const roller2 = new DiceRoller(54321);

      // Very unlikely to be equal
      const results1 = [roller1.rollD100(), roller1.rollD100(), roller1.rollD100()];
      const results2 = [roller2.rollD100(), roller2.rollD100(), roller2.rollD100()];

      expect(results1).not.toEqual(results2);
    });
  });

  describe('rollD100', () => {
    it('returns values between 1 and 100', () => {
      const roller = new DiceRoller(99999);
      for (let i = 0; i < 1000; i++) {
        const roll = roller.rollD100();
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('roll', () => {
    it('rolls 1d6 in range 1-6', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(1, 6);
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    });

    it('rolls 2d6 in range 2-12', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(2, 6);
        expect(roll).toBeGreaterThanOrEqual(2);
        expect(roll).toBeLessThanOrEqual(12);
      }
    });

    it('adds bonus correctly', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(1, 6, 5);
        expect(roll).toBeGreaterThanOrEqual(6); // 1 + 5
        expect(roll).toBeLessThanOrEqual(11); // 6 + 5
      }
    });
  });

  describe('state save/restore', () => {
    it('can save and restore state for replay', () => {
      const roller = new DiceRoller(12345);

      // Roll a few times
      roller.rollD100();
      roller.rollD100();

      // Save state
      const state = roller.getState();

      // Roll more
      const nextRoll = roller.rollD100();

      // Create new roller and restore state
      const roller2 = new DiceRoller(0);
      roller2.setState(state);

      // Should produce same result
      expect(roller2.rollD100()).toBe(nextRoll);
    });
  });
});
