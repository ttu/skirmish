// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { DiceRollSidebar } from '../../src/ui/DiceRollSidebar';

describe('DiceRollSidebar', () => {
  let sidebar: DiceRollSidebar;

  beforeEach(() => {
    sidebar = new DiceRollSidebar();
  });

  it('creates a container element', () => {
    const el = sidebar.getElement();
    expect(el).toBeDefined();
    expect(el.classList.contains('dice-roll-sidebar')).toBe(true);
  });

  it('starts with empty state', () => {
    const el = sidebar.getElement();
    expect(el.querySelector('.dice-sidebar-empty')).toBeTruthy();
  });

  it('can show and hide', () => {
    sidebar.hide();
    expect(sidebar.getElement().classList.contains('hidden')).toBe(true);
    sidebar.show();
    expect(sidebar.getElement().classList.contains('hidden')).toBe(false);
  });

  it('can set entity name resolver', () => {
    sidebar.setEntityNameResolver((id) => `Unit-${id}`);
    expect(true).toBe(true);
  });

  describe('event handling', () => {
    it('shows header on AttackDeclared', () => {
      sidebar.setEntityNameResolver((id) => id === 'u1' ? 'Warrior' : 'Goblin');
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0,
        timestamp: 0,
        entityId: 'u1',
        targetId: 'u2',
        data: {},
      });
      const el = sidebar.getElement();
      expect(el.querySelector('.dice-sidebar-header')).toBeTruthy();
      expect(el.querySelector('.dice-sidebar-empty')).toBeFalsy();
      expect(el.textContent).toContain('Warrior');
      expect(el.textContent).toContain('Goblin');
    });

    it('shows attack bar on AttackRolled', () => {
      sidebar.setEntityNameResolver((id) => id === 'u1' ? 'Warrior' : 'Goblin');
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackRolled',
        turn: 0, timestamp: 0, entityId: 'u1', data: {
          roll: 42,
          baseSkill: 50,
          modifiers: [{ source: 'flanking', value: 10 }, { source: 'wounded', value: -5 }],
          effectiveSkill: 55,
          hit: true,
        },
      });
      const el = sidebar.getElement();
      const section = el.querySelector('[data-section="attack"]');
      expect(section).toBeTruthy();
      expect(el.textContent).toContain('42');
      expect(el.textContent).toContain('55');
      expect(el.textContent).toContain('HIT');
    });

    it('shows defense bar on DefenseRolled', () => {
      sidebar.setEntityNameResolver((id) => id === 'u1' ? 'Warrior' : 'Goblin');
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackRolled',
        turn: 0, timestamp: 0, entityId: 'u1', data: {
          roll: 42, baseSkill: 50, modifiers: [], effectiveSkill: 50, hit: true,
        },
      });
      sidebar.handleEvent({
        type: 'DefenseRolled',
        turn: 0, timestamp: 0, entityId: 'u2', data: {
          defenseType: 'block',
          roll: 78,
          baseSkill: 25,
          modifiers: [],
          effectiveSkill: 25,
          success: false,
        },
      });
      const el = sidebar.getElement();
      const section = el.querySelector('[data-section="defense"]');
      expect(section).toBeTruthy();
      expect(el.textContent).toContain('78');
      expect(el.textContent).toContain('Block');
    });

    it('shows location and damage on DamageDealt', () => {
      sidebar.setEntityNameResolver((id) => id === 'u1' ? 'Warrior' : 'Goblin');
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackRolled',
        turn: 0, timestamp: 0, entityId: 'u1', data: {
          roll: 42, baseSkill: 50, modifiers: [], effectiveSkill: 50, hit: true,
        },
      });
      sidebar.handleEvent({
        type: 'DefenseRolled',
        turn: 0, timestamp: 0, entityId: 'u2', data: {
          defenseType: 'block', roll: 78, baseSkill: 25, modifiers: [], effectiveSkill: 25, success: false,
        },
      });
      sidebar.handleEvent({
        type: 'DamageDealt',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {
          damage: 7, location: 'arms', rawDamage: 9, armorAbsorbed: 2, newHealth: 33,
        },
      });
      const el = sidebar.getElement();
      const locSection = el.querySelector('[data-section="location"]');
      const dmgSection = el.querySelector('[data-section="damage"]');
      expect(locSection).toBeTruthy();
      expect(dmgSection).toBeTruthy();
      expect(el.textContent).toContain('7');
    });

    it('accumulates multiple exchanges in the same turn', () => {
      sidebar.setEntityNameResolver((id) => `Unit-${id}`);
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u3', targetId: 'u4', data: {},
      });
      const el = sidebar.getElement();
      expect(el.textContent).toContain('Unit-u1');
      expect(el.textContent).toContain('Unit-u3');
      expect(el.querySelectorAll('.dice-sidebar-header').length).toBe(2);
      expect(el.querySelectorAll('.dice-exchange-group').length).toBe(2);
    });

    it('clears all exchanges on clear()', () => {
      sidebar.setEntityNameResolver((id) => `Unit-${id}`);
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u3', targetId: 'u4', data: {},
      });
      sidebar.clear();
      const el = sidebar.getElement();
      expect(el.querySelector('.dice-sidebar-empty')).toBeTruthy();
      expect(el.querySelectorAll('.dice-sidebar-header').length).toBe(0);
    });

    it('stops after attack on miss (no defense/damage sections)', () => {
      sidebar.setEntityNameResolver((id) => `Unit-${id}`);
      sidebar.handleEvent({
        type: 'AttackDeclared',
        turn: 0, timestamp: 0, entityId: 'u1', targetId: 'u2', data: {},
      });
      sidebar.handleEvent({
        type: 'AttackRolled',
        turn: 0, timestamp: 0, entityId: 'u1', data: {
          roll: 88, baseSkill: 50, modifiers: [], effectiveSkill: 50, hit: false,
        },
      });
      const el = sidebar.getElement();
      expect(el.querySelector('[data-section="attack"]')).toBeTruthy();
      expect(el.querySelector('[data-section="defense"]')).toBeFalsy();
      expect(el.querySelector('[data-section="damage"]')).toBeFalsy();
    });
  });
});
