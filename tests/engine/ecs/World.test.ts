import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { Component } from '../../../src/engine/types';

interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
}

interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
}

describe('World', () => {
  let world: WorldImpl;

  beforeEach(() => {
    world = new WorldImpl();
  });

  describe('createEntity', () => {
    it('creates unique entity IDs', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      expect(e1).not.toBe(e2);
    });

    it('returns string IDs', () => {
      const e = world.createEntity();
      expect(typeof e).toBe('string');
    });
  });

  describe('addComponent / getComponent', () => {
    it('adds and retrieves a component', () => {
      const entity = world.createEntity();
      const position: PositionComponent = { type: 'position', x: 10, y: 20 };

      world.addComponent(entity, position);
      const retrieved = world.getComponent<PositionComponent>(entity, 'position');

      expect(retrieved).toEqual(position);
    });

    it('returns undefined for missing component', () => {
      const entity = world.createEntity();
      const retrieved = world.getComponent(entity, 'position');
      expect(retrieved).toBeUndefined();
    });

    it('overwrites existing component of same type', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 10, y: 20 } as PositionComponent);
      world.addComponent(entity, { type: 'position', x: 30, y: 40 } as PositionComponent);

      const retrieved = world.getComponent<PositionComponent>(entity, 'position');
      expect(retrieved?.x).toBe(30);
    });
  });

  describe('hasComponent', () => {
    it('returns true when component exists', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      expect(world.hasComponent(entity, 'position')).toBe(true);
    });

    it('returns false when component missing', () => {
      const entity = world.createEntity();
      expect(world.hasComponent(entity, 'position')).toBe(false);
    });
  });

  describe('removeComponent', () => {
    it('removes a component', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.removeComponent(entity, 'position');
      expect(world.hasComponent(entity, 'position')).toBe(false);
    });
  });

  describe('removeEntity', () => {
    it('removes entity and all its components', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.removeEntity(entity);

      expect(world.getComponent(entity, 'position')).toBeUndefined();
      expect(world.getAllEntities()).not.toContain(entity);
    });
  });

  describe('query', () => {
    it('returns entities with all specified components', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      world.addComponent(e1, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.addComponent(e1, { type: 'health', current: 100, max: 100 } as HealthComponent);

      world.addComponent(e2, { type: 'position', x: 0, y: 0 } as PositionComponent);
      // e2 has no health

      world.addComponent(e3, { type: 'health', current: 50, max: 100 } as HealthComponent);
      // e3 has no position

      const result = world.query('position', 'health');

      expect(result).toContain(e1);
      expect(result).not.toContain(e2);
      expect(result).not.toContain(e3);
    });

    it('returns empty array when no matches', () => {
      const result = world.query('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all entities', () => {
      world.createEntity();
      world.createEntity();
      world.clear();
      expect(world.getAllEntities()).toEqual([]);
    });
  });
});
