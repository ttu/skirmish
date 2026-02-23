import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { GameEvent } from '../../../src/engine/types';

describe('EventBus', () => {
  let eventBus: EventBusImpl;

  beforeEach(() => {
    eventBus = new EventBusImpl();
  });

  describe('subscribe / emit', () => {
    it('calls subscriber when event is emitted', () => {
      const callback = vi.fn();
      eventBus.subscribe('AttackRolled', callback);

      const event: GameEvent = {
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: { roll: 42 },
      };
      eventBus.emit(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('does not call subscriber for different event type', () => {
      const callback = vi.fn();
      eventBus.subscribe('AttackRolled', callback);

      eventBus.emit({
        type: 'DamageDealt',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('supports multiple subscribers for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      eventBus.subscribe('AttackRolled', callback1);
      eventBus.subscribe('AttackRolled', callback2);

      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('returns unsubscribe function that works', () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe('AttackRolled', callback);

      unsubscribe();

      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('records all emitted events', () => {
      const event1: GameEvent = {
        type: 'AttackRolled',
        turn: 1,
        timestamp: 1000,
        data: { roll: 42 },
      };
      const event2: GameEvent = {
        type: 'DamageDealt',
        turn: 1,
        timestamp: 1001,
        data: { damage: 5 },
      };

      eventBus.emit(event1);
      eventBus.emit(event2);

      const history = eventBus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(event1);
      expect(history[1]).toEqual(event2);
    });

    it('clearHistory removes all events', () => {
      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      eventBus.clearHistory();

      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('subscribeAll', () => {
    it('receives all events regardless of type', () => {
      const callback = vi.fn();
      eventBus.subscribeAll(callback);

      eventBus.emit({ type: 'AttackRolled', turn: 1, timestamp: 1, data: {} });
      eventBus.emit({ type: 'DamageDealt', turn: 1, timestamp: 2, data: {} });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});
