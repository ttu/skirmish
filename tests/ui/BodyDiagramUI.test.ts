import { describe, it, expect } from 'vitest';
import {
  getZoneColor,
  getWorstSeverity,
  getWoundLabels,
  getPerceptionFilteredArmor,
  getPerceptionFilteredZoneColor,
} from '../../src/ui/BodyDiagramUI';
import { WoundEffect, WoundSeverity, WoundLocation } from '../../src/engine/components';

describe('BodyDiagramUI', () => {
  describe('getZoneColor', () => {
    it('returns gray for no wounds', () => {
      expect(getZoneColor(null)).toBe('#555');
    });
    it('returns yellow for minor', () => {
      expect(getZoneColor('minor')).toBe('#e8c547');
    });
    it('returns orange for moderate', () => {
      expect(getZoneColor('moderate')).toBe('#e87c2a');
    });
    it('returns red for severe', () => {
      expect(getZoneColor('severe')).toBe('#e83a3a');
    });
    it('returns dark for down', () => {
      expect(getZoneColor('down')).toBe('#222');
    });
  });

  describe('getWorstSeverity', () => {
    it('returns null for empty array', () => {
      expect(getWorstSeverity([])).toBeNull();
    });
    it('returns the single severity', () => {
      expect(getWorstSeverity(['minor'])).toBe('minor');
    });
    it('returns worst when mixed', () => {
      expect(getWorstSeverity(['minor', 'severe', 'moderate'])).toBe('severe');
    });
    it('returns moderate over minor', () => {
      expect(getWorstSeverity(['minor', 'moderate'])).toBe('moderate');
    });
  });

  // --- Wound labels ---

  const makeWound = (location: WoundLocation, severity: WoundSeverity): WoundEffect => {
    const table: Record<WoundLocation, Record<WoundSeverity, WoundEffect>> = {
      arms: {
        minor: { location: 'arms', severity: 'minor', skillPenalty: 5, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'arms', severity: 'moderate', skillPenalty: 15, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        severe: { location: 'arms', severity: 'severe', skillPenalty: 30, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: true, restrictsMoveMode: false, halvesMovement: false },
      },
      legs: {
        minor: { location: 'legs', severity: 'minor', skillPenalty: 0, movementPenalty: 1, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'legs', severity: 'moderate', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: true },
        severe: { location: 'legs', severity: 'severe', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: true, halvesMovement: true },
      },
      torso: {
        minor: { location: 'torso', severity: 'minor', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 1, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'torso', severity: 'moderate', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 3, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        severe: { location: 'torso', severity: 'severe', skillPenalty: 10, movementPenalty: 0, bleedingPerTurn: 5, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
      },
    };
    return table[location][severity];
  };

  describe('getWoundLabels', () => {
    it('returns empty array for no wounds', () => {
      expect(getWoundLabels('arms', [])).toEqual([]);
    });
    it('returns skill penalty label for arm wounds', () => {
      const wounds = [makeWound('arms', 'minor')];
      expect(getWoundLabels('arms', wounds)).toContain('-5 skill');
    });
    it('returns cumulative skill penalty for stacked arm wounds', () => {
      const wounds = [makeWound('arms', 'minor'), makeWound('arms', 'moderate')];
      expect(getWoundLabels('arms', wounds)).toContain('-20 skill');
    });
    it('returns "No 2H" for severe arm wound', () => {
      const wounds = [makeWound('arms', 'severe')];
      expect(getWoundLabels('arms', wounds)).toContain('No 2H');
    });
    it('returns movement labels for leg wounds', () => {
      const wounds = [makeWound('legs', 'moderate')];
      expect(getWoundLabels('legs', wounds)).toContain('½ move');
    });
    it('returns "No run" for severe leg wound', () => {
      const wounds = [makeWound('legs', 'severe')];
      expect(getWoundLabels('legs', wounds)).toContain('No run');
    });
    it('returns bleeding label for torso wounds', () => {
      const wounds = [makeWound('torso', 'minor')];
      expect(getWoundLabels('torso', wounds)).toContain('1/turn');
    });
    it('returns cumulative bleeding for stacked torso wounds', () => {
      const wounds = [makeWound('torso', 'minor'), makeWound('torso', 'moderate')];
      expect(getWoundLabels('torso', wounds)).toContain('4/turn');
    });
  });

  // --- Perception filtering ---

  describe('getPerceptionFilteredArmor', () => {
    it('returns exact value for excellent', () => {
      expect(getPerceptionFilteredArmor(5, 'excellent')).toBe('5');
    });
    it('returns range for good', () => {
      expect(getPerceptionFilteredArmor(5, 'good')).toBe('4-6');
    });
    it('returns Light/Medium/Heavy for average', () => {
      expect(getPerceptionFilteredArmor(1, 'average')).toBe('Light');
      expect(getPerceptionFilteredArmor(3, 'average')).toBe('Medium');
      expect(getPerceptionFilteredArmor(6, 'average')).toBe('Heavy');
    });
    it('returns null for low and poor', () => {
      expect(getPerceptionFilteredArmor(5, 'low')).toBeNull();
      expect(getPerceptionFilteredArmor(5, 'poor')).toBeNull();
    });
  });

  describe('getPerceptionFilteredZoneColor', () => {
    it('returns exact color for excellent', () => {
      expect(getPerceptionFilteredZoneColor('minor', false, 'excellent')).toBe('#e8c547');
    });
    it('returns exact color for good', () => {
      expect(getPerceptionFilteredZoneColor('moderate', false, 'good')).toBe('#e87c2a');
    });
    it('merges minor/moderate to yellow for average', () => {
      expect(getPerceptionFilteredZoneColor('minor', false, 'average')).toBe('#e8c547');
      expect(getPerceptionFilteredZoneColor('moderate', false, 'average')).toBe('#e8c547');
      expect(getPerceptionFilteredZoneColor('severe', false, 'average')).toBe('#e83a3a');
    });
    it('returns binary hurt/badly-hurt for low', () => {
      expect(getPerceptionFilteredZoneColor('minor', false, 'low')).toBe('#e8c547');
      expect(getPerceptionFilteredZoneColor('moderate', false, 'low')).toBe('#e8c547');
      expect(getPerceptionFilteredZoneColor('severe', false, 'low')).toBe('#e83a3a');
    });
    it('returns gray for poor (no info)', () => {
      expect(getPerceptionFilteredZoneColor('severe', false, 'poor')).toBe('#555');
    });
    it('returns down color regardless of perception when down', () => {
      expect(getPerceptionFilteredZoneColor(null, true, 'poor')).toBe('#222');
    });
  });
});
