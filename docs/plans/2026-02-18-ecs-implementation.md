# ECS Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core ECS foundation with dice system and basic combat, testable without UI.

**Architecture:** Lightweight custom ECS with World managing entities/components, systems as pure functions. Engine completely separated from UI - no DOM or Three.js dependencies. State snapshots enable save/load and deterministic replay.

**Tech Stack:** TypeScript, Vitest for testing, seeded Mulberry32 PRNG for dice.

---

## Progress Tracker

- [x] Task 1: Setup Vitest
- [x] Task 2: Core ECS Types
- [x] Task 3: World Class
- [x] Task 4: DiceRoller
- [x] Task 5: EventBus
- [x] Task 6: Basic Components
- [x] Task 7: Combat Resolution Logic
- [x] Task 8: Damage System
- [x] Task 9: GameEngine Shell
- [x] Task 10: Integration Test

**Status: COMPLETE** - All 68 tests passing

---

## Task 1: Setup Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

```bash
npm install -D vitest
```

**Step 2: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 3: Add test script to package.json**

Add to scripts:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 4: Verify setup**

Run: `npm run test:run`
Expected: "No test files found" (success - vitest works)

---

## Task 2: Core ECS Types

**Files:**
- Create: `src/engine/types/index.ts`

**Step 1: Write type definitions**

```typescript
// Entity is just a string ID
export type EntityId = string;

// Base component interface - all components must have a type
export interface Component {
  readonly type: string;
}

// System context passed to all systems
export interface SystemContext {
  deltaTime: number;
  turn: number;
  phase: 'planning' | 'resolution';
}

// System interface
export interface System {
  readonly name: string;
  readonly requiredComponents: readonly string[];
  run(world: World, entities: EntityId[], context: SystemContext): void;
}

// Forward declaration for World (will be implemented in ecs/)
export interface World {
  createEntity(): EntityId;
  removeEntity(entityId: EntityId): void;
  addComponent<T extends Component>(entityId: EntityId, component: T): void;
  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined;
  hasComponent(entityId: EntityId, type: string): boolean;
  removeComponent(entityId: EntityId, type: string): void;
  query(...componentTypes: string[]): EntityId[];
  getAllEntities(): EntityId[];
  clear(): void;
}

// Game event types
export type GameEventType =
  | 'TurnStarted'
  | 'PlanningPhaseStarted'
  | 'ResolutionPhaseStarted'
  | 'TurnEnded'
  | 'UnitMoved'
  | 'AttackDeclared'
  | 'AttackRolled'
  | 'DefenseRolled'
  | 'HitLocationRolled'
  | 'DamageDealt'
  | 'UnitWounded'
  | 'UnitDown'
  | 'MoraleChecked'
  | 'UnitShaken'
  | 'UnitBroken'
  | 'UnitRouted'
  | 'VictoryAchieved'
  | 'DefeatSuffered';

// Game event structure
export interface GameEvent {
  type: GameEventType;
  turn: number;
  timestamp: number;
  entityId?: EntityId;
  targetId?: EntityId;
  data: Record<string, unknown>;
}

// Snapshot for save/load
export interface GameSnapshot {
  turn: number;
  phase: 'planning' | 'resolution';
  timestamp: number;
  entities: Record<EntityId, Record<string, Component>>;
  randomState: {
    seed: number;
    callCount: number;
  };
  turnLog: GameEvent[];
}
```

---

## Task 3: World Class

