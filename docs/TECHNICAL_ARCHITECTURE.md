# Technical Architecture

## Technology Stack

### Core
- **Renderer**: Three.js
- **Language**: TypeScript (strict mode)
- **Build Tool**: Vite
- **Test Framework**: Vitest
- **Package Manager**: npm

### Architecture
- **Pattern**: Entity Component System (ECS)
- **UI**: Vanilla HTML/CSS (DOM-based overlays)
- **State**: Custom EventBus for cross-system communication

---

## Project Structure

```
src/
├── main.ts                          # Entry point
├── types/index.ts                   # Shared TypeScript types
├── core/
│   ├── Camera.ts                    # Camera controller (orthographic, pan, zoom)
│   └── InputManager.ts              # Keyboard/mouse input handling
├── engine/
│   ├── components/index.ts          # ECS component definitions
│   ├── core/
│   │   ├── DiceRoller.ts            # Seeded D100 and dice roll mechanics
│   │   ├── EventBus.ts              # Engine event system (GameEvent types)
│   │   └── GameEngine.ts            # Main engine orchestrator
│   ├── data/
│   │   ├── ScenarioLoader.ts        # Loads scenarios into ECS world
│   │   ├── UnitFactory.ts           # Creates units with all components
│   │   └── UnitTemplates.ts         # Unit type stat definitions
│   ├── ecs/
│   │   └── World.ts                 # ECS world (entity-component storage & queries)
│   ├── systems/
│   │   ├── AICommandSystem.ts       # AI personality-driven decision-making
│   │   ├── AmmoSystem.ts            # Ammunition tracking and switching
│   │   ├── CombatResolver.ts        # D100 attack/defense/hit location resolution
│   │   ├── DamageSystem.ts          # Damage application and wound state
│   │   ├── MoraleSystem.ts          # D100 morale checks and status progression
│   │   ├── MovementSystem.ts        # Movement modes with AP/stamina costs
│   │   ├── Pathfinder.ts            # A* grid-based pathfinding
│   │   ├── StaminaSystem.ts         # Stamina drain, recovery, exhaustion
│   │   ├── TurnResolutionSystem.ts  # Turn execution pipeline
│   │   ├── VictorySystem.ts         # Win/loss condition evaluation
│   │   └── WoundEffectsSystem.ts    # Wound severity and location effects
│   └── types/index.ts               # Engine-specific types
├── entities/
│   ├── Obstacle.ts                  # Obstacle Three.js meshes
│   └── UnitMeshBuilder.ts           # Unit mesh construction
├── game/
│   ├── TurnBasedGame.ts             # Main game class (rendering, UI, interaction)
│   └── selection.ts                 # Unit selection logic
├── data/
│   └── scenarios.ts                 # Battle scenario definitions
├── ui/
│   ├── BodyDiagramUI.ts             # Visual body wound/armor diagram
│   ├── CombatLogUI.ts               # Scrolling combat event log
│   ├── CombatStatusHelpers.ts       # Status badges for units
│   ├── CommandFormatters.ts         # Command text formatting with AP costs
│   ├── FloatingCombatText.ts        # Floating damage numbers and status
│   ├── PerceptionHelpers.ts         # Perception-based distance estimation
│   ├── ScreenStateManager.ts        # Screen state transitions
│   └── ToastManager.ts              # Toast notifications
└── utils/
    ├── EventBus.ts                  # Utility event bus
    └── PrintedMaterial.ts           # Printed material styling

tests/
├── engine/
│   ├── core/                        # DiceRoller, EventBus, GameEngine tests
│   ├── data/                        # ScenarioLoader, UnitFactory tests
│   ├── ecs/                         # World tests
│   └── systems/                     # All system tests
├── integration/                     # Combat, turns, AI, movement, selection tests
└── ui/                              # UI helper tests
```

---

## Game Loop

The game has two layers: a **render loop** (60 FPS via `requestAnimationFrame`) and a **turn loop** (player-driven phase transitions).

### Render Loop (`TurnBasedGame.start()`)

Runs continuously at 60 FPS regardless of turn phase:

```
requestAnimationFrame ──►
    ├── Update obstacle animations (rivers, trees)
    ├── Update movement animations (lerp units to new positions)
    ├── Update active highlight pulse (selected unit ring)
    ├── Update floating combat text (fade, drift upward)
    └── Render scene (Three.js)
```

The render loop is purely visual — no game state changes happen here.

### Turn Loop

