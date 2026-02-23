# Turn-Based Tactical RPG Combat System Design

## Overview

A complete redesign of the combat system from real-time to turn-based tactical RPG with D100 dice mechanics, simultaneous resolution, and deep tactical positioning.

**Design Goals:**
- Chess-like tactical depth - every decision matters
- High lethality - dying is easy, survival requires smart play
- Realistic medieval combat - armor, flanking, morale all matter
- Complex RPG mechanics - lots of dice rolling with full transparency

---

## Turn Structure: Simultaneous Resolution (WeGo)

Each game round has two phases:

### Planning Phase
- Game is paused, both sides plan actions
- Player assigns commands to each unit by spending Action Points (AP)
- Commands can be queued across multiple turns with conditionals
- Orders persist between turns - modify existing plans rather than starting fresh

### Resolution Phase
- All planned actions execute simultaneously
- Within the turn, actions resolve in speed order - lighter/faster weapons strike first
- A dagger thrust resolves before a greatsword swing
- After resolution, player sees full results with dice rolls visible

---

## Action Points (AP)

### Base AP
All humans have **5 AP** by default.

### Equipment Modifiers

| Armor Type | AP Modifier | Trade-off |
|------------|-------------|-----------|
| Unarmored | +0 | Fast but fragile |
| Leather | +0 | Light protection, no penalty |
| Chainmail | -1 | Good protection, slightly slower |
| Plate armor | -2 | Excellent protection, limited actions |

### Experience Modifiers

| Experience Level | AP Modifier |
|------------------|-------------|
| Recruit | -1 |
| Regular | +0 |
| Veteran | +1 |
| Elite | +2 |

### Example Builds
- Elite scout (leather): 5 + 0 + 2 = **7 AP**
- Veteran knight (plate): 5 - 2 + 1 = **4 AP**
- Recruit militia (chainmail): 5 - 1 - 1 = **3 AP**
- Regular archer (leather): 5 + 0 + 0 = **5 AP**

---

## Movement Modes

Movement speed is a tactical choice trading mobility vs remaining AP:

| Mode | Distance | AP Cost | Example (5 AP unit) |
|------|----------|---------|---------------------|
| Sprint | Full speed | All AP | 0 AP remaining - no defense, no attack |
| Run | 75% speed | 4 AP | 1 AP remaining - minimal options |
| Advance | 50% speed | 2 AP | 3 AP remaining - can attack or defend |
| Walk | 25% speed | 1 AP | 4 AP remaining - full combat capability |
| Hold | 0 | 0 AP | 5 AP remaining - maximum defense/attacks |

**Tactical implications:**
- Sprinting archers reposition but are defenseless
- Knights advancing slowly arrive ready to fight
- Charging units cover ground but arrive exhausted
- Retreating under fire: sprint and hope, or back away blocking?

---

## Combat Resolution: D100 Opposed Rolls

### Attack Sequence

1. **Attacker rolls** D100 vs Weapon Skill (e.g., 55%)
   - Roll ≤ skill = potential hit
   - Roll > skill = miss

2. **Defender reacts** (free reaction, no AP cost)
   - Choose: Parry (weapon), Block (shield), or Dodge
   - Roll D100 vs appropriate skill
   - Success negates or reduces the hit

3. **If hit lands, roll location** (D100):

| Roll | Location | Notes |
|------|----------|-------|
| 01-15 | Head | 3x damage, helmet critical |
| 16-35 | Torso | Standard, main armor coverage |
| 36-55 | Arms | Weapon/shield arm matters |
| 56-80 | Legs | Can cripple movement |
| 81-00 | Weapon/Shield | May disarm or break equipment |

4. **Damage calculation:**
   - Weapon base damage (e.g., sword 1d10+4)
   - Minus armor at that location
   - Minimum 0 (armor fully absorbs)

### Combat Modifiers

| Situation | Modifier |
|-----------|----------|
| Flanking (2 attackers) | +10% each |
| Flanking (3 attackers) | +15% each |
| Flanking (4+ attackers) | +20% each |
| Side attack | +10%, shield half effective |
| Rear attack | +20%, no shield, no parry |
| Higher ground | +10% ranged, +10% melee defense |
| Aimed shot (extra AP) | Choose hit location |

---

## Defensive Reactions & Stances

### Free Reactions
Every unit gets **ONE free reaction** per turn against incoming attacks:

