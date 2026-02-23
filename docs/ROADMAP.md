# Development Roadmap

## Overview

This roadmap breaks down development into phases with clear milestones.

---

## Phase 1: Foundation (Prototype) - COMPLETE

**Goal**: Playable prototype with basic mechanics

### Milestone 1.1: Project Setup
- [x] Initialize project with Vite + TypeScript
- [x] Set up Three.js scene
- [x] Basic folder structure
- [x] Development environment working
- [x] Vitest test framework

### Milestone 1.2: Camera & Controls
- [x] Orthographic top-down camera
- [x] Camera pan (WASD or arrow keys)
- [x] Camera zoom (mouse wheel)
- [x] Camera bounds

### Milestone 1.3: Basic Rendering
- [x] Ground plane / terrain
- [x] Simple unit representation (colored cylinders)
- [x] Unit health bars
- [x] Selection indicators

### Milestone 1.4: Unit Selection
- [x] Click to select unit
- [x] Box selection (drag)
- [x] Multi-select (Ctrl+click)
- [x] Selection highlighting
- [x] Deselect (click empty space / Escape)

### Milestone 1.5: ECS Architecture
- [x] World with entity-component storage
- [x] Component-based data model
- [x] System-based logic processing
- [x] EventBus for cross-system communication

---

## Phase 2: Turn-Based Combat System - COMPLETE

**Goal**: D100 dice-based combat with turn phases

### Milestone 2.1: Turn System
- [x] Planning phase (queue commands)
- [x] Resolution phase (execute commands)
- [x] Turn counter
- [x] Phase transitions
- [x] Action Points (AP) per unit

### Milestone 2.2: D100 Combat Resolution
- [x] Attack roll (D100 vs skill)
- [x] Defense roll (block/dodge/parry)
- [x] Hit location system (head/torso/arms/legs/weapon)
- [x] Weapon damage dice rolls
- [x] Per-location armor absorption

### Milestone 2.3: Command System
- [x] Move command (walk/advance/run/sprint modes)
- [x] Attack command (melee/ranged)
- [x] Defend command (block/dodge/parry)
- [x] Aim command
- [x] Reload command
- [x] Rally command
- [x] Wait command
- [x] Overwatch command
- [x] Conditional commands (target dead, in range, HP below, enemy approaches)

### Milestone 2.4: Damage & Wounds
- [x] Damage calculation with armor
- [x] Wound threshold system
- [x] Wound severity (minor/moderate/severe)
- [x] Location-specific wound effects
- [x] Bleeding damage per turn
- [x] Head hit toughness checks

---

## Phase 3: Unit Systems - COMPLETE

**Goal**: Deep tactical mechanics

### Milestone 3.1: Stamina System
- [x] Stamina resource per unit
- [x] Stamina drain on sprint, dodge, melee, power attacks
- [x] Heavy armor stamina penalty
- [x] Per-turn stamina recovery
- [x] Exhaustion state at stamina ≤ 0

### Milestone 3.2: Morale System
- [x] D100 morale checks
- [x] Morale status progression (steady → shaken → broken → routed)
- [x] Triggers: casualties, leader death, fear
- [x] Rally command for recovery

### Milestone 3.3: Ammo System
- [x] Finite ammunition for ranged units
- [x] Multiple ammo types (standard, bodkin)
- [x] Armor piercing and damage bonus per type
- [x] Ammo slot switching

### Milestone 3.4: Movement & Pathfinding
- [x] A* grid-based pathfinding (0.5m cells)
- [x] Movement modes with AP/stamina costs
- [x] Engagement range mechanics (1.5m)
- [x] Unit collision detection
- [x] Obstacle avoidance with clearance

---

## Phase 4: AI & Unit Variety - COMPLETE

**Goal**: Intelligent enemies and diverse units

### Milestone 4.1: AI Command System
- [x] AI personality types (aggressive, cunning, cautious, brutal, honorable)
- [x] Battlefield analysis (strength, casualties, threats)
- [x] Threat assessment per enemy
- [x] Personality-driven decision making
- [x] Command generation for AI units

