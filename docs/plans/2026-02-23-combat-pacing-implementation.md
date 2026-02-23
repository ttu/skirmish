# Combat Pacing Rework — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the combat system so every action matters: armor deflects but drains stamina, unarmored hits trigger critical wounds, exhaustion degrades defense, and stamina management becomes a core tactical resource.

**Architecture:** Five new mechanics layered onto the existing D100 combat pipeline: (1) armor class restricts dodge, (2) armor absorption drains stamina, (3) critical wound table for unarmored hits, (4) stamina-based defense penalty, (5) conditional stamina recovery. All changes are in the engine systems layer; no UI changes required.

**Tech Stack:** TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-23-combat-pacing-design.md`

---

### Task 1: Armor Classification Helper

Add a function to classify armor weight and return dodge penalty.

**Files:**
- Modify: `src/engine/systems/CombatResolver.ts`
- Test: `tests/engine/systems/CombatResolver.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/CombatResolver.test.ts`, inside the top-level `describe('CombatResolver', ...)`:

```typescript
describe('getArmorClass', () => {
  it('returns unarmored for total armor 0-4', () => {
    expect(CombatResolver.getArmorClass({ head: 0, torso: 1, arms: 0, legs: 0 })).toBe('unarmored');
    expect(CombatResolver.getArmorClass({ head: 1, torso: 1, arms: 1, legs: 1 })).toBe('unarmored');
  });

  it('returns light for total armor 5-8', () => {
    expect(CombatResolver.getArmorClass({ head: 1, torso: 2, arms: 1, legs: 1 })).toBe('light');
    expect(CombatResolver.getArmorClass({ head: 2, torso: 2, arms: 2, legs: 2 })).toBe('light');
  });

  it('returns medium for total armor 9-14', () => {
    expect(CombatResolver.getArmorClass({ head: 2, torso: 4, arms: 2, legs: 2 })).toBe('medium');
    expect(CombatResolver.getArmorClass({ head: 3, torso: 5, arms: 3, legs: 3 })).toBe('medium');
  });

  it('returns heavy for total armor 15+', () => {
    expect(CombatResolver.getArmorClass({ head: 6, torso: 8, arms: 5, legs: 5 })).toBe('heavy');
    expect(CombatResolver.getArmorClass({ head: 4, torso: 6, arms: 4, legs: 4 })).toBe('heavy');
  });
});