- **Parry** - Deflect with weapon. Melee only. Based on Weapon Skill.
- **Block** - Use shield. Melee and ranged. Front arc only. Based on Shield Skill.
- **Dodge** - Evade entirely. Works vs everything. Based on Agility. Harder in heavy armor.

### Multiple Attackers
If three enemies attack you, you get ONE free reaction. Choose which attack to defend - others hit unopposed. This is why flanking is deadly.

### Defensive Stance (costs AP)

| AP Spent | Bonus |
|----------|-------|
| 1 AP | +10% to all defense rolls this turn |
| 2 AP | +20% and one extra reaction |
| 3 AP | +30% and two extra reactions |

### Shield Wall
Adjacent allies with shields can form a shield wall:
- Each gains +10% block
- Can use reactions to block attacks against neighbors
- Powerful but immobile

---

## Positioning: Facing, Flanking & Terrain

### Movement
Free movement by distance, not tiles. Units have movement rates in meters.

### Facing
Units have a 180° front arc:
- 90° turn: Free (part of normal movement)
- 180° turn: 1 AP

| Arc | Effect |
|-----|--------|
| Front | Normal - shield applies |
| Side | +10% to hit, shield at half effectiveness |
| Rear | +20% to hit, no shield, no parry (only dodge) |

### Flanking Bonuses

| Attackers | Bonus |
|-----------|-------|
| 2 units | +10% each |
| 3 units | +15% each |
| 4+ units | +20% each |

If attackers are in different arcs, defender can only react to ONE attack.

### Height Advantage
- Higher ground: +10% ranged accuracy, +10% melee defense
- Charging downhill: +1 damage, +10% to hit

### Engagement Zones
Units in melee range (~1.5m) are "engaged." Leaving engagement:
- **Disengage** (2 AP): Safely back away
- **Sprint away**: Provokes free attack at +20%
- **Fighting retreat** (half speed): No free attack

---

## Resources

### Ammunition

Ranged units carry limited ammo. When empty, reduced to melee (dagger).

| Ammo Type | Quantity | Effect |
|-----------|----------|--------|
| Standard arrows | 12 | Normal damage |
| Bodkin arrows | 6 | Armor piercing (-2 enemy armor) |
| Broadhead arrows | 6 | +3 damage vs unarmored, -2 vs armor |
| Fire arrows | 3 | Can ignite, morale penalty to target |
| Crossbow bolts | 8 | Slower reload, better armor pierce |
| Throwing axes | 3 | Short range, high damage |
| Javelins | 2 | Can be used in melee if needed |

Players choose loadout before battle.

### Fatigue/Stamina

Each unit has a Stamina pool (typically 10):

| Action | Stamina Cost |
|--------|--------------|
| Walk/Advance | 0 |
| Run | 1 |
| Sprint | 3 |
| Melee attack | 1 |
| Power attack | 2 |
| Full defense | 0 (resting) |

**Exhausted** (0 stamina):
- -1 AP until rested
- -10% to all skills
- Cannot sprint

**Recovery:** 2 stamina per turn if walking or holding position.

Heavy armor adds +1 stamina cost to all physical actions.

### Consumables
- **Bandages (3):** Spend 2 AP to heal 1d6 HP over 2 turns
- **Throwing oil (1):** Creates slippery/flammable zone
- **Caltrops (1):** Slows enemies, damages unarmored feet

---

## Wounds & Going Down

### Wound States

| HP Status | State | Effect |
|-----------|-------|--------|
| 75-100% | Healthy | Normal |
| 50-74% | Bloodied | Visible wounds, enemies may target |
| 25-49% | Wounded | -10% all skills, morale check |
| 1-24% | Critical | -20% all skills, half AP, bleeding |
| 0 or below | Down | Unconscious/dying - out of fight |

### Going Down
When a unit hits 0 HP, they collapse:
- Allies see them go down - triggers morale check
- Cannot tell if dead or unconscious during battle
- Unit is removed from combat

### After Battle
- Roll for each downed unit: survived (wounded) or dead
- Heavily negative HP = worse survival odds
- Medical attention (healer nearby) improves odds

### Head Hits
Critical hit to head can cause instant knockout even with HP remaining:
- Head hit + damage > 5: Roll Toughness or go down immediately

---

## Morale, Fear & Leadership

### Morale Stat
Each unit has Morale (typically 40-70%). Higher = braver.

