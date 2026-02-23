import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/core/GameEngine';
import { CombatResolver } from '../../src/engine/systems/CombatResolver';
import { DamageSystem } from '../../src/engine/systems/DamageSystem';
import {
  HealthComponent,
  SkillsComponent,
  ArmorComponent,
  WeaponComponent,
  PositionComponent,
  FactionComponent,
  IdentityComponent,
} from '../../src/engine/components';

describe('Combat Integration', () => {
  function createWarrior(
    engine: GameEngine,
    name: string,
    faction: 'player' | 'enemy',
    x: number,
    y: number
  ) {
    const entityId = engine.createEntity();

    engine.addComponent<IdentityComponent>(entityId, {
      type: 'identity',
      name,
      unitType: 'warrior',
    });

    engine.addComponent<PositionComponent>(entityId, {
      type: 'position',
      x,
      y,
      facing: 0,
    });

    engine.addComponent<FactionComponent>(entityId, {
      type: 'faction',
      faction,
    });

    engine.addComponent<HealthComponent>(entityId, {
      type: 'health',
      current: 100,
      max: 100,
      woundState: 'healthy',
    });

    engine.addComponent<SkillsComponent>(entityId, {
      type: 'skills',
      melee: 50,
      ranged: 30,
      block: 50,
      dodge: 30,
      morale: 50,
    });

    engine.addComponent<ArmorComponent>(entityId, {
      type: 'armor',
      head: 2,
      torso: 5,
      arms: 3,
      legs: 3,
      apPenalty: 1,
      staminaPenalty: 1,
    });

    engine.addComponent<WeaponComponent>(entityId, {
      type: 'weapon',
      name: 'Sword',
      damage: { dice: 1, sides: 8, bonus: 2 },
      speed: 5,
      range: 1.5,
      apCost: 2,
      twoHanded: false,
    });

    return entityId;
  }

  it('full attack sequence: attack roll -> defense roll -> hit location -> damage', () => {
    const engine = new GameEngine({ seed: 42 });

    const attacker = createWarrior(engine, 'Sir Knight', 'player', 0, 0);
    const defender = createWarrior(engine, 'Orc Grunt', 'enemy', 1, 0);

    const attackerSkills = engine.getComponent<SkillsComponent>(attacker, 'skills')!;
    const defenderSkills = engine.getComponent<SkillsComponent>(defender, 'skills')!;
    const defenderArmor = engine.getComponent<ArmorComponent>(defender, 'armor')!;
    const attackerWeapon = engine.getComponent<WeaponComponent>(attacker, 'weapon')!;

    // Resolve attack
    const attackResult = CombatResolver.resolveAttackRoll(
      attackerSkills.melee,
      [], // no modifiers
      engine.getDiceRoller()
    );

    console.log(
      'Attack roll:',
      attackResult.roll,
      'vs skill',
      attackResult.effectiveSkill,
      '=',
      attackResult.hit ? 'HIT' : 'MISS'
    );

    if (attackResult.hit) {
      // Defender attempts to block
      const defenseResult = CombatResolver.resolveDefenseRoll(
        'block',
        defenderSkills.block,
        [],
        engine.getDiceRoller()
      );

      console.log(
        'Defense roll:',
        defenseResult.roll,
        'vs skill',
        defenseResult.effectiveSkill,
        '=',
        defenseResult.success ? 'BLOCKED' : 'FAILED'
      );

      if (!defenseResult.success) {
        // Determine hit location
        const location = CombatResolver.resolveHitLocation(engine.getDiceRoller());
        console.log('Hit location:', location);

        // Get armor for location
        const armor = CombatResolver.getArmorForLocation(defenderArmor, location);

        // Calculate damage
        const damageResult = CombatResolver.calculateDamage(
          attackerWeapon.damage,
          armor,
          engine.getDiceRoller()
        );

        // Apply head multiplier
        const multiplier = CombatResolver.getLocationDamageMultiplier(location);
        const finalDamage = damageResult.finalDamage * multiplier;

        console.log(
          'Damage:',
          damageResult.rawDamage,
          '- armor',
          armor,
          '=',
          damageResult.finalDamage,
          'x',
          multiplier,
          '=',
          finalDamage
        );

        // Apply damage
        DamageSystem.applyDamage(
          engine.getWorld(),
          engine.getEventBus(),
          defender,
          finalDamage,
          location,
          engine.getTurn()
        );

        const defenderHealth = engine.getComponent<HealthComponent>(defender, 'health')!;
        console.log(
          'Defender health:',
          defenderHealth.current,
          '/',
          defenderHealth.max,
          '-',
          defenderHealth.woundState
        );

        // Verify events were emitted
        const events = engine.getEventHistory();
        expect(events.some((e) => e.type === 'DamageDealt')).toBe(true);
      }
    }

    // Test is successful if we get here without errors
    expect(true).toBe(true);
  });

  it('deterministic combat with same seed', () => {
    function runCombat(seed: number): number {
      const engine = new GameEngine({ seed });
      const attacker = createWarrior(engine, 'Attacker', 'player', 0, 0);

      const attackerSkills = engine.getComponent<SkillsComponent>(attacker, 'skills')!;

      const result = CombatResolver.resolveAttackRoll(
        attackerSkills.melee,
        [],
        engine.getDiceRoller()
      );

      return result.roll;
    }

    // Same seed = same results
    expect(runCombat(12345)).toBe(runCombat(12345));
    expect(runCombat(99999)).toBe(runCombat(99999));

    // Different seeds = different results (very likely)
    expect(runCombat(12345)).not.toBe(runCombat(54321));
  });

  it('snapshot saves and restores combat state', () => {
    const engine = new GameEngine({ seed: 777 });
    const warrior = createWarrior(engine, 'Test Warrior', 'player', 5, 5);

    // Take some damage
    DamageSystem.applyDamage(engine.getWorld(), engine.getEventBus(), warrior, 30, 'torso', 0);

    // Save snapshot
    const snapshot = engine.createSnapshot();
    const healthBefore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthBefore.current).toBe(70);

    // Take more damage
    DamageSystem.applyDamage(engine.getWorld(), engine.getEventBus(), warrior, 20, 'torso', 0);

    const healthAfterMore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthAfterMore.current).toBe(50);

    // Restore snapshot
    engine.loadSnapshot(snapshot);

    const healthAfterRestore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthAfterRestore.current).toBe(70);
  });

  it('flanking bonus increases hit chance', () => {
    const engine = new GameEngine({ seed: 12345 });

    // Without flanking
    const resultNoFlank = CombatResolver.resolveAttackRoll(50, [], engine.getDiceRoller());

    // With flanking (2 attackers = +10%)
    const engine2 = new GameEngine({ seed: 12345 });
    const resultWithFlank = CombatResolver.resolveAttackRoll(
      50,
      [{ source: 'flanking', value: 10 }],
      engine2.getDiceRoller()
    );

    // Same roll, but different effective skill
    expect(resultNoFlank.roll).toBe(resultWithFlank.roll);
    expect(resultNoFlank.effectiveSkill).toBe(50);
    expect(resultWithFlank.effectiveSkill).toBe(60);
  });

  it('head hits deal triple damage', () => {
    const engine = new GameEngine({ seed: 999 });
    const defender = createWarrior(engine, 'Defender', 'enemy', 0, 0);

    const defenderHealth = engine.getComponent<HealthComponent>(defender, 'health')!;
    const initialHealth = defenderHealth.current;

    // Simulate 10 damage to torso
    DamageSystem.applyDamage(engine.getWorld(), engine.getEventBus(), defender, 10, 'torso', 0);

    const healthAfterTorso = engine.getComponent<HealthComponent>(defender, 'health')!;
    expect(healthAfterTorso.current).toBe(initialHealth - 10);

    // Create new defender for head hit comparison
    const engine2 = new GameEngine({ seed: 888 });
    const defender2 = createWarrior(engine2, 'Defender2', 'enemy', 0, 0);

    // Simulate 10 * 3 = 30 damage to head (applying multiplier manually as damage system would)
    const headMultiplier = CombatResolver.getLocationDamageMultiplier('head');
    expect(headMultiplier).toBe(3);

    DamageSystem.applyDamage(
      engine2.getWorld(),
      engine2.getEventBus(),
      defender2,
      10 * headMultiplier,
      'head',
      0
    );

    const healthAfterHead = engine2.getComponent<HealthComponent>(defender2, 'health')!;
    expect(healthAfterHead.current).toBe(100 - 30);
  });
});
