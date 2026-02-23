import { WorldImpl } from '../ecs/World';
import { EntityId } from '../types';
import {
  PositionComponent,
  ObstacleComponent,
  HealthComponent,
} from '../components';

const UNIT_RADIUS = 0.5;
const CELL_SIZE = 0.5;
/** Extra clearance beyond obstacle radius + unit radius to avoid brushing edges. */
const CLEARANCE = 0.15;

interface PathNode {
  gx: number; // grid x
  gy: number; // grid y
  g: number;  // cost from start
  f: number;  // g + heuristic
  parentGx: number;
  parentGy: number;
}

/**
 * A* grid-based pathfinder that routes around obstacles.
 * Returns waypoints in world coordinates.
 */
export class Pathfinder {
  /**
   * Find a path from (fromX, fromY) to (toX, toY) avoiding obstacles.
   * Returns array of waypoints in world coordinates (including start and end).
   * Returns null if no path exists.
   */
  static findPath(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    mapWidth: number,
    mapHeight: number,
    approachTargetId?: EntityId
  ): { x: number; y: number }[] | null {
    // If direct path is clear, return straight line
    if (this.isPathClear(world, entityId, fromX, fromY, toX, toY, approachTargetId)) {
      return [{ x: fromX, y: fromY }, { x: toX, y: toY }];
    }

    // Maps are centered at (0,0), so coordinates range from -w/2 to +w/2.
    // Offset all world↔grid conversions so the grid covers the full map.
    const halfW = mapWidth / 2;
    const halfH = mapHeight / 2;

    const gridW = Math.ceil(mapWidth / CELL_SIZE);
    const gridH = Math.ceil(mapHeight / CELL_SIZE);

    // Build blocked grid (offset-aware)
    const blocked = this.buildBlockedGrid(world, entityId, gridW, gridH, halfW, halfH, approachTargetId);

    // Convert world coords to grid coords (offset by half-map)
    const startGx = Math.round((fromX + halfW) / CELL_SIZE);
    const startGy = Math.round((fromY + halfH) / CELL_SIZE);
    const endGx = Math.round((toX + halfW) / CELL_SIZE);
    const endGy = Math.round((toY + halfH) / CELL_SIZE);

    // Clamp to grid bounds
    const sgx = Math.max(0, Math.min(gridW - 1, startGx));
    const sgy = Math.max(0, Math.min(gridH - 1, startGy));
    const egx = Math.max(0, Math.min(gridW - 1, endGx));
    const egy = Math.max(0, Math.min(gridH - 1, endGy));

    // If start or end is blocked, find nearest unblocked cell
    const start = blocked[sgy * gridW + sgx]
      ? this.findNearestOpen(blocked, sgx, sgy, gridW, gridH)
      : { gx: sgx, gy: sgy };
    const end = blocked[egy * gridW + egx]
      ? this.findNearestOpen(blocked, egx, egy, gridW, gridH)
      : { gx: egx, gy: egy };

    if (!start || !end) return null;

    // A* search
    const path = this.astar(blocked, start.gx, start.gy, end.gx, end.gy, gridW, gridH);
    if (!path) return null;

    // Convert grid path to world coordinates (remove offset)
    const worldPath = path.map(p => ({
      x: p.gx * CELL_SIZE - halfW,
      y: p.gy * CELL_SIZE - halfH,
    }));

    // Replace first and last with exact coordinates
    worldPath[0] = { x: fromX, y: fromY };
    worldPath[worldPath.length - 1] = { x: toX, y: toY };

    // Smooth the path to remove unnecessary waypoints
    return this.smoothPath(world, entityId, worldPath, approachTargetId);
  }

  /**
   * Follow a path up to maxDistance and return the final position.
   */
  static getPositionAlongPath(
    path: { x: number; y: number }[],
    maxDistance: number
  ): { x: number; y: number } {
    if (path.length === 0) return { x: 0, y: 0 };
    if (path.length === 1) return path[0];

    let remaining = maxDistance;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1].x - path[i].x;
      const dy = path[i + 1].y - path[i].y;
      const segLen = Math.sqrt(dx * dx + dy * dy);