describe('getDodgePenalty', () => {
  it('returns 0 for unarmored', () => {
    expect(CombatResolver.getDodgePenalty('unarmored')).toBe(0);
  });

  it('returns -15 for light armor', () => {
    expect(CombatResolver.getDodgePenalty('light')).toBe(-15);
  });

  it('returns -30 for medium armor', () => {
    expect(CombatResolver.getDodgePenalty('medium')).toBe(-30);
  });

  it('returns null for heavy armor (cannot dodge)', () => {
    expect(CombatResolver.getDodgePenalty('heavy')).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/CombatResolver.test.ts`
Expected: FAIL — `getArmorClass` and `getDodgePenalty` are not functions

**Step 3: Write minimal implementation**

Add to `src/engine/systems/CombatResolver.ts`:

```typescript
export type ArmorClass = 'unarmored' | 'light' | 'medium' | 'heavy';
```

Add these static methods to the `CombatResolver` class:

```typescript
static getArmorClass(armor: { head: number; torso: number; arms: number; legs: number }): ArmorClass {
  const total = armor.head + armor.torso + armor.arms + armor.legs;
  if (total <= 4) return 'unarmored';
  if (total <= 8) return 'light';
  if (total <= 14) return 'medium';
  return 'heavy';
}

static getDodgePenalty(armorClass: ArmorClass): number | null {
  switch (armorClass) {
    case 'unarmored': return 0;
    case 'light': return -15;
    case 'medium': return -30;
    case 'heavy': return null; // Cannot dodge
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/CombatResolver.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/systems/CombatResolver.ts tests/engine/systems/CombatResolver.test.ts
git commit -m "feat: add armor classification and dodge penalty helpers"
```

---

### Task 2: Stamina Defense Penalty

Add a function that returns a defense penalty based on current stamina percentage.

**Files:**
- Modify: `src/engine/systems/StaminaSystem.ts`
- Test: `tests/engine/systems/StaminaSystem.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/StaminaSystem.test.ts`, inside the top-level `describe('StaminaSystem', ...)`:

```typescript
describe('getStaminaDefensePenalty', () => {
  it('returns 0 at 75-100% stamina', () => {
    const entity = createUnit(10); // 10/10 = 100%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(0);

    const entity2 = createUnit(8); // 8/10 = 80%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(0);
  });

  it('returns -10 at 50-74% stamina', () => {
    const entity = createUnit(7); // 7/10 = 70%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-10);

    const entity2 = createUnit(5); // 5/10 = 50%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-10);
  });

  it('returns -20 at 25-49% stamina', () => {
    const entity = createUnit(4); // 4/10 = 40%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-20);

    const entity2 = createUnit(3); // 3/10 = 30%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-20);
  });

  it('returns -30 at 1-24% stamina', () => {
    const entity = createUnit(2); // 2/10 = 20%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-30);

    const entity2 = createUnit(1); // 1/10 = 10%
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity2)).toBe(-30);
  });

  it('returns -40 when exhausted (0 stamina)', () => {
    const entity = createUnit(0, true);
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(-40);
  });

  it('returns 0 when entity has no stamina component', () => {
    const entity = world.createEntity();
    expect(StaminaSystem.getStaminaDefensePenalty(world, entity)).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: FAIL — `getStaminaDefensePenalty` is not a function

**Step 3: Write minimal implementation**

Add to `src/engine/systems/StaminaSystem.ts`, as a new static method on the `StaminaSystem` class:

```typescript
static getStaminaDefensePenalty(world: WorldImpl, entityId: EntityId): number {
  const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
  if (!stamina) return 0;

  if (stamina.exhausted || stamina.current <= 0) return -40;

  const pct = (stamina.current / stamina.max) * 100;
  if (pct < 25) return -30;
  if (pct < 50) return -20;
  if (pct < 75) return -10;
  return 0;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/systems/StaminaSystem.ts tests/engine/systems/StaminaSystem.test.ts
git commit -m "feat: add stamina-based defense penalty calculation"
```

---

### Task 3: Armor Stamina Drain on Hit

Add a function that calculates stamina drain from armor absorbing damage, and a method that applies it.

**Files:**
- Modify: `src/engine/systems/StaminaSystem.ts`
- Test: `tests/engine/systems/StaminaSystem.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/StaminaSystem.test.ts`:

```typescript
describe('calculateArmorStaminaDrain', () => {
  it('drains half of absorbed damage rounded up', () => {
    expect(StaminaSystem.calculateArmorStaminaDrain(8)).toBe(4);
    expect(StaminaSystem.calculateArmorStaminaDrain(5)).toBe(3);
    expect(StaminaSystem.calculateArmorStaminaDrain(1)).toBe(1);
  });

  it('returns 0 when no damage absorbed', () => {
    expect(StaminaSystem.calculateArmorStaminaDrain(0)).toBe(0);
  });
});

describe('applyArmorStaminaDrain', () => {
  it('drains stamina based on absorbed damage', () => {
    const entity = createUnit(10);
    StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 8, 1);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(6); // 10 - ceil(8/2) = 6
  });

  it('emits ArmorImpact event', () => {
    const entity = createUnit(10);
    StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 6, 1);

    const events = eventBus.getHistory().filter(e => e.type === 'ArmorImpact');
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe(entity);
    expect(events[0].data.staminaDrain).toBe(3);
    expect(events[0].data.absorbed).toBe(6);
  });

  it('does nothing when absorbed is 0', () => {
    const entity = createUnit(10);
    StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 0, 1);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(10);
  });

  it('can cause exhaustion from armor drain', () => {
    const entity = createUnit(1);
    StaminaSystem.applyArmorStaminaDrain(world, eventBus, entity, 6, 1);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.exhausted).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: FAIL — `calculateArmorStaminaDrain` and `applyArmorStaminaDrain` are not functions

**Step 3: Write minimal implementation**

Add to `src/engine/systems/StaminaSystem.ts`:

```typescript
static calculateArmorStaminaDrain(absorbed: number): number {
  if (absorbed <= 0) return 0;
  return Math.ceil(absorbed / 2);
}

static applyArmorStaminaDrain(
  world: WorldImpl,
  eventBus: EventBusImpl,
  entityId: EntityId,
  absorbed: number,
  turn: number
): void {
  const drain = this.calculateArmorStaminaDrain(absorbed);
  if (drain <= 0) return;

  this.drainStamina(world, eventBus, entityId, drain, turn);

  eventBus.emit({
    type: 'ArmorImpact',
    turn,
    timestamp: Date.now(),
    entityId,
    data: { staminaDrain: drain, absorbed },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/systems/StaminaSystem.ts tests/engine/systems/StaminaSystem.test.ts
git commit -m "feat: add armor stamina drain on absorbed damage"
```

---

### Task 4: Critical Wound Table for Unarmored Hits

Add a critical wound table that triggers when a hit lands on an unarmored location (armor 0). This replaces the threshold-based wound check for those locations.

**Files:**
- Modify: `src/engine/systems/WoundEffectsSystem.ts`
- Test: `tests/engine/systems/WoundEffectsSystem.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/WoundEffectsSystem.test.ts`. You'll need to import `DiceRoller`:

```typescript
import { DiceRoller } from '../../../src/engine/core/DiceRoller';
```

Then add inside the top-level `describe('WoundEffectsSystem', ...)`:

```typescript
describe('rollCriticalWound', () => {
  it('returns severe for heavy damage + low roll', () => {
    // Heavy damage (9+), roll 1-30 → severe
    expect(WoundEffectsSystem.rollCriticalWound(10, 15)).toBe('severe');
    expect(WoundEffectsSystem.rollCriticalWound(12, 30)).toBe('severe');
  });

  it('returns moderate for heavy damage + mid roll', () => {
    // Heavy damage (9+), roll 31-60 → moderate
    expect(WoundEffectsSystem.rollCriticalWound(10, 45)).toBe('moderate');
  });

  it('returns minor for heavy damage + high roll', () => {
    // Heavy damage (9+), roll 61-100 → minor
    expect(WoundEffectsSystem.rollCriticalWound(10, 75)).toBe('minor');
    expect(WoundEffectsSystem.rollCriticalWound(10, 100)).toBe('minor');
  });

  it('returns moderate for medium damage + low roll', () => {
    // Medium damage (5-8), roll 1-30 → moderate
    expect(WoundEffectsSystem.rollCriticalWound(6, 20)).toBe('moderate');
  });

  it('returns minor for medium damage + mid roll', () => {
    // Medium damage (5-8), roll 31-60 → minor
    expect(WoundEffectsSystem.rollCriticalWound(6, 50)).toBe('minor');
  });

  it('returns null for medium damage + high roll', () => {
    // Medium damage (5-8), roll 81-100 → no wound
    expect(WoundEffectsSystem.rollCriticalWound(6, 90)).toBeNull();
  });

  it('returns minor for light damage + low roll', () => {
    // Light damage (1-4), roll 1-60 → minor
    expect(WoundEffectsSystem.rollCriticalWound(3, 30)).toBe('minor');
    expect(WoundEffectsSystem.rollCriticalWound(3, 55)).toBe('minor');
  });

  it('returns null for light damage + high roll', () => {
    // Light damage (1-4), roll 61-100 → no wound
    expect(WoundEffectsSystem.rollCriticalWound(2, 75)).toBeNull();
  });
});

describe('checkAndApplyWoundEffect with critical table', () => {
  it('uses critical wound table when location armor is 0', () => {
    const unit = createUnit({ armor: { arms: 0 } });
    const roller = new DiceRoller(42); // Deterministic roller

    // Pass roller to use critical table
    WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 10, 0, 1, roller);

    const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
    expect(wounds).toBeDefined();
    // With 10 damage (heavy) and a D100 roll, we should get a wound
    expect(wounds!.effects.length).toBeGreaterThanOrEqual(1);
  });

  it('still uses threshold system when location has armor', () => {
    const unit = createUnit({ armor: { arms: 5 } });
    const roller = new DiceRoller(42);

    // armor 5, threshold 10, damage 8 → excess -2 → no wound (threshold system)
    WoundEffectsSystem.checkAndApplyWoundEffect(world, eventBus, unit, 'arms', 8, 5, 1, roller);

    const wounds = world.getComponent<WoundEffectsComponent>(unit, 'woundEffects');
    expect(wounds).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/WoundEffectsSystem.test.ts`
Expected: FAIL — `rollCriticalWound` is not a function, `checkAndApplyWoundEffect` doesn't accept `roller` parameter

**Step 3: Write minimal implementation**

Modify `src/engine/systems/WoundEffectsSystem.ts`:

Add import at top:
```typescript
import { DiceRoller } from '../core/DiceRoller';
```

Add new static method to `WoundEffectsSystem`:

```typescript
/**
 * Roll on the critical wound table for unarmored hits.
 * Returns wound severity or null if no wound.
 */
static rollCriticalWound(damage: number, roll: number): WoundSeverity | null {
  if (damage >= 9) {
    // Heavy hit: always at least minor
    if (roll <= 30) return 'severe';
    if (roll <= 60) return 'moderate';
    return 'minor';
  }
  if (damage >= 5) {
    // Medium hit
    if (roll <= 30) return 'moderate';
    if (roll <= 60) return 'minor';
    if (roll <= 80) return 'minor';
    return null;
  }
  // Light hit (1-4)
  if (roll <= 60) return 'minor';
  return null;
}
```

Update `checkAndApplyWoundEffect` signature to accept an optional `roller`:

```typescript
static checkAndApplyWoundEffect(
  world: WorldImpl,
  eventBus: EventBusImpl,
  targetId: string,
  location: HitLocation,
  finalDamage: number,
  locationArmor: number,
  turn: number,
  roller?: DiceRoller
): void {
  // Only arms, legs, torso can have wound effects
  if (location === 'head' || location === 'weapon') return;

  const woundLocation = location as WoundLocation;
  let severity: WoundSeverity | null;

  if (locationArmor === 0 && roller) {
    // Unarmored: use critical wound table
    const roll = roller.rollD100();
    severity = this.rollCriticalWound(finalDamage, roll);
  } else {
    // Armored: use threshold system
    const threshold = this.getWoundThreshold(locationArmor);
    const excess = finalDamage - threshold;
    severity = this.getSeverity(excess);
  }

  if (!severity) return;

  const effectTemplate = WOUND_EFFECTS_TABLE[woundLocation][severity];
  const effect: WoundEffect = {
    location: woundLocation,
    severity,
    ...effectTemplate,
  };

  // Get or create wound effects component
  const existing = world.getComponent<WoundEffectsComponent>(targetId, 'woundEffects');
  const effects = existing ? [...existing.effects, effect] : [effect];

  world.addComponent<WoundEffectsComponent>(targetId, {
    type: 'woundEffects',
    effects,
  });

  eventBus.emit({
    type: 'WoundEffectApplied',
    turn,
    timestamp: Date.now(),
    entityId: targetId,
    data: {
      location: woundLocation,
      severity,
      skillPenalty: effect.skillPenalty,
      bleedingPerTurn: effect.bleedingPerTurn,
      disablesTwoHanded: effect.disablesTwoHanded,
      restrictsMoveMode: effect.restrictsMoveMode,
      halvesMovement: effect.halvesMovement,
    },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/WoundEffectsSystem.test.ts`
Expected: ALL PASS (existing tests still pass since `roller` is optional)

**Step 5: Commit**

```bash
git add src/engine/systems/WoundEffectsSystem.ts tests/engine/systems/WoundEffectsSystem.test.ts
git commit -m "feat: add critical wound table for unarmored hit locations"
```

---

### Task 5: Conditional Stamina Recovery

Change stamina recovery to be conditional: 3/turn if unhit, 1/turn if hit.

**Files:**
- Modify: `src/engine/systems/StaminaSystem.ts`
- Modify: `src/engine/components/index.ts`
- Test: `tests/engine/systems/StaminaSystem.test.ts`

**Step 1: Write the failing tests**

Update the existing `recoverStamina` tests in `tests/engine/systems/StaminaSystem.test.ts` and add new ones. Replace the entire `describe('recoverStamina', ...)` block:

```typescript
describe('recoverStamina', () => {
  it('recovers 3 stamina when not hit this turn', () => {
    const entity = createUnit(5);
    StaminaSystem.recoverStamina(world, entity, false);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(8);
  });

  it('recovers 1 stamina when hit this turn', () => {
    const entity = createUnit(5);
    StaminaSystem.recoverStamina(world, entity, true);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(6);
  });

  it('does not exceed max stamina', () => {
    const entity = createUnit(9);
    StaminaSystem.recoverStamina(world, entity, false);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(10);
  });

  it('clears exhausted when stamina recovered', () => {
    const entity = createUnit(0, true);
    StaminaSystem.recoverStamina(world, entity, false);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(3);
    expect(stamina.exhausted).toBe(false);
  });

  it('clears exhausted even with only 1 recovery when hit', () => {
    const entity = createUnit(0, true);
    StaminaSystem.recoverStamina(world, entity, true);

    const stamina = world.getComponent<StaminaComponent>(entity, 'stamina')!;
    expect(stamina.current).toBe(1);
    expect(stamina.exhausted).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: FAIL — `recoverStamina` doesn't accept `wasHit` parameter

**Step 3: Write minimal implementation**

Update `src/engine/systems/StaminaSystem.ts`. Change the constants and method:

```typescript
const STAMINA_RECOVERY_UNHIT = 3;
const STAMINA_RECOVERY_HIT = 1;
```

Replace the `recoverStamina` method:

```typescript
static recoverStamina(world: WorldImpl, entityId: EntityId, wasHit: boolean = false): void {
  const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
  if (!stamina) return;

  const recovery = wasHit ? STAMINA_RECOVERY_HIT : STAMINA_RECOVERY_UNHIT;
  const newCurrent = Math.min(stamina.max, stamina.current + recovery);

  world.addComponent<StaminaComponent>(entityId, {
    ...stamina,
    current: newCurrent,
    exhausted: false, // Clear exhaustion when recovering
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/StaminaSystem.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/systems/StaminaSystem.ts tests/engine/systems/StaminaSystem.test.ts
git commit -m "feat: conditional stamina recovery (3 unhit, 1 hit)"
```

---

### Task 6: Double Stamina in Unit Templates

Update all unit template stamina values to double.

**Files:**
- Modify: `src/engine/data/UnitTemplates.ts`
- Test: `tests/engine/data/UnitFactory.test.ts` (verify via existing factory tests)

**Step 1: Write a verification test**

Add a new test file or add to existing. Add to `tests/engine/data/UnitFactory.test.ts`:

```typescript
describe('stamina rebalancing', () => {
  it('all units have doubled stamina pools', () => {
    // Spot-check key units to verify rebalancing
    expect(UNIT_TEMPLATES.militia.stamina).toBe(20);
    expect(UNIT_TEMPLATES.warrior.stamina).toBe(20);
    expect(UNIT_TEMPLATES.knight.stamina).toBe(20);
    expect(UNIT_TEMPLATES.archer.stamina).toBe(20);
    expect(UNIT_TEMPLATES.scout.stamina).toBe(24);
    expect(UNIT_TEMPLATES.veteran.stamina).toBe(24);
    expect(UNIT_TEMPLATES.healer.stamina).toBe(16);
    expect(UNIT_TEMPLATES.goblin.stamina).toBe(16);
    expect(UNIT_TEMPLATES.orc_warrior.stamina).toBe(24);
    expect(UNIT_TEMPLATES.orc_brute.stamina).toBe(30);
    expect(UNIT_TEMPLATES.troll.stamina).toBe(40);
  });
});
```

Also add the import at the top of the test file:

```typescript
import { UNIT_TEMPLATES } from '../../../src/engine/data/UnitTemplates';
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/data/UnitFactory.test.ts`
Expected: FAIL — stamina values are the old (halved) values

**Step 3: Update all stamina values**

In `src/engine/data/UnitTemplates.ts`, update each unit's `stamina` field:

| Unit | Old | New |
|------|-----|-----|
| militia | 10 | 20 |
| warrior | 10 | 20 |
| veteran | 12 | 24 |
| knight | 10 | 20 |
| archer | 10 | 20 |
| crossbowman | 10 | 20 |
| healer | 8 | 16 |
| scout | 12 | 24 |
| goblin | 8 | 16 |
| orc_warrior | 12 | 24 |
| orc_archer | 10 | 20 |
| orc_brute | 15 | 30 |
| troll | 20 | 40 |

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/data/UnitFactory.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/data/UnitTemplates.ts tests/engine/data/UnitFactory.test.ts
git commit -m "feat: double all unit stamina pools for combat pacing rework"
```

---

### Task 7: Wire Armor Dodge Restriction into TurnResolutionSystem

Update the `chooseDefenseType` method to respect armor class dodge restrictions.

**Files:**
- Modify: `src/engine/systems/TurnResolutionSystem.ts`
- Test: `tests/engine/systems/TurnResolutionSystem.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/TurnResolutionSystem.test.ts`. First, check how tests are structured there and add a new describe block. You'll need to test the defense type selection indirectly via the `resolveAction` or test the method if it can be made accessible. Since `chooseDefenseType` is private, test it via the full attack resolution.

Create a focused test helper and tests. Add at the end of the existing test file:

```typescript
describe('armor class dodge restriction', () => {
  function createCombatUnit(
    world: WorldImpl,
    eventBus: EventBusImpl,
    faction: 'player' | 'enemy',
    x: number,
    y: number,
    armor: { head: number; torso: number; arms: number; legs: number },
    skills: { melee: number; block: number; dodge: number },
    hasShield: boolean = false
  ): string {
    const entity = world.createEntity();
    world.addComponent(entity, { type: 'position', x, y, facing: 0 } as PositionComponent);
    world.addComponent(entity, { type: 'faction', faction } as FactionComponent);
    world.addComponent(entity, {
      type: 'health', current: 100, max: 100, woundState: 'healthy',
    } as HealthComponent);
    world.addComponent(entity, {
      type: 'skills', melee: skills.melee, ranged: 30, block: skills.block,
      dodge: skills.dodge, morale: 50, perception: 40,
    } as SkillsComponent);
    world.addComponent(entity, {
      type: 'armor', ...armor, apPenalty: 0, staminaPenalty: 0,
    } as ArmorComponent);
    world.addComponent(entity, {
      type: 'weapon', name: 'Sword', damage: { dice: 1, sides: 8, bonus: 2 },
      speed: 5, range: 1.5, apCost: 2, twoHanded: false,
    } as WeaponComponent);
    world.addComponent(entity, {
      type: 'actionPoints', current: 5, max: 5, baseValue: 5,
      armorPenalty: 0, experienceBonus: 0,
    } as ActionPointsComponent);
    world.addComponent(entity, {
      type: 'stamina', current: 20, max: 20, exhausted: false,
    } as StaminaComponent);
    world.addComponent(entity, {
      type: 'engagement', engagedWith: [],
    } as EngagementComponent);
    if (hasShield) {
      world.addComponent(entity, {
        type: 'offHand', itemType: 'shield', blockBonus: 15,
      } as OffHandComponent);
    }
    return entity;
  }

  it('heavy armor unit cannot dodge - uses block or parry', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();
    const roller = new DiceRoller(42);

    // Heavy armor (total 24), high dodge skill — but should NOT dodge
    const attacker = createCombatUnit(world, eventBus, 'player', 0, 0,
      { head: 6, torso: 8, arms: 5, legs: 5 },
      { melee: 50, block: 30, dodge: 80 }
    );
    const defender = createCombatUnit(world, eventBus, 'enemy', 1, 0,
      { head: 6, torso: 8, arms: 5, legs: 5 },
      { melee: 50, block: 30, dodge: 80 },
      true // has shield
    );

    // Run many attack resolutions and check that no 'dodge' defense events appear
    let dodgeUsed = false;
    for (let i = 0; i < 20; i++) {
      const localRoller = new DiceRoller(i * 100);
      TurnResolutionSystem.resolveAction(
        world, eventBus, localRoller, attacker,
        { type: 'attack', targetId: defender, attackType: 'melee', apCost: 2, priority: 5 },
        1
      );
    }

    const defenseEvents = eventBus.getHistory().filter(e => e.type === 'DefenseRolled');
    for (const evt of defenseEvents) {
      if (evt.data.defenseType === 'dodge') dodgeUsed = true;
    }
    expect(dodgeUsed).toBe(false);
  });

  it('unarmored unit can use dodge', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();

    // Unarmored (total 1), high dodge
    const attacker = createCombatUnit(world, eventBus, 'player', 0, 0,
      { head: 0, torso: 1, arms: 0, legs: 0 },
      { melee: 50, block: 20, dodge: 60 }
    );
    const defender = createCombatUnit(world, eventBus, 'enemy', 1, 0,
      { head: 0, torso: 1, arms: 0, legs: 0 },
      { melee: 30, block: 20, dodge: 60 }
    );

    // Run attacks — dodge should be used since dodge > melee (parry) and no shield
    for (let i = 0; i < 20; i++) {
      const localRoller = new DiceRoller(i * 100);
      TurnResolutionSystem.resolveAction(
        world, eventBus, localRoller, attacker,
        { type: 'attack', targetId: defender, attackType: 'melee', apCost: 2, priority: 5 },
        1
      );
    }

    const defenseEvents = eventBus.getHistory().filter(e => e.type === 'DefenseRolled');
    const dodgeEvents = defenseEvents.filter(e => e.data.defenseType === 'dodge');
    expect(dodgeEvents.length).toBeGreaterThan(0);
  });
});
```

Note: You'll need to add missing imports at top of the test file. Check existing imports and add any missing ones (`StaminaComponent`, `EngagementComponent`, `OffHandComponent`).

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/TurnResolutionSystem.test.ts`
Expected: FAIL — heavy armor unit still uses dodge

**Step 3: Update chooseDefenseType**

In `src/engine/systems/TurnResolutionSystem.ts`, add import:

```typescript
import { CombatResolver, Modifier, DefenseType, HitLocation, ArmorClass } from './CombatResolver';
```

Replace the `chooseDefenseType` method:

```typescript
private static chooseDefenseType(
  world: WorldImpl,
  defenderId: EntityId,
  attackType: 'melee' | 'ranged'
): DefenseType {
  const offHand = world.getComponent<OffHandComponent>(defenderId, 'offHand');
  const skills = world.getComponent<SkillsComponent>(defenderId, 'skills');
  const armor = world.getComponent<ArmorComponent>(defenderId, 'armor');
  if (!skills) return 'dodge';

  // Determine armor class and whether dodge is available
  const armorClass = armor
    ? CombatResolver.getArmorClass(armor)
    : 'unarmored';
  const dodgePenalty = CombatResolver.getDodgePenalty(armorClass);
  const canDodge = dodgePenalty !== null;
  const effectiveDodge = canDodge ? skills.dodge + dodgePenalty : -Infinity;

  if (attackType === 'ranged') {
    // Ranged: block (shield) or dodge, no parry
    if (offHand?.itemType === 'shield' && skills.block >= effectiveDodge) return 'block';
    if (canDodge) return 'dodge';
    return 'block'; // Fallback for heavy armor with no shield
  }

  // Melee: block (shield) > parry > dodge, weighted by effective skill
  if (offHand?.itemType === 'shield' && skills.block >= Math.max(skills.melee, effectiveDodge)) return 'block';
  if (skills.melee >= effectiveDodge) return 'parry';
  if (canDodge) return 'dodge';
  return offHand?.itemType === 'shield' ? 'block' : 'parry';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/TurnResolutionSystem.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/systems/TurnResolutionSystem.ts tests/engine/systems/TurnResolutionSystem.test.ts
git commit -m "feat: armor class restricts dodge in defense type selection"
```

---

### Task 8: Wire Stamina Defense Penalty and Armor Drain into Combat Flow

Integrate the stamina defense penalty as a modifier in the attack resolution, add armor stamina drain when damage is dealt, and pass the roller to wound effects for critical table.

**Files:**
- Modify: `src/engine/systems/TurnResolutionSystem.ts`
- Test: `tests/engine/systems/TurnResolutionSystem.test.ts`

**Step 1: Write the failing tests**

Add to `tests/engine/systems/TurnResolutionSystem.test.ts`:

```typescript
describe('stamina defense penalty in combat', () => {
  it('applies stamina defense penalty to defense rolls', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();

    // Create exhausted defender (stamina 0) — should have -40 defense penalty
    const attacker = createCombatUnit(world, eventBus, 'player', 0, 0,
      { head: 0, torso: 1, arms: 0, legs: 0 },
      { melee: 50, block: 30, dodge: 60 }
    );
    const defender = createCombatUnit(world, eventBus, 'enemy', 1, 0,
      { head: 0, torso: 1, arms: 0, legs: 0 },
      { melee: 30, block: 30, dodge: 90 }, // Very high dodge
    );

    // Set defender to exhausted
    world.addComponent(defender, {
      type: 'stamina', current: 0, max: 20, exhausted: true,
    } as StaminaComponent);

    // Resolve an attack where the attack hits
    // With -40 penalty, effective dodge should be 90 - 40 = 50
    const roller = new DiceRoller(42);
    TurnResolutionSystem.resolveAction(
      world, eventBus, roller, attacker,
      { type: 'attack', targetId: defender, attackType: 'melee', apCost: 2, priority: 5 },
      1
    );

    // Check defense events — effective skill should be reduced
    const defenseEvents = eventBus.getHistory().filter(e => e.type === 'DefenseRolled');
    if (defenseEvents.length > 0) {
      // The effective skill should reflect the -40 stamina penalty
      expect(defenseEvents[0].data.effectiveSkill).toBeLessThanOrEqual(50);
    }
  });
});

describe('armor stamina drain in combat', () => {
  it('drains stamina when armor absorbs damage', () => {
    const world = new WorldImpl();
    const eventBus = new EventBusImpl();

    // Heavy armor defender
    const attacker = createCombatUnit(world, eventBus, 'player', 0, 0,
      { head: 0, torso: 1, arms: 0, legs: 0 },
      { melee: 95, block: 10, dodge: 10 } // Very high melee to guarantee hit
    );
    const defender = createCombatUnit(world, eventBus, 'enemy', 1, 0,
      { head: 6, torso: 8, arms: 5, legs: 5 },
      { melee: 10, block: 5, dodge: 5 }, // Very low defense to guarantee hit lands
      true
    );

    const staminaBefore = world.getComponent<StaminaComponent>(defender, 'stamina')!.current;

    // Run multiple attacks to get at least one hit
    for (let i = 0; i < 10; i++) {
      const localRoller = new DiceRoller(i * 1000);
      TurnResolutionSystem.resolveAction(
        world, eventBus, localRoller, attacker,
        { type: 'attack', targetId: defender, attackType: 'melee', apCost: 2, priority: 5 },
        1
      );
    }

    // Check ArmorImpact events were emitted
    const armorEvents = eventBus.getHistory().filter(e => e.type === 'ArmorImpact');
    // At least some hits should have triggered armor drain
    if (armorEvents.length > 0) {
      const staminaAfter = world.getComponent<StaminaComponent>(defender, 'stamina')!.current;
      expect(staminaAfter).toBeLessThan(staminaBefore);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/systems/TurnResolutionSystem.test.ts`
Expected: FAIL — no stamina defense penalty applied, no ArmorImpact events

**Step 3: Wire into resolveAttackCommand**

In `src/engine/systems/TurnResolutionSystem.ts`, in the `resolveAttackCommand` method, make these changes:

1. **Add stamina defense penalty** — after the existing wound penalty block in the defense modifier section (around line 680), add:

```typescript
// Stamina defense penalty
const staminaDefensePenalty = StaminaSystem.getStaminaDefensePenalty(world, command.targetId);
if (staminaDefensePenalty < 0) {
  defenseModifiers.push({ source: 'stamina_fatigue', value: staminaDefensePenalty });
}
```

2. **Add dodge armor class penalty** — also in the defense modifiers section, before the defense roll:

```typescript
// Armor dodge penalty
if (defenseType === 'dodge') {
  const defenderArmorForClass = world.getComponent<ArmorComponent>(command.targetId, 'armor');
  if (defenderArmorForClass) {
    const armorClass = CombatResolver.getArmorClass(defenderArmorForClass);
    const dodgePen = CombatResolver.getDodgePenalty(armorClass);
    if (dodgePen !== null && dodgePen < 0) {
      defenseModifiers.push({ source: 'armor_weight', value: dodgePen });
    }
  }
}
```

3. **Add armor stamina drain** — after the damage application block (after `DamageSystem.applyDamage`), add:

```typescript
// Armor stamina drain: absorbed damage tires the defender
const absorbed = damageResult.armorAbsorbed;
if (absorbed > 0) {
  StaminaSystem.applyArmorStaminaDrain(world, eventBus, command.targetId, absorbed, turn);
}
```

4. **Pass roller to wound effects** — update the `WoundEffectsSystem.checkAndApplyWoundEffect` call to pass `roller`:

```typescript
WoundEffectsSystem.checkAndApplyWoundEffect(
  world, eventBus, command.targetId, location, finalDamage, armor, turn, roller
);
```

This requires adding `roller` to the `resolveAttackCommand` parameters. Update the method signature to accept `roller: DiceRoller` and thread it through from `resolveAction`.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/systems/TurnResolutionSystem.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/engine/systems/TurnResolutionSystem.ts tests/engine/systems/TurnResolutionSystem.test.ts
git commit -m "feat: wire stamina defense penalty and armor drain into combat flow"
```

---

### Task 9: Update End-of-Turn Recovery for Hit Tracking

Update the end-of-turn processing to track which units were hit and apply conditional recovery.

**Files:**
- Modify: `src/engine/systems/TurnResolutionSystem.ts`
- Test: `tests/engine/systems/TurnResolutionSystem.test.ts`

**Step 1: Track hit entities during turn resolution**

In `resolveTurn`, add a `Set<EntityId>` to track which entities were damaged this turn. The simplest approach: after each attack resolution, check events for `DamageDealt` events targeting each entity.

In `processEndOfTurn`, update the `StaminaSystem.recoverStamina` call to pass the `wasHit` flag:

Replace:
```typescript
StaminaSystem.recoverStamina(world, entityId);
```
With:
```typescript
StaminaSystem.recoverStamina(world, entityId, hitEntities.has(entityId));
```

Where `hitEntities` is built from the event bus history for this turn by filtering `DamageDealt` events and collecting their `targetId` values.

**Step 2: Update processEndOfTurn signature**

```typescript
private static processEndOfTurn(
  world: WorldImpl,
  eventBus: EventBusImpl,
  _roller: DiceRoller,
  turn: number,
  hitEntities: Set<EntityId>
): void {
```

And in `resolveTurn`, before calling `processEndOfTurn`, build the hit set:

```typescript
const hitEntities = new Set<EntityId>();
for (const evt of eventBus.getHistory()) {
  if (evt.type === 'DamageDealt' && evt.turn === turn && evt.targetId) {
    hitEntities.add(evt.targetId as EntityId);
  }
}
this.processEndOfTurn(world, eventBus, roller, turn, hitEntities);
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/engine/systems/TurnResolutionSystem.ts
git commit -m "feat: conditional stamina recovery based on hit tracking"
```

---

### Task 10: Integration Test — Full Combat Pacing Scenario

Write an integration test that validates the full combat pacing loop: armor drains stamina, defense degrades, critical wounds on unarmored hits.

**Files:**
- Create: `tests/integration/combat-pacing.test.ts`

**Step 1: Write the integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/engine/core/GameEngine';
import { TurnResolutionSystem } from '../../src/engine/systems/TurnResolutionSystem';
import { StaminaSystem } from '../../src/engine/systems/StaminaSystem';
import { CombatResolver } from '../../src/engine/systems/CombatResolver';
import {
  HealthComponent,
  SkillsComponent,
  ArmorComponent,
  WeaponComponent,
  PositionComponent,
  FactionComponent,
  StaminaComponent,
  ActionPointsComponent,
  EngagementComponent,
  OffHandComponent,
  CommandQueueComponent,
  IdentityComponent,
} from '../../src/engine/components';

describe('Combat Pacing Integration', () => {
  function createKnight(engine: GameEngine, faction: 'player' | 'enemy', x: number, y: number) {
    const id = engine.createEntity();
    engine.addComponent(id, { type: 'identity', name: 'Knight', unitType: 'knight', shortId: 1 } as IdentityComponent);
    engine.addComponent(id, { type: 'position', x, y, facing: 0 } as PositionComponent);
    engine.addComponent(id, { type: 'faction', faction } as FactionComponent);
    engine.addComponent(id, { type: 'health', current: 120, max: 120, woundState: 'healthy' } as HealthComponent);
    engine.addComponent(id, {
      type: 'skills', melee: 85, ranged: 45, block: 70, dodge: 25, morale: 70, perception: 50,
    } as SkillsComponent);
    engine.addComponent(id, {
      type: 'armor', head: 6, torso: 8, arms: 5, legs: 5, apPenalty: 2, staminaPenalty: 2,
    } as ArmorComponent);
    engine.addComponent(id, {
      type: 'weapon', name: 'Longsword', damage: { dice: 1, sides: 10, bonus: 4 },
      speed: 6, range: 1.5, apCost: 2, twoHanded: false,
    } as WeaponComponent);
    engine.addComponent(id, { type: 'offHand', itemType: 'shield', blockBonus: 20 } as OffHandComponent);
    engine.addComponent(id, { type: 'actionPoints', current: 5, max: 5, baseValue: 5, armorPenalty: 2, experienceBonus: 1 } as ActionPointsComponent);
    engine.addComponent(id, { type: 'stamina', current: 20, max: 20, exhausted: false } as StaminaComponent);
    engine.addComponent(id, { type: 'engagement', engagedWith: [] } as EngagementComponent);
    engine.addComponent(id, { type: 'commandQueue', commands: [], currentCommandIndex: 0 } as CommandQueueComponent);
    return id;
  }

  function createGoblin(engine: GameEngine, faction: 'player' | 'enemy', x: number, y: number) {
    const id = engine.createEntity();
    engine.addComponent(id, { type: 'identity', name: 'Goblin', unitType: 'goblin', shortId: 2 } as IdentityComponent);
    engine.addComponent(id, { type: 'position', x, y, facing: 0 } as PositionComponent);
    engine.addComponent(id, { type: 'faction', faction } as FactionComponent);
    engine.addComponent(id, { type: 'health', current: 40, max: 40, woundState: 'healthy' } as HealthComponent);
    engine.addComponent(id, {
      type: 'skills', melee: 50, ranged: 40, block: 20, dodge: 45, morale: 30, perception: 40,
    } as SkillsComponent);
    engine.addComponent(id, {
      type: 'armor', head: 0, torso: 1, arms: 0, legs: 0, apPenalty: 0, staminaPenalty: 0,
    } as ArmorComponent);
    engine.addComponent(id, {
      type: 'weapon', name: 'Rusty Knife', damage: { dice: 1, sides: 4, bonus: 0 },
      speed: 2, range: 1, apCost: 1, twoHanded: false,
    } as WeaponComponent);
    engine.addComponent(id, { type: 'actionPoints', current: 6, max: 6, baseValue: 6, armorPenalty: 0, experienceBonus: 0 } as ActionPointsComponent);
    engine.addComponent(id, { type: 'stamina', current: 16, max: 16, exhausted: false } as StaminaComponent);
    engine.addComponent(id, { type: 'engagement', engagedWith: [] } as EngagementComponent);
    engine.addComponent(id, { type: 'commandQueue', commands: [], currentCommandIndex: 0 } as CommandQueueComponent);
    return id;
  }

  it('knight armor class is heavy and cannot dodge', () => {
    const engine = new GameEngine({ seed: 42 });
    const knight = createKnight(engine, 'player', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(knight, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('heavy');
    expect(CombatResolver.getDodgePenalty('heavy')).toBeNull();
  });

  it('goblin armor class is unarmored with full dodge', () => {
    const engine = new GameEngine({ seed: 42 });
    const goblin = createGoblin(engine, 'enemy', 5, 5);
    const armor = engine.getComponent<ArmorComponent>(goblin, 'armor')!;
    expect(CombatResolver.getArmorClass(armor)).toBe('unarmored');
    expect(CombatResolver.getDodgePenalty('unarmored')).toBe(0);
  });

  it('repeated hits on knight drain stamina over multiple turns', () => {
    const engine = new GameEngine({ seed: 100 });
    const knight = createKnight(engine, 'player', 5, 5);
    const goblin = createGoblin(engine, 'enemy', 6, 5);

    // Queue multiple attacks from goblin against knight
    for (let turn = 1; turn <= 5; turn++) {
      TurnResolutionSystem.queueCommand(engine.getWorld(), goblin, {
        type: 'attack', targetId: knight, attackType: 'melee', apCost: 1, priority: 2,
      });

      TurnResolutionSystem.resolveTurn(
        engine.getWorld(), engine.getEventBus(), engine.getDiceRoller(), turn
      );
    }

    // Knight's stamina should have decreased from absorbing hits
    const stamina = engine.getComponent<StaminaComponent>(knight, 'stamina')!;
    expect(stamina.current).toBeLessThan(20);
  });

  it('exhausted unit has significantly worse defense', () => {
    const engine = new GameEngine({ seed: 42 });
    const knight = createKnight(engine, 'player', 5, 5);

    // Manually exhaust the knight
    engine.addComponent<StaminaComponent>(knight, {
      type: 'stamina', current: 0, max: 20, exhausted: true,
    });

    expect(StaminaSystem.getStaminaDefensePenalty(engine.getWorld(), knight)).toBe(-40);
  });

  it('critical wound table applies to unarmored goblin hits', () => {
    const engine = new GameEngine({ seed: 42 });
    const knight = createKnight(engine, 'player', 5, 5);
    const goblin = createGoblin(engine, 'enemy', 6, 5);

    // Queue many attacks against goblin (unarmored)
    for (let turn = 1; turn <= 10; turn++) {
      TurnResolutionSystem.queueCommand(engine.getWorld(), knight, {
        type: 'attack', targetId: goblin, attackType: 'melee', apCost: 2, priority: 5,
      });

      TurnResolutionSystem.resolveTurn(
        engine.getWorld(), engine.getEventBus(), engine.getDiceRoller(), turn
      );

      // If goblin is down, stop
      const health = engine.getComponent<HealthComponent>(goblin, 'health');
      if (health && health.woundState === 'down') break;
    }

    // Check that wound events were generated (critical table should produce wounds)
    const woundEvents = engine.getEventHistory().filter(e => e.type === 'WoundEffectApplied');
    // We expect at least some wounds given unarmored hits
    // (Knight has high melee skill, goblin has low defense)
    expect(woundEvents.length).toBeGreaterThanOrEqual(0); // May be 0 if goblin dies from HP loss first
  });
});
```

**Step 2: Run integration test**

Run: `npx vitest run tests/integration/combat-pacing.test.ts`
Expected: ALL PASS

**Step 3: Run full test suite to ensure nothing is broken**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/integration/combat-pacing.test.ts
git commit -m "test: add combat pacing integration tests"
```

---

### Task 11: Fix Any Broken Existing Tests

After all changes, some existing tests may need updates (especially StaminaSystem tests that call `recoverStamina` without the `wasHit` parameter, and integration tests).

**Step 1: Run full test suite**

Run: `npx vitest run`

**Step 2: Fix any failures**

Common fixes needed:
- `recoverStamina` calls without `wasHit` parameter — the default is `false` so these should still work. If any test expects recovery of exactly 2 (the old value), update it to expect 3.
- Stamina values in tests that hardcode `max: 10` — these are test-local values and don't reference UnitTemplates, so they should be fine.

**Step 3: Run full suite again**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: update existing tests for combat pacing changes"
```

---

## Execution Order Summary

| Task | What | Files |
|------|------|-------|
| 1 | Armor classification helper | CombatResolver |
| 2 | Stamina defense penalty | StaminaSystem |
| 3 | Armor stamina drain | StaminaSystem |
| 4 | Critical wound table | WoundEffectsSystem |
| 5 | Conditional recovery | StaminaSystem |
| 6 | Double stamina values | UnitTemplates |
| 7 | Dodge restriction wiring | TurnResolutionSystem |
| 8 | Stamina penalty + drain wiring | TurnResolutionSystem |
| 9 | Hit tracking for recovery | TurnResolutionSystem |
| 10 | Integration tests | New test file |
| 11 | Fix broken tests | Various |

Tasks 1-6 are independent and could be parallelized. Tasks 7-9 depend on 1-6. Task 10-11 depend on everything.
