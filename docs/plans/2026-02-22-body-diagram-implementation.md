# Body Diagram UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline SVG body silhouette to the unit selection panel showing per-region armor, wound severity, and wound effect labels, with perception-filtered enemy views.

**Architecture:** New `src/ui/BodyDiagramUI.ts` module with pure functions returning HTML strings. Integrates into existing `TurnBasedGame.updateTurnBasedUI()` by replacing the HP/Armor text lines. No new data structures — reads existing ECS components.

**Tech Stack:** TypeScript, inline SVG, CSS classes, Vitest

---

### Task 1: Core mapping helpers — tests

**Files:**
- Create: `tests/ui/BodyDiagramUI.test.ts`

**Step 1: Write failing tests for zone color mapping**

```typescript
import { describe, it, expect } from 'vitest';
import {
  getZoneColor,
  getWorstSeverity,
  getWoundLabels,
  getPerceptionFilteredArmor,
  getPerceptionFilteredZoneColor,
} from '../../src/ui/BodyDiagramUI';
import { WoundEffect, WoundSeverity } from '../../src/engine/components';

describe('BodyDiagramUI', () => {
  describe('getZoneColor', () => {
    it('returns gray for no wounds', () => {
      expect(getZoneColor(null)).toBe('#555');
    });

    it('returns yellow for minor', () => {
      expect(getZoneColor('minor')).toBe('#e8c547');
    });

    it('returns orange for moderate', () => {
      expect(getZoneColor('moderate')).toBe('#e87c2a');
    });

    it('returns red for severe', () => {
      expect(getZoneColor('severe')).toBe('#e83a3a');
    });

    it('returns dark for down', () => {
      expect(getZoneColor('down')).toBe('#222');
    });
  });

  describe('getWorstSeverity', () => {
    it('returns null for empty array', () => {
      expect(getWorstSeverity([])).toBeNull();
    });

    it('returns the single severity', () => {
      expect(getWorstSeverity(['minor'])).toBe('minor');
    });

    it('returns worst when mixed', () => {
      expect(getWorstSeverity(['minor', 'severe', 'moderate'])).toBe('severe');
    });

    it('returns moderate over minor', () => {
      expect(getWorstSeverity(['minor', 'moderate'])).toBe('moderate');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: FAIL — module not found

---

### Task 2: Core mapping helpers — implementation

**Files:**
- Create: `src/ui/BodyDiagramUI.ts`

**Step 1: Implement the mapping helpers**

```typescript
import { WoundSeverity, WoundEffect, WoundLocation, ArmorComponent, WoundEffectsComponent, HealthComponent } from '../engine/components';
import { PerceptionTier, getPerceptionTier } from './PerceptionHelpers';

// --- Zone color mapping ---

const SEVERITY_ORDER: Record<WoundSeverity, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
};

const ZONE_COLORS: Record<string, string> = {
  none: '#555',
  minor: '#e8c547',
  moderate: '#e87c2a',
  severe: '#e83a3a',
  down: '#222',
};

export function getZoneColor(severity: WoundSeverity | 'down' | null): string {
  if (severity === null) return ZONE_COLORS.none;
  return ZONE_COLORS[severity] ?? ZONE_COLORS.none;
}

