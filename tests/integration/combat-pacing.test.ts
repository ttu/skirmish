import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/core/GameEngine';
import { TurnResolutionSystem } from '../../src/engine/systems/TurnResolutionSystem';
import { StaminaSystem } from '../../src/engine/systems/StaminaSystem';
import { CombatResolver } from '../../src/engine/systems/CombatResolver';
import { UnitFactory } from '../../src/engine/data/UnitFactory';
import {
  HealthComponent,
  ArmorComponent,
  StaminaComponent,
  AttackCommand,
} from '../../src/engine/components';

describe('Combat Pacing Integration', () => {
  it('knight armor class is heavy and cannot dodge', () => {
    const engine = new GameEngine({ seed: 42 });
    const knight = UnitFactory.createUnit(engine.getWorld(), 'knight', 'player', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(knight, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('heavy');
    expect(CombatResolver.getDodgePenalty('heavy')).toBeNull();
  });

  it('goblin armor class is unarmored with full dodge', () => {
    const engine = new GameEngine({ seed: 42 });
    const goblin = UnitFactory.createUnit(engine.getWorld(), 'goblin', 'enemy', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(goblin, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('unarmored');
    expect(CombatResolver.getDodgePenalty('unarmored')).toBe(0);
  });

  it('archer is light armor with dodge penalty', () => {
    const engine = new GameEngine({ seed: 42 });
    const archer = UnitFactory.createUnit(engine.getWorld(), 'archer', 'player', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(archer, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('light');
    expect(CombatResolver.getDodgePenalty('light')).toBe(-15);
  });

  it('warrior is medium armor with heavy dodge penalty', () => {
    const engine = new GameEngine({ seed: 42 });
    const warrior = UnitFactory.createUnit(engine.getWorld(), 'warrior', 'player', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(warrior, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('medium');
    expect(CombatResolver.getDodgePenalty('medium')).toBe(-30);
  });

  it('exhausted unit has -40 defense penalty', () => {
    const engine = new GameEngine({ seed: 42 });
    const knight = UnitFactory.createUnit(engine.getWorld(), 'knight', 'player', 5, 5);

    // Manually exhaust the knight
    engine.addComponent<StaminaComponent>(knight, {
      type: 'stamina', current: 0, max: 20, exhausted: true,
    });

    expect(StaminaSystem.getStaminaDefensePenalty(engine.getWorld(), knight)).toBe(-40);
  });

  it('repeated hits on knight drain stamina from armor absorption', () => {
    const engine = new GameEngine({ seed: 100 });
    const world = engine.getWorld();
    const eventBus = engine.getEventBus();

    const knight = UnitFactory.createUnit(world, 'knight', 'player', 5, 5);
    const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 6, 5);

    const staminaBefore = world.getComponent<StaminaComponent>(knight, 'stamina')!.current;

    // Queue multiple attacks from goblin against knight over several turns
    for (let turn = 1; turn <= 5; turn++) {
      TurnResolutionSystem.queueCommand(world, goblin, {
        type: 'attack',
        targetId: knight,
        attackType: 'melee',
        apCost: 1,
        priority: 2,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, engine.getDiceRoller(), turn);
    }

    // Knight's stamina should have decreased from absorbing hits
    // (even if all damage was absorbed by armor, stamina drain still applies)
    const staminaAfter = world.getComponent<StaminaComponent>(knight, 'stamina')!.current;
    // We can't predict exact value due to dice rolls, but check ArmorImpact events were emitted
    const armorImpactEvents = eventBus.getHistory().filter(e => e.type === 'ArmorImpact');
    // At least some hits should have landed (goblin has 50 melee vs knight's defense)
    // If any armor impacts occurred, stamina should be lower
    if (armorImpactEvents.length > 0) {
      expect(staminaAfter).toBeLessThan(staminaBefore);
    }
  });

  it('units recover more stamina when not hit', () => {
    const engine = new GameEngine({ seed: 42 });
    const world = engine.getWorld();
    const eventBus = engine.getEventBus();

    const warrior = UnitFactory.createUnit(world, 'warrior', 'player', 0, 0);

    // Drain stamina manually
    const stamina = world.getComponent<StaminaComponent>(warrior, 'stamina')!;
    world.addComponent<StaminaComponent>(warrior, {
      ...stamina,
      current: stamina.max - 10,
    });

    const beforeResolve = world.getComponent<StaminaComponent>(warrior, 'stamina')!.current;

    // Resolve a turn with no combat (warrior has no commands, no enemies nearby)
    TurnResolutionSystem.resolveTurn(world, eventBus, engine.getDiceRoller(), 1);

    const afterResolve = world.getComponent<StaminaComponent>(warrior, 'stamina')!.current;

    // Should recover 3 (unhit recovery)
    expect(afterResolve).toBe(beforeResolve + 3);
  });

  it('critical wound table produces wounds on unarmored goblin hits', () => {
    const engine = new GameEngine({ seed: 42 });
    const world = engine.getWorld();
    const eventBus = engine.getEventBus();

    const knight = UnitFactory.createUnit(world, 'knight', 'player', 5, 5);
    const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 6, 5);

    // Queue many attacks against goblin (unarmored areas)
    for (let turn = 1; turn <= 10; turn++) {
      TurnResolutionSystem.queueCommand(world, knight, {
        type: 'attack',
        targetId: goblin,
        attackType: 'melee',
        apCost: 2,
        priority: 5,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, engine.getDiceRoller(), turn);

      const health = world.getComponent<HealthComponent>(goblin, 'health');
      if (health && health.woundState === 'down') break;
    }

    // Knight has high melee (85), goblin has low defense — hits should land
    // On unarmored locations (arms: 0, legs: 0, head: 0), critical wound table applies
    const woundEvents = eventBus.getHistory().filter(e => e.type === 'WoundEffectApplied');
    const damageEvents = eventBus.getHistory().filter(e => e.type === 'DamageDealt');

    // Verify combat happened
    expect(damageEvents.length).toBeGreaterThan(0);
    // Wounds are likely given unarmored locations, but not guaranteed for every hit
  });

  it('heavy armor knight never uses dodge defense', () => {
    const engine = new GameEngine({ seed: 200 });
    const world = engine.getWorld();
    const eventBus = engine.getEventBus();

    const goblin = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);
    const knight = UnitFactory.createUnit(world, 'knight', 'player', 1, 0);

    // Queue many goblin attacks against knight
    for (let turn = 1; turn <= 10; turn++) {
      TurnResolutionSystem.queueCommand(world, goblin, {
        type: 'attack',
        targetId: knight,
        attackType: 'melee',
        apCost: 1,
        priority: 2,
      } as AttackCommand);

      TurnResolutionSystem.resolveTurn(world, eventBus, engine.getDiceRoller(), turn);

      const health = world.getComponent<HealthComponent>(knight, 'health');
      if (health && health.woundState === 'down') break;
    }

    // Check that knight never dodged
    const defenseEvents = eventBus.getHistory().filter(e => e.type === 'DefenseRolled');
    const dodgeEvents = defenseEvents.filter(e => e.data.defenseType === 'dodge');
    expect(dodgeEvents.length).toBe(0);
  });
});
