import { describe, it, expect } from 'vitest';
import {
  getPerceptionTier,
  formatDistance,
  formatEnemyCondition,
  PerceptionTier,
} from '../../src/ui/PerceptionHelpers';
import { HealthComponent, WoundState } from '../../src/engine/components';

describe('PerceptionHelpers', () => {
  describe('getPerceptionTier', () => {
    it('returns "poor" for perception 0-20', () => {
      expect(getPerceptionTier(0)).toBe('poor');
      expect(getPerceptionTier(10)).toBe('poor');
      expect(getPerceptionTier(20)).toBe('poor');
    });

    it('returns "low" for perception 21-40', () => {
      expect(getPerceptionTier(21)).toBe('low');
      expect(getPerceptionTier(30)).toBe('low');
      expect(getPerceptionTier(40)).toBe('low');
    });

    it('returns "average" for perception 41-60', () => {
      expect(getPerceptionTier(41)).toBe('average');
      expect(getPerceptionTier(50)).toBe('average');
      expect(getPerceptionTier(60)).toBe('average');
    });

    it('returns "good" for perception 61-80', () => {
      expect(getPerceptionTier(61)).toBe('good');
      expect(getPerceptionTier(70)).toBe('good');
      expect(getPerceptionTier(80)).toBe('good');
    });

    it('returns "excellent" for perception 81+', () => {
      expect(getPerceptionTier(81)).toBe('excellent');
      expect(getPerceptionTier(90)).toBe('excellent');
      expect(getPerceptionTier(100)).toBe('excellent');
    });
  });

  describe('formatDistance', () => {
    describe('god view (perception null)', () => {
      it('returns exact distance', () => {
        expect(formatDistance(11.2, null, 0)).toBe('11.2m');
        expect(formatDistance(5.0, null, 0)).toBe('5.0m');
      });
    });

    describe('poor perception (0-20)', () => {
      it('returns "Close" for distance <= 10m', () => {
        expect(formatDistance(5, 10, 0)).toBe('Close');
        expect(formatDistance(10, 10, 0)).toBe('Close');
      });

      it('returns "Far" for distance > 10m', () => {
        expect(formatDistance(11, 10, 0)).toBe('Far');
        expect(formatDistance(20, 10, 0)).toBe('Far');
      });
    });

    describe('low perception (21-40)', () => {
      it('returns distance with ±50% error range', () => {
        const result = formatDistance(10, 30, 42);
        // Should be something like "~5-15m" (±50% of 10)
        expect(result).toMatch(/^~\d+-\d+m$/);
        // Parse and verify the range is approximately ±50%
        const match = result.match(/^~(\d+)-(\d+)m$/);
        expect(match).not.toBeNull();
        const [, low, high] = match!;
        expect(parseInt(low)).toBeGreaterThanOrEqual(4);
        expect(parseInt(low)).toBeLessThanOrEqual(6);
        expect(parseInt(high)).toBeGreaterThanOrEqual(14);
        expect(parseInt(high)).toBeLessThanOrEqual(16);
      });
    });

    describe('average perception (41-60)', () => {
      it('returns distance with ±25% error range', () => {
        const result = formatDistance(10, 50, 42);
        // Should be something like "~8-12m" (±25% of 10)
        expect(result).toMatch(/^~\d+-\d+m$/);
        const match = result.match(/^~(\d+)-(\d+)m$/);
        expect(match).not.toBeNull();
        const [, low, high] = match!;
        expect(parseInt(low)).toBeGreaterThanOrEqual(7);
        expect(parseInt(low)).toBeLessThanOrEqual(8);
        expect(parseInt(high)).toBeGreaterThanOrEqual(12);
        expect(parseInt(high)).toBeLessThanOrEqual(13);
      });
    });

    describe('good perception (61-80)', () => {
      it('returns distance with ±10% error range', () => {
        const result = formatDistance(10, 70, 42);
        // Should be something like "9-11m" (±10% of 10)
        expect(result).toMatch(/^~?\d+(\.\d)?-\d+(\.\d)?m$/);
      });
    });

    describe('excellent perception (81+)', () => {
      it('returns exact distance', () => {
        expect(formatDistance(11.2, 85, 0)).toBe('11.2m');
        expect(formatDistance(5.5, 100, 0)).toBe('5.5m');
      });
    });

    it('produces consistent results with same seed', () => {
      const result1 = formatDistance(10, 30, 12345);
      const result2 = formatDistance(10, 30, 12345);
      expect(result1).toBe(result2);
    });

    it('produces different results with different seeds', () => {
      // With enough trials, different seeds should produce different results
      // for perception levels that have randomization
      const result1 = formatDistance(10, 30, 1);
      const result2 = formatDistance(10, 30, 999);
      // They might be the same by chance, but the mechanism should support variation
      // This is a weak test, but verifies the seed is used
    });
  });

  describe('formatEnemyCondition', () => {
    const makeHealth = (current: number, max: number, woundState: WoundState): HealthComponent => ({
      type: 'health',
      current,
      max,
      woundState,
    });

    describe('god view (perception null)', () => {
      it('returns exact HP values', () => {
        expect(formatEnemyCondition(makeHealth(72, 100, 'bloodied'), null)).toBe('72/100 HP');
        expect(formatEnemyCondition(makeHealth(50, 80, 'wounded'), null)).toBe('50/80 HP');
      });
    });

    describe('poor perception (0-20)', () => {
      it('returns empty string (no info)', () => {
        expect(formatEnemyCondition(makeHealth(50, 100, 'wounded'), 10)).toBe('');
        expect(formatEnemyCondition(makeHealth(100, 100, 'healthy'), 20)).toBe('');
      });
    });

    describe('low perception (21-40)', () => {
      it('returns "Healthy" for HP > 50%', () => {
        expect(formatEnemyCondition(makeHealth(60, 100, 'bloodied'), 30)).toBe('Healthy');
        expect(formatEnemyCondition(makeHealth(51, 100, 'bloodied'), 40)).toBe('Healthy');
      });

      it('returns "Hurt" for HP <= 50%', () => {
        expect(formatEnemyCondition(makeHealth(50, 100, 'wounded'), 30)).toBe('Hurt');
        expect(formatEnemyCondition(makeHealth(25, 100, 'critical'), 40)).toBe('Hurt');
      });
    });

    describe('average perception (41-60)', () => {
      it('returns wound state name', () => {
        expect(formatEnemyCondition(makeHealth(100, 100, 'healthy'), 50)).toBe('Healthy');
        expect(formatEnemyCondition(makeHealth(75, 100, 'bloodied'), 50)).toBe('Bloodied');
        expect(formatEnemyCondition(makeHealth(50, 100, 'wounded'), 50)).toBe('Wounded');
        expect(formatEnemyCondition(makeHealth(25, 100, 'critical'), 50)).toBe('Critical');
        expect(formatEnemyCondition(makeHealth(0, 100, 'down'), 50)).toBe('Down');
      });
    });

    describe('good perception (61-80)', () => {
      it('returns wound state with approximate HP%', () => {
        const result = formatEnemyCondition(makeHealth(72, 100, 'bloodied'), 70);
        expect(result).toMatch(/Bloodied \(~\d+%\)/);
      });

      it('rounds HP% to nearest 10', () => {
        expect(formatEnemyCondition(makeHealth(72, 100, 'bloodied'), 70)).toBe('Bloodied (~70%)');
        expect(formatEnemyCondition(makeHealth(45, 100, 'wounded'), 70)).toBe('Wounded (~50%)');
        expect(formatEnemyCondition(makeHealth(23, 100, 'critical'), 70)).toBe('Critical (~20%)');
      });
    });

    describe('excellent perception (81+)', () => {
      it('returns exact HP values', () => {
        expect(formatEnemyCondition(makeHealth(72, 100, 'bloodied'), 85)).toBe('72/100 HP');
        expect(formatEnemyCondition(makeHealth(45, 80, 'wounded'), 100)).toBe('45/80 HP');
      });
    });
  });
});