export function getWorstSeverity(severities: WoundSeverity[]): WoundSeverity | null {
  if (severities.length === 0) return null;
  return severities.reduce((worst, s) =>
    SEVERITY_ORDER[s] > SEVERITY_ORDER[worst] ? s : worst
  );
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/BodyDiagramUI.ts tests/ui/BodyDiagramUI.test.ts
git commit -m "feat: add body diagram zone color mapping helpers with tests"
```

---

### Task 3: Wound label helpers — tests

**Files:**
- Modify: `tests/ui/BodyDiagramUI.test.ts`

**Step 1: Add tests for wound label generation**

Add to the existing describe block:

```typescript
describe('getWoundLabels', () => {
  const makeWound = (location: WoundLocation, severity: WoundSeverity): WoundEffect => {
    const table: Record<WoundLocation, Record<WoundSeverity, WoundEffect>> = {
      arms: {
        minor: { location: 'arms', severity: 'minor', skillPenalty: 5, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'arms', severity: 'moderate', skillPenalty: 15, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        severe: { location: 'arms', severity: 'severe', skillPenalty: 30, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: true, restrictsMoveMode: false, halvesMovement: false },
      },
      legs: {
        minor: { location: 'legs', severity: 'minor', skillPenalty: 0, movementPenalty: 1, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'legs', severity: 'moderate', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: true },
        severe: { location: 'legs', severity: 'severe', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 0, disablesTwoHanded: false, restrictsMoveMode: true, halvesMovement: true },
      },
      torso: {
        minor: { location: 'torso', severity: 'minor', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 1, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        moderate: { location: 'torso', severity: 'moderate', skillPenalty: 0, movementPenalty: 0, bleedingPerTurn: 3, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
        severe: { location: 'torso', severity: 'severe', skillPenalty: 10, movementPenalty: 0, bleedingPerTurn: 5, disablesTwoHanded: false, restrictsMoveMode: false, halvesMovement: false },
      },
    };
    return table[location][severity];
  };

  it('returns empty array for no wounds', () => {
    expect(getWoundLabels('arms', [])).toEqual([]);
  });

  it('returns skill penalty label for arm wounds', () => {
    const wounds = [makeWound('arms', 'minor')];
    expect(getWoundLabels('arms', wounds)).toContain('-5 skill');
  });

  it('returns cumulative skill penalty for stacked arm wounds', () => {
    const wounds = [makeWound('arms', 'minor'), makeWound('arms', 'moderate')];
    expect(getWoundLabels('arms', wounds)).toContain('-20 skill');
  });

  it('returns "No 2H" for severe arm wound', () => {
    const wounds = [makeWound('arms', 'severe')];
    const labels = getWoundLabels('arms', wounds);
    expect(labels).toContain('No 2H');
  });

  it('returns movement labels for leg wounds', () => {
    const wounds = [makeWound('legs', 'moderate')];
    const labels = getWoundLabels('legs', wounds);
    expect(labels).toContain('½ move');
  });

  it('returns "No run" for severe leg wound', () => {
    const wounds = [makeWound('legs', 'severe')];
    const labels = getWoundLabels('legs', wounds);
    expect(labels).toContain('No run');
  });

  it('returns bleeding label for torso wounds', () => {
    const wounds = [makeWound('torso', 'minor')];
    const labels = getWoundLabels('torso', wounds);
    expect(labels).toContain('1/turn');
  });

  it('returns cumulative bleeding for stacked torso wounds', () => {
    const wounds = [makeWound('torso', 'minor'), makeWound('torso', 'moderate')];
    const labels = getWoundLabels('torso', wounds);
    expect(labels).toContain('4/turn');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: FAIL — `getWoundLabels` not found

---

### Task 4: Wound label helpers — implementation

**Files:**
- Modify: `src/ui/BodyDiagramUI.ts`

**Step 1: Implement getWoundLabels**

Add to `BodyDiagramUI.ts`:

```typescript
export type BodyZone = 'head' | 'torso' | 'arms' | 'legs';

export function getWoundLabels(zone: BodyZone, wounds: WoundEffect[]): string[] {
  const zoneWounds = wounds.filter(w => w.location === zone);
  if (zoneWounds.length === 0) return [];

  const labels: string[] = [];

  // Cumulative skill penalty
  const totalSkill = zoneWounds.reduce((sum, w) => sum + w.skillPenalty, 0);
  if (totalSkill > 0) labels.push(`-${totalSkill} skill`);

  // Movement effects (legs)
  if (zoneWounds.some(w => w.halvesMovement)) labels.push('½ move');
  if (zoneWounds.some(w => w.restrictsMoveMode)) labels.push('No run');

  // Movement penalty (legs minor: -1 move)
  const totalMovePenalty = zoneWounds.reduce((sum, w) => sum + w.movementPenalty, 0);
  if (totalMovePenalty > 0 && !zoneWounds.some(w => w.halvesMovement)) {
    labels.push(`-${totalMovePenalty} move`);
  }

  // Two-handed disabled (arms)
  if (zoneWounds.some(w => w.disablesTwoHanded)) labels.push('No 2H');

  // Bleeding (torso)
  const totalBleeding = zoneWounds.reduce((sum, w) => sum + w.bleedingPerTurn, 0);
  if (totalBleeding > 0) labels.push(`${totalBleeding}/turn`);

  return labels;
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/BodyDiagramUI.ts tests/ui/BodyDiagramUI.test.ts
git commit -m "feat: add wound label generation for body diagram zones"
```

---

### Task 5: Perception filtering helpers — tests

**Files:**
- Modify: `tests/ui/BodyDiagramUI.test.ts`

**Step 1: Add tests for perception filtering**

```typescript
describe('getPerceptionFilteredArmor', () => {
  it('returns exact value for excellent', () => {
    expect(getPerceptionFilteredArmor(5, 'excellent')).toBe('5');
  });

  it('returns range for good', () => {
    expect(getPerceptionFilteredArmor(5, 'good')).toBe('4-6');
  });

  it('returns Light/Medium/Heavy for average', () => {
    expect(getPerceptionFilteredArmor(1, 'average')).toBe('Light');
    expect(getPerceptionFilteredArmor(3, 'average')).toBe('Medium');
    expect(getPerceptionFilteredArmor(6, 'average')).toBe('Heavy');
  });

  it('returns null for low and poor', () => {
    expect(getPerceptionFilteredArmor(5, 'low')).toBeNull();
    expect(getPerceptionFilteredArmor(5, 'poor')).toBeNull();
  });
});

describe('getPerceptionFilteredZoneColor', () => {
  it('returns exact color for excellent', () => {
    expect(getPerceptionFilteredZoneColor('minor', false, 'excellent')).toBe('#e8c547');
  });

  it('returns exact color for good', () => {
    expect(getPerceptionFilteredZoneColor('moderate', false, 'good')).toBe('#e87c2a');
  });

  it('merges minor/moderate to yellow for average', () => {
    expect(getPerceptionFilteredZoneColor('minor', false, 'average')).toBe('#e8c547');
    expect(getPerceptionFilteredZoneColor('moderate', false, 'average')).toBe('#e8c547');
    expect(getPerceptionFilteredZoneColor('severe', false, 'average')).toBe('#e83a3a');
  });

  it('returns binary hurt/badly-hurt for low', () => {
    expect(getPerceptionFilteredZoneColor('minor', false, 'low')).toBe('#e8c547');
    expect(getPerceptionFilteredZoneColor('moderate', false, 'low')).toBe('#e8c547');
    expect(getPerceptionFilteredZoneColor('severe', false, 'low')).toBe('#e83a3a');
  });

  it('returns gray for poor (no info)', () => {
    expect(getPerceptionFilteredZoneColor('severe', false, 'poor')).toBe('#555');
  });

  it('returns down color regardless of perception when down', () => {
    expect(getPerceptionFilteredZoneColor(null, true, 'poor')).toBe('#222');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: FAIL

---

### Task 6: Perception filtering helpers — implementation

**Files:**
- Modify: `src/ui/BodyDiagramUI.ts`

**Step 1: Implement perception filtering**

```typescript
export function getPerceptionFilteredArmor(value: number, tier: PerceptionTier): string | null {
  switch (tier) {
    case 'excellent':
      return String(value);
    case 'good': {
      const low = Math.max(0, value - 1);
      const high = value + 1;
      return `${low}-${high}`;
    }
    case 'average':
      if (value <= 2) return 'Light';
      if (value <= 4) return 'Medium';
      return 'Heavy';
    case 'low':
    case 'poor':
      return null;
  }
}

export function getPerceptionFilteredZoneColor(
  severity: WoundSeverity | null,
  isDown: boolean,
  tier: PerceptionTier
): string {
  if (isDown) return ZONE_COLORS.down;
  if (severity === null) return ZONE_COLORS.none;

  switch (tier) {
    case 'excellent':
    case 'good':
      return getZoneColor(severity);
    case 'average':
      // minor and moderate both show as yellow
      return severity === 'severe' ? ZONE_COLORS.severe : ZONE_COLORS.minor;
    case 'low':
      // binary: hurt (yellow) or badly hurt (red)
      return severity === 'severe' ? ZONE_COLORS.severe : ZONE_COLORS.minor;
    case 'poor':
      return ZONE_COLORS.none; // no info
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/BodyDiagramUI.ts tests/ui/BodyDiagramUI.test.ts
git commit -m "feat: add perception-filtered armor and zone color helpers"
```

---

### Task 7: SVG silhouette and renderBodyDiagram for player units

**Files:**
- Modify: `src/ui/BodyDiagramUI.ts`

**Step 1: Implement SVG template and renderBodyDiagram**

Add the SVG body silhouette template and the main render function. The SVG is a simple front-facing outline ~120px wide by ~200px tall with 4 zones (head circle, torso rect, arms rects, legs rects). Each zone is a `<path>` or `<rect>` with a `data-zone` attribute.

```typescript
import { WorldImpl } from '../engine/ecs/World';
import { EntityId } from '../engine/types';

// Zone layout positions in the SVG (viewBox 0 0 120 200)
const ZONES = {
  head:  { cx: 60, cy: 22, r: 16 },
  torso: { x: 38, y: 42, w: 44, h: 52 },
  armL:  { x: 18, y: 44, w: 18, h: 48 },
  armR:  { x: 84, y: 44, w: 18, h: 48 },
  legL:  { x: 38, y: 98, w: 20, h: 56 },
  legR:  { x: 62, y: 98, w: 20, h: 56 },
};

// Armor badge positions
const ARMOR_POS = {
  head:  { x: 60, y: 26 },
  torso: { x: 60, y: 70 },
  arms:  { x: 14, y: 70 },
  legs:  { x: 60, y: 128 },
};

// Wound label positions (right side of body)
const LABEL_POS = {
  head:  { x: 95, y: 22 },
  arms:  { x: 108, y: 58 },
  torso: { x: 108, y: 80 },
  legs:  { x: 108, y: 120 },
};

interface ZoneData {
  color: string;
  armorText: string | null;
  labels: string[];
  tooltipLines: string[];
}

function getZoneDataForPlayer(
  zone: BodyZone,
  armor: ArmorComponent | undefined,
  woundEffects: WoundEffectsComponent | undefined,
  isDown: boolean
): ZoneData {
  const armorValue = armor ? armor[zone as keyof Pick<ArmorComponent, 'head' | 'torso' | 'arms' | 'legs'>] : 0;
  const wounds = woundEffects?.effects.filter(w => w.location === zone) ?? [];
  const severities = wounds.map(w => w.severity);
  const worst = isDown ? 'down' as const : getWorstSeverity(severities);
  const color = getZoneColor(worst);
  const armorText = armorValue > 0 ? String(armorValue) : null;
  const labels = zone === 'head' ? [] : getWoundLabels(zone, woundEffects?.effects ?? []);

  // Tooltip
  const tooltipLines: string[] = [];
  tooltipLines.push(`Armor: ${armorValue}`);
  if (wounds.length > 0) {
    for (const w of wounds) {
      tooltipLines.push(`${w.severity} wound`);
    }
  } else {
    tooltipLines.push('No wounds');
  }

  return { color, armorText, labels, tooltipLines };
}

function renderSvgZone(zone: BodyZone, data: ZoneData): string {
  const tooltip = data.tooltipLines.join('&#10;');
  let shapeSvg = '';

  // Head is a circle, everything else uses rects
  if (zone === 'head') {
    const z = ZONES.head;
    shapeSvg = `<circle cx="${z.cx}" cy="${z.cy}" r="${z.r}" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></circle>`;
  } else if (zone === 'torso') {
    const z = ZONES.torso;
    shapeSvg = `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  } else if (zone === 'arms') {
    // Two rects for left and right arm, same color
    const l = ZONES.armL, r = ZONES.armR;
    shapeSvg = `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>` +
               `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  } else { // legs
    const l = ZONES.legL, r = ZONES.legR;
    shapeSvg = `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>` +
               `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  }

  // Armor badge
  let armorBadge = '';
  if (data.armorText) {
    const pos = ARMOR_POS[zone];
    armorBadge = `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" font-size="10" fill="#fff" font-weight="bold" style="text-shadow:0 0 3px #000">🛡${data.armorText}</text>`;
  }

  // Wound labels
  let labelsSvg = '';
  if (data.labels.length > 0) {
    const pos = LABEL_POS[zone];
    labelsSvg = data.labels.map((label, i) =>
      `<text x="${pos.x}" y="${pos.y + i * 12}" font-size="9" fill="${data.color}" font-weight="bold" text-anchor="start">${label}</text>`
    ).join('');
  }

  return shapeSvg + armorBadge + labelsSvg;
}

export function renderBodyDiagram(
  entityId: EntityId,
  world: WorldImpl
): string {
  const health = world.getComponent<HealthComponent>(entityId, 'health');
  const armor = world.getComponent<ArmorComponent>(entityId, 'armor');
  const woundEffects = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
  const isDown = health?.woundState === 'down';

  const zones: BodyZone[] = ['head', 'torso', 'arms', 'legs'];
  const zonesSvg = zones.map(zone => {
    const data = getZoneDataForPlayer(zone, armor, woundEffects, isDown);
    return renderSvgZone(zone, data);
  }).join('');

  // HP bar
  const hpCurrent = health?.current ?? 0;
  const hpMax = health?.max ?? 1;
  const hpPct = Math.max(0, (hpCurrent / hpMax) * 100);
  const hpColor = hpPct > 50 ? '#6bcf7b' : hpPct > 25 ? '#e8c547' : '#e83a3a';

  return `<div class="body-diagram">
    <svg viewBox="0 0 140 160" width="140" height="160" xmlns="http://www.w3.org/2000/svg">
      ${zonesSvg}
    </svg>
    <div class="body-hp-bar" style="margin-top:4px">
      <div style="background:#333;border-radius:3px;height:6px;width:100%;position:relative">
        <div style="background:${hpColor};border-radius:3px;height:6px;width:${hpPct}%"></div>
      </div>
      <div style="font-size:11px;color:#aaa;text-align:center;margin-top:2px">${hpCurrent} / ${hpMax} HP (${health?.woundState ?? '—'})</div>
    </div>
  </div>`;
}
```

**Step 2: Verify existing tests still pass**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/BodyDiagramUI.ts
git commit -m "feat: add SVG body silhouette and renderBodyDiagram for player units"
```

---

### Task 8: renderEnemyBodyDiagram with perception filtering

**Files:**
- Modify: `src/ui/BodyDiagramUI.ts`

**Step 1: Implement enemy diagram renderer**

```typescript
function getZoneDataForEnemy(
  zone: BodyZone,
  armor: ArmorComponent | undefined,
  woundEffects: WoundEffectsComponent | undefined,
  isDown: boolean,
  tier: PerceptionTier
): ZoneData {
  const armorValue = armor ? armor[zone as keyof Pick<ArmorComponent, 'head' | 'torso' | 'arms' | 'legs'>] : 0;
  const wounds = woundEffects?.effects.filter(w => w.location === zone) ?? [];
  const severities = wounds.map(w => w.severity);
  const worst = getWorstSeverity(severities);

  const color = getPerceptionFilteredZoneColor(worst, isDown, tier);
  const armorText = getPerceptionFilteredArmor(armorValue, tier);

  // Labels only visible at good+ perception
  let labels: string[] = [];
  if (tier === 'excellent' || tier === 'good') {
    labels = zone === 'head' ? [] : getWoundLabels(zone, woundEffects?.effects ?? []);
  } else if (tier === 'average' && wounds.length > 0) {
    labels = ['wounded'];
  }

  // Tooltips based on tier
  const tooltipLines: string[] = [];
  if (tier === 'poor') {
    tooltipLines.push('???');
  } else if (tier === 'low') {
    tooltipLines.push(wounds.length > 0 ? 'Hurt' : 'OK');
  } else {
    tooltipLines.push(`Armor: ${armorText ?? '?'}`);
    if (wounds.length > 0) {
      for (const w of wounds) {
        tooltipLines.push(tier === 'average' ? 'wound' : `${w.severity} wound`);
      }
    }
  }

  return { color, armorText: tier === 'poor' ? null : armorText, labels, tooltipLines };
}

export function renderEnemyBodyDiagram(
  entityId: EntityId,
  observerPerception: number,
  world: WorldImpl
): string {
  const tier = getPerceptionTier(observerPerception);
  const health = world.getComponent<HealthComponent>(entityId, 'health');
  const armor = world.getComponent<ArmorComponent>(entityId, 'armor');
  const woundEffects = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
  const isDown = health?.woundState === 'down';

  const zones: BodyZone[] = ['head', 'torso', 'arms', 'legs'];
  const zonesSvg = zones.map(zone => {
    const data = getZoneDataForEnemy(zone, armor, woundEffects, isDown, tier);
    return renderSvgZone(zone, data);
  }).join('');

  // "?" overlay for poor perception
  const overlay = tier === 'poor'
    ? '<text x="60" y="90" text-anchor="middle" font-size="40" fill="#888" opacity="0.7">?</text>'
    : '';

  return `<div class="body-diagram body-diagram-enemy">
    <svg viewBox="0 0 140 160" width="140" height="160" xmlns="http://www.w3.org/2000/svg">
      ${zonesSvg}
      ${overlay}
    </svg>
  </div>`;
}
```

**Step 2: Run all tests**

Run: `npx vitest run tests/ui/BodyDiagramUI.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/BodyDiagramUI.ts
git commit -m "feat: add perception-filtered enemy body diagram renderer"
```

---

### Task 9: Integrate into TurnBasedGame — player panel

**Files:**
- Modify: `src/game/TurnBasedGame.ts` (around lines 2049-2056)

**Step 1: Import and wire up player diagram**

At the top of `TurnBasedGame.ts`, add import:

```typescript
import { renderBodyDiagram, renderEnemyBodyDiagram } from '../ui/BodyDiagramUI';
```

In `updateTurnBasedUI()`, in the player branch (around line 2049), replace the HP and Armor lines:

```typescript
// BEFORE (lines ~2051-2056):
"<div>" + label("HP") + (health?.current ?? 0) + " / " + (health?.max ?? 0) + " <span style=\"color:#888\">(" + (health?.woundState ?? "—") + ")</span></div>",
...
"<div>" + label("Armor") + armorStr + "</div>",

// AFTER:
renderBodyDiagram(id, world),
```

Keep AP, Stamina, Morale, Weapon, Distance, command list, and buttons unchanged below the diagram.

**Step 2: Test manually in browser**

Run: `npm run dev`
- Select a player unit → body diagram should appear with colored zones and armor values
- Verify AP/stamina/morale/weapon/commands still display below

**Step 3: Commit**

```bash
git add src/game/TurnBasedGame.ts
git commit -m "feat: integrate body diagram into player selection panel"
```

---

### Task 10: Integrate into TurnBasedGame — enemy panel

**Files:**
- Modify: `src/game/TurnBasedGame.ts` (around lines 1967-1973 and 2088-2131)

**Step 1: Wire up enemy diagram**

In the enemy branch of `updateTurnBasedUI()` (around line 1967), replace the "Condition" line with the body diagram. Need to find the currently selected player unit's perception to pass as `observerPerception`.

For the single-enemy view (~line 1967):
```typescript
// Get observer perception (last selected player unit, or first alive player)
const observerPerception = this.getObserverPerception(world);

const lines = [
  renderEnemyBodyDiagram(id, observerPerception, world),
  "<div>" + label("Weapon") + weaponStr + "</div>",
  "<div>" + label("Distance") + distanceStr + " " + rangeIndicator + "</div>",
  "<div>" + label("Status") + queueStatus + "</div>",
];
```

For the engaged-enemies view (~line 2088), add a small diagram per enemy card:
```typescript
// Inside the enemy card loop, add the diagram before condition
const eDiagramHtml = renderEnemyBodyDiagram(enemyId, observerPerception, world);
```

Add a helper method to get observer perception:
```typescript
private getObserverPerception(world: WorldImpl): number {
  // Use last-selected player unit, or first alive player unit
  const playerUnits = world.query('faction', 'skills', 'health');
  for (const pId of playerUnits) {
    const f = world.getComponent<FactionComponent>(pId, 'faction');
    const h = world.getComponent<HealthComponent>(pId, 'health');
    if (f?.faction === 'player' && h?.woundState !== 'down') {
      const skills = world.getComponent<SkillsComponent>(pId, 'skills');
      return skills?.perception ?? 40;
    }
  }
  return 40; // fallback average
}
```

**Step 2: Test manually in browser**

Run: `npm run dev`
- Select an enemy → body diagram with perception filtering
- Select a player unit engaged with enemies → engaged enemy cards show diagrams

**Step 3: Commit**

```bash
git add src/game/TurnBasedGame.ts
git commit -m "feat: integrate enemy body diagram with perception filtering"
```

---

### Task 11: CSS styling and polish

**Files:**
- Modify: `index.html` (add CSS for `.body-diagram` class)

**Step 1: Add CSS for body diagram**

Add within the existing `<style>` block in `index.html`:

```css
.body-diagram {
  margin: 4px 0 8px 0;
  text-align: center;
}
.body-diagram svg {
  display: block;
  margin: 0 auto;
}
.body-diagram-enemy {
  opacity: 0.9;
}
.body-hp-bar {
  max-width: 140px;
  margin: 0 auto;
}
```

**Step 2: Test manually in browser**

Run: `npm run dev`
- Verify diagram is centered and properly spaced in the panel

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add CSS styling for body diagram"
```

---

### Task 12: Run full test suite and build

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any test/build issues from body diagram integration"
```
