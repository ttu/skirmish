import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../../src/engine/core/GameEngine';
import { scenarios } from '../../../src/data/scenarios';

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine({ seed: 12345 });
  });

  describe('initialization', () => {
    it('starts at turn 0', () => {
      expect(engine.getTurn()).toBe(0);
    });

    it('starts in planning phase', () => {
      expect(engine.getPhase()).toBe('planning');
    });
  });

  describe('entity management', () => {
    it('creates entities through world', () => {
      const entityId = engine.createEntity();
      expect(entityId).toBeDefined();
      expect(typeof entityId).toBe('string');
    });

    it('can add components to entities', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      const health = engine.getComponent(entityId, 'health');
      expect(health).toBeDefined();
      expect(health?.current).toBe(100);
    });
  });

  describe('turn management', () => {
    it('advances turn after resolution', () => {
      engine.endPlanningPhase();
      engine.resolvePhase(); // resolvePhase internally calls endTurn()

      expect(engine.getTurn()).toBe(1);
    });

    it('transitions phases correctly', () => {
      expect(engine.getPhase()).toBe('planning');

      engine.endPlanningPhase();
      expect(engine.getPhase()).toBe('resolution');

      engine.resolvePhase();
      expect(engine.getPhase()).toBe('planning');
      expect(engine.getTurn()).toBe(1);
    });
  });

  describe('snapshots', () => {
    it('creates snapshot of current state', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 50,
        max: 100,
        woundState: 'wounded',
      });

      const snapshot = engine.createSnapshot();

      expect(snapshot.turn).toBe(0);
      expect(snapshot.phase).toBe('planning');
      expect(snapshot.entities[entityId]).toBeDefined();
      expect(snapshot.entities[entityId]['health']).toBeDefined();
    });

    it('restores state from snapshot', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      const snapshot = engine.createSnapshot();

      // Modify state
      engine.addComponent(entityId, {
        type: 'health',
        current: 50,
        max: 100,
        woundState: 'wounded',
      });

      // Restore
      engine.loadSnapshot(snapshot);

      const health = engine.getComponent(entityId, 'health');
      expect(health?.current).toBe(100);
    });
  });

  describe('event history', () => {
    it('records events', () => {
      engine.emitEvent({
        type: 'TurnStarted',
        turn: 0,
        timestamp: Date.now(),
        data: {},
      });

      const history = engine.getEventHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('TurnStarted');
    });
  });

  describe('scenario loading', () => {
    it('loads scenario and creates units', () => {
      const scenario = scenarios.find((s) => s.id === 'tutorial')!;
      const loaded = engine.loadScenario(scenario);

      expect(loaded.playerUnitIds).toHaveLength(3);
      expect(loaded.enemyUnitIds).toHaveLength(5);
      expect(loaded.scenarioId).toBe('tutorial');
    });

    it('getLoadedScenario returns loaded scenario', () => {
      const scenario = scenarios.find((s) => s.id === 'tutorial')!;
      engine.loadScenario(scenario);

      const loaded = engine.getLoadedScenario();
      expect(loaded).not.toBeNull();
      expect(loaded!.scenarioId).toBe('tutorial');
    });
  });

  describe('deterministic replay', () => {
    it('produces same results with same seed', () => {
      const engine1 = new GameEngine({ seed: 99999 });
      const engine2 = new GameEngine({ seed: 99999 });

      const roll1 = engine1.rollD100();
      const roll2 = engine2.rollD100();

      expect(roll1).toBe(roll2);
    });
  });
});
