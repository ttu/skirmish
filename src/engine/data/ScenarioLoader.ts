import { WorldImpl } from '../ecs/World';
import { EntityId } from '../types';
import { UnitFactory } from './UnitFactory';
import { Scenario, ScenarioUnit, ScenarioObstacle } from '../../types';
import { AIControllerComponent } from '../systems/AICommandSystem';
import { PositionComponent, ObstacleComponent } from '../components';

const UNIT_RADIUS = 0.5;

export interface LoadedScenario {
  scenarioId: string;
  scenarioName: string;
  mapSize: { width: number; height: number };
  playerUnitIds: EntityId[];
  enemyUnitIds: EntityId[];
  objectives: string[];
}

interface ObstacleProps {
  radius: number;
  isPassable: boolean;
  speedMultiplier?: number;
  halfLength?: number;
  halfWidth?: number;
}

/** Radii, passability, and speed multiplier from Obstacle.ts (mirrors Obstacle class). */
function obstacleProperties(def: ScenarioObstacle): ObstacleProps {
  const scale = def.scale ?? 1;
  switch (def.type) {
    case 'tree':
    case 'tree_pine':
      return { radius: 0.4 * scale, isPassable: false };
    case 'tree_oak':
      return { radius: 0.7 * scale, isPassable: false };
    case 'tree_willow':
      return { radius: 1.0 * scale, isPassable: false };
    case 'house':
    case 'house_stone':
      return { radius: 1.5 * scale, isPassable: false };
    case 'house_cottage':
      return { radius: 1.0 * scale, isPassable: false };
    case 'house_hall':
      return { radius: 2.2 * scale, isPassable: false };
    case 'rock':
      return { radius: 0.8 * scale, isPassable: false };
    case 'stone_wall':
      return {
        radius: 0,
        isPassable: false,
        halfLength: ((def.length ?? 4) / 2) * scale,
        halfWidth: 0.4 * scale,
      };
    case 'river':
      return { radius: 1.5 * scale, isPassable: false };
    case 'brook':
      return { radius: 0, isPassable: true, speedMultiplier: 0.5 };
    case 'bridge':
      return { radius: 0, isPassable: true };
    case 'fence':
      return {
        radius: 0,
        isPassable: false,
        halfLength: 0.6 * scale,
        halfWidth: 0.15 * scale,
      };
    default:
      return { radius: 1, isPassable: false };
  }
}

/**
 * Loads a scenario into the engine world. Creates units from scenario definitions.
 * Scenario uses { x, z } for positions (Three.js ground); engine uses { x, y } - z maps to y.
 */
export function loadScenario(world: WorldImpl, scenario: Scenario): LoadedScenario {
  UnitFactory.resetDisplayNameCounters();

  const playerUnitIds: EntityId[] = [];
  const enemyUnitIds: EntityId[] = [];

  const createUnits = (units: ScenarioUnit[], faction: 'player' | 'enemy') => {
    const ids: EntityId[] = [];
    for (const u of units) {
      const entityId = UnitFactory.createUnit(
        world,
        u.type,
        faction,
        u.position.x,
        u.position.z,
        0,
        u.position.elevation ?? 0
      );
      if (faction === 'enemy') {
        world.addComponent<AIControllerComponent>(entityId, {
          type: 'aiController',
          personality: 'aggressive',
          currentGoal: 'engage',
        });
      }
      ids.push(entityId);
    }
    return ids;
  };

  for (const id of createUnits(scenario.playerUnits, 'player')) {
    playerUnitIds.push(id);
  }
  for (const id of createUnits(scenario.enemyUnits, 'enemy')) {
    enemyUnitIds.push(id);
  }

  // Create obstacle entities for movement blocking (position + obstacle component)
  if (scenario.obstacles?.length) {
    for (const def of scenario.obstacles) {
      const { radius, isPassable, speedMultiplier, halfLength, halfWidth } = obstacleProperties(def);
      const id = world.createEntity();
      world.addComponent<PositionComponent>(id, {
        type: 'position',
        x: def.position.x,
        y: def.position.z,
        facing: 0,
      });
      world.addComponent<ObstacleComponent>(id, {
        type: 'obstacle',
        radius,
        isPassable,
        ...(speedMultiplier != null && { speedMultiplier }),
        ...(halfLength != null && { halfLength }),
        ...(halfWidth != null && { halfWidth }),
        ...(def.rotation != null && { rotation: def.rotation }),
      });
    }
  }

  // Nudge any units that spawned inside obstacles
  nudgeUnitsOutOfObstacles(world, [...playerUnitIds, ...enemyUnitIds]);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    mapSize: scenario.mapSize,
    playerUnitIds,
    enemyUnitIds,
    objectives: scenario.objectives,
  };
}

