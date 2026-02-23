import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { EntityId } from '../types';
import {
  PositionComponent,
  ActionPointsComponent,
  StaminaComponent,
  EngagementComponent,
  HealthComponent,
  ObstacleComponent,
} from '../components';
import { Pathfinder } from './Pathfinder';

const MIN_UNIT_SEPARATION = 1.0;
/** Unit radius for obstacle clearance (half of min separation). */
const UNIT_RADIUS = 0.5;

export type MovementMode = 'walk' | 'advance' | 'run' | 'sprint' | 'hold';

export interface MovementModeCost {
  apCost: number;
  speedMultiplier: number;
  staminaCost: number;
}

const ENGAGEMENT_RANGE = 1.5; // meters

/** Melee attacks succeed when units are within touching distance.
 *  Must be >= MIN_UNIT_SEPARATION to allow attacks after moving adjacent to enemy. */
const MELEE_ATTACK_RANGE = MIN_UNIT_SEPARATION + 0.2; // 1.2 meters

export class MovementSystem {
  static readonly ENGAGEMENT_RANGE = ENGAGEMENT_RANGE;
  static readonly MELEE_ATTACK_RANGE = MELEE_ATTACK_RANGE;

  /** Compute destination of a move without applying it */
  static getMoveDestination(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    mode: MovementMode,
    baseSpeed: number
  ): { x: number; y: number } {
    const modeCost = this.getMovementModeCost(mode);
    const maxDistance = baseSpeed * modeCost.speedMultiplier;
    const requestedDistance = this.calculateDistance(fromX, fromY, targetX, targetY);
    if (requestedDistance < 0.01) return { x: fromX, y: fromY };
    const actualDistance = Math.min(requestedDistance, maxDistance);
    const ratio = actualDistance / requestedDistance;
    return {
      x: fromX + (targetX - fromX) * ratio,
      y: fromY + (targetY - fromY) * ratio,
    };
  }
  static getMovementModeCost(mode: MovementMode): MovementModeCost {
    switch (mode) {
      case 'hold':
        return { apCost: 0, speedMultiplier: 0, staminaCost: 0 };
      case 'walk':
        return { apCost: 1, speedMultiplier: 0.25, staminaCost: 0 };
      case 'advance':
        return { apCost: 2, speedMultiplier: 0.5, staminaCost: 0 };
      case 'run':
        return { apCost: 4, speedMultiplier: 0.75, staminaCost: 1 };
      case 'sprint':
        return { apCost: Infinity, speedMultiplier: 1.0, staminaCost: 3 };
    }
  }

  /**
   * Meters of movement per 1 AP at a given mode.
   * Walk/Advance: 0.25 * baseSpeed per AP. Run: 0.1875 * baseSpeed per AP.
   */
  static getMetersPerAP(mode: MovementMode, baseSpeed: number, currentAP?: number): number {
    const modeCost = this.getMovementModeCost(mode);
    if (mode === 'sprint' && currentAP != null && currentAP > 0) {
      return (baseSpeed * modeCost.speedMultiplier) / currentAP;
    }
    if (modeCost.apCost === 0 || modeCost.apCost === Infinity) return Infinity;
    return (baseSpeed * modeCost.speedMultiplier) / modeCost.apCost;
  }

  /**
   * AP cost for moving from (fromX,fromY) to (toX,toY) at the given mode.
   * Distance-based: short moves cost 1 AP, longer moves cost more.
   * Sprint uses all current AP.
   */
  static getMovementApCost(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    mode: MovementMode,
    baseSpeed: number,
    currentAP?: number
  ): number {
    const modeCost = this.getMovementModeCost(mode);
    if (mode === 'hold') return 0;
    if (mode === 'sprint' && currentAP != null) return currentAP;

    const dest = this.getMoveDestination(fromX, fromY, toX, toY, mode, baseSpeed);
    const distance = this.calculateDistance(fromX, fromY, dest.x, dest.y);
    if (distance < 0.01) return 0;

    const metersPerAP = this.getMetersPerAP(mode, baseSpeed, currentAP);
    if (metersPerAP === Infinity) return 0;
    const apCost = Math.ceil(distance / metersPerAP);
    const maxAP = modeCost.apCost;
    return Math.min(Math.max(1, apCost), maxAP);
  }