### Morale Check Triggers
Units must test morale (D100 vs Morale) when:
- Taking a wound (not scratch damage)
- Ally goes down within 5m
- Outnumbered 2:1 or worse in engagement
- Leader dies
- Facing terrifying enemy (troll, mounted knight)
- Unit reaches 25% HP

### Failed Morale Results

| Roll vs Morale | Result |
|----------------|--------|
| Failed by 1-20 | **Shaken**: -10% all skills until rallied |
| Failed by 21-40 | **Broken**: Must retreat, -20% skills |
| Failed by 41+ | **Routed**: Flees battlefield, may not return |

### Rallying
Shaken/Broken units can attempt rally:
- Spend 2 AP holding position
- Roll Morale with bonuses from nearby leader
- Success removes one level of fear

### Leadership
Certain units have Leadership skill:
- **Aura (5m radius):** Allies get +10% to morale checks
- **Rally bonus:** +20% to rally attempts
- **Death trigger:** All allies within 10m test morale immediately

### Fear
Some units cause Fear (e.g., Trolls). Enemies must pass morale check when:
- First seeing the fearsome unit
- Being charged by it
- Being attacked by it

Elite units may have "Fearless" - immune to fear.

---

## Victory Conditions

Scenarios can use different victory types:

### Elimination
- Defeat all enemy combatants (killed or routed)
- Pure tactical combat

### Morale Victory
Enemy army breaks when:
- Leader killed/routed
- 50%+ casualties
- Failed army-wide morale check

### Objective-Based
Scenario-specific goals:
- "Hold the bridge for 8 turns"
- "Escort the healer to the village"
- "Capture the enemy banner"
- "Assassinate the orc warlord"

### Point-Based
- Units have point values
- Battle ends after X turns
- Higher remaining point value wins

### Combined Conditions
Scenarios can mix: "Kill the troll OR survive 10 turns"

---

## Enemy AI

### Reactive Behavior
AI analyzes battlefield each turn:
- Identify weak/wounded targets
- Protect high-value units
- Seek flanking opportunities
- Retreat when losing
- Focus fire on dangerous enemies

### Personality Types

| Personality | Behavior |
|-------------|----------|
| **Aggressive** | Charges early, focuses damage, fights to the last |
| **Cunning** | Flanks constantly, targets wounded, sets ambushes |
| **Cautious** | Holds position, waits for player, retreats early |
| **Brutal** | Targets weakest, executes downed enemies, intimidates |
| **Honorable** | Challenges strong enemies, doesn't flank |

### Difficulty Scaling
- **Easy:** AI makes occasional mistakes
- **Normal:** Competent tactical decisions
- **Hard:** Near-optimal play, predicts player moves

---

## Command System

### Basic Commands
- **Move to** - Click destination, choose speed
- **Attack** - Click target, choose attack type
- **Defend** - Set defensive stance, allocate AP
- **Hold** - Stay in place, recover stamina
- **Use item** - Select consumable
- **Special** - Unit-specific abilities

### Queued Commands
Chain actions across turns:
"Move here (2 AP), then move here (2 AP), then attack nearest (2 AP)"

### Conditional Commands
Add conditions:
- "Move toward archer. **When in range**: Attack"
- "Hold position. **If enemy approaches**: Defensive stance"
- "Attack target. **If target dies**: Attack nearest"

### Order Persistence
Between turns, orders remain active. Player adjusts as needed.

### Command Preview
Before ending planning, see projected movement paths and attack arcs.

---

## Unit Templates

### Player Units

| Unit | Final AP | Armor | Weapons | Key Skills | Special |
|------|----------|-------|---------|------------|---------|
| Militia | 4 | Leather | Spear, dagger | Melee 35%, Block 30% | Cheap, expendable |
| Warrior | 4 | Chainmail | Sword, shield | Melee 50%, Block 50% | Solid front-line |
| Veteran | 5 | Chainmail | Sword, shield | Melee 60%, Block 60% | Reliable |
| Knight | 4 | Full plate | Longsword, shield | Melee 65%, Block 70% | Tank, leadership |
| Archer | 5 | Leather | Bow (12), dagger | Ranged 55%, Melee 30% | Mobile |
| Crossbowman | 4 | Chainmail | Crossbow (8), sword | Ranged 50%, Melee 40% | Armor pierce |
| Healer | 5 | Robes | Staff, bandages (5) | Melee 25%, Medicine 60% | Fragile |
| Scout | 6 | Leather | Short bow (10), daggers | Ranged 50%, Dodge 55% | Fast flanker |