/** Check if a point overlaps a circular obstacle (with unit radius clearance). */
function overlapsCircular(
  ux: number, uy: number,
  ox: number, oy: number,
  obsRadius: number,
): boolean {
  const dx = ux - ox;
  const dy = uy - oy;
  return Math.sqrt(dx * dx + dy * dy) < obsRadius + UNIT_RADIUS;
}

/** Check if a point overlaps a rectangular obstacle (with unit radius clearance). */
function overlapsRectangular(
  ux: number, uy: number,
  ox: number, oy: number,
  halfLength: number, halfWidth: number,
  rotation: number,
): boolean {
  // Transform to obstacle-local coordinates
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const dx = ux - ox;
  const dy = uy - oy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) < halfLength + UNIT_RADIUS && Math.abs(localY) < halfWidth + UNIT_RADIUS;
}

/** Nudge a unit out of a circular obstacle along the line from obstacle center to unit. */
function nudgeFromCircular(
  ux: number, uy: number,
  ox: number, oy: number,
  obsRadius: number,
): { x: number; y: number } {
  const dx = ux - ox;
  const dy = uy - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = obsRadius + UNIT_RADIUS;
  if (dist < 0.001) {
    // Unit is exactly at obstacle center — push along +x
    return { x: ox + minDist, y: oy };
  }
  const scale = minDist / dist;
  return { x: ox + dx * scale, y: oy + dy * scale };
}

/** Nudge a unit out of a rectangular obstacle along the shortest exit axis. */
function nudgeFromRectangular(
  ux: number, uy: number,
  ox: number, oy: number,
  halfLength: number, halfWidth: number,
  rotation: number,
): { x: number; y: number } {
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const dx = ux - ox;
  const dy = uy - oy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const expandedHL = halfLength + UNIT_RADIUS;
  const expandedHW = halfWidth + UNIT_RADIUS;

  // Find shortest exit: push along the axis with least penetration
  const overlapX = expandedHL - Math.abs(localX);
  const overlapY = expandedHW - Math.abs(localY);

  let newLocalX = localX;
  let newLocalY = localY;
  if (overlapX < overlapY) {
    newLocalX = Math.sign(localX || 1) * expandedHL;
  } else {
    newLocalY = Math.sign(localY || 1) * expandedHW;
  }

  // Transform back to world coordinates
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  return {
    x: ox + newLocalX * cosR - newLocalY * sinR,
    y: oy + newLocalX * sinR + newLocalY * cosR,
  };
}

/** After loading, nudge any units that overlap obstacles to the nearest valid position. */
function nudgeUnitsOutOfObstacles(world: WorldImpl, unitIds: EntityId[]): void {
  // Gather all obstacles
  const obstacles: Array<{
    pos: PositionComponent;
    obs: ObstacleComponent;
  }> = [];
  for (const id of world.getAllEntities()) {
    const obs = world.getComponent<ObstacleComponent>(id, 'obstacle');
    if (!obs) continue;
    const pos = world.getComponent<PositionComponent>(id, 'position');
    if (pos && !obs.isPassable) {
      obstacles.push({ pos, obs });
    }
  }

  for (const unitId of unitIds) {
    const unitPos = world.getComponent<PositionComponent>(unitId, 'position');
    if (!unitPos) continue;

    // Check against each obstacle and nudge iteratively
    for (const { pos: obsPos, obs } of obstacles) {
      const isRect = obs.halfLength != null && obs.halfWidth != null;

      if (isRect) {
        if (overlapsRectangular(
          unitPos.x, unitPos.y,
          obsPos.x, obsPos.y,
          obs.halfLength!, obs.halfWidth!,
          obs.rotation ?? 0,
        )) {
          const nudged = nudgeFromRectangular(
            unitPos.x, unitPos.y,
            obsPos.x, obsPos.y,
            obs.halfLength!, obs.halfWidth!,
            obs.rotation ?? 0,
          );
          unitPos.x = nudged.x;
          unitPos.y = nudged.y;
        }
      } else if (obs.radius > 0) {
        if (overlapsCircular(unitPos.x, unitPos.y, obsPos.x, obsPos.y, obs.radius)) {
          const nudged = nudgeFromCircular(unitPos.x, unitPos.y, obsPos.x, obsPos.y, obs.radius);
          unitPos.x = nudged.x;
          unitPos.y = nudged.y;
        }
      }
    }
  }
}