**Files:**
- Create: `src/engine/ecs/World.ts`
- Create: `tests/engine/ecs/World.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { Component } from '../../../src/engine/types';

interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
}

interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
}

describe('World', () => {
  let world: WorldImpl;

  beforeEach(() => {
    world = new WorldImpl();
  });

  describe('createEntity', () => {
    it('creates unique entity IDs', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      expect(e1).not.toBe(e2);
    });

    it('returns string IDs', () => {
      const e = world.createEntity();
      expect(typeof e).toBe('string');
    });
  });

  describe('addComponent / getComponent', () => {
    it('adds and retrieves a component', () => {
      const entity = world.createEntity();
      const position: PositionComponent = { type: 'position', x: 10, y: 20 };

      world.addComponent(entity, position);
      const retrieved = world.getComponent<PositionComponent>(entity, 'position');

      expect(retrieved).toEqual(position);
    });

    it('returns undefined for missing component', () => {
      const entity = world.createEntity();
      const retrieved = world.getComponent(entity, 'position');
      expect(retrieved).toBeUndefined();
    });

    it('overwrites existing component of same type', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 10, y: 20 } as PositionComponent);
      world.addComponent(entity, { type: 'position', x: 30, y: 40 } as PositionComponent);

      const retrieved = world.getComponent<PositionComponent>(entity, 'position');
      expect(retrieved?.x).toBe(30);
    });
  });

  describe('hasComponent', () => {
    it('returns true when component exists', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      expect(world.hasComponent(entity, 'position')).toBe(true);
    });

    it('returns false when component missing', () => {
      const entity = world.createEntity();
      expect(world.hasComponent(entity, 'position')).toBe(false);
    });
  });

  describe('removeComponent', () => {
    it('removes a component', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.removeComponent(entity, 'position');
      expect(world.hasComponent(entity, 'position')).toBe(false);
    });
  });

  describe('removeEntity', () => {
    it('removes entity and all its components', () => {
      const entity = world.createEntity();
      world.addComponent(entity, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.removeEntity(entity);

      expect(world.getComponent(entity, 'position')).toBeUndefined();
      expect(world.getAllEntities()).not.toContain(entity);
    });
  });

  describe('query', () => {
    it('returns entities with all specified components', () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      const e3 = world.createEntity();

      world.addComponent(e1, { type: 'position', x: 0, y: 0 } as PositionComponent);
      world.addComponent(e1, { type: 'health', current: 100, max: 100 } as HealthComponent);

      world.addComponent(e2, { type: 'position', x: 0, y: 0 } as PositionComponent);
      // e2 has no health

      world.addComponent(e3, { type: 'health', current: 50, max: 100 } as HealthComponent);
      // e3 has no position

      const result = world.query('position', 'health');

      expect(result).toContain(e1);
      expect(result).not.toContain(e2);
      expect(result).not.toContain(e3);
    });

    it('returns empty array when no matches', () => {
      const result = world.query('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all entities', () => {
      world.createEntity();
      world.createEntity();
      world.clear();
      expect(world.getAllEntities()).toEqual([]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write World implementation**

```typescript
import { Component, EntityId, World } from '../types';

export class WorldImpl implements World {
  private entities: Map<EntityId, Map<string, Component>> = new Map();
  private nextEntityId = 0;

  createEntity(): EntityId {
    const id = `entity_${this.nextEntityId++}`;
    this.entities.set(id, new Map());
    return id;
  }