### Enemy Units

| Unit | Final AP | Armor | Weapons | Key Skills | Special |
|------|----------|-------|---------|------------|---------|
| Goblin | 6 | None | Rusty knife | Melee 30%, Dodge 45% | Cowardly, swarm bonus |
| Orc Warrior | 5 | Hide | Cleaver, shield | Melee 50%, Block 40% | Tough, aggressive |
| Orc Archer | 5 | Hide | Crude bow (8) | Ranged 40%, Melee 35% | Inaccurate |
| Orc Brute | 4 | None | Great axe | Melee 55% | Slow, high damage |
| Troll | 3 | Thick hide | Fists | Melee 45% | Massive HP, fear, regen |

---

## Dice Visibility

### Full Transparency
Show every roll as it happens:
- Attack roll vs skill
- Defense roll vs skill
- Location roll
- Damage calculation

### Detailed Logs
Combat log captures all rolls for post-battle analysis:
- Complete roll breakdowns
- Modifier sources
- Success/failure margins

---

## Implementation Notes

### Migration from Real-Time
The current game is real-time with pause. Key changes:
- Remove real-time update loop for combat
- Add planning phase UI
- Implement turn resolution system
- Add D100 dice system
- Replace simple damage with location-based
- Add AP tracking per unit
- Implement command queue system

### Modular Loadout System
Units are defined by:
- Base stats (HP, skills)
- Equipment slots (weapon, off-hand, armor, consumables)
- Experience level

Predefined templates combine these for standard units, but system supports customization.

---

## Summary

| System | Design Choice |
|--------|---------------|
| Turn Structure | WeGo simultaneous resolution |
| Actions | Action Points (base 5, modified by armor/experience) |
| Movement | Distance-based, speed modes trade mobility vs AP |
| Combat | D100 opposed rolls (attack vs defense reaction) |
| Damage | Location-based (head/torso/arms/legs) |
| Defense | One free reaction + AP for extra reactions/stance |
| Ammo | Limited arrows with types (bodkin, broadhead, fire) |
| Fatigue | Stamina pool, exhaustion penalties |
| Positioning | Facing arcs, flanking bonuses, height advantage |
| Engagement | Melee zones, disengaging costs AP |
| Morale | Checks on wounds/deaths, shaken/broken/routed |
| Leadership | Aura bonuses, rally, death triggers morale |
| Wounds | Going down vs death, post-battle survival |
| Victory | Elimination, morale, objective, or point-based |
| AI | Reactive tactics + personality-driven |
| Commands | Queued, conditional, persistent between turns |

---

# Technical Architecture

## Overview

The game uses a lightweight custom Entity Component System (ECS) with strict separation between game logic and UI. The engine is a pure TypeScript library with no DOM or Three.js dependencies, enabling full test coverage without rendering.

**Key Principles:**
- Engine has zero UI dependencies
- State is represented as immutable snapshots
- Deterministic replay via seeded RNG
- Event-based communication between engine and UI

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Game Application                         │
├─────────────────────────────────┬───────────────────────────────┤
│           Engine (Pure TS)      │        UI (Three.js)          │
│                                 │                               │
│  ┌───────────────────────────┐  │  ┌─────────────────────────┐  │
│  │       GameEngine          │  │  │      Renderer           │  │
│  │  - TurnManager            │──┼──│  - UnitRenderer         │  │
│  │  - SystemRunner           │  │  │  - TerrainRenderer      │  │
│  │  - EventBus ─────────────────┼──│  - EventHandler         │  │
│  └───────────────────────────┘  │  └─────────────────────────┘  │
│                                 │                               │
│  ┌───────────────────────────┐  │  ┌─────────────────────────┐  │
│  │         World             │  │  │      UIManager          │  │
│  │  - Entities               │  │  │  - CommandUI            │  │
│  │  - Components             │  │  │  - CombatLogUI          │  │
│  │  - Queries                │  │  │  - HUD                  │  │
│  └───────────────────────────┘  │  └─────────────────────────┘  │
│                                 │                               │
│  ┌───────────────────────────┐  │                               │
│  │        Systems            │  │                               │
│  │  - MovementSystem         │  │                               │
│  │  - CombatSystem           │  │                               │
│  │  - MoraleSystem           │  │                               │
│  │  - etc.                   │  │                               │
│  └───────────────────────────┘  │                               │
│                                 │                               │
│  ┌───────────────────────────┐  │                               │
│  │      SnapshotManager      │  │                               │
│  │  - Save/Load              │  │                               │
│  │  - Replay                 │  │                               │
│  └───────────────────────────┘  │                               │
└─────────────────────────────────┴───────────────────────────────┘
```

---

## Entity Component System (ECS)

### Lightweight Custom Implementation

No external library - simple, tailored to our needs:

```typescript
// Entity is just an ID
type EntityId = string;