  static calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Clamp destination to avoid overlapping other units and obstacles. */
  private static clampToAvoidOverlap(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    destX: number,
    destY: number
  ): { x: number; y: number } {
    let minT = 1;

    // Other units (position + health)
    const others = world.query('position', 'health');
    for (const otherId of others) {
      if (otherId === entityId) continue;
      const health = world.getComponent<HealthComponent>(otherId, 'health');
      if (health?.woundState === 'down') continue;

      const otherPos = world.getComponent<PositionComponent>(otherId, 'position');
      if (!otherPos) continue;

      const distFrom = this.calculateDistance(fromX, fromY, otherPos.x, otherPos.y);
      if (distFrom < MIN_UNIT_SEPARATION) return { x: fromX, y: fromY };

      // Use line-circle intersection to find where path enters exclusion zone
      // This allows moving TO the edge of another unit instead of not moving at all
      const t = this.lineCircleIntersectT(
        fromX,
        fromY,
        destX,
        destY,
        otherPos.x,
        otherPos.y,
        MIN_UNIT_SEPARATION
      );
      if (t >= 0 && t < minT) minT = t;
    }

    // Obstacles (position + obstacle, non-passable)
    const obstacles = world.query('position', 'obstacle');
    for (const obsId of obstacles) {
      const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
      const obsPos = world.getComponent<PositionComponent>(obsId, 'position');
      if (!obs || !obsPos || obs.isPassable) continue;

      // Use rectangular collision for obstacles with half-extents
      if (obs.halfLength != null && obs.halfWidth != null) {
        const rot = obs.rotation ?? 0;
        const t = this.lineRectIntersectT(
          fromX, fromY, destX, destY,
          obsPos.x, obsPos.y,
          obs.halfLength, obs.halfWidth, rot
        );
        if (t === 0) return { x: fromX, y: fromY };
        if (t > 0 && t < minT) minT = t;
        continue;
      }

      const r = obs.radius + UNIT_RADIUS;
      const distFrom = this.calculateDistance(fromX, fromY, obsPos.x, obsPos.y);
      if (distFrom < r) return { x: fromX, y: fromY };

      const t = this.lineCircleIntersectT(
        fromX,
        fromY,
        destX,
        destY,
        obsPos.x,
        obsPos.y,
        r
      );
      if (t >= 0 && t < minT) minT = t;
    }

    if (minT >= 1) return { x: destX, y: destY };
    if (minT <= 0) return { x: fromX, y: fromY };

    return {
      x: fromX + (destX - fromX) * minT,
      y: fromY + (destY - fromY) * minT,
    };
  }

  /** Adjust a pathfinding destination to avoid overlapping other units.
   *  Walks backward along the path if the destination is too close to another unit.
   */
  private static adjustDestinationForUnitOverlap(
    world: WorldImpl,
    entityId: EntityId,
    destX: number,
    destY: number,
    path: { x: number; y: number }[]
  ): { x: number; y: number } {
    const others = world.query('position', 'health');
    for (const otherId of others) {
      if (otherId === entityId) continue;
      const health = world.getComponent<HealthComponent>(otherId, 'health');
      if (health?.woundState === 'down') continue;
      const otherPos = world.getComponent<PositionComponent>(otherId, 'position');
      if (!otherPos) continue;

      const dist = this.calculateDistance(destX, destY, otherPos.x, otherPos.y);
      if (dist < MIN_UNIT_SEPARATION) {
        // Walk backward along the path to find a safe position
        return this.retreatAlongPath(world, entityId, path, otherPos.x, otherPos.y);
      }
    }
    return { x: destX, y: destY };
  }