  removeEntity(entityId: EntityId): void {
    this.entities.delete(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    const components = this.entities.get(entityId);
    if (components) {
      components.set(component.type, component);
    }
  }

  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined {
    const components = this.entities.get(entityId);
    return components?.get(type) as T | undefined;
  }

  hasComponent(entityId: EntityId, type: string): boolean {
    const components = this.entities.get(entityId);
    return components?.has(type) ?? false;
  }

  removeComponent(entityId: EntityId, type: string): void {
    const components = this.entities.get(entityId);
    components?.delete(type);
  }

  query(...componentTypes: string[]): EntityId[] {
    const result: EntityId[] = [];
    for (const [entityId, components] of this.entities) {
      if (componentTypes.every(type => components.has(type))) {
        result.push(entityId);
      }
    }
    return result;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  clear(): void {
    this.entities.clear();
  }

  // For snapshot support
  getEntityComponents(entityId: EntityId): Record<string, Component> {
    const components = this.entities.get(entityId);
    if (!components) return {};
    return Object.fromEntries(components);
  }

  // For loading snapshots
  loadEntity(entityId: EntityId, components: Record<string, Component>): void {
    const componentMap = new Map<string, Component>();
    for (const [type, component] of Object.entries(components)) {
      componentMap.set(type, component);
    }
    this.entities.set(entityId, componentMap);
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 4: DiceRoller

**Files:**
- Create: `src/engine/core/DiceRoller.ts`
- Create: `tests/engine/core/DiceRoller.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';

describe('DiceRoller', () => {
  describe('deterministic behavior', () => {
    it('produces same results with same seed', () => {
      const roller1 = new DiceRoller(12345);
      const roller2 = new DiceRoller(12345);

      expect(roller1.rollD100()).toBe(roller2.rollD100());
      expect(roller1.rollD100()).toBe(roller2.rollD100());
      expect(roller1.rollD100()).toBe(roller2.rollD100());
    });

    it('produces different results with different seeds', () => {
      const roller1 = new DiceRoller(12345);
      const roller2 = new DiceRoller(54321);

      // Very unlikely to be equal
      const results1 = [roller1.rollD100(), roller1.rollD100(), roller1.rollD100()];
      const results2 = [roller2.rollD100(), roller2.rollD100(), roller2.rollD100()];

      expect(results1).not.toEqual(results2);
    });
  });

  describe('rollD100', () => {
    it('returns values between 1 and 100', () => {
      const roller = new DiceRoller(99999);
      for (let i = 0; i < 1000; i++) {
        const roll = roller.rollD100();
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('roll', () => {
    it('rolls 1d6 in range 1-6', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(1, 6);
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(6);
      }
    });

    it('rolls 2d6 in range 2-12', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(2, 6);
        expect(roll).toBeGreaterThanOrEqual(2);
        expect(roll).toBeLessThanOrEqual(12);
      }
    });

    it('adds bonus correctly', () => {
      const roller = new DiceRoller(42);
      for (let i = 0; i < 100; i++) {
        const roll = roller.roll(1, 6, 5);
        expect(roll).toBeGreaterThanOrEqual(6);  // 1 + 5
        expect(roll).toBeLessThanOrEqual(11);    // 6 + 5
      }
    });
  });

  describe('state save/restore', () => {
    it('can save and restore state for replay', () => {
      const roller = new DiceRoller(12345);

      // Roll a few times
      roller.rollD100();
      roller.rollD100();

      // Save state
      const state = roller.getState();

      // Roll more
      const nextRoll = roller.rollD100();

      // Create new roller and restore state
      const roller2 = new DiceRoller(0);
      roller2.setState(state);

      // Should produce same result
      expect(roller2.rollD100()).toBe(nextRoll);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write DiceRoller implementation**

```typescript
export interface DiceState {
  seed: number;
  callCount: number;
}

export class DiceRoller {
  private seed: number;
  private initialSeed: number;
  private callCount: number = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.initialSeed = seed;
  }

  // Mulberry32 PRNG - fast, good distribution
  private next(): number {
    this.callCount++;
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Roll D100 (1-100)
  rollD100(): number {
    return Math.floor(this.next() * 100) + 1;
  }

  // Roll dice (e.g., 2d6+3)
  roll(dice: number, sides: number, bonus: number = 0): number {
    let total = bonus;
    for (let i = 0; i < dice; i++) {
      total += Math.floor(this.next() * sides) + 1;
    }
    return total;
  }

  // Get state for snapshot
  getState(): DiceState {
    return {
      seed: this.initialSeed,
      callCount: this.callCount,
    };
  }

  // Restore state from snapshot
  setState(state: DiceState): void {
    this.seed = state.seed;
    this.initialSeed = state.seed;
    this.callCount = 0;
    // Fast-forward to the correct state
    for (let i = 0; i < state.callCount; i++) {
      this.next();
    }
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 5: EventBus

**Files:**
- Create: `src/engine/core/EventBus.ts`
- Create: `tests/engine/core/EventBus.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusImpl } from '../../../src/engine/core/EventBus';
import { GameEvent } from '../../../src/engine/types';

describe('EventBus', () => {
  let eventBus: EventBusImpl;

  beforeEach(() => {
    eventBus = new EventBusImpl();
  });

  describe('subscribe / emit', () => {
    it('calls subscriber when event is emitted', () => {
      const callback = vi.fn();
      eventBus.subscribe('AttackRolled', callback);

      const event: GameEvent = {
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: { roll: 42 },
      };
      eventBus.emit(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('does not call subscriber for different event type', () => {
      const callback = vi.fn();
      eventBus.subscribe('AttackRolled', callback);

      eventBus.emit({
        type: 'DamageDealt',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('supports multiple subscribers for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      eventBus.subscribe('AttackRolled', callback1);
      eventBus.subscribe('AttackRolled', callback2);

      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('returns unsubscribe function that works', () => {
      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe('AttackRolled', callback);

      unsubscribe();

      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('records all emitted events', () => {
      const event1: GameEvent = {
        type: 'AttackRolled',
        turn: 1,
        timestamp: 1000,
        data: { roll: 42 },
      };
      const event2: GameEvent = {
        type: 'DamageDealt',
        turn: 1,
        timestamp: 1001,
        data: { damage: 5 },
      };

      eventBus.emit(event1);
      eventBus.emit(event2);

      const history = eventBus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(event1);
      expect(history[1]).toEqual(event2);
    });

    it('clearHistory removes all events', () => {
      eventBus.emit({
        type: 'AttackRolled',
        turn: 1,
        timestamp: Date.now(),
        data: {},
      });

      eventBus.clearHistory();

      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe('subscribeAll', () => {
    it('receives all events regardless of type', () => {
      const callback = vi.fn();
      eventBus.subscribeAll(callback);

      eventBus.emit({ type: 'AttackRolled', turn: 1, timestamp: 1, data: {} });
      eventBus.emit({ type: 'DamageDealt', turn: 1, timestamp: 2, data: {} });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write EventBus implementation**

```typescript
import { GameEvent, GameEventType } from '../types';

export interface EventBus {
  subscribe(type: GameEventType, callback: (event: GameEvent) => void): () => void;
  subscribeAll(callback: (event: GameEvent) => void): () => void;
  emit(event: GameEvent): void;
  getHistory(): GameEvent[];
  clearHistory(): void;
}

export class EventBusImpl implements EventBus {
  private listeners: Map<GameEventType, Set<(event: GameEvent) => void>> = new Map();
  private allListeners: Set<(event: GameEvent) => void> = new Set();
  private history: GameEvent[] = [];

  subscribe(type: GameEventType, callback: (event: GameEvent) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  subscribeAll(callback: (event: GameEvent) => void): () => void {
    this.allListeners.add(callback);
    return () => {
      this.allListeners.delete(callback);
    };
  }

  emit(event: GameEvent): void {
    this.history.push(event);

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const callback of typeListeners) {
        callback(event);
      }
    }

    // Notify all-event listeners
    for (const callback of this.allListeners) {
      callback(event);
    }
  }

  getHistory(): GameEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 6: Basic Components

**Files:**
- Create: `src/engine/components/index.ts`

**Step 1: Write component definitions**

```typescript
import { Component, EntityId } from '../types';

// Position and facing
export interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
  facing: number; // Angle in radians
}

// Faction (player or enemy)
export interface FactionComponent extends Component {
  type: 'faction';
  faction: 'player' | 'enemy';
}

// Combat skills (D100 values)
export interface SkillsComponent extends Component {
  type: 'skills';
  melee: number;
  ranged: number;
  block: number;
  dodge: number;
  morale: number;
}

// Health and wound state
export type WoundState = 'healthy' | 'bloodied' | 'wounded' | 'critical' | 'down';

export interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
  woundState: WoundState;
}

// Action points
export interface ActionPointsComponent extends Component {
  type: 'actionPoints';
  current: number;
  max: number;
  baseValue: number;
  armorPenalty: number;
  experienceBonus: number;
}

// Stamina
export interface StaminaComponent extends Component {
  type: 'stamina';
  current: number;
  max: number;
  exhausted: boolean;
}

// Armor per location
export interface ArmorComponent extends Component {
  type: 'armor';
  head: number;
  torso: number;
  arms: number;
  legs: number;
  apPenalty: number;
  staminaPenalty: number;
}

// Weapon
export interface WeaponComponent extends Component {
  type: 'weapon';
  name: string;
  damage: { dice: number; sides: number; bonus: number };
  speed: number; // Lower = faster
  range: number;
  apCost: number;
  twoHanded: boolean;
}

// Off-hand (shield or second weapon)
export interface OffHandComponent extends Component {
  type: 'offHand';
  itemType: 'shield' | 'weapon' | 'none';
  blockBonus: number; // For shields
  weapon?: WeaponComponent; // For dual-wield
}

// Ammunition
export interface AmmoSlot {
  ammoType: string;
  quantity: number;
  maxQuantity: number;
  armorPiercing: number;
  damageBonus: number;
}

export interface AmmoComponent extends Component {
  type: 'ammo';
  slots: AmmoSlot[];
  currentSlot: number;
}

// Morale state
export type MoraleStatus = 'steady' | 'shaken' | 'broken' | 'routed';

export interface MoraleStateComponent extends Component {
  type: 'moraleState';
  status: MoraleStatus;
  modifiers: { source: string; value: number }[];
}

// Engagement tracking
export interface EngagementComponent extends Component {
  type: 'engagement';
  engagedWith: EntityId[];
}

// Unit name/identity
export interface IdentityComponent extends Component {
  type: 'identity';
  name: string;
  unitType: string;
}

// Helper to calculate wound state from HP
export function calculateWoundState(current: number, max: number): WoundState {
  const percentage = (current / max) * 100;
  if (current <= 0) return 'down';
  if (percentage <= 25) return 'critical';
  if (percentage <= 50) return 'wounded';
  if (percentage <= 75) return 'bloodied';
  return 'healthy';
}

// Helper to get wound state skill penalty
export function getWoundPenalty(state: WoundState): number {
  switch (state) {
    case 'healthy':
    case 'bloodied':
      return 0;
    case 'wounded':
      return 10;
    case 'critical':
      return 20;
    case 'down':
      return 100; // Cannot act
  }
}
```

---

## Task 7: Combat Resolution Logic

**Files:**
- Create: `src/engine/systems/CombatResolver.ts`
- Create: `tests/engine/systems/CombatResolver.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CombatResolver, AttackResult, HitLocation } from '../../../src/engine/systems/CombatResolver';
import { DiceRoller } from '../../../src/engine/core/DiceRoller';

describe('CombatResolver', () => {
  describe('resolveAttackRoll', () => {
    it('hit when roll <= skill', () => {
      // Find a seed that produces a roll of 42
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(55, [], roller);

      expect(result.roll).toBeGreaterThanOrEqual(1);
      expect(result.roll).toBeLessThanOrEqual(100);
      expect(result.hit).toBe(result.roll <= result.effectiveSkill);
    });

    it('applies positive modifiers', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(50, [
        { source: 'flanking', value: 10 },
        { source: 'height', value: 10 },
      ], roller);

      expect(result.effectiveSkill).toBe(70);
    });

    it('applies negative modifiers', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(50, [
        { source: 'wounded', value: -10 },
      ], roller);

      expect(result.effectiveSkill).toBe(40);
    });

    it('caps effective skill at 95', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(90, [
        { source: 'flanking', value: 20 },
      ], roller);

      expect(result.effectiveSkill).toBe(95);
    });

    it('floors effective skill at 5', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveAttackRoll(10, [
        { source: 'penalty', value: -50 },
      ], roller);

      expect(result.effectiveSkill).toBe(5);
    });
  });

  describe('resolveDefenseRoll', () => {
    it('successful defense when roll <= skill', () => {
      const roller = new DiceRoller(54321);
      const result = CombatResolver.resolveDefenseRoll('block', 60, [], roller);

      expect(result.success).toBe(result.roll <= result.effectiveSkill);
    });

    it('records defense type', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.resolveDefenseRoll('dodge', 50, [], roller);

      expect(result.defenseType).toBe('dodge');
    });
  });

  describe('resolveHitLocation', () => {
    it('returns head for rolls 1-15', () => {
      // We need deterministic location, so test the logic
      expect(CombatResolver.getLocationFromRoll(1)).toBe('head');
      expect(CombatResolver.getLocationFromRoll(15)).toBe('head');
    });

    it('returns torso for rolls 16-35', () => {
      expect(CombatResolver.getLocationFromRoll(16)).toBe('torso');
      expect(CombatResolver.getLocationFromRoll(35)).toBe('torso');
    });

    it('returns arms for rolls 36-55', () => {
      expect(CombatResolver.getLocationFromRoll(36)).toBe('arms');
      expect(CombatResolver.getLocationFromRoll(55)).toBe('arms');
    });

    it('returns legs for rolls 56-80', () => {
      expect(CombatResolver.getLocationFromRoll(56)).toBe('legs');
      expect(CombatResolver.getLocationFromRoll(80)).toBe('legs');
    });

    it('returns weapon for rolls 81-100', () => {
      expect(CombatResolver.getLocationFromRoll(81)).toBe('weapon');
      expect(CombatResolver.getLocationFromRoll(100)).toBe('weapon');
    });
  });

  describe('calculateDamage', () => {
    it('subtracts armor from damage', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.calculateDamage(
        { dice: 1, sides: 6, bonus: 4 },
        5, // armor
        roller
      );

      expect(result.rawDamage).toBeGreaterThanOrEqual(5); // 1d6+4 = 5-10
      expect(result.armorAbsorbed).toBe(5);
      expect(result.finalDamage).toBe(Math.max(0, result.rawDamage - 5));
    });

    it('minimum damage is 0', () => {
      const roller = new DiceRoller(12345);
      const result = CombatResolver.calculateDamage(
        { dice: 1, sides: 4, bonus: 0 },
        100, // massive armor
        roller
      );

      expect(result.finalDamage).toBe(0);
    });
  });

  describe('getHeadDamageMultiplier', () => {
    it('returns 3 for head hits', () => {
      expect(CombatResolver.getLocationDamageMultiplier('head')).toBe(3);
    });

    it('returns 1 for other locations', () => {
      expect(CombatResolver.getLocationDamageMultiplier('torso')).toBe(1);
      expect(CombatResolver.getLocationDamageMultiplier('arms')).toBe(1);
      expect(CombatResolver.getLocationDamageMultiplier('legs')).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write CombatResolver implementation**

```typescript
import { DiceRoller } from '../core/DiceRoller';

export type HitLocation = 'head' | 'torso' | 'arms' | 'legs' | 'weapon';
export type DefenseType = 'parry' | 'block' | 'dodge';

export interface Modifier {
  source: string;
  value: number;
}

export interface AttackRollResult {
  roll: number;
  baseSkill: number;
  modifiers: Modifier[];
  effectiveSkill: number;
  hit: boolean;
}

export interface DefenseRollResult {
  defenseType: DefenseType;
  roll: number;
  baseSkill: number;
  modifiers: Modifier[];
  effectiveSkill: number;
  success: boolean;
}

export interface DamageResult {
  rawDamage: number;
  armorAbsorbed: number;
  finalDamage: number;
  location: HitLocation;
}

export class CombatResolver {
  static resolveAttackRoll(
    baseSkill: number,
    modifiers: Modifier[],
    roller: DiceRoller
  ): AttackRollResult {
    const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
    const effectiveSkill = Math.min(95, Math.max(5, baseSkill + totalModifier));
    const roll = roller.rollD100();

    return {
      roll,
      baseSkill,
      modifiers,
      effectiveSkill,
      hit: roll <= effectiveSkill,
    };
  }

  static resolveDefenseRoll(
    defenseType: DefenseType,
    baseSkill: number,
    modifiers: Modifier[],
    roller: DiceRoller
  ): DefenseRollResult {
    const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
    const effectiveSkill = Math.min(95, Math.max(5, baseSkill + totalModifier));
    const roll = roller.rollD100();

    return {
      defenseType,
      roll,
      baseSkill,
      modifiers,
      effectiveSkill,
      success: roll <= effectiveSkill,
    };
  }

  static resolveHitLocation(roller: DiceRoller): HitLocation {
    const roll = roller.rollD100();
    return this.getLocationFromRoll(roll);
  }

  static getLocationFromRoll(roll: number): HitLocation {
    if (roll <= 15) return 'head';
    if (roll <= 35) return 'torso';
    if (roll <= 55) return 'arms';
    if (roll <= 80) return 'legs';
    return 'weapon';
  }

  static calculateDamage(
    weaponDamage: { dice: number; sides: number; bonus: number },
    armor: number,
    roller: DiceRoller
  ): Omit<DamageResult, 'location'> {
    const rawDamage = roller.roll(weaponDamage.dice, weaponDamage.sides, weaponDamage.bonus);
    const armorAbsorbed = armor;
    const finalDamage = Math.max(0, rawDamage - armorAbsorbed);

    return {
      rawDamage,
      armorAbsorbed,
      finalDamage,
    };
  }

  static getLocationDamageMultiplier(location: HitLocation): number {
    return location === 'head' ? 3 : 1;
  }

  static getArmorForLocation(
    armor: { head: number; torso: number; arms: number; legs: number },
    location: HitLocation
  ): number {
    switch (location) {
      case 'head':
        return armor.head;
      case 'torso':
        return armor.torso;
      case 'arms':
        return armor.arms;
      case 'legs':
        return armor.legs;
      case 'weapon':
        return 0; // Weapon/shield hits don't use body armor
    }
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 8: Damage System

**Files:**
- Create: `src/engine/systems/DamageSystem.ts`
- Create: `tests/engine/systems/DamageSystem.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorldImpl } from '../../../src/engine/ecs/World';
import { DamageSystem } from '../../../src/engine/systems/DamageSystem';
import { HealthComponent, calculateWoundState } from '../../../src/engine/components';
import { EventBusImpl } from '../../../src/engine/core/EventBus';

describe('DamageSystem', () => {
  let world: WorldImpl;
  let eventBus: EventBusImpl;

  beforeEach(() => {
    world = new WorldImpl();
    eventBus = new EventBusImpl();
  });

  describe('applyDamage', () => {
    it('reduces health by damage amount', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 25, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.current).toBe(75);
    });

    it('updates wound state when damaged', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 30, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.woundState).toBe('bloodied'); // 70% HP
    });

    it('sets unit to down when HP reaches 0', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 20,
        max: 100,
        woundState: 'critical',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 25, 'torso', 1);

      const health = world.getComponent<HealthComponent>(entity, 'health')!;
      expect(health.current).toBe(0);
      expect(health.woundState).toBe('down');
    });

    it('emits DamageDealt event', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 15, 'arms', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'DamageDealt',
          entityId: entity,
          data: expect.objectContaining({
            damage: 15,
            location: 'arms',
          }),
        })
      );
    });

    it('emits UnitDown event when unit goes down', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 10,
        max: 100,
        woundState: 'critical',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 15, 'torso', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitDown',
          entityId: entity,
        })
      );
    });

    it('emits UnitWounded event on wound state change', () => {
      const entity = world.createEntity();
      world.addComponent<HealthComponent>(entity, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      DamageSystem.applyDamage(world, eventBus, entity, 60, 'torso', 1);

      const events = eventBus.getHistory();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'UnitWounded',
          entityId: entity,
          data: expect.objectContaining({
            newState: 'wounded',
          }),
        })
      );
    });
  });

  describe('calculateWoundState', () => {
    it('returns healthy for > 75%', () => {
      expect(calculateWoundState(80, 100)).toBe('healthy');
    });

    it('returns bloodied for 51-75%', () => {
      expect(calculateWoundState(75, 100)).toBe('bloodied');
      expect(calculateWoundState(51, 100)).toBe('bloodied');
    });

    it('returns wounded for 26-50%', () => {
      expect(calculateWoundState(50, 100)).toBe('wounded');
      expect(calculateWoundState(26, 100)).toBe('wounded');
    });

    it('returns critical for 1-25%', () => {
      expect(calculateWoundState(25, 100)).toBe('critical');
      expect(calculateWoundState(1, 100)).toBe('critical');
    });

    it('returns down for 0 or less', () => {
      expect(calculateWoundState(0, 100)).toBe('down');
      expect(calculateWoundState(-5, 100)).toBe('down');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write DamageSystem implementation**

```typescript
import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { HealthComponent, calculateWoundState, WoundState } from '../components';
import { HitLocation } from './CombatResolver';

export class DamageSystem {
  static applyDamage(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: string,
    damage: number,
    location: HitLocation,
    turn: number
  ): void {
    const health = world.getComponent<HealthComponent>(entityId, 'health');
    if (!health) return;

    const previousState = health.woundState;
    const newCurrent = Math.max(0, health.current - damage);
    const newWoundState = calculateWoundState(newCurrent, health.max);

    // Update health component
    world.addComponent<HealthComponent>(entityId, {
      ...health,
      current: newCurrent,
      woundState: newWoundState,
    });

    // Emit damage event
    eventBus.emit({
      type: 'DamageDealt',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        damage,
        location,
        newHealth: newCurrent,
        previousHealth: health.current,
      },
    });

    // Emit wound state change if applicable
    if (newWoundState !== previousState && newWoundState !== 'down') {
      eventBus.emit({
        type: 'UnitWounded',
        turn,
        timestamp: Date.now(),
        entityId,
        data: {
          previousState,
          newState: newWoundState,
        },
      });
    }

    // Emit unit down event
    if (newWoundState === 'down') {
      eventBus.emit({
        type: 'UnitDown',
        turn,
        timestamp: Date.now(),
        entityId,
        data: {
          finalHealth: newCurrent,
          killingBlow: location,
        },
      });
    }
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 9: GameEngine Shell

**Files:**
- Create: `src/engine/core/GameEngine.ts`
- Create: `tests/engine/core/GameEngine.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../../src/engine/core/GameEngine';

describe('GameEngine', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine({ seed: 12345 });
  });

  describe('initialization', () => {
    it('starts at turn 0', () => {
      expect(engine.getTurn()).toBe(0);
    });

    it('starts in planning phase', () => {
      expect(engine.getPhase()).toBe('planning');
    });
  });

  describe('entity management', () => {
    it('creates entities through world', () => {
      const entityId = engine.createEntity();
      expect(entityId).toBeDefined();
      expect(typeof entityId).toBe('string');
    });

    it('can add components to entities', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      const health = engine.getComponent(entityId, 'health');
      expect(health).toBeDefined();
      expect(health?.current).toBe(100);
    });
  });

  describe('turn management', () => {
    it('advances turn after resolution', () => {
      engine.endPlanningPhase();
      engine.resolvePhase();
      engine.endTurn();

      expect(engine.getTurn()).toBe(1);
    });

    it('transitions phases correctly', () => {
      expect(engine.getPhase()).toBe('planning');

      engine.endPlanningPhase();
      expect(engine.getPhase()).toBe('resolution');

      engine.resolvePhase();
      engine.endTurn();
      expect(engine.getPhase()).toBe('planning');
    });
  });

  describe('snapshots', () => {
    it('creates snapshot of current state', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 50,
        max: 100,
        woundState: 'wounded',
      });

      const snapshot = engine.createSnapshot();

      expect(snapshot.turn).toBe(0);
      expect(snapshot.phase).toBe('planning');
      expect(snapshot.entities[entityId]).toBeDefined();
      expect(snapshot.entities[entityId]['health']).toBeDefined();
    });

    it('restores state from snapshot', () => {
      const entityId = engine.createEntity();
      engine.addComponent(entityId, {
        type: 'health',
        current: 100,
        max: 100,
        woundState: 'healthy',
      });

      const snapshot = engine.createSnapshot();

      // Modify state
      engine.addComponent(entityId, {
        type: 'health',
        current: 50,
        max: 100,
        woundState: 'wounded',
      });

      // Restore
      engine.loadSnapshot(snapshot);

      const health = engine.getComponent(entityId, 'health');
      expect(health?.current).toBe(100);
    });
  });

  describe('event history', () => {
    it('records events', () => {
      engine.emitEvent({
        type: 'TurnStarted',
        turn: 0,
        timestamp: Date.now(),
        data: {},
      });

      const history = engine.getEventHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('TurnStarted');
    });
  });

  describe('deterministic replay', () => {
    it('produces same results with same seed', () => {
      const engine1 = new GameEngine({ seed: 99999 });
      const engine2 = new GameEngine({ seed: 99999 });

      const roll1 = engine1.rollD100();
      const roll2 = engine2.rollD100();

      expect(roll1).toBe(roll2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run`
Expected: FAIL - module not found

**Step 3: Write GameEngine implementation**

```typescript
import { WorldImpl } from '../ecs/World';
import { DiceRoller } from './DiceRoller';
import { EventBusImpl } from './EventBus';
import { Component, EntityId, GameEvent, GameSnapshot } from '../types';

export interface GameEngineOptions {
  seed: number;
}

export class GameEngine {
  private world: WorldImpl;
  private diceRoller: DiceRoller;
  private eventBus: EventBusImpl;
  private turn: number = 0;
  private phase: 'planning' | 'resolution' = 'planning';

  constructor(options: GameEngineOptions) {
    this.world = new WorldImpl();
    this.diceRoller = new DiceRoller(options.seed);
    this.eventBus = new EventBusImpl();
  }

  // World access
  createEntity(): EntityId {
    return this.world.createEntity();
  }

  removeEntity(entityId: EntityId): void {
    this.world.removeEntity(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    this.world.addComponent(entityId, component);
  }

  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined {
    return this.world.getComponent<T>(entityId, type);
  }

  hasComponent(entityId: EntityId, type: string): boolean {
    return this.world.hasComponent(entityId, type);
  }

  query(...componentTypes: string[]): EntityId[] {
    return this.world.query(...componentTypes);
  }

  // Turn management
  getTurn(): number {
    return this.turn;
  }

  getPhase(): 'planning' | 'resolution' {
    return this.phase;
  }

  endPlanningPhase(): void {
    if (this.phase !== 'planning') {
      throw new Error('Not in planning phase');
    }
    this.phase = 'resolution';
    this.emitEvent({
      type: 'ResolutionPhaseStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
  }

  resolvePhase(): void {
    if (this.phase !== 'resolution') {
      throw new Error('Not in resolution phase');
    }
    // Systems will be run here in future tasks
  }

  endTurn(): void {
    this.turn++;
    this.phase = 'planning';
    this.emitEvent({
      type: 'TurnStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
    this.emitEvent({
      type: 'PlanningPhaseStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
  }

  // Dice
  rollD100(): number {
    return this.diceRoller.rollD100();
  }

  roll(dice: number, sides: number, bonus: number = 0): number {
    return this.diceRoller.roll(dice, sides, bonus);
  }

  getDiceRoller(): DiceRoller {
    return this.diceRoller;
  }

  // Events
  emitEvent(event: GameEvent): void {
    this.eventBus.emit(event);
  }

  getEventHistory(): GameEvent[] {
    return this.eventBus.getHistory();
  }

  subscribeToEvent(type: GameEvent['type'], callback: (event: GameEvent) => void): () => void {
    return this.eventBus.subscribe(type, callback);
  }

  getEventBus(): EventBusImpl {
    return this.eventBus;
  }

  getWorld(): WorldImpl {
    return this.world;
  }

  // Snapshots
  createSnapshot(): GameSnapshot {
    const entities: Record<EntityId, Record<string, Component>> = {};
    for (const entityId of this.world.getAllEntities()) {
      entities[entityId] = this.world.getEntityComponents(entityId);
    }

    return {
      turn: this.turn,
      phase: this.phase,
      timestamp: Date.now(),
      entities,
      randomState: this.diceRoller.getState(),
      turnLog: this.eventBus.getHistory(),
    };
  }

  loadSnapshot(snapshot: GameSnapshot): void {
    // Clear current state
    this.world.clear();
    this.eventBus.clearHistory();

    // Restore entities
    for (const [entityId, components] of Object.entries(snapshot.entities)) {
      this.world.loadEntity(entityId, components);
    }

    // Restore game state
    this.turn = snapshot.turn;
    this.phase = snapshot.phase;
    this.diceRoller.setState(snapshot.randomState);

    // Restore event history
    for (const event of snapshot.turnLog) {
      this.eventBus.emit(event);
    }
  }
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Task 10: Integration Test

**Files:**
- Create: `tests/integration/combat.test.ts`

**Step 1: Write integration test**

```typescript
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
  function createWarrior(engine: GameEngine, name: string, faction: 'player' | 'enemy', x: number, y: number) {
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

    console.log('Attack roll:', attackResult.roll, 'vs skill', attackResult.effectiveSkill, '=', attackResult.hit ? 'HIT' : 'MISS');

    if (attackResult.hit) {
      // Defender attempts to block
      const defenseResult = CombatResolver.resolveDefenseRoll(
        'block',
        defenderSkills.block,
        [],
        engine.getDiceRoller()
      );

      console.log('Defense roll:', defenseResult.roll, 'vs skill', defenseResult.effectiveSkill, '=', defenseResult.success ? 'BLOCKED' : 'FAILED');

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

        console.log('Damage:', damageResult.rawDamage, '- armor', armor, '=', damageResult.finalDamage, 'x', multiplier, '=', finalDamage);

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
        console.log('Defender health:', defenderHealth.current, '/', defenderHealth.max, '-', defenderHealth.woundState);

        // Verify events were emitted
        const events = engine.getEventHistory();
        expect(events.some(e => e.type === 'DamageDealt')).toBe(true);
      }
    }

    // Test is successful if we get here without errors
    expect(true).toBe(true);
  });

  it('deterministic combat with same seed', () => {
    function runCombat(seed: number): number {
      const engine = new GameEngine({ seed });
      const attacker = createWarrior(engine, 'Attacker', 'player', 0, 0);
      const defender = createWarrior(engine, 'Defender', 'enemy', 1, 0);

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
    DamageSystem.applyDamage(
      engine.getWorld(),
      engine.getEventBus(),
      warrior,
      30,
      'torso',
      0
    );

    // Save snapshot
    const snapshot = engine.createSnapshot();
    const healthBefore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthBefore.current).toBe(70);

    // Take more damage
    DamageSystem.applyDamage(
      engine.getWorld(),
      engine.getEventBus(),
      warrior,
      20,
      'torso',
      0
    );

    const healthAfterMore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthAfterMore.current).toBe(50);

    // Restore snapshot
    engine.loadSnapshot(snapshot);

    const healthAfterRestore = engine.getComponent<HealthComponent>(warrior, 'health')!;
    expect(healthAfterRestore.current).toBe(70);
  });
});
```

**Step 2: Run all tests**

Run: `npm run test:run`
Expected: All tests pass

---

## Final Verification

After completing all tasks:

1. Run full test suite: `npm run test:run`
2. Verify all tests pass
3. The engine foundation is complete and ready for UI integration
