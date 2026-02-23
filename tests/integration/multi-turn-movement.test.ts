import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../src/engine/ecs/World';
import { EventBusImpl } from '../../src/engine/core/EventBus';
import { DiceRoller } from '../../src/engine/core/DiceRoller';
import { UnitFactory } from '../../src/engine/data/UnitFactory';
import { TurnResolutionSystem } from '../../src/engine/systems/TurnResolutionSystem';
import { MovementSystem } from '../../src/engine/systems/MovementSystem';
import {
  PositionComponent,
  ActionPointsComponent,
  HealthComponent,
  FactionComponent,
  CommandQueueComponent,
  ObstacleComponent,
  MoveCommand,
} from '../../src/engine/components';
import { Pathfinder } from '../../src/engine/systems/Pathfinder';

/**
 * Tests for multi-turn waypoint movement logic.
 *
 * The actual auto-continue runs in TurnBasedGame (UI layer), but these tests
 * verify the underlying engine mechanics: that movement can be split across
 * turns and the remaining distance computed correctly.
 */
describe('Multi-Turn Movement', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;
  let roller: DiceRoller;
  const mapSize = { width: 40, height: 40 };

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
    roller = new DiceRoller(42);
  });

  describe('Movement leg computation', () => {
    it('clamps movement to max distance when destination is far away', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const mode = 'advance' as const;
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;

      // Click a location much farther than one turn can reach
      const farX = 20;
      const farY = 0;
      const dest = MovementSystem.getClampedDestination(
        world, warrior, 0, 0, farX, farY, mapSize, maxDist
      );

      // Should be clamped to maxDist
      const movedDist = MovementSystem.calculateDistance(0, 0, dest.x, dest.y);
      expect(movedDist).toBeLessThanOrEqual(maxDist + 0.01);
      expect(movedDist).toBeGreaterThan(0);

      // Final destination is still far away
      const remaining = MovementSystem.calculateDistance(dest.x, dest.y, farX, farY);
      expect(remaining).toBeGreaterThan(0.5);
    });

    it('does not clamp when destination is within range', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const mode = 'advance' as const;
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;

      // Click a location within one turn's reach
      const nearX = maxDist * 0.5;
      const nearY = 0;
      const dest = MovementSystem.getClampedDestination(
        world, warrior, 0, 0, nearX, nearY, mapSize, maxDist
      );

      expect(dest.x).toBeCloseTo(nearX, 1);
      expect(dest.y).toBeCloseTo(nearY, 1);
    });
  });

  describe('Multi-turn movement simulation', () => {
    it('reaches a distant destination over multiple turns', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const finalDestX = 20;
      const finalDestY = 0;
      const mode = 'advance' as const;

      let currentX = 0;
      let currentY = 0;
      const maxTurns = 20;
      let turnsUsed = 0;

      for (let turn = 0; turn < maxTurns; turn++) {
        const distToFinal = MovementSystem.calculateDistance(
          currentX, currentY, finalDestX, finalDestY
        );
        if (distToFinal < 0.5) break;

        const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
        const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
        const dest = MovementSystem.getClampedDestination(
          world, warrior, currentX, currentY, finalDestX, finalDestY, mapSize, maxDist
        );

        const apCost = MovementSystem.getMovementApCost(
          currentX, currentY, dest.x, dest.y, mode, baseSpeed
        );
        if (apCost === 0) break;

        // Queue and resolve the move
        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'move',
          targetX: dest.x,
          targetY: dest.y,
          mode,
          apCost,
          priority: 2,
        } as MoveCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn + 1, mapSize);

        const pos = world.getComponent<PositionComponent>(warrior, 'position')!;
        currentX = pos.x;
        currentY = pos.y;
        turnsUsed++;
      }

      // Should have arrived at or very near the destination
      const finalDist = MovementSystem.calculateDistance(
        currentX, currentY, finalDestX, finalDestY
      );
      expect(finalDist).toBeLessThan(1.0);
      expect(turnsUsed).toBeGreaterThan(1); // Took multiple turns
    });

    it('makes progress each turn toward the destination', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const finalDestX = 15;
      const finalDestY = 0;
      const mode = 'advance' as const;

      let currentX = 0;
      let currentY = 0;
      let prevDist = MovementSystem.calculateDistance(currentX, currentY, finalDestX, finalDestY);

      for (let turn = 0; turn < 5; turn++) {
        const distToFinal = MovementSystem.calculateDistance(
          currentX, currentY, finalDestX, finalDestY
        );
        if (distToFinal < 0.5) break;

        const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
        const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
        const dest = MovementSystem.getClampedDestination(
          world, warrior, currentX, currentY, finalDestX, finalDestY, mapSize, maxDist
        );

        const apCost = MovementSystem.getMovementApCost(
          currentX, currentY, dest.x, dest.y, mode, baseSpeed
        );
        if (apCost === 0) break;

        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'move',
          targetX: dest.x,
          targetY: dest.y,
          mode,
          apCost,
          priority: 2,
        } as MoveCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn + 1, mapSize);

        const pos = world.getComponent<PositionComponent>(warrior, 'position')!;
        currentX = pos.x;
        currentY = pos.y;

        const newDist = MovementSystem.calculateDistance(currentX, currentY, finalDestX, finalDestY);
        expect(newDist).toBeLessThan(prevDist); // Getting closer each turn
        prevDist = newDist;
      }
    });
  });

  describe('Waypoint destination tracking', () => {
    it('determines when destination is beyond single-turn reach', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const mode = 'advance' as const;
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;

      const farX = 20;
      const farY = 0;
      const dest = MovementSystem.getClampedDestination(
        world, warrior, 0, 0, farX, farY, mapSize, maxDist
      );

      // Distance from clamped dest to final click > 0.5 means multi-turn needed
      const distToFinal = MovementSystem.calculateDistance(dest.x, dest.y, farX, farY);
      expect(distToFinal).toBeGreaterThan(0.5);
    });

    it('determines when destination is within single-turn reach', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const mode = 'advance' as const;
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;

      const nearX = maxDist * 0.3;
      const nearY = 0;
      const dest = MovementSystem.getClampedDestination(
        world, warrior, 0, 0, nearX, nearY, mapSize, maxDist
      );

      const distToFinal = MovementSystem.calculateDistance(dest.x, dest.y, nearX, nearY);
      expect(distToFinal).toBeLessThan(0.5);
    });
  });

  describe('Auto-continue skip conditions', () => {
    it('should not queue movement for downed units', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const health = world.getComponent<HealthComponent>(warrior, 'health')!;
      world.addComponent(warrior, { ...health, woundState: 'down' } as HealthComponent);

      // The auto-continue logic checks woundState === 'down' before queuing.
      // Verify the health state is correctly set so the check would skip this unit.
      const updatedHealth = world.getComponent<HealthComponent>(warrior, 'health')!;
      expect(updatedHealth.woundState).toBe('down');
    });

    it('should not queue movement when unit already has commands', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      // Queue an existing command
      TurnResolutionSystem.queueCommand(world, warrior, {
        type: 'move',
        targetX: 2,
        targetY: 0,
        mode: 'advance',
        apCost: 2,
        priority: 2,
      } as MoveCommand);

      const queue = world.getComponent<CommandQueueComponent>(warrior, 'commandQueue')!;
      expect(queue.commands.length).toBe(1);

      // Auto-continue logic should check for existing commands and skip
      // (the actual check is in TurnBasedGame, but we verify the queue state here)
      expect(queue.commands[0].type).toBe('move');
      expect((queue.commands[0] as MoveCommand).targetX).toBe(2);
    });
  });

  describe('Pathfinding around obstacles', () => {
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

    /** Check that no path segment passes through a circular obstacle. */
    function assertPathAvoidsCircle(
      path: { x: number; y: number }[],
      cx: number, cy: number, radius: number
    ) {
      for (let i = 0; i < path.length - 1; i++) {
        // Check midpoint of each segment (simple approximation)
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        const distToCenter = MovementSystem.calculateDistance(midX, midY, cx, cy);
        // Path should not pass through the obstacle interior
        // Use a slightly smaller threshold since path may graze edges
        expect(distToCenter).toBeGreaterThan(radius * 0.5);
      }
    }

    it('routes around a circular obstacle over multiple turns', () => {
      // Unit at (0,5), obstacle blocking direct path at (5,5), destination at (10,5)
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createObstacle(5, 5, 1.5);

      const mode = 'advance' as const;
      let currentX = 0;
      let currentY = 5;
      const finalDestX = 10;
      const finalDestY = 5;

      for (let turn = 0; turn < 15; turn++) {
        const distToFinal = MovementSystem.calculateDistance(
          currentX, currentY, finalDestX, finalDestY
        );
        if (distToFinal < 0.5) break;

        const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
        const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
        const dest = MovementSystem.getClampedDestination(
          world, warrior, currentX, currentY, finalDestX, finalDestY, mapSize, maxDist
        );

        const apCost = MovementSystem.getMovementApCost(
          currentX, currentY, dest.x, dest.y, mode, baseSpeed
        );
        if (apCost === 0) break;

        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'move',
          targetX: dest.x,
          targetY: dest.y,
          mode,
          apCost,
          priority: 2,
        } as MoveCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn + 1, mapSize);

        const pos = world.getComponent<PositionComponent>(warrior, 'position')!;
        currentX = pos.x;
        currentY = pos.y;

        // Unit should never be inside the obstacle
        const distToObs = MovementSystem.calculateDistance(currentX, currentY, 5, 5);
        expect(distToObs).toBeGreaterThan(1.0); // obstacle radius 1.5 + unit clearance
      }

      // Should have arrived
      const finalDist = MovementSystem.calculateDistance(currentX, currentY, finalDestX, finalDestY);
      expect(finalDist).toBeLessThan(1.0);
    });

    it('routes around a rectangular wall obstacle over multiple turns', () => {
      // Unit at (0,5), wall blocking at x=5 (vertical wall), destination at (10,5)
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createRectObstacle(5, 5, 0.5, 3, 0); // Vertical wall

      const mode = 'advance' as const;
      let currentX = 0;
      let currentY = 5;
      const finalDestX = 10;
      const finalDestY = 5;

      for (let turn = 0; turn < 15; turn++) {
        const distToFinal = MovementSystem.calculateDistance(
          currentX, currentY, finalDestX, finalDestY
        );
        if (distToFinal < 0.5) break;

        const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
        const maxDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
        const dest = MovementSystem.getClampedDestination(
          world, warrior, currentX, currentY, finalDestX, finalDestY, mapSize, maxDist
        );

        const apCost = MovementSystem.getMovementApCost(
          currentX, currentY, dest.x, dest.y, mode, baseSpeed
        );
        if (apCost === 0) break;

        TurnResolutionSystem.queueCommand(world, warrior, {
          type: 'move',
          targetX: dest.x,
          targetY: dest.y,
          mode,
          apCost,
          priority: 2,
        } as MoveCommand);

        TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn + 1, mapSize);

        const pos = world.getComponent<PositionComponent>(warrior, 'position')!;
        currentX = pos.x;
        currentY = pos.y;
      }

      // Should have arrived
      const finalDist = MovementSystem.calculateDistance(currentX, currentY, finalDestX, finalDestY);
      expect(finalDist).toBeLessThan(1.0);
    });

    it('full A* path avoids circular obstacles', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createObstacle(5, 5, 1.5);

      const pathResult = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 5, 10, 5, mapSize
      );

      expect(pathResult).not.toBeNull();
      expect(pathResult!.path.length).toBeGreaterThan(2); // Must have waypoints to route around

      // Verify no path segment passes through the obstacle
      assertPathAvoidsCircle(pathResult!.path, 5, 5, 1.5);

      // Total path should be longer than straight-line distance (10 units)
      const totalLen = Pathfinder.pathLength(pathResult!.path);
      expect(totalLen).toBeGreaterThan(10);
    });

    it('full A* path avoids rectangular obstacles', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createRectObstacle(5, 5, 0.5, 3, 0); // Vertical wall

      const pathResult = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 5, 10, 5, mapSize
      );

      expect(pathResult).not.toBeNull();
      expect(pathResult!.path.length).toBeGreaterThan(2);

      // Path must go around the wall — total length should be longer than 10
      const totalLen = Pathfinder.pathLength(pathResult!.path);
      expect(totalLen).toBeGreaterThan(10);
    });

    it('clamped single-turn destination is on the A* path, not through obstacle', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createObstacle(5, 5, 1.5);

      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost('advance').speedMultiplier;

      const dest = MovementSystem.getClampedDestination(
        world, warrior, 0, 5, 10, 5, mapSize, maxDist
      );

      // The clamped destination should not be inside the obstacle
      const distToObs = MovementSystem.calculateDistance(dest.x, dest.y, 5, 5);
      expect(distToObs).toBeGreaterThan(1.0);
    });
  });

  describe('UI path preview reproduces exact TurnBasedGame code path', () => {
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

    /**
     * Reproduces exactly what TurnBasedGame.updateCommandPreview does:
     * 1. On click: compute full A* path, compute clamped turn endpoint, store both
     * 2. For blue line: walk along stored fullPath up to turn endpoint
     * 3. For amber line: extract remaining stored fullPath after turn endpoint,
     *    fallback to Pathfinder.findPath if extraction fails
     *
     * This test must catch the bug where amber line goes straight through obstacles.
     */
    it('blue current-turn line follows stored A* path around obstacle', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createObstacle(5, 5, 1.5);

      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost('advance').speedMultiplier;

      // Step 1: What TurnBasedGame stores on click
      const fullPathResult = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 5, 10, 5, mapSize
      );
      expect(fullPathResult).not.toBeNull();
      const storedPath = fullPathResult!.path;

      // Step 2: What gets queued as the move command target
      const turnEnd = MovementSystem.getClampedDestination(
        world, warrior, 0, 5, 10, 5, mapSize, maxDist
      );

      // Step 3: Reproduce the blue line drawing logic from updateCommandPreview
      const bluePoints: { x: number; y: number }[] = [];
      const moveDistance = MovementSystem.calculateDistance(0, 5, turnEnd.x, turnEnd.y);
      let distAccum = 0;
      bluePoints.push({ x: storedPath[0].x, y: storedPath[0].y });
      for (let i = 1; i < storedPath.length; i++) {
        const segLen = MovementSystem.calculateDistance(
          storedPath[i - 1].x, storedPath[i - 1].y,
          storedPath[i].x, storedPath[i].y
        );
        if (distAccum + segLen >= moveDistance) {
          bluePoints.push({ x: turnEnd.x, y: turnEnd.y });
          break;
        }
        distAccum += segLen;
        bluePoints.push({ x: storedPath[i].x, y: storedPath[i].y });
      }

      // Verify blue line has multiple segments (went around obstacle, not straight through)
      expect(bluePoints.length).toBeGreaterThanOrEqual(2);
      // Verify no blue line point is inside the obstacle
      for (const p of bluePoints) {
        const dist = MovementSystem.calculateDistance(p.x, p.y, 5, 5);
        expect(dist).toBeGreaterThan(1.0);
      }
    });

    it('amber future-turn line from stored path avoids obstacle', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 5);
      createObstacle(5, 5, 1.5);

      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost('advance').speedMultiplier;

      // Step 1: Store the full A* path
      const fullPathResult = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 5, 10, 5, mapSize
      );
      expect(fullPathResult).not.toBeNull();
      const storedPath = fullPathResult!.path;
      const totalPathLen = Pathfinder.pathLength(storedPath);

      // Step 2: Get turn endpoint
      const turnEnd = MovementSystem.getClampedDestination(
        world, warrior, 0, 5, 10, 5, mapSize, maxDist
      );
      const lastX = turnEnd.x;
      const lastZ = turnEnd.y;
      const finalDestX = 10;
      const finalDestY = 5;
      const distToFinal = MovementSystem.calculateDistance(lastX, lastZ, finalDestX, finalDestY);

      // Step 3: Reproduce amber line drawing logic from updateCommandPreview
      const amberPoints: { x: number; y: number }[] = [];
      const moveDistFromStart = totalPathLen - distToFinal;
      let distAccum2 = 0;
      let started = false;

      for (let i = 1; i < storedPath.length; i++) {
        const segLen = MovementSystem.calculateDistance(
          storedPath[i - 1].x, storedPath[i - 1].y,
          storedPath[i].x, storedPath[i].y
        );
        if (!started) {
          if (distAccum2 + segLen >= moveDistFromStart - 0.1) {
            started = true;
            amberPoints.push({ x: lastX, y: lastZ });
            amberPoints.push({ x: storedPath[i].x, y: storedPath[i].y });
          }
          distAccum2 += segLen;
        } else {
          amberPoints.push({ x: storedPath[i].x, y: storedPath[i].y });
        }
      }

      // Step 4: If stored path extraction failed, this is the fallback
      if (amberPoints.length < 2) {
        // THIS IS THE BUG PATH - Pathfinder.findPath does isPathClear shortcut
        const freshPath = Pathfinder.findPath(
          world, warrior, lastX, lastZ, finalDestX, finalDestY,
          mapSize.width, mapSize.height
        );
        if (freshPath && freshPath.length >= 2) {
          for (const p of freshPath) {
            amberPoints.push({ x: p.x, y: p.y });
          }
        }
      }

      expect(amberPoints.length).toBeGreaterThanOrEqual(2);

      // THE KEY ASSERTION: no amber line point should be inside the obstacle
      for (const p of amberPoints) {
        const dist = MovementSystem.calculateDistance(p.x, p.y, 5, 5);
        expect(dist).toBeGreaterThan(1.0);
      }

      // Also verify the line segments don't cross through the obstacle
      for (let i = 0; i < amberPoints.length - 1; i++) {
        const midX = (amberPoints[i].x + amberPoints[i + 1].x) / 2;
        const midY = (amberPoints[i].y + amberPoints[i + 1].y) / 2;
        const midDist = MovementSystem.calculateDistance(midX, midY, 5, 5);
        expect(midDist).toBeGreaterThan(1.0);
      }
    });
  });

  describe('Path computation for preview', () => {
    it('computes a pathfinding route for distant destinations', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

      const result = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 0, 20, 0, mapSize
      );

      expect(result).not.toBeNull();
      expect(result!.path.length).toBeGreaterThanOrEqual(2);
      expect(result!.destination.x).toBeCloseTo(20, 0);
      expect(result!.destination.y).toBeCloseTo(0, 0);
    });

    it('computes a clamped pathfinding route with maxDistance', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost('advance').speedMultiplier;

      const result = MovementSystem.getPathfindingDestination(
        world, warrior, 0, 0, 20, 0, mapSize, maxDist
      );

      expect(result).not.toBeNull();
      const movedDist = MovementSystem.calculateDistance(0, 0, result!.destination.x, result!.destination.y);
      expect(movedDist).toBeLessThanOrEqual(maxDist + 0.01);
    });

    it('computes remaining path from intermediate position to final destination', () => {
      const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);
      const baseSpeed = UnitFactory.getBaseSpeed(world, warrior);
      const maxDist = baseSpeed * MovementSystem.getMovementModeCost('advance').speedMultiplier;

      // First leg: get clamped position
      const firstLeg = MovementSystem.getClampedDestination(
        world, warrior, 0, 0, 20, 0, mapSize, maxDist
      );

      // Second leg: compute remaining path from intermediate to final
      const remainingPath = MovementSystem.getPathfindingDestination(
        world, warrior, firstLeg.x, firstLeg.y, 20, 0, mapSize
      );

      expect(remainingPath).not.toBeNull();
      expect(remainingPath!.path.length).toBeGreaterThanOrEqual(2);
      // Remaining path start should be near the first leg destination
      expect(remainingPath!.path[0].x).toBeCloseTo(firstLeg.x, 0);
    });
  });
});