// Components are plain data objects
interface Component {
  type: string;
}

// World manages entities and components
class World {
  private entities: Map<EntityId, Map<string, Component>>;

  createEntity(): EntityId;
  addComponent(entityId: EntityId, component: Component): void;
  getComponent<T>(entityId: EntityId, type: string): T | undefined;
  query(...componentTypes: string[]): EntityId[];
  removeEntity(entityId: EntityId): void;
}

// Systems are functions that operate on entities
interface System {
  name: string;
  query: string[];  // Required component types
  run(world: World, entities: EntityId[], context: SystemContext): void;
}
```

### Component Definitions

**Identity & Core:**
```typescript
interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
  facing: number;  // Angle in radians
}

interface FactionComponent extends Component {
  type: 'faction';
  faction: 'player' | 'enemy';
}
```

**Combat Stats:**
```typescript
interface SkillsComponent extends Component {
  type: 'skills';
  melee: number;      // D100 skill value (0-100)
  ranged: number;
  block: number;
  dodge: number;
  morale: number;
}

interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
  woundState: 'healthy' | 'bloodied' | 'wounded' | 'critical' | 'down';
}

interface ActionPointsComponent extends Component {
  type: 'actionPoints';
  current: number;
  max: number;
  baseModifier: number;  // From experience
  equipmentModifier: number;  // From armor
}

interface StaminaComponent extends Component {
  type: 'stamina';
  current: number;
  max: number;
  exhausted: boolean;
}
```

**Equipment:**
```typescript
interface ArmorComponent extends Component {
  type: 'armor';
  head: number;
  torso: number;
  arms: number;
  legs: number;
  apPenalty: number;
  staminaPenalty: number;
}

interface WeaponComponent extends Component {
  type: 'weapon';
  name: string;
  damage: { dice: number; sides: number; bonus: number };  // e.g., 1d10+4
  speed: number;  // Lower = faster, resolves first
  range: number;
  apCost: number;
  twoHanded: boolean;
}

interface AmmoComponent extends Component {
  type: 'ammo';
  slots: {
    type: string;
    quantity: number;
    maxQuantity: number;
  }[];
  currentSlot: number;
}

interface InventoryComponent extends Component {
  type: 'inventory';
  items: {
    id: string;
    name: string;
    quantity: number;
    effect: string;
  }[];
}
```

**State:**
```typescript
interface MoraleStateComponent extends Component {
  type: 'moraleState';
  state: 'steady' | 'shaken' | 'broken' | 'routed';
  modifiers: { source: string; value: number }[];
}

interface CommandQueueComponent extends Component {
  type: 'commandQueue';
  commands: QueuedCommand[];
  currentCommandIndex: number;
}

interface QueuedCommand {
  type: string;
  params: Record<string, unknown>;
  apCost: number;
  condition?: CommandCondition;
}

interface CommandCondition {
  type: 'inRange' | 'enemyApproaches' | 'hpBelow' | 'targetDead';
  params: Record<string, unknown>;
}

interface EngagementComponent extends Component {
  type: 'engagement';
  engagedWith: EntityId[];
}
```

**AI:**
```typescript
interface AIControllerComponent extends Component {
  type: 'aiController';
  personality: 'aggressive' | 'cunning' | 'cautious' | 'brutal' | 'honorable';
  currentGoal: string;
  targetId?: EntityId;
}
```

---

## Systems Pipeline

Systems run in a defined order each turn:

### Planning Phase Systems

```typescript
const planningPhaseSystems: System[] = [
  CommandInputSystem,    // Validates and accepts player commands
  AICommandSystem,       // Generates enemy commands based on personality
];
```

### Resolution Phase Systems

```typescript
const resolutionPhaseSystems: System[] = [
  InitiativeSystem,      // Sorts actions by weapon speed
  MovementSystem,        // Executes movement, checks engagement zones
  CombatSystem,          // Resolves attacks (D100 rolls, location, damage)
  ReactionSystem,        // Handles defensive reactions (parry/block/dodge)
  DamageSystem,          // Applies damage, checks wound states
  MoraleSystem,          // Triggers and resolves morale checks
  StaminaSystem,         // Applies fatigue costs, handles exhaustion
  AmmoSystem,            // Depletes ammunition
  CleanupSystem,         // Updates engagement, removes down entities from combat
];
```

### Utility Systems

```typescript
const utilitySystems: System[] = [
  VictorySystem,         // Checks win/loss conditions
  SnapshotSystem,        // Captures state for save/undo
];
```

---

## State Snapshots

### Snapshot Structure

```typescript
interface GameSnapshot {
  // Metadata
  turn: number;
  phase: 'planning' | 'resolution';
  timestamp: number;

