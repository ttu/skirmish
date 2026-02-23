import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { MovementSystem, MovementMode } from '../../../src/engine/systems/MovementSystem';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import {
  PositionComponent,
  ActionPointsComponent,
  StaminaComponent,
  EngagementComponent,
  HealthComponent,
  ObstacleComponent,
  FactionComponent,
} from '../../../src/engine/components';

describe('MovementSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  function createMobileUnit(x: number, y: number, facing: number = 0) {
    const entity = world.createEntity();
    world.addComponent<PositionComponent>(entity, {
      type: 'position',
      x,
      y,
      facing,
    });
    world.addComponent<ActionPointsComponent>(entity, {
      type: 'actionPoints',
      current: 5,
      max: 5,
      baseValue: 5,
      armorPenalty: 0,
      experienceBonus: 0,
    });
    world.addComponent<StaminaComponent>(entity, {
      type: 'stamina',
      current: 10,
      max: 10,
      exhausted: false,
    });
    world.addComponent<EngagementComponent>(entity, {
      type: 'engagement',
      engagedWith: [],
    });
    return entity;
  }

  describe('calculateMovementCost', () => {
    it('walk costs 1 AP and moves 25% speed', () => {
      const cost = MovementSystem.getMovementModeCost('walk');
      expect(cost.apCost).toBe(1);
      expect(cost.speedMultiplier).toBe(0.25);
      expect(cost.staminaCost).toBe(0);
    });

    it('advance costs 2 AP and moves 50% speed', () => {
      const cost = MovementSystem.getMovementModeCost('advance');
      expect(cost.apCost).toBe(2);
      expect(cost.speedMultiplier).toBe(0.5);
      expect(cost.staminaCost).toBe(0);
    });

    it('run costs 4 AP and moves 75% speed', () => {
      const cost = MovementSystem.getMovementModeCost('run');
      expect(cost.apCost).toBe(4);
      expect(cost.speedMultiplier).toBe(0.75);
      expect(cost.staminaCost).toBe(1);
    });

    it('sprint costs all AP and moves 100% speed', () => {
      const cost = MovementSystem.getMovementModeCost('sprint');
      expect(cost.apCost).toBe(Infinity); // All AP
      expect(cost.speedMultiplier).toBe(1.0);
      expect(cost.staminaCost).toBe(3);
    });
  });

  describe('getMovementApCost (distance-based)', () => {
    const baseSpeed = 6;

    it('short move costs 1 AP', () => {
      expect(MovementSystem.getMovementApCost(0, 0, 1, 0, 'advance', baseSpeed)).toBe(1);
      expect(MovementSystem.getMovementApCost(0, 0, 0.5, 0, 'walk', baseSpeed)).toBe(1);
    });

    it('longer move costs more AP', () => {
      // Advance: 1.5m per AP, so 3m = 2 AP
      expect(MovementSystem.getMovementApCost(0, 0, 3, 0, 'advance', baseSpeed)).toBe(2);
    });

    it('multiple short moves can share 1 AP each', () => {
      const cost1 = MovementSystem.getMovementApCost(0, 0, 1, 0, 'walk', baseSpeed);
      const cost2 = MovementSystem.getMovementApCost(1, 0, 2, 0, 'walk', baseSpeed);
      expect(cost1).toBe(1);
      expect(cost2).toBe(1);
    });
  });

  describe('moveUnit', () => {
    it('moves unit to target position', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6; // 6 meters per turn at full speed

      MovementSystem.moveUnit(world, eventBus, entity, 3, 0, 'advance', baseSpeed, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position')!;
      expect(pos.x).toBe(3);
      expect(pos.y).toBe(0);
    });

    it('limits movement to max distance based on mode', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6;

      // Try to move 10 units with walk (25% of 6 = 1.5 max)
      MovementSystem.moveUnit(world, eventBus, entity, 10, 0, 'walk', baseSpeed, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position')!;
      expect(pos.x).toBe(1.5); // Capped at max walk distance
    });

    it('deducts AP for movement (distance-based)', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6;

      // Short move (1m): advance gives 1.5m per AP, so 1m costs 1 AP
      MovementSystem.moveUnit(world, eventBus, entity, 1, 0, 'advance', baseSpeed, 1);
      let ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.current).toBe(4); // 5 - 1 = 4

      // Longer move (2.5m): 2.5/1.5 = 2 AP
      MovementSystem.moveUnit(world, eventBus, entity, 4, 0, 'advance', baseSpeed, 1);
      ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.current).toBe(2); // 4 - 2 = 2
    });

    it('deducts stamina for running', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, entity, 4, 0, 'run', baseSpeed, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(9); // 10 - 1 = 9
    });

    it('deducts more stamina for sprinting', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, entity, 6, 0, 'sprint', baseSpeed, 1);

      const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
      expect(stamina.current).toBe(7); // 10 - 3 = 7
    });

    it('emits UnitMoved event', () => {
      const entity = createMobileUnit(0, 0);
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, entity, 2, 2, 'advance', baseSpeed, 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitMoved',
          entityId: entity,
          data: expect.objectContaining({
            fromX: 0,
            fromY: 0,
          }),
        })
      );
    });

    it('stops at edge of exclusion zone when destination is blocked by another unit', () => {
      const player = createMobileUnit(0, 0);
      const enemy = createMobileUnit(5, 0);
      world.addComponent<HealthComponent>(player, {
        type: 'health',
        current: 10,
        max: 10,
        woundState: 'healthy',
      });
      world.addComponent<HealthComponent>(enemy, {
        type: 'health',
        current: 10,
        max: 10,
        woundState: 'healthy',
      });
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, enemy, 0, 0, 'sprint', baseSpeed, 1);

      const enemyPos = world.getComponent<PositionComponent>(enemy, 'position')!;
      const playerPos = world.getComponent<PositionComponent>(player, 'position')!;
      const dist = MovementSystem.calculateDistance(enemyPos.x, enemyPos.y, playerPos.x, playerPos.y);
      // Unit should stop at MIN_UNIT_SEPARATION distance (1.0m) from player
      expect(dist).toBeGreaterThanOrEqual(1.0);
      expect(dist).toBeLessThan(1.1); // Should be close to 1.0m
      expect(enemyPos.x).toBeCloseTo(1, 1); // Should move from 5 to ~1
      expect(enemyPos.y).toBe(0);
    });

    it('does not allow moving when segment is entirely inside another unit circle', () => {
      const player = createMobileUnit(0, 0);
      const enemy = createMobileUnit(0.5, 0);
      world.addComponent<HealthComponent>(player, {
        type: 'health',
        current: 10,
        max: 10,
        woundState: 'healthy',
      });
      world.addComponent<HealthComponent>(enemy, {
        type: 'health',
        current: 10,
        max: 10,
        woundState: 'healthy',
      });
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, enemy, 0, 0, 'advance', baseSpeed, 1);

      const enemyPos = world.getComponent<PositionComponent>(enemy, 'position')!;
      expect(enemyPos.x).toBe(0.5);
      expect(enemyPos.y).toBe(0);
    });

    it('stops before obstacle so unit cannot move through it', () => {
      const unit = createMobileUnit(0, 0);
      world.addComponent<HealthComponent>(unit, {
        type: 'health',
        current: 10,
        max: 10,
        woundState: 'healthy',
      });
      // Obstacle at (3, 0) with radius 1; unit at (0,0) tries to move to (6, 0)
      const obstacleId = world.createEntity();
      world.addComponent<PositionComponent>(obstacleId, {
        type: 'position',
        x: 3,
        y: 0,
        facing: 0,
      });
      world.addComponent<ObstacleComponent>(obstacleId, {
        type: 'obstacle',
        radius: 1,
        isPassable: false,
      });
      const baseSpeed = 6;

      MovementSystem.moveUnit(world, eventBus, unit, 6, 0, 'advance', baseSpeed, 1);

      const pos = world.getComponent<PositionComponent>(unit, 'position')!;
      // Unit should stop before obstacle (obstacle radius 1 + unit radius 0.5 = 1.5, so center at 3 -> unit stops at 3 - 1.5 = 1.5)
      expect(pos.x).toBeLessThanOrEqual(2);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.y).toBe(0);
    });
  });

  describe('turnUnit', () => {
    it('90 degree turn is free', () => {
      const entity = createMobileUnit(0, 0, 0);

      MovementSystem.turnUnit(world, eventBus, entity, Math.PI / 2, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position')!;
      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;

      expect(pos.facing).toBe(Math.PI / 2);
      expect(ap.current).toBe(5); // No AP cost for 90 degrees
    });

    it('180 degree turn costs 1 AP', () => {
      const entity = createMobileUnit(0, 0, 0);

      MovementSystem.turnUnit(world, eventBus, entity, Math.PI, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position')!;
      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;

      expect(pos.facing).toBe(Math.PI);
      expect(ap.current).toBe(4); // 5 - 1 = 4
    });
  });

  describe('calculateDistance', () => {
    it('calculates distance between two points', () => {
      const distance = MovementSystem.calculateDistance(0, 0, 3, 4);
      expect(distance).toBe(5); // 3-4-5 triangle
    });
  });

  describe('isInEngagementRange', () => {
    it('returns true when units are within 1.5m', () => {
      const e1 = createMobileUnit(0, 0);
      const e2 = createMobileUnit(1, 0);

      expect(MovementSystem.isInEngagementRange(world, e1, e2)).toBe(true);
    });

    it('returns false when units are far apart', () => {
      const e1 = createMobileUnit(0, 0);
      const e2 = createMobileUnit(10, 0);

      expect(MovementSystem.isInEngagementRange(world, e1, e2)).toBe(false);
    });
  });

  describe('disengage', () => {
    it('costs 2 AP to safely disengage', () => {
      const entity = createMobileUnit(0, 0);
      const enemy = createMobileUnit(1, 0);

      // Set up engagement
      world.addComponent<EngagementComponent>(entity, {
        type: 'engagement',
        engagedWith: [enemy],
      });

      MovementSystem.disengage(world, eventBus, entity, 1);

      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      const engagement = world.getComponent<EngagementComponent>(entity, 'engagement')!;

      expect(ap.current).toBe(3); // 5 - 2 = 3
      expect(engagement.engagedWith).toEqual([]);
    });
  });

  describe('rectangular obstacle collision', () => {
    function createRectObstacle(
      x: number, y: number,
      halfLength: number, halfWidth: number,
      rotation: number = 0
    ) {
      const id = world.createEntity();
      world.addComponent<PositionComponent>(id, {
        type: 'position', x, y, facing: 0,
      });
      world.addComponent<ObstacleComponent>(id, {
        type: 'obstacle',
        radius: 0,
        isPassable: false,
        halfLength,
        halfWidth,
        rotation,
      });
      return id;
    }

    it('blocks movement through the long side of a wall', () => {
      const unit = createMobileUnit(0, 0);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });
      // Wall at (3, 0), length 4 (halfLength=2), width 0.8 (halfWidth=0.4), no rotation
      // Wall extends from x=1 to x=5, z=-0.4 to z=0.4
      createRectObstacle(3, 0, 2, 0.4);

      MovementSystem.moveUnit(world, eventBus, unit, 6, 0, 'sprint', 10, 1);

      const pos = world.getComponent<PositionComponent>(unit, 'position')!;
      // Unit (radius 0.5) should stop before the wall: wall starts at z=-0.4 expanded by 0.5 = unit stops at x ~ 0.5
      // Actually wall edge at x=1 (3 - halfLength 2), minus unit radius 0.5 = 0.5
      expect(pos.x).toBeLessThan(1.1); // Must stop before wall edge (x=1) minus clearance
      expect(pos.x).toBeGreaterThan(0);
    });

    it('allows movement past the narrow end of a wall through a gap', () => {
      const unit = createMobileUnit(0, 2);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });
      // Wall at (3, 0), halfLength=2, halfWidth=0.4, no rotation
      // Wall occupies x=[1,5], z=[-0.4, 0.4]
      // Unit at (0, 2) moving to (6, 2) — passes above the wall with 1.1m clearance
      createRectObstacle(3, 0, 2, 0.4);

      MovementSystem.moveUnit(world, eventBus, unit, 6, 2, 'sprint', 10, 1);

      const pos = world.getComponent<PositionComponent>(unit, 'position')!;
      // Should pass freely — gap of 1.1m (unit at z=2, wall edge at z=0.9 with unit radius)
      expect(pos.x).toBe(6);
      expect(pos.y).toBe(2);
    });

    it('allows movement through gap between rock and wall that circular collision would block', () => {
      const unit = createMobileUnit(0, 1.5);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });
      // Wall at (3, 0), halfLength=2.5, halfWidth=0.4 — extends z=-0.4 to z=0.4
      createRectObstacle(3, 0, 2.5, 0.4);
      // Rock at (3, 3) with circular radius 0.8
      const rockId = world.createEntity();
      world.addComponent<PositionComponent>(rockId, {
        type: 'position', x: 3, y: 3, facing: 0,
      });
      world.addComponent<ObstacleComponent>(rockId, {
        type: 'obstacle', radius: 0.8, isPassable: false,
      });

      // Unit at z=1.5 tries to move through the gap between wall (edge at z=0.9 with radius) and rock (edge at z=1.7 with radius)
      // Gap: wall top edge = 0.4 + 0.5 = 0.9, rock bottom edge = 3 - 0.8 - 0.5 = 1.7
      // Available gap center at z=1.3, gap width = 0.8m — unit radius 0.5 means it should fit
      MovementSystem.moveUnit(world, eventBus, unit, 6, 1.5, 'sprint', 10, 1);

      const pos = world.getComponent<PositionComponent>(unit, 'position')!;
      // With rectangular collision, unit should pass through the gap
      expect(pos.x).toBeGreaterThan(4); // Should make it past the obstacles
    });

    it('blocks movement through a rotated wall', () => {
      const unit = createMobileUnit(0, 0);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });
      // Wall at (3, 0), rotated 90 degrees — now the long axis is along z
      createRectObstacle(3, 0, 2, 0.4, Math.PI / 2);

      // Unit moves along x axis toward the rotated wall
      MovementSystem.moveUnit(world, eventBus, unit, 6, 0, 'sprint', 10, 1);

      const pos = world.getComponent<PositionComponent>(unit, 'position')!;
      // Rotated wall: halfWidth (0.4) is now along x, so wall occupies x=[2.6, 3.4]
      // Unit should stop before x=2.6 - 0.5 = 2.1
      expect(pos.x).toBeLessThan(2.2);
      expect(pos.x).toBeGreaterThan(0);
    });
  });

  describe('brook speed penalty', () => {
    it('reduces movement distance when path crosses a brook', () => {
      const entity = createMobileUnit(0, 0);
      // Place a brook obstacle at (3, 0) — passable but slows movement
      const brookId = world.createEntity();
      world.addComponent<PositionComponent>(brookId, {
        type: 'position', x: 3, y: 0, facing: 0,
      });
      world.addComponent<ObstacleComponent>(brookId, {
        type: 'obstacle', radius: 0, isPassable: true, speedMultiplier: 0.5,
      });

      // Move through the brook with advance (0.5 * 12 = 6m max)
      MovementSystem.moveUnit(world, eventBus, entity, 6, 0, 'advance', 12, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position');
      // Brook halves effective movement, so distance should be less than 6
      expect(pos!.x).toBeLessThan(6);
      expect(pos!.x).toBeGreaterThan(0);
    });

    it('does not reduce movement when path does not cross a brook', () => {
      const entity = createMobileUnit(0, 0);
      // Place a brook far away
      const brookId = world.createEntity();
      world.addComponent<PositionComponent>(brookId, {
        type: 'position', x: 20, y: 20, facing: 0,
      });
      world.addComponent<ObstacleComponent>(brookId, {
        type: 'obstacle', radius: 0, isPassable: true, speedMultiplier: 0.5,
      });

      MovementSystem.moveUnit(world, eventBus, entity, 6, 0, 'advance', 12, 1);

      const pos = world.getComponent<PositionComponent>(entity, 'position');
      expect(pos!.x).toBe(6);
    });
  });

  describe('pathfinding movement emits path in event', () => {
    it('includes multi-waypoint path when routing around obstacle', () => {
      const unit = createMobileUnit(0, 5);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });

      // Place an obstacle directly between start (0,5) and target (10,5)
      const obsId = world.createEntity();
      world.addComponent<PositionComponent>(obsId, {
        type: 'position', x: 5, y: 5, facing: 0,
      });
      world.addComponent<ObstacleComponent>(obsId, {
        type: 'obstacle', radius: 2, isPassable: false,
      });

      const baseSpeed = 20; // Large speed so unit can reach destination
      const mapSize = { width: 20, height: 20 };

      MovementSystem.moveUnit(world, eventBus, unit, 10, 5, 'sprint', baseSpeed, 1, mapSize);

      const events = eventBus.getHistory();
      const moveEvent = events.find(e => e.type === 'UnitMoved');
      expect(moveEvent).toBeDefined();

      const path = moveEvent!.data.path as { x: number; y: number }[];
      expect(path).toBeDefined();
      // Path should have more than 2 waypoints (not a straight line)
      expect(path.length).toBeGreaterThan(2);

      // First waypoint should be near start, last near destination
      expect(path[0].x).toBeCloseTo(0, 0);
      expect(path[0].y).toBeCloseTo(5, 0);
      expect(path[path.length - 1].x).toBeCloseTo(10, 0);
      expect(path[path.length - 1].y).toBeCloseTo(5, 0);

      // Middle waypoints should deviate from the straight line y=5
      // (routing around the obstacle)
      const middlePoints = path.slice(1, -1);
      const deviates = middlePoints.some(p => Math.abs(p.y - 5) > 1);
      expect(deviates).toBe(true);
    });

    it('emits no path for straight-line movement without obstacles', () => {
      const unit = createMobileUnit(0, 0);
      const baseSpeed = 10;
      const mapSize = { width: 20, height: 20 };

      MovementSystem.moveUnit(world, eventBus, unit, 5, 0, 'advance', baseSpeed, 1, mapSize);

      const events = eventBus.getHistory();
      const moveEvent = events.find(e => e.type === 'UnitMoved');
      expect(moveEvent).toBeDefined();

      // Straight-line path (2 points) should still be provided for consistency
      // or undefined if pathfinder returns a 2-point path
      const path = moveEvent!.data.path as { x: number; y: number }[] | undefined;
      if (path) {
        // If a path is present, it should be a simple 2-point straight line
        expect(path.length).toBe(2);
      }
    });

    it('path waypoints stay clear of obstacle', () => {
      const unit = createMobileUnit(0, 5);
      world.addComponent<HealthComponent>(unit, {
        type: 'health', current: 10, max: 10, woundState: 'healthy',
      });

      const obsId = world.createEntity();
      world.addComponent<PositionComponent>(obsId, {
        type: 'position', x: 5, y: 5, facing: 0,
      });
      world.addComponent<ObstacleComponent>(obsId, {
        type: 'obstacle', radius: 2, isPassable: false,
      });

      const baseSpeed = 20;
      const mapSize = { width: 20, height: 20 };

      MovementSystem.moveUnit(world, eventBus, unit, 10, 5, 'sprint', baseSpeed, 1, mapSize);

      const moveEvent = eventBus.getHistory().find(e => e.type === 'UnitMoved');
      const path = moveEvent!.data.path as { x: number; y: number }[];

      // Every waypoint in the path should be outside the obstacle's exclusion zone
      // (obstacle radius 2 + unit radius 0.5 = 2.5)
      for (const point of path) {
        const dist = MovementSystem.calculateDistance(point.x, point.y, 5, 5);
        expect(dist).toBeGreaterThanOrEqual(2.0);
      }
    });
  });

  describe('updateEngagements with dead units', () => {
    function createUnitWithHealth(x: number, y: number, faction: 'player' | 'enemy', woundState: HealthComponent['woundState'] = 'healthy') {
      const entity = createMobileUnit(x, y);
      world.addComponent<FactionComponent>(entity, { type: 'faction', faction });
      world.addComponent<HealthComponent>(entity, {
        type: 'health', current: woundState === 'down' ? 0 : 10, max: 10, woundState,
      });
      return entity;
    }

    it('removes dead units from engagement lists', () => {
      const player = createUnitWithHealth(0, 0, 'player');
      const enemy = createUnitWithHealth(0.5, 0, 'enemy');

      // Establish engagement
      MovementSystem.updateEngagements(world, [player, enemy]);

      let playerEng = world.getComponent<EngagementComponent>(player, 'engagement')!;
      expect(playerEng.engagedWith).toContain(enemy);

      // Kill the enemy
      world.addComponent<HealthComponent>(enemy, {
        type: 'health', current: 0, max: 10, woundState: 'down',
      });

      // Update engagements — dead enemy should be removed
      MovementSystem.updateEngagements(world, [player, enemy]);

      playerEng = world.getComponent<EngagementComponent>(player, 'engagement')!;
      expect(playerEng.engagedWith).not.toContain(enemy);
    });

    it('does not engage with dead units', () => {
      const player = createUnitWithHealth(0, 0, 'player');
      const deadEnemy = createUnitWithHealth(0.5, 0, 'enemy', 'down');

      MovementSystem.updateEngagements(world, [player, deadEnemy]);

      const playerEng = world.getComponent<EngagementComponent>(player, 'engagement')!;
      expect(playerEng.engagedWith).not.toContain(deadEnemy);
    });
  });
});