### Milestone 4.2: Player Unit Types
- [x] Militia (basic melee)
- [x] Warrior (main melee)
- [x] Veteran (experienced melee)
- [x] Knight (heavy armored leader)
- [x] Archer (ranged with ammo types)
- [x] Crossbowman (heavy ranged)
- [x] Healer (support)
- [x] Scout (fast recon, high perception)

### Milestone 4.3: Enemy Unit Types
- [x] Goblin (weak, low morale)
- [x] Orc Warrior (tough melee)
- [x] Orc Archer (ranged)
- [x] Orc Brute (powerful, fearless)
- [x] Troll (boss, fearless, causes fear)

---

## Phase 5: Scenarios & UI - COMPLETE

**Goal**: Complete playable game

### Milestone 5.1: Scenario System
- [x] Scenario data format (TypeScript)
- [x] Scenario loader with unit factory
- [x] 6 scenarios (quick_skirmish, duel, tutorial, forest_ambush, orc_patrol, troll_bridge)
- [x] Multiple obstacle types (trees, houses, rocks, walls, fences, rivers, bridges)
- [x] Victory conditions (elimination, morale break, objectives, survival, points)

### Milestone 5.2: UI - Combat Feedback
- [x] Combat log with color-coded events
- [x] Floating combat text (damage, status, morale)
- [x] Body diagram (visual wound/armor display)
- [x] Command queue display with AP costs
- [x] Perception-based distance estimation
- [x] Toast notifications

### Milestone 5.3: UI - Game Screens
- [x] Scenario selection
- [x] Victory/Defeat overlay
- [x] Screen state management

### Milestone 5.4: Terrain & Obstacles
- [x] Trees (pine, oak, willow)
- [x] Houses (stone, cottage, hall)
- [x] Rocks
- [x] Stone walls & fences
- [x] Rivers & brooks (passable with speed reduction)
- [x] Bridges
- [x] A* pathfinding around obstacles

---

## Phase 6: Polish & Balance

**Goal**: Polished, shippable game

### Milestone 6.1: Balance
- [ ] Playtest all scenarios
- [ ] Adjust unit stats and skills
- [ ] Tune wound thresholds and effects
- [ ] Balance AP costs and stamina drain
- [ ] Ensure fair difficulty progression

### Milestone 6.2: Bug Fixes
- [ ] Fix critical bugs
- [ ] Performance optimization
- [ ] Browser compatibility testing

### Milestone 6.3: Release
- [ ] Build production version
- [ ] Deploy to hosting
- [ ] Basic landing page

---

## Future Phases (v2+)

### Phase 7: Campaign Mode
- [ ] Multiple linked scenarios
- [ ] Persistent warband
- [ ] Between-battle upgrades
- [ ] Story elements

### Phase 8: Progression
- [ ] Unit experience and leveling
- [ ] Equipment/inventory
- [ ] Unlockable units

### Phase 9: Content Expansion
- [ ] More unit types
- [ ] More enemy types
- [ ] More scenarios
- [ ] Different environments

### Phase 10: Advanced Features
- [ ] Fog of war
- [ ] Terrain elevation effects
- [ ] Special abilities
- [ ] Audio (music, sound effects)

### Phase 11: Multiplayer (v3)
- [ ] Player vs Player
- [ ] Co-op scenarios
- [ ] Matchmaking

---

## Current Status

**Active Phase**: Phase 6 (Polish & Balance)

**Completed**: Phases 1-5 (Foundation, Combat, Unit Systems, AI, Scenarios & UI)

**Next Action**: Playtest scenarios and balance unit stats

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024 | Vite build tool | Fast development, good TypeScript support |
| 2024 | 3D primitives art | Fast to implement, clear visibility |
| 2025 | Turn-based combat | Better tactical depth than real-time |
| 2025 | D100 dice system | Granular probability, RPG-style mechanics |
| 2025 | ECS architecture | Clean data/logic separation, testable systems |
| 2025 | Per-location armor | Adds tactical depth to combat |
| 2025 | AP + Stamina | Dual resource system creates meaningful choices |
| 2025 | A* pathfinding | Predictable, fair movement around obstacles |
| 2025 | AI personalities | Varied enemy behavior, more engaging encounters |

---

## Notes

- Phases 1-5 implemented in development sprints
- Game is playable with 6 scenarios
- Full test suite covering all engine systems and integration
- Ready for playtesting and balance adjustments