```
┌─────────────────────────────────────────────────────────────────┐
│ PLANNING PHASE                                                  │
│                                                                 │
│  1. Auto-continue attacks (re-queue attacks from last turn)     │
│  2. Auto-continue movement (re-queue multi-turn destinations)   │
│  3. Player selects units and queues commands via UI              │
│     └── Each command checked against remaining AP               │
│  4. If all player units on overwatch → auto-resolve             │
│  5. Player clicks "Resolve Turn"                                │
│     └── Unspent AP warning if units have unused AP              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESOLUTION TRIGGER (onResolveTurn)                              │
│                                                                 │
│  1. Record all unit positions (for animation)                   │
│  2. AICommandSystem generates enemy commands                    │
│  3. engine.endPlanningPhase()  → phase = 'resolution'           │
│  4. engine.resolvePhase()      → TurnResolutionSystem runs      │
│  5. engine.endTurn()           → turn++, phase = 'planning'     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ ANIMATION & PLAYBACK                                            │
│                                                                 │
│  1. Start movement animations (lerp from old → new positions)   │
│     └── Uses A* paths from UnitMoved events for curved paths    │
│  2. Queue combat events for staggered playback                  │
│  3. Play combat events with delays (COMBAT_EVENT_DELAY = 600ms) │
│     ├── Floating damage numbers                                 │
│     ├── Combat log entries                                      │
│     ├── Status changes (morale, wounds)                         │
│     └── Body diagram updates                                    │
│  4. Check victory/defeat conditions                             │
│  5. Update UI (unit panels, command queue, body diagrams)       │
│  6. Return to Planning Phase                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Turn Resolution Detail (`TurnResolutionSystem.resolveTurn()`)

All game state changes happen atomically during resolution:

```
1. Refresh engagement state (who is in melee with whom)
2. Collect all queued commands from all units
   └── Evaluate conditions (targetDead, inRange, hpBelow, enemyApproaches)
   └── Skip downed and routed units
3. Sort by priority (lower = faster, e.g. defend before attack)
4. For each action in priority order:
   ├── Move: apply wound restrictions → calculate destination →
   │         check disengagement → execute move → update engagements →
   │         check overwatch triggers
   ├── Attack: build modifiers (wounds, morale, flanking, facing, elevation) →
   │           roll D100 attack → roll D100 defense → roll hit location →
   │           roll damage dice → apply armor → apply damage →
   │           check wound effects → check morale
   ├── Defend: set defensive stance (bonus% + extra reactions)
   ├── Overwatch: set overwatch component for reactive attacks
   ├── Rally: attempt morale recovery with leadership bonus
   ├── Aim/Reload/Wait: deduct AP, apply effect
   └── Remove executed command from queue (unexecuted carry over)
5. End-of-turn processing:
   ├── Apply bleeding damage from wounds
   ├── Clear defensive stances and overwatch
   ├── Recover stamina (+2 per turn)
   └── Reset AP to max
```

### Auto-Continue Mechanics

Commands persist across turns to reduce micromanagement:

- **Attack persistence**: If a unit attacked an enemy last turn, it auto-queues the same attack next turn (if target is alive and in range)
- **Multi-turn movement**: Right-clicking a distant destination queues movement legs turn-by-turn, recomputing A* paths each turn until arrival
- **Order persistence**: Unexecuted commands (e.g., conditional commands whose conditions weren't met) carry over to the next turn

---

## Core Systems

### ECS World

The `WorldImpl` class provides entity-component storage and querying:

```typescript
interface World {
  createEntity(): number;
  removeEntity(entityId: number): void;
  setComponent<T>(entityId: number, componentType: string, component: T): void;
  getComponent<T>(entityId: number, componentType: string): T | undefined;
  hasComponent(entityId: number, componentType: string): boolean;
  removeComponent(entityId: number, componentType: string): void;
  getEntitiesWith(...componentTypes: string[]): number[];
  getAllEntities(): number[];
}
```

### ECS Components

| Component | Key Fields | Purpose |
|-----------|------------|---------|
| PositionComponent | x, y, facing, elevation | Spatial position and orientation |
| FactionComponent | faction ('player'\|'enemy') | Team membership |
| IdentityComponent | name, unitType, shortId | Display name and type |
| HealthComponent | current, max, woundState | HP and wound tracking |
| SkillsComponent | melee, ranged, block, dodge, morale, perception, toughness | D100 skill values |
| ActionPointsComponent | current, max, armorPenalty, experiencePenalty | AP resource |
| StaminaComponent | current, max, exhausted | Stamina resource |
| ArmorComponent | head, torso, arms, legs, apPenalty, staminaPenalty | Per-location armor |
| WeaponComponent | name, damage {dice,sides,bonus}, speed, range, apCost, twoHanded | Weapon stats |
| OffHandComponent | type ('shield'\|'weapon'), blockBonus, name | Shield or second weapon |
| AmmoComponent | slots [{ammoType, quantity, maxQuantity, armorPiercing, damageBonus}] | Ammo tracking |
| MoraleStateComponent | status, modifiers | Morale status |
| EngagementComponent | engagedWith (entity IDs) | Melee engagement tracking |
| DefensiveStanceComponent | bonusPercent, extraReactions | Active defense |
| OverwatchComponent | attackType, watchDirection, watchArc, triggered | Reaction fire |
| CommandQueueComponent | commands, currentCommandIndex | Queued commands |
| WoundEffectsComponent | effects array | Active wound penalties |
| ObstacleComponent | radius, isPassable, speedMultiplier, dimensions | Obstacle collision |
| AIControllerComponent | personality, currentGoal, targetId, fearTarget | AI state |

### Game Engine

`GameEngine` orchestrates the turn cycle:

```typescript
class GameEngine {
  // Phase management
  startPlanningPhase(): void;   // Begin command input
  resolvePhase(): void;          // Execute all commands

