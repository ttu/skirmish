import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { loadScenario } from '../../../src/engine/data/ScenarioLoader';
import { scenarios } from '../../../src/data/scenarios';
import { FactionComponent, HealthComponent, PositionComponent, ObstacleComponent } from '../../../src/engine/components';
import { Scenario } from '../../../src/types';

describe('ScenarioLoader', () => {
  let world: WorldImpl;

  beforeEach(() => {
    world = new WorldImpl();
  });

  it('loads tutorial scenario with correct unit counts', () => {
    const scenario = scenarios.find((s) => s.id === 'tutorial');
    expect(scenario).toBeDefined();

    const loaded = loadScenario(world, scenario!);

    expect(loaded.playerUnitIds).toHaveLength(3);
    expect(loaded.enemyUnitIds).toHaveLength(5);
    expect(loaded.scenarioId).toBe('tutorial');
    expect(loaded.mapSize).toEqual({ width: 30, height: 30 });
  });

  it('creates units with correct positions', () => {
    const scenario = scenarios.find((s) => s.id === 'tutorial')!;
    const loaded = loadScenario(world, scenario);

    const firstPlayer = world.getComponent<PositionComponent>(loaded.playerUnitIds[0], 'position');
    expect(firstPlayer).toBeDefined();
    expect(firstPlayer!.x).toBe(-8);
    expect(firstPlayer!.y).toBe(0);

    const firstEnemy = world.getComponent<PositionComponent>(loaded.enemyUnitIds[0], 'position');
    expect(firstEnemy).toBeDefined();
    expect(firstEnemy!.x).toBe(8);
    expect(firstEnemy!.y).toBe(0);
  });

  it('assigns correct factions', () => {
    const scenario = scenarios.find((s) => s.id === 'tutorial')!;
    const loaded = loadScenario(world, scenario);

    for (const id of loaded.playerUnitIds) {
      const faction = world.getComponent<FactionComponent>(id, 'faction');
      expect(faction?.faction).toBe('player');
    }
    for (const id of loaded.enemyUnitIds) {
      const faction = world.getComponent<FactionComponent>(id, 'faction');
      expect(faction?.faction).toBe('enemy');
    }
  });

  it('nudges units spawning inside circular obstacles to nearest valid position', () => {
    const scenario: Scenario = {
      id: 'test_overlap',
      name: 'Test Overlap',
      description: 'Test',
      mapSize: { width: 20, height: 20 },
      playerUnits: [
        { type: 'warrior', position: { x: 0, z: 0 }, faction: 'player' }, // inside rock at (0,0)
      ],
      enemyUnits: [
        { type: 'goblin', position: { x: 5, z: 0 }, faction: 'enemy' }, // clear of obstacles
      ],
      obstacles: [
        { type: 'rock', position: { x: 0, z: 0 } }, // radius 0.8
      ],
      objectives: ['Test'],
    };

    const loaded = loadScenario(world, scenario);
    const pos = world.getComponent<PositionComponent>(loaded.playerUnitIds[0], 'position')!;

    // Unit should have been pushed out of the rock (radius 0.8 + unit radius 0.5 = 1.3 min distance)
    const dx = pos.x - 0;
    const dy = pos.y - 0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThanOrEqual(1.3);
  });

  it('nudges units spawning inside rectangular obstacles', () => {
    const scenario: Scenario = {
      id: 'test_rect_overlap',
      name: 'Test Rect Overlap',
      description: 'Test',
      mapSize: { width: 20, height: 20 },
      playerUnits: [
        { type: 'warrior', position: { x: -1, z: 0 }, faction: 'player' }, // inside stone_wall
      ],
      enemyUnits: [
        { type: 'goblin', position: { x: 5, z: 0 }, faction: 'enemy' },
      ],
      obstacles: [
        { type: 'stone_wall', position: { x: 0, z: 0 }, rotation: 0, length: 6 },
        // halfLength=3, halfWidth=0.4 => extends x: -3..3, z: -0.4..0.4
      ],
      objectives: ['Test'],
    };

    const loaded = loadScenario(world, scenario);
    const pos = world.getComponent<PositionComponent>(loaded.playerUnitIds[0], 'position')!;

    // Unit should NOT still be at (-1, 0) inside the wall
    // It should have been nudged outside the wall + unit radius clearance
    const obs = { x: 0, y: 0, halfLength: 3, halfWidth: 0.4, rotation: 0 };
    // Check unit is outside the expanded obstacle bounds
    const localX = pos.x - obs.x;
    const localY = pos.y - obs.y;
    const outsideX = Math.abs(localX) >= obs.halfLength + 0.5;
    const outsideY = Math.abs(localY) >= obs.halfWidth + 0.5;
    expect(outsideX || outsideY).toBe(true);
  });

  it('does not move units that are already clear of obstacles', () => {
    const scenario: Scenario = {
      id: 'test_no_overlap',
      name: 'Test No Overlap',
      description: 'Test',
      mapSize: { width: 20, height: 20 },
      playerUnits: [
        { type: 'warrior', position: { x: -5, z: 0 }, faction: 'player' },
      ],
      enemyUnits: [
        { type: 'goblin', position: { x: 5, z: 0 }, faction: 'enemy' },
      ],
      obstacles: [
        { type: 'rock', position: { x: 0, z: 0 } },
      ],
      objectives: ['Test'],
    };

    const loaded = loadScenario(world, scenario);
    const pos = world.getComponent<PositionComponent>(loaded.playerUnitIds[0], 'position')!;

    // Unit should remain at original position
    expect(pos.x).toBe(-5);
    expect(pos.y).toBe(0);
  });

  it('gives units health from templates', () => {
    const scenario = scenarios.find((s) => s.id === 'tutorial')!;
    const loaded = loadScenario(world, scenario);

    const warrior = world.getComponent<HealthComponent>(loaded.playerUnitIds[0], 'health');
    expect(warrior).toBeDefined();
    expect(warrior!.current).toBeGreaterThan(0);
    expect(warrior!.max).toBe(warrior!.current);
    expect(warrior!.woundState).toBe('healthy');
  });
});
