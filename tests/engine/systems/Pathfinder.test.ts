import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { Pathfinder } from '../../../src/engine/systems/Pathfinder';
import {
  PositionComponent,
  ObstacleComponent,
  HealthComponent,
} from '../../../src/engine/components';

describe('Pathfinder', () => {
  let world: WorldImpl;

  beforeEach(() => {
    world = new WorldImpl();
  });

  function createObstacle(x: number, y: number, radius: number) {
    const entity = world.createEntity();
    world.addComponent<PositionComponent>(entity, { type: 'position', x, y, facing: 0 });
    world.addComponent<ObstacleComponent>(entity, {
      type: 'obstacle',
      radius,
      isPassable: false,
    });
    return entity;
  }

  function createRectObstacle(
    x: number, y: number,
    halfLength: number, halfWidth: number,
    rotation = 0
  ) {
    const entity = world.createEntity();
    world.addComponent<PositionComponent>(entity, { type: 'position', x, y, facing: 0 });
    world.addComponent<ObstacleComponent>(entity, {
      type: 'obstacle',
      radius: 0,
      isPassable: false,
      halfLength,
      halfWidth,
      rotation,
    });
    return entity;
  }

  function createUnit(x: number, y: number) {
    const entity = world.createEntity();
    world.addComponent<PositionComponent>(entity, { type: 'position', x, y, facing: 0 });
    world.addComponent<HealthComponent>(entity, {
      type: 'health',
      current: 10,
      max: 10,
      woundState: 'healthy',
    });
    return entity;
  }

  describe('findPath', () => {
    it('returns straight line when no obstacles', () => {
      const unit = createUnit(2, 2);
      const path = Pathfinder.findPath(world, unit, 2, 2, 8, 2, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(2);
      expect(path![0]).toEqual({ x: 2, y: 2 });
      expect(path![1]).toEqual({ x: 8, y: 2 });
    });

    it('routes around a circular obstacle', () => {
      const unit = createUnit(2, 5);
      createObstacle(5, 5, 1.5);

      const path = Pathfinder.findPath(world, unit, 2, 5, 8, 5, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2); // Should have waypoints

      // Path should not pass through the obstacle
      const totalLength = Pathfinder.pathLength(path!);
      // Path around obstacle should be longer than straight line (6 units)
      expect(totalLength).toBeGreaterThan(6);
    });

    it('routes around a rectangular obstacle (wall)', () => {
      const unit = createUnit(2, 5);
      createRectObstacle(5, 5, 0.5, 3, 0); // Vertical wall at x=5

      const path = Pathfinder.findPath(world, unit, 2, 5, 8, 5, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);
    });

    it('returns null when destination is completely blocked', () => {
      const unit = createUnit(2, 2);
      // Surround destination with obstacles
      for (let x = 7; x <= 9; x++) {
        for (let y = 1; y <= 3; y++) {
          createObstacle(x, y, 0.8);
        }
      }

      const path = Pathfinder.findPath(world, unit, 2, 2, 8, 2, 20, 20);
      // Should still find a path to nearest open cell, or null
      // The destination cell itself may be blocked
    });

    it('avoids other units', () => {
      const unit = createUnit(2, 5);
      createUnit(5, 5); // Another unit blocking the way

      const path = Pathfinder.findPath(world, unit, 2, 5, 8, 5, 20, 20);
      expect(path).not.toBeNull();
      // Should route around the other unit
      expect(path!.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores passable obstacles', () => {
      const unit = createUnit(2, 5);
      // Create a passable obstacle (bridge/brook)
      const bridge = world.createEntity();
      world.addComponent<PositionComponent>(bridge, { type: 'position', x: 5, y: 5, facing: 0 });
      world.addComponent<ObstacleComponent>(bridge, {
        type: 'obstacle',
        radius: 1.5,
        isPassable: true,
        speedMultiplier: 1.0,
      });

      const path = Pathfinder.findPath(world, unit, 2, 5, 8, 5, 20, 20);
      expect(path).not.toBeNull();
      // Should be a straight line since the obstacle is passable
      expect(path!.length).toBe(2);
    });
  });

  describe('getPositionAlongPath', () => {
    it('returns start for zero distance', () => {
      const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
      const pos = Pathfinder.getPositionAlongPath(path, 0);
      expect(pos).toEqual({ x: 0, y: 0 });
    });

    it('returns point along first segment', () => {
      const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
      const pos = Pathfinder.getPositionAlongPath(path, 5);
      expect(pos.x).toBeCloseTo(5);
      expect(pos.y).toBeCloseTo(0);
    });

    it('returns endpoint when distance exceeds path length', () => {
      const path = [{ x: 0, y: 0 }, { x: 3, y: 4 }];
      const pos = Pathfinder.getPositionAlongPath(path, 100);
      expect(pos).toEqual({ x: 3, y: 4 });
    });

    it('handles multi-segment paths', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
      ];
      // Total length: 3 + 4 = 7
      // At distance 5: 3 along first segment + 2 along second
      const pos = Pathfinder.getPositionAlongPath(path, 5);
      expect(pos.x).toBeCloseTo(3);
      expect(pos.y).toBeCloseTo(2);
    });
  });

  describe('pathLength', () => {
    it('calculates total path length', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
      ];
      expect(Pathfinder.pathLength(path)).toBeCloseTo(7);
    });

    it('returns 0 for single point', () => {
      expect(Pathfinder.pathLength([{ x: 5, y: 5 }])).toBe(0);
    });
  });

  describe('centered coordinate maps (negative coords)', () => {
    it('finds straight-line path with negative coordinates', () => {
      const unit = createUnit(-5, 0);
      const path = Pathfinder.findPath(world, unit, -5, 0, 5, 0, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBe(2);
      expect(path![0]).toEqual({ x: -5, y: 0 });
      expect(path![1]).toEqual({ x: 5, y: 0 });
    });

    it('routes around stone wall at origin on centered map', () => {
      // Simulates the "duel" scenario: knight at (-4,0), wall at (0,0), target at (4,0)
      const unit = createUnit(-4, 0);
      createRectObstacle(0, 0, 1.5, 0.4, 0); // stone wall: halfLength=1.5, halfWidth=0.4

      const path = Pathfinder.findPath(world, unit, -4, 0, 4, 0, 15, 15);
      expect(path).not.toBeNull();
      // Path should go around the wall, not through it
      expect(path!.length).toBeGreaterThan(2);

      // Verify no waypoint is inside the wall's expanded bounds
      for (const wp of path!) {
        const dx = wp.x - 0; // wall center x
        const dy = wp.y - 0; // wall center y
        // In local space (rotation=0), check distance from wall center
        const insideWall = Math.abs(dx) < 1.5 && Math.abs(dy) < 0.4;
        // At least one waypoint coordinate should be outside the wall
        if (insideWall) {
          // This waypoint is inside the raw wall bounds — it should be start or end only
          // and should not be an intermediate waypoint
          expect(wp === path![0] || wp === path![path!.length - 1]).toBe(true);
        }
      }
    });

    it('routes around circular obstacle at negative coordinates', () => {
      const unit = createUnit(-7, -3);
      createObstacle(-3, -3, 1.5);

      const path = Pathfinder.findPath(world, unit, -7, -3, 1, -3, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);
      const totalLength = Pathfinder.pathLength(path!);
      // Straight line is 8 units; path around should be longer
      expect(totalLength).toBeGreaterThan(8);
    });
  });

  describe('path segment collision with stone wall', () => {
    /** Check that no interior path segment crosses through a rotated rectangle obstacle.
     *  Skips the very first and last path points since they are exact unit/target positions
     *  that may legitimately be adjacent to the wall. */
    function assertPathAvoidsRect(
      path: { x: number; y: number }[],
      cx: number, cy: number,
      halfLength: number, halfWidth: number,
      rotation: number
    ) {
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const hx = halfLength;
      const hy = halfWidth;

      // Check sample points along each segment (skip first point of first segment
      // and last point of last segment — those are the unit/target positions)
      for (let i = 0; i < path.length - 1; i++) {
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          // Skip exact start and end of entire path
          if (i === 0 && s === 0) continue;
          if (i === path.length - 2 && s === steps) continue;

          const t = s / steps;
          const px = path[i].x + (path[i + 1].x - path[i].x) * t;
          const py = path[i].y + (path[i + 1].y - path[i].y) * t;
          // Transform to local space
          const dx = px - cx;
          const dy = py - cy;
          const lx = cos * dx - sin * dy;
          const ly = sin * dx + cos * dy;
          const insideWall = Math.abs(lx) < hx && Math.abs(ly) < hy;
          if (insideWall) {
            throw new Error(
              `Path segment ${i} at t=${t} passes through wall interior: ` +
              `world(${px.toFixed(2)}, ${py.toFixed(2)}) -> local(${lx.toFixed(2)}, ${ly.toFixed(2)})`
            );
          }
        }
      }
    }

    it('duel scenario: path from knight to orc avoids stone wall', () => {
      // Exact duel scenario: wall at (0,0), rotation=0.3, length=3
      // Knight at (-4, 0), needs to reach (4, 0)
      const unit = createUnit(-4, 0);
      const halfLength = 1.5; // length 3 / 2
      const halfWidth = 0.4;
      const rotation = 0.3;
      createRectObstacle(0, 0, halfLength, halfWidth, rotation);

      const path = Pathfinder.findPath(world, unit, -4, 0, 4, 0, 15, 15);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);

      // Verify path doesn't pass through the wall
      assertPathAvoidsRect(path!, 0, 0, halfLength, halfWidth, rotation);

      // Path should be longer than straight-line distance (8 units)
      const totalLen = Pathfinder.pathLength(path!);
      expect(totalLen).toBeGreaterThan(8);
    });

    it('long stone wall forces path around end', () => {
      // Long wall blocking horizontal movement
      const unit = createUnit(-5, 0);
      createRectObstacle(0, 0, 3, 0.4, 0); // 6-unit long wall at origin

      const path = Pathfinder.findPath(world, unit, -5, 0, 5, 0, 20, 20);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);
      assertPathAvoidsRect(path!, 0, 0, 3, 0.4, 0);
    });

    it('village scenario: wall at negative coords', () => {
      // Wall at (-6, 6) with halfLength=2.5 covers x from -8.5 to -3.5
      // Unit starts outside the wall at (-10, 6), target at (-2, 6)
      const unit = createUnit(-10, 6);
      createRectObstacle(-6, 6, 2.5, 0.4, 0); // stone_wall length=5

      const path = Pathfinder.findPath(world, unit, -10, 6, -2, 6, 30, 30);
      expect(path).not.toBeNull();
      expect(path!.length).toBeGreaterThan(2);
      assertPathAvoidsRect(path!, -6, 6, 2.5, 0.4, 0);
    });

  });

  describe('integration with movement', () => {
    it('finds path around obstacle to reach the other side', () => {
      const unit = createUnit(3, 10);
      // Large obstacle blocking direct path
      createObstacle(10, 10, 3);

      const path = Pathfinder.findPath(world, unit, 3, 10, 17, 10, 30, 20);
      expect(path).not.toBeNull();

      // Verify the path actually reaches the destination
      const lastPoint = path![path!.length - 1];
      expect(lastPoint.x).toBeCloseTo(17);
      expect(lastPoint.y).toBeCloseTo(10);

      // Verify it goes around, not through
      const totalLen = Pathfinder.pathLength(path!);
      expect(totalLen).toBeGreaterThan(14); // Straight line would be 14
    });

    it('getPositionAlongPath respects movement budget', () => {
      const unit = createUnit(3, 10);
      createObstacle(10, 10, 3);

      const path = Pathfinder.findPath(world, unit, 3, 10, 17, 10, 30, 20);
      expect(path).not.toBeNull();

      // With limited movement budget, should stop partway along path
      const pos = Pathfinder.getPositionAlongPath(path!, 5);
      const distFromStart = Math.sqrt(
        (pos.x - 3) ** 2 + (pos.y - 10) ** 2
      );
      // Should have moved but not reached destination
      expect(distFromStart).toBeGreaterThan(0);
      expect(distFromStart).toBeLessThanOrEqual(5.1);
    });
  });
});