  // Command interface
  queueCommand(entityId: number, command: Command): void;

  // Query
  getPhase(): 'planning' | 'resolution';
  getTurnNumber(): number;
}
```

### Turn Resolution Pipeline

`TurnResolutionSystem.resolveTurn()` executes in order:

1. **Queue commands** for all units
2. **Resolve commands** by priority order
3. **Process attacks** via CombatResolver → DamageSystem
4. **Apply wound effects** via WoundEffectsSystem
5. **Check morale** via MoraleSystem
6. **Update stamina** via StaminaSystem (recovery)
7. **Clear stances** (defensive stance, overwatch) at turn end

### Command Types

```typescript
type Command =
  | { type: 'move'; targetX: number; targetY: number; mode: MovementMode }
  | { type: 'attack'; targetId: number; attackType: 'melee' | 'ranged'; chosenLocation?: string }
  | { type: 'defend'; defenseType: 'block' | 'dodge' | 'parry' }
  | { type: 'aim'; targetId: number; aimBonus: number }
  | { type: 'reload'; slotIndex: number }
  | { type: 'rally' }
  | { type: 'wait' }
  | { type: 'overwatch'; attackType: 'melee' | 'ranged'; watchDirection?: number; watchArc?: number }

// Commands can have conditions
interface CommandCondition {
  type: 'targetDead' | 'inRange' | 'hpBelow' | 'enemyApproaches';
  // condition-specific params
}
```

### Combat Resolution Flow

```
Attacker declares attack
    │
    ▼
Roll D100 vs attack skill ──► Miss (roll > skill)
    │ Hit
    ▼
Roll D100 vs defense skill ──► Defended (roll ≤ defense)
    │ Not defended
    ▼
Roll D100 for hit location
    │
    ▼
Roll weapon damage dice
    │
    ▼
Subtract location armor ──► 0 damage (fully absorbed)
    │ Damage > 0
    ▼
Apply damage to health
    │
    ▼
Check wound threshold (2x armor)
    │ Exceeded
    ▼
Apply wound effects by location
    │
    ▼
Check morale (if casualty)
```

### Movement System

```
Movement Modes:
┌──────────┬────────┬───────┬─────────┐
│ Mode     │ AP     │ Speed │ Stamina │
├──────────┼────────┼───────┼─────────┤
│ Walk     │ 1      │ 25%   │ 0       │
│ Advance  │ 2      │ 50%   │ 0       │
│ Run      │ 4      │ 75%   │ 1       │
│ Sprint   │ All AP │ 100%  │ 3       │
└──────────┴────────┴───────┴─────────┘

Engagement range: 1.5m
Melee attack range: 1.2m
Unit radius: 0.5m
Min unit separation: 1.0m
```

### Pathfinding

A* algorithm on a grid:
- Cell size: 0.5m
- Clearance: 0.15m extra for unit radius
- Considers obstacles (impassable and passable with speed penalty)
- Optional approach target to path near a specific entity

---

## Data Flow

```
Scenario Definition
    │
    ▼