  // All entities as plain data
  entities: {
    [entityId: string]: {
      components: {
        [componentType: string]: Component;
      };
    };
  };

  // Scenario data
  scenario: {
    id: string;
    name: string;
    victoryConditions: VictoryCondition[];
    terrain: TerrainData;
  };

  // Combat log for this turn
  turnLog: GameEvent[];

  // Random seed for deterministic replay
  randomState: {
    seed: number;
    callCount: number;  // How many times RNG was called
  };
}
```

### Save/Load

```typescript
// Saving
const snapshot = engine.createSnapshot();
const json = JSON.stringify(snapshot);
localStorage.setItem('save', json);

// Loading
const json = localStorage.getItem('save');
const snapshot = JSON.parse(json) as GameSnapshot;
engine.loadSnapshot(snapshot);
```

### Deterministic Replay

```typescript
interface ReplayData {
  initialSnapshot: GameSnapshot;
  commands: {
    turn: number;
    entityId: EntityId;
    command: QueuedCommand;
  }[];
}

// Replay a battle
function replayBattle(replay: ReplayData): GameSnapshot[] {
  const engine = new GameEngine();
  engine.loadSnapshot(replay.initialSnapshot);

  const snapshots: GameSnapshot[] = [engine.createSnapshot()];

  for (const cmd of replay.commands) {
    engine.queueCommand(cmd.entityId, cmd.command);
    if (isEndOfTurn(cmd)) {
      engine.resolveTurn();
      snapshots.push(engine.createSnapshot());
    }
  }

  return snapshots;
}
```

---

## Event System

### Event Types

```typescript
type GameEventType =
  // Turn flow
  | 'TurnStarted'
  | 'PlanningPhaseStarted'
  | 'ResolutionPhaseStarted'
  | 'TurnEnded'
  // Movement
  | 'UnitMoved'
  | 'UnitTurned'
  | 'UnitEngaged'
  | 'UnitDisengaged'
  // Combat
  | 'AttackDeclared'
  | 'AttackRolled'
  | 'DefenseRolled'
  | 'HitLocationRolled'
  // Damage
  | 'DamageDealt'
  | 'ArmorAbsorbed'
  | 'UnitWounded'
  | 'UnitDown'
  // Resources
  | 'AmmoSpent'
  | 'StaminaDrained'
  | 'Exhausted'
  | 'ItemUsed'
  // Morale
  | 'MoraleChecked'
  | 'UnitShaken'
  | 'UnitBroken'
  | 'UnitRouted'
  | 'UnitRallied'
  // Game state
  | 'VictoryAchieved'
  | 'DefeatSuffered'
  | 'ObjectiveCompleted';
```

### Event Structure

```typescript
interface GameEvent {
  type: GameEventType;
  turn: number;
  timestamp: number;  // For replay timing
  entityId?: EntityId;
  targetId?: EntityId;
  data: Record<string, unknown>;
}

// Example events
const attackRolledEvent: GameEvent = {
  type: 'AttackRolled',
  turn: 3,
  timestamp: 1234567890,
  entityId: 'unit_1',
  targetId: 'unit_5',
  data: {
    roll: 42,
    skill: 55,
    modifiers: [
      { source: 'flanking', value: 10 },
      { source: 'height', value: 10 }
    ],
    result: 'hit'
  }
};

const damageDealtEvent: GameEvent = {
  type: 'DamageDealt',
  turn: 3,
  timestamp: 1234567891,
  entityId: 'unit_1',
  targetId: 'unit_5',
  data: {
    location: 'torso',
    rawDamage: 8,
    armorAbsorbed: 3,
    finalDamage: 5,
    newHealth: 12
  }
};
```

### EventBus

```typescript
class EventBus {
  private listeners: Map<GameEventType, Set<(event: GameEvent) => void>>;