  /** Walk backward along a path to find a position that maintains MIN_UNIT_SEPARATION from a blocking unit. */
  private static retreatAlongPath(
    world: WorldImpl,
    entityId: EntityId,
    path: { x: number; y: number }[],
    blockX: number,
    blockY: number
  ): { x: number; y: number } {
    // Walk backward through path segments to find safe point
    for (let i = path.length - 1; i > 0; i--) {
      const segEnd = path[i];
      const segStart = path[i - 1];
      const dx = segEnd.x - segStart.x;
      const dy = segEnd.y - segStart.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen < 0.01) continue;

      // Sample along this segment from end toward start
      const steps = Math.ceil(segLen / 0.25);
      for (let s = 0; s <= steps; s++) {
        const t = 1 - s / steps;
        const px = segStart.x + dx * t;
        const py = segStart.y + dy * t;
        const distToBlock = this.calculateDistance(px, py, blockX, blockY);
        if (distToBlock >= MIN_UNIT_SEPARATION) {
          // Verify this point doesn't overlap any other unit
          let safe = true;
          const others = world.query('position', 'health');
          for (const otherId of others) {
            if (otherId === entityId) continue;
            const health = world.getComponent<HealthComponent>(otherId, 'health');
            if (health?.woundState === 'down') continue;
            const otherPos = world.getComponent<PositionComponent>(otherId, 'position');
            if (!otherPos) continue;
            if (this.calculateDistance(px, py, otherPos.x, otherPos.y) < MIN_UNIT_SEPARATION) {
              safe = false;
              break;
            }
          }
          if (safe) return { x: px, y: py };
        }
      }
    }
    // Fallback: stay at start of path
    return path[0];
  }

  /** Public clamp for destination (used by UI/AI so preview and queued moves respect obstacles).
   *  When mapSize is provided, uses A* pathfinding to route around obstacles.
   */
  static getClampedDestination(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    destX: number,
    destY: number,
    mapSize?: { width: number; height: number },
    maxDistance?: number,
    approachTargetId?: EntityId
  ): { x: number; y: number } {
    // Try pathfinding when map size is available
    if (mapSize) {
      const result = this.getPathfindingDestination(
        world, entityId, fromX, fromY, destX, destY, mapSize, maxDistance, approachTargetId
      );
      if (result) {
        return this.adjustDestinationForUnitOverlap(
          world, entityId, result.destination.x, result.destination.y, result.path
        );
      }
    }
    // Fallback to straight-line clamping (also respect maxDistance)
    let clampedDestX = destX;
    let clampedDestY = destY;
    if (maxDistance != null && maxDistance > 0) {
      const dist = this.calculateDistance(fromX, fromY, destX, destY);
      if (dist > maxDistance && dist > 0) {
        const ratio = maxDistance / dist;
        clampedDestX = fromX + (destX - fromX) * ratio;
        clampedDestY = fromY + (destY - fromY) * ratio;
      }
    }
    return this.clampToAvoidOverlap(world, entityId, fromX, fromY, clampedDestX, clampedDestY);
  }

  /** Find a path and return the reachable destination along it.
   *  Returns null if no path found (caller should fall back to straight-line).
   */
  static getPathfindingDestination(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    destX: number,
    destY: number,
    mapSize: { width: number; height: number },
    maxDistance?: number,
    approachTargetId?: EntityId
  ): { destination: { x: number; y: number }; path: { x: number; y: number }[] } | null {
    const path = Pathfinder.findPath(
      world, entityId, fromX, fromY, destX, destY,
      mapSize.width, mapSize.height, approachTargetId
    );
    if (!path || path.length < 2) return null;

    if (maxDistance != null && maxDistance > 0) {
      const dest = Pathfinder.getPositionAlongPath(path, maxDistance);
      return { destination: dest, path };
    }

    return { destination: path[path.length - 1], path };
  }

  /** Distance from point (px,py) to closest point on segment (ax,ay)-(bx,by). */
  private static pointToSegmentDistance(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return this.calculateDistance(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return this.calculateDistance(px, py, ax + t * dx, ay + t * dy);
  }

  /**
   * Find smallest t in [0,1] where segment first enters an oriented rectangle.
   * Rectangle centered at (cx,cy) with half-extents (halfLength, halfWidth), rotated by angle.
   * The rectangle is expanded by UNIT_RADIUS (Minkowski sum) for collision.
   * Returns -1 if no hit.
   */
  private static lineRectIntersectT(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    halfLength: number, halfWidth: number,
    rotation: number
  ): number {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    // Transform segment endpoints into obstacle's local space
    const dx1 = x1 - cx;
    const dy1 = y1 - cy;
    const lx1 = cos * dx1 - sin * dy1;
    const ly1 = sin * dx1 + cos * dy1;

    const dx2 = x2 - cx;
    const dy2 = y2 - cy;
    const lx2 = cos * dx2 - sin * dy2;
    const ly2 = sin * dx2 + cos * dy2;

    // Expanded half-extents (Minkowski sum with unit radius)
    const hx = halfLength + UNIT_RADIUS;
    const hy = halfWidth + UNIT_RADIUS;

    // Ray-AABB intersection (slab method)
    const ldx = lx2 - lx1;
    const ldy = ly2 - ly1;

    let tMin = 0;
    let tMax = 1;

    // X slab
    if (Math.abs(ldx) < 1e-10) {
      if (lx1 < -hx || lx1 > hx) return -1;
    } else {
      let t1 = (-hx - lx1) / ldx;
      let t2 = (hx - lx1) / ldx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return -1;
    }

    // Y slab
    if (Math.abs(ldy) < 1e-10) {
      if (ly1 < -hy || ly1 > hy) return -1;
    } else {
      let t1 = (-hy - ly1) / ldy;
      let t2 = (hy - ly1) / ldy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return -1;
    }

    return tMin;
  }

  /** Find smallest t in [0,1] where segment first touches circle. Returns -1 if no hit. */
  private static lineCircleIntersectT(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    r: number
  ): number {
    const d1 = this.calculateDistance(x1, y1, cx, cy);
    const d2 = this.calculateDistance(x2, y2, cx, cy);
    if (d1 < r && d2 < r) return 0;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return -1;
    const b = 2 * (dx * fx + dy * fy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    const tFirst = Math.min(t1, t2);
    const tSecond = Math.max(t1, t2);
    if (tFirst >= 0 && tFirst <= 1) return tFirst;
    if (tSecond >= 0 && tSecond <= 1) return tSecond;
    return -1;
  }

  /** Trim a path so it ends at the actual destination (which may be partway along the last segment). */
  private static trimPathToDestination(
    path: { x: number; y: number }[],
    destX: number,
    destY: number
  ): { x: number; y: number }[] {
    if (path.length < 2) return [{ x: destX, y: destY }];

    const trimmed: { x: number; y: number }[] = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const distToDest = this.calculateDistance(path[i].x, path[i].y, destX, destY);
      if (distToDest < 0.01) {
        trimmed.push(path[i]);
        break;
      }
      // Check if dest falls between path[i-1] and path[i]
      const segLen = this.calculateDistance(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      const d1 = this.calculateDistance(path[i - 1].x, path[i - 1].y, destX, destY);
      const d2 = this.calculateDistance(path[i].x, path[i].y, destX, destY);
      if (d1 <= segLen && d2 <= segLen) {
        // Destination is on this segment
        trimmed.push({ x: destX, y: destY });
        break;
      }
      trimmed.push(path[i]);
    }
    return trimmed;
  }

  static moveUnit(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    targetX: number,
    targetY: number,
    mode: MovementMode,
    baseSpeed: number,
    turn: number,
    mapSize?: { width: number; height: number }
  ): void {
    const position = world.getComponent<PositionComponent>(entityId, 'position');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');

    if (!position || !ap) return;

    const modeCost = this.getMovementModeCost(mode);

    // Calculate max movement distance
    let maxDistance = baseSpeed * modeCost.speedMultiplier;

    // Check for brook speed penalties along the movement path
    const fromX = position.x;
    const fromY = position.y;
    const obstacles = world.query('position', 'obstacle');
    for (const obsId of obstacles) {
      const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
      const obsPos = world.getComponent<PositionComponent>(obsId, 'position');
      if (!obs || !obsPos || obs.speedMultiplier == null || obs.speedMultiplier >= 1.0) continue;

      // Check if movement path passes near this obstacle
      const distToLine = this.pointToSegmentDistance(
        obsPos.x, obsPos.y, fromX, fromY, targetX, targetY,
      );
      if (distToLine < 2.0) {
        maxDistance *= obs.speedMultiplier;
      }
    }

    // Try pathfinding when map size is available
    let newX: number;
    let newY: number;
    let actualDistance: number;
    let movePath: { x: number; y: number }[] | undefined;

    if (mapSize) {
      const pathResult = this.getPathfindingDestination(
        world, entityId, fromX, fromY, targetX, targetY, mapSize, maxDistance
      );
      if (pathResult) {
        // Ensure pathfinding destination doesn't overlap other units
        const adjusted = this.adjustDestinationForUnitOverlap(
          world, entityId, pathResult.destination.x, pathResult.destination.y, pathResult.path
        );
        newX = adjusted.x;
        newY = adjusted.y;
        actualDistance = this.calculateDistance(fromX, fromY, newX, newY);
        // Store the path waypoints up to the actual destination for animation
        movePath = this.trimPathToDestination(pathResult.path, newX, newY);
      } else {
        // Fallback to straight-line
        newX = targetX;
        newY = targetY;
        const requestedDistance = this.calculateDistance(fromX, fromY, targetX, targetY);
        if (requestedDistance > maxDistance && requestedDistance > 0) {
          const ratio = maxDistance / requestedDistance;
          newX = fromX + (targetX - fromX) * ratio;
          newY = fromY + (targetY - fromY) * ratio;
        }
        const clamped = this.clampToAvoidOverlap(world, entityId, fromX, fromY, newX, newY);
        newX = clamped.x;
        newY = clamped.y;
        actualDistance = this.calculateDistance(fromX, fromY, newX, newY);
      }
    } else {
      // Original straight-line movement
      const requestedDistance = this.calculateDistance(fromX, fromY, targetX, targetY);

      newX = targetX;
      newY = targetY;

      if (requestedDistance > maxDistance && requestedDistance > 0) {
        const ratio = maxDistance / requestedDistance;
        newX = fromX + (targetX - fromX) * ratio;
        newY = fromY + (targetY - fromY) * ratio;
      }

      const clamped = this.clampToAvoidOverlap(world, entityId, fromX, fromY, newX, newY);
      newX = clamped.x;
      newY = clamped.y;
      actualDistance = this.calculateDistance(fromX, fromY, newX, newY);
    }

    // Distance-based AP cost (short moves = 1 AP, longer = more)
    const apCost =
      mode === 'sprint'
        ? ap.current
        : this.getMovementApCost(fromX, fromY, newX, newY, mode, baseSpeed, ap.current);

    if (ap.current < apCost) return;

    // Update facing to movement direction
    const newFacing = Math.atan2(newX - fromX, newY - fromY);

    // Update position
    world.addComponent<PositionComponent>(entityId, {
      ...position,
      x: newX,
      y: newY,
      facing: actualDistance > 0.01 ? newFacing : position.facing,
    });

    // Deduct AP
    world.addComponent<ActionPointsComponent>(entityId, {
      ...ap,
      current: mode === 'sprint' ? 0 : ap.current - apCost,
    });

    // Deduct stamina if applicable
    if (stamina && modeCost.staminaCost > 0) {
      world.addComponent<StaminaComponent>(entityId, {
        ...stamina,
        current: Math.max(0, stamina.current - modeCost.staminaCost),
        exhausted: stamina.current - modeCost.staminaCost <= 0,
      });
    }

    // Emit event
    eventBus.emit({
      type: 'UnitMoved',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        fromX,
        fromY,
        toX: newX,
        toY: newY,
        distance: actualDistance,
        mode,
        path: movePath,
      },
    });
  }

  static turnUnit(
    world: WorldImpl,
    _eventBus: EventBusImpl,
    entityId: EntityId,
    targetFacing: number,
    _turn: number
  ): void {
    const position = world.getComponent<PositionComponent>(entityId, 'position');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');

    if (!position || !ap) return;

    // Normalize angles to 0 - 2PI
    const currentFacing = ((position.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const newFacing = ((targetFacing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Calculate the smallest angle difference
    let angleDiff = Math.abs(newFacing - currentFacing);
    if (angleDiff > Math.PI) {
      angleDiff = 2 * Math.PI - angleDiff;
    }

    // 180 degree turn (PI radians) costs 1 AP, less is free
    const apCost = angleDiff > Math.PI / 2 + 0.01 ? 1 : 0;

    if (ap.current < apCost) return;

    // Update position with new facing
    world.addComponent<PositionComponent>(entityId, {
      ...position,
      facing: targetFacing,
    });

    // Deduct AP if needed
    if (apCost > 0) {
      world.addComponent<ActionPointsComponent>(entityId, {
        ...ap,
        current: ap.current - apCost,
      });
    }
  }

  /**
   * Get attack arc: front (0), side (+10%), or rear (+20%) based on attacker position relative to defender facing.
   */
  static getAttackArc(
    defenderX: number,
    defenderY: number,
    defenderFacing: number,
    attackerX: number,
    attackerY: number
  ): 'front' | 'side' | 'rear' {
    const angleToAttacker = Math.atan2(attackerX - defenderX, attackerY - defenderY);
    let relAngle = angleToAttacker - defenderFacing;
    while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
    while (relAngle < -Math.PI) relAngle += 2 * Math.PI;
    const absRel = Math.abs(relAngle);
    if (absRel <= Math.PI / 2) return 'front';
    if (absRel <= Math.PI) return 'side';
    return 'rear';
  }

  static isInEngagementRange(world: WorldImpl, entityA: EntityId, entityB: EntityId): boolean {
    const posA = world.getComponent<PositionComponent>(entityA, 'position');
    const posB = world.getComponent<PositionComponent>(entityB, 'position');

    if (!posA || !posB) return false;

    const distance = this.calculateDistance(posA.x, posA.y, posB.x, posB.y);
    return distance <= ENGAGEMENT_RANGE;
  }

  static disengage(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    turn: number
  ): boolean {
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const engagement = world.getComponent<EngagementComponent>(entityId, 'engagement');

    if (!ap || !engagement) return false;

    const DISENGAGE_COST = 2;

    if (ap.current < DISENGAGE_COST) return false;

    // Deduct AP
    world.addComponent<ActionPointsComponent>(entityId, {
      ...ap,
      current: ap.current - DISENGAGE_COST,
    });

    // Clear engagement
    world.addComponent<EngagementComponent>(entityId, {
      ...engagement,
      engagedWith: [],
    });

    eventBus.emit({
      type: 'UnitDisengaged',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {},
    });

    return true;
  }

  static updateEngagements(world: WorldImpl, entities: EntityId[]): void {
    // Check all pairs of entities for engagement range
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entityA = entities[i];
        const entityB = entities[j];

        const engagementA = world.getComponent<EngagementComponent>(entityA, 'engagement');
        const engagementB = world.getComponent<EngagementComponent>(entityB, 'engagement');

        if (!engagementA || !engagementB) continue;

        const inRange = this.isInEngagementRange(world, entityA, entityB);

        // Update engagement lists
        const aEngagedWithB = engagementA.engagedWith.includes(entityB);
        const bEngagedWithA = engagementB.engagedWith.includes(entityA);

        if (inRange && !aEngagedWithB) {
          world.addComponent<EngagementComponent>(entityA, {
            ...engagementA,
            engagedWith: [...engagementA.engagedWith, entityB],
          });
        } else if (!inRange && aEngagedWithB) {
          world.addComponent<EngagementComponent>(entityA, {
            ...engagementA,
            engagedWith: engagementA.engagedWith.filter((e) => e !== entityB),
          });
        }

        if (inRange && !bEngagedWithA) {
          world.addComponent<EngagementComponent>(entityB, {
            ...engagementB,
            engagedWith: [...engagementB.engagedWith, entityA],
          });
        } else if (!inRange && bEngagedWithA) {
          world.addComponent<EngagementComponent>(entityB, {
            ...engagementB,
            engagedWith: engagementB.engagedWith.filter((e) => e !== entityA),
          });
        }
      }
    }
  }
}