ScenarioLoader ──► UnitFactory ──► World (entities + components)
                                      │
                                      ▼
                              ┌── Planning Phase ──┐
                              │                     │
                         Player Input           AI System
                         (UI clicks)          (AICommandSystem)
                              │                     │
                              └──► CommandQueue ◄───┘
                                      │
                                      ▼
                              Resolution Phase
                              (TurnResolutionSystem)
                                      │
                    ┌────────────┬─────┴──────┬──────────────┐
                    ▼            ▼            ▼              ▼
              MovementSystem  CombatResolver  MoraleSystem  StaminaSystem
                                │
                                ▼
                          DamageSystem
                                │
                                ▼
                       WoundEffectsSystem
                                │
                                ▼
                    EventBus (GameEvent emissions)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              CombatLogUI  FloatingText  BodyDiagram
```

---

## State Management

### Game States
```
LOADING → SCENARIO_SELECT → PLAYING (Planning ↔ Resolution) → VICTORY/DEFEAT
                                          ↑__________________________|
```

### Turn Phases
```
Planning Phase ──► Resolution Phase ──► Next Turn (Planning Phase)
     │                    │
     │ Player queues      │ Commands execute
     │ commands            │ in priority order
     │ AI generates        │
     │ commands            │
```

### Unit Health States
```
healthy → bloodied → wounded → critical → down
```

### Morale States
```
steady → shaken → broken → routed
```

---

## Event System

`EventBus` provides typed event communication between systems:

### Key Event Types

| Event | Emitted By | Purpose |
|-------|-----------|---------|
| TurnStarted | GameEngine | New turn begins |
| PlanningPhaseStarted | GameEngine | Planning phase entry |
| ResolutionPhaseStarted | GameEngine | Resolution phase entry |
| TurnEnded | GameEngine | Turn complete |
| AttackDeclared | CombatResolver | Attack initiated |
| AttackRolled | CombatResolver | D100 attack result |
| HitLocationRolled | CombatResolver | Body location determined |
| DamageDealt | DamageSystem | Damage applied |
| UnitWounded | DamageSystem | Wound threshold exceeded |
| UnitDown | DamageSystem | Unit HP reaches 0 |
| MoraleChecked | MoraleSystem | Morale check result |
| UnitShaken/Broken/Routed | MoraleSystem | Morale status change |
| UnitRallied | MoraleSystem | Morale recovery |
| StaminaDrained | StaminaSystem | Stamina consumed |
| Exhausted | StaminaSystem | Unit exhausted |
| AmmoSpent | AmmoSystem | Ammo consumed |
| WoundEffectApplied | WoundEffectsSystem | Wound effect added |
| BleedingDamage | WoundEffectsSystem | Per-turn bleed |
| VictoryAchieved | VictorySystem | Player wins |
| DefeatSuffered | VictorySystem | Player loses |

---

## DiceRoller

Seeded random number generator for deterministic replays:

```typescript
class DiceRoller {
  rollD100(): number;                          // 1-100
  roll(dice: number, sides: number, bonus?: number): number;  // XdY+Z
  setSeed(seed: number): void;
}
```

---

## Victory Conditions

Multiple victory types evaluated by `VictorySystem`:

| Type | Description |
|------|-------------|
| elimination | Destroy all enemy units |
| morale_break | All enemies routed |
| objective_hold | Hold position for N turns |
| objective_reach | Reach a map location |
| objective_kill | Kill specific target |
| survival | Survive N turns |
| point_threshold | Accumulate enough points |

Unit point values: militia (25), warrior (50), knight (100), troll (150), etc.

---

## Performance Considerations

### Optimization Strategies
- Grid-based pathfinding with configurable cell size
- Component queries via `getEntitiesWith()` for efficient system updates
- Turn-based design avoids per-frame combat calculations

### Target Performance
- 60 FPS rendering on modern browsers
- Support 20-50 units on screen

---

## Testing Strategy

### Unit Tests (Vitest)
- All ECS systems tested independently
- DiceRoller with seeded deterministic output
- EventBus subscription and emission
- GameEngine phase management
- ScenarioLoader and UnitFactory

### Integration Tests
- Full turn resolution (command → result)
- Multi-turn movement sequences
- Combat resolution chains
- AI battle simulations
- Unit selection interactions

### Test Structure
- Tests mirror `src/` structure under `tests/`
- Engine systems, core, data, ECS, and UI all covered

---

## Build & Deploy

### Development
```bash
npm run dev      # Vite dev server with HMR
npm test         # Run tests in watch mode
npm run test:run # Run tests once
```

### Production
```bash
npm run build    # tsc && vite build → dist/
npm run preview  # Preview production build
```

### Deployment
- Static hosting (Netlify, Vercel, GitHub Pages)
- Single HTML + JS bundle