  subscribe(type: GameEventType, callback: (event: GameEvent) => void): () => void;
  emit(event: GameEvent): void;
  getHistory(): GameEvent[];  // For combat log
}
```

---

## Dice System

### Seeded Random Number Generator

```typescript
class DiceRoller {
  private seed: number;
  private callCount: number = 0;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Mulberry32 PRNG - fast, good distribution
  private next(): number {
    this.callCount++;
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
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
  getState(): { seed: number; callCount: number } {
    return { seed: this.seed, callCount: this.callCount };
  }

  // Restore state from snapshot
  setState(state: { seed: number; callCount: number }): void {
    this.seed = state.seed;
    this.callCount = 0;
    // Fast-forward to the correct state
    for (let i = 0; i < state.callCount; i++) {
      this.next();
    }
  }
}
```

---

## Folder Structure

```
src/
├── engine/                    # Pure game logic (no DOM/Three.js)
│   ├── ecs/
│   │   ├── World.ts          # Entity manager, component storage
│   │   ├── Entity.ts         # Entity type definitions
│   │   └── System.ts         # Base system interface
│   │
│   ├── components/           # All component definitions
│   │   ├── Position.ts
│   │   ├── Health.ts
│   │   ├── Skills.ts
│   │   ├── ActionPoints.ts
│   │   ├── Stamina.ts
│   │   ├── Armor.ts
│   │   ├── Weapon.ts
│   │   ├── Ammo.ts
│   │   ├── Inventory.ts
│   │   ├── MoraleState.ts
│   │   ├── CommandQueue.ts
│   │   ├── Engagement.ts
│   │   ├── AIController.ts
│   │   └── index.ts
│   │
│   ├── systems/              # All game systems
│   │   ├── CommandInputSystem.ts
│   │   ├── AICommandSystem.ts
│   │   ├── InitiativeSystem.ts
│   │   ├── MovementSystem.ts
│   │   ├── CombatSystem.ts
│   │   ├── ReactionSystem.ts
│   │   ├── DamageSystem.ts
│   │   ├── MoraleSystem.ts
│   │   ├── StaminaSystem.ts
│   │   ├── AmmoSystem.ts
│   │   ├── CleanupSystem.ts
│   │   ├── VictorySystem.ts
│   │   ├── SnapshotSystem.ts
│   │   └── index.ts
│   │
│   ├── core/
│   │   ├── GameEngine.ts     # Main engine, runs systems
│   │   ├── TurnManager.ts    # Phase transitions
│   │   ├── DiceRoller.ts     # Seeded RNG for D100
│   │   ├── EventBus.ts       # Event emission
│   │   └── SnapshotManager.ts
│   │
│   ├── data/
│   │   ├── UnitTemplates.ts  # Predefined unit loadouts
│   │   ├── WeaponData.ts     # Weapon definitions
│   │   ├── ArmorData.ts      # Armor definitions
│   │   └── Scenarios.ts      # Scenario definitions
│   │
│   └── types/
│       └── index.ts          # All type definitions
│
├── ui/                        # Three.js rendering layer
│   ├── Renderer.ts           # Main Three.js scene
│   ├── UnitRenderer.ts       # Unit mesh creation/animation
│   ├── TerrainRenderer.ts    # Map rendering
│   ├── UIManager.ts          # HUD, panels, menus
│   ├── CombatLogUI.ts        # Dice roll display
│   ├── CommandUI.ts          # Planning phase interface
│   ├── EventHandler.ts       # Subscribes to engine events
│   └── Camera.ts             # Camera controls
│
├── tests/                     # Engine tests (no UI)
│   ├── ecs/
│   │   └── World.test.ts
│   ├── systems/
│   │   ├── CombatSystem.test.ts
│   │   ├── MoraleSystem.test.ts
│   │   └── MovementSystem.test.ts
│   ├── core/
│   │   ├── DiceRoller.test.ts
│   │   └── GameEngine.test.ts
│   └── integration/
│       ├── combat.test.ts
│       └── scenarios.test.ts
│
└── main.ts                    # Wires engine + UI together
```

---

## Testing Strategy

### Test Runner
Vitest - fast, native TypeScript, integrates with Vite.

### Test Levels

**Unit Tests:**
```typescript
// DiceRoller.test.ts
describe('DiceRoller', () => {
  it('produces deterministic results with same seed', () => {
    const roller1 = new DiceRoller(12345);
    const roller2 = new DiceRoller(12345);

    expect(roller1.rollD100()).toBe(roller2.rollD100());
    expect(roller1.rollD100()).toBe(roller2.rollD100());
  });

  it('rolls D100 in range 1-100', () => {
    const roller = new DiceRoller(99999);
    for (let i = 0; i < 1000; i++) {
      const roll = roller.rollD100();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);
    }
  });
});
```

**System Tests:**
```typescript
// CombatSystem.test.ts
describe('CombatSystem', () => {
  it('hit with skill 55 and roll 42 succeeds', () => {
    const world = new World();
    const attacker = createTestUnit(world, { melee: 55 });
    const defender = createTestUnit(world, { dodge: 30 });

    const roller = new DiceRoller(/* seed that produces 42 */);
    const result = CombatSystem.resolveAttack(world, attacker, defender, roller);

    expect(result.attackRoll).toBe(42);
    expect(result.hit).toBe(true);
  });

  it('flanking adds +10% per attacker', () => {
    const world = new World();
    const target = createTestUnit(world);
    const attacker1 = createTestUnit(world);
    const attacker2 = createTestUnit(world);

    const modifiers = CombatSystem.calculateModifiers(world, attacker1, target, [attacker2]);

    expect(modifiers.flanking).toBe(10);
  });
});
```

**Integration Tests:**
```typescript
// combat.test.ts
describe('Full Combat Resolution', () => {
  it('knight kills goblin, nearby goblins test morale', () => {
    const engine = new GameEngine({ seed: 12345 });

    const knight = engine.createUnit('knight', { x: 0, y: 0 }, 'player');
    const goblin1 = engine.createUnit('goblin', { x: 1, y: 0 }, 'enemy');
    const goblin2 = engine.createUnit('goblin', { x: 2, y: 0 }, 'enemy');

    engine.queueCommand(knight, { type: 'attack', target: goblin1 });
    engine.resolveTurn();

    const events = engine.getEvents();
    expect(events).toContainEqual(expect.objectContaining({
      type: 'UnitDown',
      entityId: goblin1
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'MoraleChecked',
      entityId: goblin2
    }));
  });
});
```

**Scenario Tests:**
```typescript
// scenarios.test.ts
describe('Tutorial Scenario', () => {
  it('completes with deterministic outcome', () => {
    const engine = new GameEngine({ seed: 54321 });
    engine.loadScenario('tutorial');

    // Load recorded commands
    const commands = loadReplayCommands('tutorial_playthrough_1');

    for (const cmd of commands) {
      engine.queueCommand(cmd.entityId, cmd.command);
      if (cmd.endTurn) engine.resolveTurn();
    }

    expect(engine.getVictoryState()).toBe('player_victory');
  });
});
```

---

## Migration Strategy

### Fresh Start Approach

Start new codebase, reuse visual assets only:

**Reuse from current code:**
- `UnitMeshBuilder.ts` - 3D printed miniature meshes
- `PrintedMaterial.ts` - Layer line shader
- Obstacle mesh builders (trees, houses, rocks)
- Camera control logic
- Basic UI CSS styling

**Discard and rewrite:**
- `Unit.ts` class → ECS entities with components
- `Command` classes → Command queue system
- `Game.ts` loop → Turn-based engine
- `AIController.ts` → Personality-driven AI system
- Real-time combat → D100 resolution system
- `SelectionManager.ts` → Planning phase UI

### Implementation Order

1. **Core ECS** - World, Entity, Component, System base
2. **Dice System** - Seeded RNG, D100 rolls
3. **Basic Components** - Position, Health, Skills
4. **Combat System** - Attack resolution, damage
5. **Tests** - Verify combat math works
6. **Remaining Systems** - Movement, Morale, etc.
7. **UI Integration** - Connect Three.js renderer
8. **Command UI** - Planning phase interface
9. **Scenarios** - Port existing scenarios

---

## Technical Summary

| Aspect | Decision |
|--------|----------|
| Architecture | Lightweight custom ECS |
| Engine/UI | Strictly separated, engine has no UI deps |
| State | Immutable snapshots per turn |
| Persistence | JSON serialization of snapshots |
| Replay | Deterministic via seeded RNG |
| Communication | Event-based (engine emits, UI subscribes) |
| Testing | Vitest, engine fully testable without UI |
| Migration | Fresh start, reuse visual assets only |