      if (segLen <= remaining) {
        remaining -= segLen;
      } else {
        // Partial segment
        const ratio = remaining / segLen;
        return {
          x: path[i].x + dx * ratio,
          y: path[i].y + dy * ratio,
        };
      }
    }

    // Reached the end
    return path[path.length - 1];
  }

  /**
   * Calculate total path length.
   */
  static pathLength(path: { x: number; y: number }[]): number {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1].x - path[i].x;
      const dy = path[i + 1].y - path[i].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  /** Check if straight line from A to B is clear of non-passable obstacles and other units. */
  private static isPathClear(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    approachTargetId?: EntityId
  ): boolean {
    // Check obstacles
    const obstacles = world.query('position', 'obstacle');
    for (const obsId of obstacles) {
      const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
      const obsPos = world.getComponent<PositionComponent>(obsId, 'position');
      if (!obs || !obsPos || obs.isPassable) continue;

      if (obs.halfLength != null && obs.halfWidth != null) {
        if (this.lineRectIntersects(
          fromX, fromY, toX, toY,
          obsPos.x, obsPos.y,
          obs.halfLength, obs.halfWidth,
          obs.rotation ?? 0
        )) return false;
      } else {
        const r = obs.radius + UNIT_RADIUS;
        if (this.lineCircleIntersects(fromX, fromY, toX, toY, obsPos.x, obsPos.y, r)) {
          return false;
        }
      }
    }

    // Check other units (prevent pathing through them)
    const units = world.query('position', 'health');
    for (const uid of units) {
      if (uid === entityId) continue;
      if (uid === approachTargetId) continue;
      const health = world.getComponent<HealthComponent>(uid, 'health');
      if (health?.woundState === 'down') continue;
      const uPos = world.getComponent<PositionComponent>(uid, 'position');
      if (!uPos) continue;
      const r = UNIT_RADIUS * 2;
      if (this.lineCircleIntersects(fromX, fromY, toX, toY, uPos.x, uPos.y, r)) {
        return false;
      }
    }

    return true;
  }

  /** Build boolean array of blocked cells. */
  private static buildBlockedGrid(
    world: WorldImpl,
    entityId: EntityId,
    gridW: number,
    gridH: number,
    halfW: number,
    halfH: number,
    approachTargetId?: EntityId
  ): boolean[] {
    const blocked = new Array<boolean>(gridW * gridH).fill(false);

    const obstacles = world.query('position', 'obstacle');
    for (const obsId of obstacles) {
      const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
      const obsPos = world.getComponent<PositionComponent>(obsId, 'position');
      if (!obs || !obsPos || obs.isPassable) continue;

      if (obs.halfLength != null && obs.halfWidth != null) {
        this.markRectBlocked(
          blocked, gridW, gridH, halfW, halfH,
          obsPos.x, obsPos.y,
          obs.halfLength, obs.halfWidth,
          obs.rotation ?? 0
        );
      } else {
        const r = obs.radius + UNIT_RADIUS + CLEARANCE;
        this.markCircleBlocked(blocked, gridW, gridH, halfW, halfH, obsPos.x, obsPos.y, r);
      }
    }

    // Mark other units as blocked (except downed ones and the approach target)
    const units = world.query('position', 'health');
    for (const uid of units) {
      if (uid === entityId) continue;
      if (uid === approachTargetId) continue;
      const health = world.getComponent<HealthComponent>(uid, 'health');
      if (health?.woundState === 'down') continue;
      const uPos = world.getComponent<PositionComponent>(uid, 'position');
      if (!uPos) continue;
      this.markCircleBlocked(blocked, gridW, gridH, halfW, halfH, uPos.x, uPos.y, UNIT_RADIUS * 2 + CLEARANCE);
    }

    return blocked;
  }

  /** Mark cells within a circle as blocked. */
  private static markCircleBlocked(
    blocked: boolean[],
    gridW: number,
    gridH: number,
    halfW: number,
    halfH: number,
    cx: number,
    cy: number,
    r: number
  ): void {
    const minGx = Math.max(0, Math.floor((cx + halfW - r) / CELL_SIZE));
    const maxGx = Math.min(gridW - 1, Math.ceil((cx + halfW + r) / CELL_SIZE));
    const minGy = Math.max(0, Math.floor((cy + halfH - r) / CELL_SIZE));
    const maxGy = Math.min(gridH - 1, Math.ceil((cy + halfH + r) / CELL_SIZE));

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const wx = gx * CELL_SIZE - halfW;
        const wy = gy * CELL_SIZE - halfH;
        const dx = wx - cx;
        const dy = wy - cy;
        if (dx * dx + dy * dy <= r * r) {
          blocked[gy * gridW + gx] = true;
        }
      }
    }
  }

  /** Mark cells within a rotated rectangle as blocked (expanded by UNIT_RADIUS + CLEARANCE). */
  private static markRectBlocked(
    blocked: boolean[],
    gridW: number,
    gridH: number,
    halfW: number,
    halfH: number,
    cx: number,
    cy: number,
    halfLength: number,
    halfWidth: number,
    rotation: number
  ): void {
    const hx = halfLength + UNIT_RADIUS + CLEARANCE;
    const hy = halfWidth + UNIT_RADIUS + CLEARANCE;
    // Bounding circle for fast rejection
    const boundR = Math.sqrt(hx * hx + hy * hy);
    const minGx = Math.max(0, Math.floor((cx + halfW - boundR) / CELL_SIZE));
    const maxGx = Math.min(gridW - 1, Math.ceil((cx + halfW + boundR) / CELL_SIZE));
    const minGy = Math.max(0, Math.floor((cy + halfH - boundR) / CELL_SIZE));
    const maxGy = Math.min(gridH - 1, Math.ceil((cy + halfH + boundR) / CELL_SIZE));

    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const wx = gx * CELL_SIZE - halfW - cx;
        const wy = gy * CELL_SIZE - halfH - cy;
        // Transform to local space
        const lx = cos * wx - sin * wy;
        const ly = sin * wx + cos * wy;
        if (Math.abs(lx) <= hx && Math.abs(ly) <= hy) {
          blocked[gy * gridW + gx] = true;
        }
      }
    }
  }

  /** Find nearest unblocked cell to (gx, gy). */
  private static findNearestOpen(
    blocked: boolean[],
    gx: number,
    gy: number,
    gridW: number,
    gridH: number
  ): { gx: number; gy: number } | null {
    for (let r = 1; r < Math.max(gridW, gridH); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
          if (!blocked[ny * gridW + nx]) return { gx: nx, gy: ny };
        }
      }
    }
    return null;
  }

  /** A* on grid. Returns array of grid coords or null. */
  private static astar(
    blocked: boolean[],
    startGx: number,
    startGy: number,
    endGx: number,
    endGy: number,
    gridW: number,
    gridH: number
  ): { gx: number; gy: number }[] | null {
    const key = (gx: number, gy: number) => gy * gridW + gx;
    const heuristic = (gx: number, gy: number) => {
      const dx = Math.abs(gx - endGx);
      const dy = Math.abs(gy - endGy);
      // Octile distance
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };

    const gScore = new Map<number, number>();
    const parent = new Map<number, number>();
    const startKey = key(startGx, startGy);
    gScore.set(startKey, 0);

    // Simple binary heap using array
    const open: PathNode[] = [{
      gx: startGx,
      gy: startGy,
      g: 0,
      f: heuristic(startGx, startGy),
      parentGx: -1,
      parentGy: -1,
    }];
    const closed = new Set<number>();

    // Directions: 8-connected
    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1],
    ];
    const dirCosts = [
      Math.SQRT2, 1, Math.SQRT2,
      1,             1,
      Math.SQRT2, 1, Math.SQRT2,
    ];

    while (open.length > 0) {
      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      open[bestIdx] = open[open.length - 1];
      open.pop();

      const cKey = key(current.gx, current.gy);
      if (closed.has(cKey)) continue;
      closed.add(cKey);

      // Goal check
      if (current.gx === endGx && current.gy === endGy) {
        // Reconstruct path
        const path: { gx: number; gy: number }[] = [];
        let k = cKey;
        while (k !== undefined && k !== -1) {
          const gy = Math.floor(k / gridW);
          const gx = k % gridW;
          path.push({ gx, gy });
          const p = parent.get(k);
          if (p === undefined) break;
          k = p;
        }
        path.reverse();
        return path;
      }

      // Expand neighbors
      for (let d = 0; d < 8; d++) {
        const nx = current.gx + dirs[d][0];
        const ny = current.gy + dirs[d][1];
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;

        const nKey = key(nx, ny);
        if (closed.has(nKey)) continue;
        if (blocked[nKey]) continue;

        // For diagonal movement, both adjacent cardinal cells must be unblocked
        if (dirs[d][0] !== 0 && dirs[d][1] !== 0) {
          const adj1 = key(current.gx + dirs[d][0], current.gy);
          const adj2 = key(current.gx, current.gy + dirs[d][1]);
          if (blocked[adj1] || blocked[adj2]) continue;
        }

        const tentativeG = current.g + dirCosts[d];
        const prevG = gScore.get(nKey);
        if (prevG !== undefined && tentativeG >= prevG) continue;

        gScore.set(nKey, tentativeG);
        parent.set(nKey, cKey);
        open.push({
          gx: nx,
          gy: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny),
          parentGx: current.gx,
          parentGy: current.gy,
        });
      }
    }

    return null; // No path found
  }

  /** Smooth path by removing waypoints that have clear line of sight. */
  private static smoothPath(
    world: WorldImpl,
    entityId: EntityId,
    path: { x: number; y: number }[],
    approachTargetId?: EntityId
  ): { x: number; y: number }[] {
    if (path.length <= 2) return path;

    const smoothed: { x: number; y: number }[] = [path[0]];
    let current = 0;

    while (current < path.length - 1) {
      // Try to skip as many waypoints as possible
      let farthest = current + 1;
      for (let i = path.length - 1; i > current + 1; i--) {
        if (this.isPathClear(world, entityId, path[current].x, path[current].y, path[i].x, path[i].y, approachTargetId)) {
          farthest = i;
          break;
        }
      }
      smoothed.push(path[farthest]);
      current = farthest;
    }

    return smoothed;
  }

  /** Check if line segment intersects circle. */
  private static lineCircleIntersects(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    r: number
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return (fx * fx + fy * fy) < r * r;
    const b = 2 * (dx * fx + dy * fy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
  }

  /** Check if line segment intersects rotated rectangle (expanded by UNIT_RADIUS). */
  private static lineRectIntersects(
    x1: number, y1: number,
    x2: number, y2: number,
    cx: number, cy: number,
    halfLength: number, halfWidth: number,
    rotation: number
  ): boolean {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);

    const dx1 = x1 - cx;
    const dy1 = y1 - cy;
    const lx1 = cos * dx1 - sin * dy1;
    const ly1 = sin * dx1 + cos * dy1;

    const dx2 = x2 - cx;
    const dy2 = y2 - cy;
    const lx2 = cos * dx2 - sin * dy2;
    const ly2 = sin * dx2 + cos * dy2;

    const hx = halfLength + UNIT_RADIUS;
    const hy = halfWidth + UNIT_RADIUS;

    const ldx = lx2 - lx1;
    const ldy = ly2 - ly1;

    let tMin = 0;
    let tMax = 1;

    if (Math.abs(ldx) < 1e-10) {
      if (lx1 < -hx || lx1 > hx) return false;
    } else {
      let t1 = (-hx - lx1) / ldx;
      let t2 = (hx - lx1) / ldx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }

    if (Math.abs(ldy) < 1e-10) {
      if (ly1 < -hy || ly1 > hy) return false;
    } else {
      let t1 = (-hy - ly1) / ldy;
      let t2 = (hy - ly1) / ldy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }

    return true;
  }
}
