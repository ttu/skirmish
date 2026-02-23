# Dice Roll Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated right-side sidebar that shows visual probability bars for combat dice rolls, letting players see attack/defense thresholds, modifiers, hit locations, and damage at a glance.

**Architecture:** New `DiceRollSidebar` UI class listens to existing `GameEvent` bus events (`AttackDeclared`, `AttackRolled`, `DefenseRolled`, `DamageDealt`). It renders an HTML panel with animated probability bars. Integrated into `TurnBasedGame.ts` alongside the existing `CombatLogUI` and `FloatingCombatText`. The sidebar's animation is driven by the existing `playCombatEventsWithDelay` fight-sequence grouping — each fight sequence triggers the sidebar to animate through its sections.

**Tech Stack:** TypeScript, HTML/CSS (inline styles matching existing design system in `index.html`)

**Design doc:** `docs/plans/2026-02-23-dice-roll-sidebar-design.md`

---

### Task 1: CSS styles for dice roll sidebar

**Files:**
- Modify: `index.html` (add CSS rules after the combat-log section, ~line 1008)

**Step 1: Add CSS styles**

Add the following CSS block after the `.combat-log-entry:hover` rule (around line 1008) in `index.html`:

```css
/* ═══════════════════════════════════════════════════════════════════
   DICE ROLL SIDEBAR (top-left, below unit quick bar)
   ═══════════════════════════════════════════════════════════════════ */

.dice-roll-sidebar {
  position: absolute;
  top: 70px;
  left: 20px;
  width: 280px;
  background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-deep) 100%);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  pointer-events: auto;
  z-index: 25;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: opacity var(--transition-medium);
}

.dice-roll-sidebar.hidden {
  display: none;
}

.dice-sidebar-title {
  font-family: var(--font-display);
  color: var(--accent-gold);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.dice-sidebar-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dice-sidebar-header .attacker {
  color: var(--status-info);
}

.dice-sidebar-header .defender {
  color: var(--status-damage);
}

.dice-sidebar-header .arrow {
  color: var(--text-muted);
}

.dice-sidebar-section {
  margin-bottom: 12px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.dice-sidebar-section.visible {
  opacity: 1;
  transform: translateY(0);
}

.dice-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

/* Probability bar */
.dice-prob-bar {
  position: relative;
  height: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: visible;
  margin-bottom: 4px;
}

.dice-prob-fill {
  height: 100%;
  border-radius: 3px 0 0 3px;
  transition: width 0.5s ease;
  width: 0%;
}

.dice-prob-fill.player {
  background: linear-gradient(90deg, rgba(79, 195, 247, 0.4), rgba(79, 195, 247, 0.25));
}

.dice-prob-fill.enemy {
  background: linear-gradient(90deg, rgba(232, 90, 90, 0.4), rgba(232, 90, 90, 0.25));
}

.dice-prob-threshold {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: rgba(255, 255, 255, 0.4);
  transition: left 0.5s ease;
}

.dice-prob-threshold-label {
  position: absolute;
  top: -14px;
  font-size: 9px;
  font-weight: 600;
  color: var(--text-secondary);
  transform: translateX(-50%);
  white-space: nowrap;
}

.dice-prob-marker {
  position: absolute;
  top: -8px;
  font-size: 10px;
  line-height: 1;
  transform: translateX(-50%);
  transition: left 0.4s ease 0.2s;
  white-space: nowrap;
}

.dice-prob-marker.success {
  color: var(--status-health);
}

.dice-prob-marker.fail {
  color: var(--status-damage);
}

.dice-roll-number {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  font-weight: 600;
}

.dice-result-label {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-left: 4px;
}

.dice-modifiers {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  margin-top: 2px;
}

/* Hit location strip */
.dice-location-strip {
  display: flex;
  height: 20px;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.dice-location-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border-right: 1px solid var(--border-subtle);
  transition: background 0.3s ease, color 0.3s ease;
}

.dice-location-zone:last-child {
  border-right: none;
}

.dice-location-zone.hit {
  background: rgba(232, 197, 71, 0.25);
  color: var(--accent-gold);
}

.dice-location-roll {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Damage section */
.dice-damage-row {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
}

.dice-damage-raw {
  color: var(--text-secondary);
}

.dice-damage-armor {
  color: var(--text-muted);
}

.dice-damage-final {
  color: var(--status-damage);
  font-weight: 600;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Empty state */
.dice-sidebar-empty {
  text-align: center;
  padding: 16px 0;
  color: var(--text-muted);
  font-size: 12px;
}

.dice-sidebar-empty-icon {
  font-size: 24px;
  margin-bottom: 8px;
  opacity: 0.5;
}
```

**Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add CSS styles for dice roll sidebar"
```

---

### Task 2: Create DiceRollSidebar class with empty state and event types

**Files:**
- Create: `src/ui/DiceRollSidebar.ts`
- Create: `tests/ui/DiceRollSidebar.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/ui/DiceRollSidebar.test.ts
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
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/DiceRollSidebar.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/ui/DiceRollSidebar.ts
import { EntityId, GameEvent } from '../engine/types';

export interface DiceRollData {
  attackerName: string;
  defenderName: string;
  attackerFaction: 'player' | 'enemy';
}

export class DiceRollSidebar {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private resolveEntityName: (id: EntityId) => string = (id) => String(id);

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'dice-roll-sidebar';

    const title = document.createElement('div');
    title.className = 'dice-sidebar-title';
    title.textContent = 'Combat Roll';
    this.container.appendChild(title);

    this.contentEl = document.createElement('div');
    this.container.appendChild(this.contentEl);

    this.showEmpty();

    // Click to skip animation
    this.container.addEventListener('click', () => this.skipAnimation());
  }

  getElement(): HTMLElement {
    return this.container;
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  setEntityNameResolver(resolver: (id: EntityId) => string): void {
    this.resolveEntityName = resolver;
  }

  private showEmpty(): void {
    this.contentEl.innerHTML = `
      <div class="dice-sidebar-empty">
        <div class="dice-sidebar-empty-icon">⚔</div>
        <div>No combat this turn</div>
      </div>
    `;
  }

  private skipAnimation(): void {
    // Will be implemented in Task 3
  }

  clear(): void {
    this.showEmpty();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/DiceRollSidebar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/DiceRollSidebar.ts tests/ui/DiceRollSidebar.test.ts
git commit -m "feat: add DiceRollSidebar class with empty state"
```

---

### Task 3: Implement event handling and roll display logic

**Files:**
- Modify: `src/ui/DiceRollSidebar.ts`
- Modify: `tests/ui/DiceRollSidebar.test.ts`

**Step 1: Write the failing tests**

Add to `tests/ui/DiceRollSidebar.test.ts`:

```typescript
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

  it('resets on new AttackDeclared', () => {
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
    expect(el.textContent).toContain('Unit-u3');
    // Should not contain the old header
    expect(el.querySelectorAll('.dice-sidebar-header').length).toBe(1);
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/DiceRollSidebar.test.ts`
Expected: FAIL — `handleEvent` is not a function / sections not found

**Step 3: Implement handleEvent and rendering**

Replace `src/ui/DiceRollSidebar.ts` with full implementation:

```typescript
// src/ui/DiceRollSidebar.ts
import { EntityId, GameEvent } from '../engine/types';
import { Modifier } from '../engine/systems/CombatResolver';

const LOCATION_ZONES: { key: string; label: string; widthPct: number }[] = [
  { key: 'head',   label: 'Head',  widthPct: 15 },
  { key: 'torso',  label: 'Torso', widthPct: 20 },
  { key: 'arms',   label: 'Arms',  widthPct: 20 },
  { key: 'legs',   label: 'Legs',  widthPct: 25 },
  { key: 'weapon', label: 'Wpn',   widthPct: 20 },
];

export class DiceRollSidebar {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private resolveEntityName: (id: EntityId) => string = (id) => String(id);
  private animationTimeouts: number[] = [];
  private currentAttackerId: EntityId | null = null;
  private currentDefenderId: EntityId | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'dice-roll-sidebar';

    const title = document.createElement('div');
    title.className = 'dice-sidebar-title';
    title.textContent = 'Combat Roll';
    this.container.appendChild(title);

    this.contentEl = document.createElement('div');
    this.container.appendChild(this.contentEl);

    this.showEmpty();

    this.container.addEventListener('click', () => this.skipAnimation());
  }

  getElement(): HTMLElement {
    return this.container;
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  setEntityNameResolver(resolver: (id: EntityId) => string): void {
    this.resolveEntityName = resolver;
  }

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'AttackDeclared':
        this.onAttackDeclared(event);
        break;
      case 'AttackRolled':
        this.onAttackRolled(event);
        break;
      case 'DefenseRolled':
        this.onDefenseRolled(event);
        break;
      case 'DamageDealt':
        this.onDamageDealt(event);
        break;
    }
  }

  private onAttackDeclared(event: GameEvent): void {
    this.cancelAnimations();
    this.currentAttackerId = event.entityId ?? null;
    this.currentDefenderId = event.targetId ?? null;

    const attackerName = event.entityId ? this.resolveEntityName(event.entityId) : '?';
    const defenderName = event.targetId ? this.resolveEntityName(event.targetId) : '?';

    this.contentEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'dice-sidebar-header';
    header.innerHTML = `<span class="attacker">${attackerName}</span> <span class="arrow">→</span> <span class="defender">${defenderName}</span>`;
    this.contentEl.appendChild(header);
  }

  private onAttackRolled(event: GameEvent): void {
    const { roll, baseSkill, modifiers, effectiveSkill, hit } = event.data as {
      roll: number;
      baseSkill: number;
      modifiers: Modifier[];
      effectiveSkill: number;
      hit: boolean;
    };

    const section = this.createRollSection(
      'attack',
      `Attack (${hit ? 'Melee' : 'Melee'}: ${effectiveSkill}%)`,
      roll,
      effectiveSkill,
      modifiers,
      baseSkill,
      hit,
      hit ? 'HIT' : 'MISS',
      'player',
    );
    this.contentEl.appendChild(section);
    this.animateSection(section);
  }

  private onDefenseRolled(event: GameEvent): void {
    const { defenseType, roll, baseSkill, modifiers, effectiveSkill, success } = event.data as {
      defenseType: string;
      roll: number;
      baseSkill: number;
      modifiers: Modifier[];
      effectiveSkill: number;
      success: boolean;
    };

    const typeLabel = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);
    const resultLabel = success
      ? (defenseType === 'block' ? 'BLOCKED' : defenseType === 'parry' ? 'PARRIED' : 'DODGED')
      : 'FAIL';

    const section = this.createRollSection(
      'defense',
      `Defense (${typeLabel}: ${effectiveSkill}%)`,
      roll,
      effectiveSkill,
      modifiers,
      baseSkill,
      success,
      resultLabel,
      'enemy',
    );
    this.contentEl.appendChild(section);
    this.animateSection(section);
  }

  private onDamageDealt(event: GameEvent): void {
    const { damage, location, rawDamage, armorAbsorbed } = event.data as {
      damage: number;
      location: string;
      rawDamage: number;
      armorAbsorbed: number;
    };

    // Location section
    const locSection = document.createElement('div');
    locSection.className = 'dice-sidebar-section';
    locSection.setAttribute('data-section', 'location');

    const locLabel = document.createElement('div');
    locLabel.className = 'dice-section-label';
    locLabel.textContent = 'Hit Location';
    locSection.appendChild(locLabel);

    const strip = document.createElement('div');
    strip.className = 'dice-location-strip';
    for (const zone of LOCATION_ZONES) {
      const el = document.createElement('div');
      el.className = 'dice-location-zone';
      if (zone.key === location) el.classList.add('hit');
      el.style.width = `${zone.widthPct}%`;
      el.textContent = zone.label;
      strip.appendChild(el);
    }
    locSection.appendChild(strip);
    this.contentEl.appendChild(locSection);
    this.animateSection(locSection);

    // Damage section
    const dmgSection = document.createElement('div');
    dmgSection.className = 'dice-sidebar-section';
    dmgSection.setAttribute('data-section', 'damage');

    const dmgLabel = document.createElement('div');
    dmgLabel.className = 'dice-section-label';
    dmgLabel.textContent = 'Damage';
    dmgSection.appendChild(dmgLabel);

    const dmgRow = document.createElement('div');
    dmgRow.className = 'dice-damage-row';
    dmgRow.innerHTML = `
      <span class="dice-damage-raw">Raw: ${rawDamage ?? damage}</span>
      <span class="dice-damage-armor">Armor: ${armorAbsorbed ?? 0}</span>
      <span class="dice-damage-final">${damage} HP</span>
    `;
    dmgSection.appendChild(dmgRow);
    this.contentEl.appendChild(dmgSection);
    this.animateSection(dmgSection);
  }

  private createRollSection(
    sectionId: string,
    label: string,
    roll: number,
    effectiveSkill: number,
    modifiers: Modifier[],
    baseSkill: number,
    success: boolean,
    resultLabel: string,
    barType: 'player' | 'enemy',
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dice-sidebar-section';
    section.setAttribute('data-section', sectionId);

    // Label
    const labelEl = document.createElement('div');
    labelEl.className = 'dice-section-label';
    labelEl.textContent = label;
    section.appendChild(labelEl);

    // Probability bar
    const bar = document.createElement('div');
    bar.className = 'dice-prob-bar';

    const fill = document.createElement('div');
    fill.className = `dice-prob-fill ${barType}`;
    fill.style.width = `${effectiveSkill}%`;
    bar.appendChild(fill);

    // Threshold line
    const threshold = document.createElement('div');
    threshold.className = 'dice-prob-threshold';
    threshold.style.left = `${effectiveSkill}%`;
    const threshLabel = document.createElement('span');
    threshLabel.className = 'dice-prob-threshold-label';
    threshLabel.textContent = `${effectiveSkill}%`;
    threshold.appendChild(threshLabel);
    bar.appendChild(threshold);

    // Roll marker
    const marker = document.createElement('div');
    marker.className = `dice-prob-marker ${success ? 'success' : 'fail'}`;
    marker.style.left = `${roll}%`;
    marker.innerHTML = `▼ <span class="dice-roll-number">${roll}</span><span class="dice-result-label">${resultLabel}</span>`;
    bar.appendChild(marker);

    section.appendChild(bar);

    // Modifier breakdown
    if (modifiers.length > 0 || baseSkill !== effectiveSkill) {
      const modsEl = document.createElement('div');
      modsEl.className = 'dice-modifiers';
      const parts = [`base ${baseSkill}`];
      for (const mod of modifiers) {
        const sign = mod.value >= 0 ? '+' : '';
        parts.push(`${sign}${mod.value} ${mod.source}`);
      }
      modsEl.textContent = parts.join(' ');
      section.appendChild(modsEl);
    }

    return section;
  }

  private animateSection(section: HTMLElement): void {
    // Use requestAnimationFrame to ensure the element is in the DOM before transitioning
    requestAnimationFrame(() => {
      section.classList.add('visible');
    });
  }

  skipAnimation(): void {
    this.cancelAnimations();
    // Make all sections visible immediately
    const sections = this.contentEl.querySelectorAll('.dice-sidebar-section');
    sections.forEach((s) => s.classList.add('visible'));
  }

  private cancelAnimations(): void {
    for (const id of this.animationTimeouts) {
      clearTimeout(id);
    }
    this.animationTimeouts = [];
  }

  private showEmpty(): void {
    this.contentEl.innerHTML = `
      <div class="dice-sidebar-empty">
        <div class="dice-sidebar-empty-icon">⚔</div>
        <div>No combat this turn</div>
      </div>
    `;
  }

  clear(): void {
    this.cancelAnimations();
    this.currentAttackerId = null;
    this.currentDefenderId = null;
    this.showEmpty();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/DiceRollSidebar.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/ui/DiceRollSidebar.ts tests/ui/DiceRollSidebar.test.ts
git commit -m "feat: implement DiceRollSidebar event handling and roll display"
```

---

### Task 4: Integrate sidebar into TurnBasedGame

**Files:**
- Modify: `src/game/TurnBasedGame.ts`

**Step 1: Add import and property**

At the top of `TurnBasedGame.ts`, add import (near the other UI imports around line 30):

```typescript
import { DiceRollSidebar } from '../ui/DiceRollSidebar';
```

Add property (near `combatLog` on line 68):

```typescript
private diceRollSidebar: DiceRollSidebar;
```

**Step 2: Initialize sidebar in constructor**

After the `combatLog` initialization (after line 128), add:

```typescript
// Initialize dice roll sidebar
this.diceRollSidebar = new DiceRollSidebar();
this.diceRollSidebar.setEntityNameResolver((id) => {
  const world = this.engine.getWorld();
  const identity = world.getComponent<IdentityComponent>(id, 'identity');
  if (!identity) return String(id);
  const typeName = identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
  return identity.shortId != null ? `${typeName} #${identity.shortId}` : identity.name;
});
document.getElementById('game-container')!.appendChild(this.diceRollSidebar.getElement());
```

**Step 3: Feed events to sidebar in playCombatEventsWithDelay**

In the `playCombatEventsWithDelay` method (around line 2616), after `this.showActiveHighlight(declaredEvent.entityId);`, feed each event in the sequence to the sidebar:

```typescript
// Feed events to dice roll sidebar
for (const event of sequence) {
  this.diceRollSidebar.handleEvent(event);
}
```

**Step 4: Show/hide sidebar with game phases**

In the method that hides UI when going to menu (search for `combatLog?.hide()`), add:

```typescript
this.diceRollSidebar?.hide();
```

In the method that shows UI when starting a game (search for `combatLog?.show()`), add:

```typescript
this.diceRollSidebar?.show();
```

**Step 5: Clear sidebar on new turn start**

Find where `this.combatLog.clear()` is called (if on new scenario load), and add nearby:

```typescript
this.diceRollSidebar?.clear();
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 7: Run all tests**

Run: `npm run test:run`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/game/TurnBasedGame.ts
git commit -m "feat: integrate DiceRollSidebar into game loop"
```

---

### Task 5: Manual visual testing and polish

**Files:**
- Possibly tweak: `index.html` (CSS adjustments)
- Possibly tweak: `src/ui/DiceRollSidebar.ts` (layout fixes)

**Step 1: Run dev server and play a scenario**

Run: `npm run dev`

Verify:
- Sidebar appears on top-left during gameplay
- Shows "No combat this turn" initially
- During resolution, each fight sequence populates the sidebar
- Attack bar shows probability fill and roll marker
- Defense bar appears only on hits
- Location strip highlights correct zone
- Damage shows raw/armor/final
- Click skips animation
- Sidebar replaces content on each new fight

**Step 2: Fix any visual issues found**

Adjust CSS spacing, font sizes, or colors as needed.

**Step 3: Commit any polish changes**

```bash
git add -A
git commit -m "fix: polish dice roll sidebar layout and styling"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all tests**

Run: `npm run test:run`
Expected: All tests pass.

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.
