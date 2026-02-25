import * as THREE from "three";
import {
  PositionComponent,
  HealthComponent,
} from "../engine/components";
import { EntityId } from "../engine/types";
import { GameContext } from "./GameContext";

interface MovementAnimation {
  id: EntityId;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Path waypoints for curved/routed movement. */
  path?: { x: number; y: number }[];
  /** Cumulative distances along path segments (for uniform-speed interpolation). */
  pathDistances?: number[];
  /** Total path length. */
  pathLength?: number;
  startTime: number;
}

export class MovementAnimator {
  private readonly ctx: GameContext;
  private animations: MovementAnimation[] = [];
  private trails: Map<EntityId, THREE.Line> = new Map();
  private readonly MOVE_ANIM_DURATION = 400;
  private onFinished: (() => void) | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  isAnimating(): boolean {
    return this.animations.length > 0;
  }

  start(
    oldPositions: Map<EntityId, { x: number; y: number }>,
    onFinished: () => void
  ): void {
    this.onFinished = onFinished;
    const world = this.ctx.engine.getWorld();
    const now = performance.now();
    const entityMeshes = this.ctx.getEntityMeshes();

    // Clear any existing trails
    this.clearAllTrails();

    // Build a map of entityId -> path from UnitMoved events
    const eventHistory = this.ctx.engine.getEventBus().getHistory();
    const pathsByEntity = new Map<EntityId, { x: number; y: number }[]>();
    for (let i = eventHistory.length - 1; i >= 0; i--) {
      const evt = eventHistory[i];
      if (evt.type === "TurnEnded") break; // Only look at current turn's events
      if (evt.type === "UnitMoved" && evt.entityId != null && evt.data.path) {
        pathsByEntity.set(evt.entityId, evt.data.path as { x: number; y: number }[]);
      }
    }

    for (const [id] of entityMeshes) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const health = world.getComponent<HealthComponent>(id, "health");
      if (!pos || (health && health.woundState === "down")) continue;

      const old = oldPositions.get(id);
      const dx = pos.x - (old?.x ?? pos.x);
      const dy = pos.y - (old?.y ?? pos.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) continue;

      const from = { x: old?.x ?? pos.x, y: old?.y ?? pos.y };
      const to = { x: pos.x, y: pos.y };
      const eventPath = pathsByEntity.get(id);

      // Use path waypoints if available (2+ points), otherwise straight line
      let path: { x: number; y: number }[] | undefined;
      let pathDistances: number[] | undefined;
      let pathLength: number | undefined;

      if (eventPath && eventPath.length >= 2) {
        path = eventPath;
        // Precompute cumulative distances for uniform-speed interpolation
        pathDistances = [0];
        let cumDist = 0;
        for (let i = 1; i < path.length; i++) {
          const segDx = path[i].x - path[i - 1].x;
          const segDy = path[i].y - path[i - 1].y;
          cumDist += Math.sqrt(segDx * segDx + segDy * segDy);
          pathDistances.push(cumDist);
        }
        pathLength = cumDist;
      }

      // Create movement trail along path
      this.createTrail(id, from.x, from.y, to.x, to.y, path);

      this.animations.push({
        id,
        from,
        to,
        path,
        pathDistances,
        pathLength,
        startTime: now,
      });
    }

    if (this.animations.length === 0) {
      this.onFinished?.();
      this.onFinished = null;
    }
  }

  update(now: number): void {
    if (this.animations.length === 0) return;

    const duration = this.MOVE_ANIM_DURATION;
    const remaining: MovementAnimation[] = [];
    const entityMeshes = this.ctx.getEntityMeshes();
    const floatingText = this.ctx.getFloatingText();
    const selectedEntityId = this.ctx.getSelectedEntityId();

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const group = entityMeshes.get(anim.id);
      if (!group) continue;

      let x: number;
      let y: number;

      if (anim.path && anim.pathDistances && anim.pathLength && anim.pathLength > 0) {
        // Interpolate along path waypoints
        const targetDist = eased * anim.pathLength;
        // Find which segment we're on
        let segIdx = 0;
        for (let i = 1; i < anim.pathDistances.length; i++) {
          if (anim.pathDistances[i] >= targetDist) {
            segIdx = i - 1;
            break;
          }
          segIdx = i - 1;
        }
        const segStart = anim.pathDistances[segIdx];
        const segEnd = anim.pathDistances[segIdx + 1] ?? segStart;
        const segLen = segEnd - segStart;
        const segT = segLen > 0 ? (targetDist - segStart) / segLen : 0;
        const p0 = anim.path[segIdx];
        const p1 = anim.path[segIdx + 1] ?? p0;
        x = p0.x + (p1.x - p0.x) * segT;
        y = p0.y + (p1.y - p0.y) * segT;
      } else {
        // Straight line interpolation
        x = anim.from.x + (anim.to.x - anim.from.x) * eased;
        y = anim.from.y + (anim.to.y - anim.from.y) * eased;
      }

      group.position.set(x, 0.06, y);

      // Update floating text position during animation
      floatingText.updateEntityPosition(anim.id, x, y);

      if (selectedEntityId === anim.id) {
        this.ctx.updateSelectionRingAt(x, y);
      }

      if (t < 1) {
        remaining.push(anim);
      } else {
        // Clear trail when animation finishes
        this.clearTrail(anim.id);
      }
    }

    this.animations = remaining;

    if (this.animations.length === 0) {
      this.onFinished?.();
      this.onFinished = null;
    }
  }

  clearAllTrails(): void {
    for (const [id] of this.trails) {
      this.clearTrail(id);
    }
  }

  private createTrail(
    entityId: EntityId,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    path?: { x: number; y: number }[]
  ): void {
    // Remove existing trail for this entity
    this.clearTrail(entityId);

    // Create a dashed line trail along the path or straight line
    let points: THREE.Vector3[];
    if (path && path.length >= 2) {
      points = path.map((p) => new THREE.Vector3(p.x, 0.1, p.y));
    } else {
      points = [
        new THREE.Vector3(fromX, 0.1, fromZ),
        new THREE.Vector3(toX, 0.1, toZ),
      ];
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x4fc3f7,
      dashSize: 0.2,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.ctx.scene.add(line);
    this.trails.set(entityId, line);
  }

  private clearTrail(entityId: EntityId): void {
    const existing = this.trails.get(entityId);
    if (existing) {
      this.ctx.scene.remove(existing);
      existing.geometry.dispose();
      (existing.material as THREE.Material).dispose();
      this.trails.delete(entityId);
    }
  }
}
