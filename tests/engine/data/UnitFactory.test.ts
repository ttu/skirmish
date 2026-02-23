import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { UnitFactory } from '../../../src/engine/data/UnitFactory';
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  SkillsComponent,
  ActionPointsComponent,
  StaminaComponent,
  ArmorComponent,
  WeaponComponent,
  AmmoComponent,
  MoraleStateComponent,
  EngagementComponent,
  IdentityComponent,
} from '../../../src/engine/components';

describe('UnitFactory', () => {
  let world: WorldImpl;

  beforeEach(() => {
    world = new WorldImpl();
  });

  describe('createUnit', () => {
    it('creates a warrior with all components', () => {
      const entity = UnitFactory.createUnit(world, 'warrior', 'player', 5, 10);

      expect(entity).toBeDefined();

      // Check identity (unique display name and shortId for log/UI)
      const identity = world.getComponent<IdentityComponent>(entity, 'identity')!;
      expect(identity.name).toMatch(/^Warrior \d+$/);
      expect(identity.unitType).toBe('warrior');
      expect(identity.shortId).toBeGreaterThanOrEqual(1);

      // Check position
      const position = world.getComponent<PositionComponent>(entity, 'position')!;
      expect(position.x).toBe(5);
      expect(position.y).toBe(10);

      // Check faction
      const faction = world.getComponent<FactionComponent>(entity, 'faction')!;
      expect(faction.faction).toBe('player');

      // Check health
      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.current).toBe(100);
      expect(health.max).toBe(100);
      expect(health.woundState).toBe('healthy');

      // Check skills
      const skills = world.getComponent<SkillsComponent>(entity, 'skills')!;
      expect(skills.melee).toBe(70);

      // Check AP (with armor penalty)
      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.baseValue).toBe(5);
      expect(ap.armorPenalty).toBe(1);
      expect(ap.max).toBe(4); // 5 - 1 armor penalty

      // Check armor
      const armor = world.getComponent<ArmorComponent>(entity, 'armor')!;
      expect(armor.torso).toBe(5);

      // Check weapon
      const weapon = world.getComponent<WeaponComponent>(entity, 'weapon')!;
      expect(weapon.name).toBe('Sword');

      // Check morale state
      const morale = world.getComponent<MoraleStateComponent>(entity, 'moraleState')!;
      expect(morale.status).toBe('steady');

      // Check engagement
      const engagement = world.getComponent<EngagementComponent>(entity, 'engagement')!;
      expect(engagement.engagedWith).toEqual([]);
    });

    it('creates an archer with ammo', () => {
      const entity = UnitFactory.createUnit(world, 'archer', 'player', 0, 0);

      const ammo = world.getComponent<AmmoComponent>(entity, 'ammo')!;
      expect(ammo.slots).toHaveLength(2);
      expect(ammo.slots[0].ammoType).toBe('standard');
      expect(ammo.slots[0].quantity).toBe(12);
      expect(ammo.slots[1].ammoType).toBe('bodkin');
    });

    it('creates a goblin as enemy', () => {
      const entity = UnitFactory.createUnit(world, 'goblin', 'enemy', 0, 0);

      const faction = world.getComponent<FactionComponent>(entity, 'faction')!;
      expect(faction.faction).toBe('enemy');

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.max).toBe(40); // Goblins are weak

      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.max).toBe(6); // Goblins are fast
    });

    it('creates a troll with high HP', () => {
      const entity = UnitFactory.createUnit(world, 'troll', 'enemy', 0, 0);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.max).toBe(250);

      const ap = world.getComponent<ActionPointsComponent>(entity, 'actionPoints')!;
      expect(ap.max).toBe(3); // Trolls are slow
    });

    it('applies experience bonus to AP', () => {
      // Knight has +1 experience bonus but -2 armor penalty = 5 + 1 - 2 = 4 AP
      const knight = UnitFactory.createUnit(world, 'knight', 'player', 0, 0);
      const knightAp = world.getComponent<ActionPointsComponent>(knight, 'actionPoints')!;
      expect(knightAp.max).toBe(4);
      expect(knightAp.experienceBonus).toBe(1);
      expect(knightAp.armorPenalty).toBe(2);

      // Scout has +1 experience bonus, no armor penalty = 5 + 1 = 6 AP
      const scout = UnitFactory.createUnit(world, 'scout', 'player', 0, 0);
      const scoutAp = world.getComponent<ActionPointsComponent>(scout, 'actionPoints')!;
      expect(scoutAp.max).toBe(6);
    });
  });

  describe('getTemplateNames', () => {
    it('returns all available templates', () => {
      const names = UnitFactory.getTemplateNames();

      expect(names).toContain('warrior');
      expect(names).toContain('archer');
      expect(names).toContain('knight');
      expect(names).toContain('goblin');
      expect(names).toContain('troll');
    });
  });

  describe('getTemplate', () => {
    it('returns template data', () => {
      const template = UnitFactory.getTemplate('warrior');

      expect(template).toBeDefined();
      expect(template?.name).toBe('Warrior');
      expect(template?.health).toBe(100);
    });

    it('returns undefined for unknown template', () => {
      const template = UnitFactory.getTemplate('unknown');
      expect(template).toBeUndefined();
    });
  });
});
