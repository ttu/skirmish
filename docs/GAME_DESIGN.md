# 2D Skirmish Game - Game Design Document

## Overview

A browser-based medieval/fantasy tactical skirmish game built with Three.js. Top-down perspective with turn-based combat using an ECS (Entity Component System) architecture. Players issue commands during a planning phase and watch them resolve simultaneously.

## Core Concept

- **Genre**: Turn-based tactics / Skirmish battle
- **Setting**: Medieval/Fantasy
- **Perspective**: Top-down view
- **Scale**: Small unit battles (warband vs enemies)
- **Combat**: D100 dice-based skill checks

---

## Gameplay

### Camera Controls

- [x] Free camera movement (WASD or arrow keys)
- [x] Right-click + drag to pan
- [x] Zoom in/out (mouse wheel)
- [x] Camera bounds (per scenario)

### Turn System

- [x] Two-phase turn cycle: **Planning** → **Resolution**
- [x] During planning: select units and queue commands
- [x] During resolution: commands execute in priority order
- [x] All units act simultaneously during resolution
- [x] Turn counter tracking

### Unit Selection & Commands

- [x] Click to select single unit
- [x] Drag box to select multiple units
- [x] Ctrl+click to add/remove from selection
- [x] Right-click to move selected units
- [x] Right-click on enemy to attack
- [x] Command types: Move, Attack, Defend, Aim, Reload, Rally, Wait, Overwatch
- [x] Commands consume Action Points (AP)
- [x] Conditional commands (e.g., "attack if target in range", "move if target dead")

---

## Units

### Player Units (Warband)

| Unit Type   | Role             | HP  | AP | Stamina | Speed | Melee | Ranged | Block | Dodge | Morale | Perception |
| ----------- | ---------------- | --- | -- | ------- | ----- | ----- | ------ | ----- | ----- | ------ | ---------- |
| Militia     | Basic melee      | 80  | 5  | 8       | 4.0   | 35    | 15     | 25    | 20    | 30     | 25         |
| Warrior     | Main melee       | 100 | 5  | 10      | 3.5   | 50    | 20     | 40    | 30    | 50     | 35         |
| Veteran     | Experienced melee| 100 | 5  | 12      | 3.5   | 60    | 25     | 50    | 35    | 60     | 45         |
| Knight      | Heavy armored    | 120 | 5  | 10      | 3.0   | 65    | 15     | 55    | 15    | 70     | 40         |
| Archer      | Ranged support   | 70  | 5  | 8       | 4.0   | 25    | 55     | 15    | 35    | 35     | 50         |
| Crossbowman | Heavy ranged     | 80  | 5  | 8       | 3.5   | 30    | 50     | 25    | 20    | 40     | 40         |
| Healer      | Support          | 60  | 5  | 6       | 3.5   | 20    | 15     | 15    | 25    | 40     | 45         |
| Scout       | Fast recon       | 65  | 5  | 12      | 5.0   | 35    | 45     | 20    | 50    | 40     | 65         |

### Enemy Units

| Unit Type   | HP  | AP | Stamina | Speed | Melee | Ranged | Morale | Traits              |
| ----------- | --- | -- | ------- | ----- | ----- | ------ | ------ | ------------------- |
| Goblin      | 40  | 6  | 6       | 5.0   | 30    | 20     | 20     | Low morale          |
| Orc Warrior | 120 | 5  | 10      | 3.0   | 55    | 15     | 55     | Heavy armor         |
| Orc Archer  | 90  | 5  | 8       | 3.0   | 30    | 50     | 45     | Ranged               |
| Orc Brute   | 150 | 4  | 14      | 2.5   | 70    | 10     | 65     | Fearless             |
| Troll       | 250 | 3  | 20      | 2.0   | 75    | 10     | 80     | Fearless, causes fear |

### Skills (D100-based)

All skills are percentages (0-100) representing the chance of success on a D100 roll:

- **Melee**: Close combat attack skill
- **Ranged**: Ranged attack skill
- **Block**: Chance to block with shield/weapon
- **Dodge**: Chance to dodge an attack
- **Morale**: Resistance to fear and routing
- **Perception**: Awareness of surroundings (affects distance estimation in UI)
- **Toughness**: Resistance to knockdown on head hits (optional, default 40)

---

## Combat System

### D100 Dice-Based Resolution

Combat uses D100 (percentile dice) skill checks rather than simple ATK-DEF:

1. **Attack Roll**: Attacker rolls D100 vs their effective attack skill (melee or ranged)
   - Roll ≤ skill = hit, roll > skill = miss
   - Skills clamped to 5-95 range (always a chance to hit or miss)
2. **Defense Roll**: If attack hits, defender rolls D100 vs defense skill
   - Defense type: block (with shield), dodge, or parry
3. **Hit Location**: D100 roll determines where the hit lands
   - Head (0-15%), Torso (15-35%), Arms (35-55%), Legs (55-80%), Weapon (80-100%)
4. **Damage**: Roll weapon damage dice, subtract location armor
   - Minimum 0 damage after armor

### Weapons

Each weapon has:
- **Damage**: Expressed as dice rolls (e.g., 1d8+2)
- **Speed**: Lower = faster (affects AP cost)
- **Range**: Melee (≤1.5m) or Ranged (>3m)
- **AP Cost**: Action points per attack
- **Two-handed**: Prevents offhand use

### Armor System

- Per-location armor: head, torso, arms, legs
- Armor absorbs damage at the hit location
- Heavy armor adds AP and stamina penalties
- Armor piercing ammo can bypass armor

### Action Points (AP)

- Each unit has AP per turn (typically 5)
- Commands consume AP:
  - Walk: 1 AP (25% speed)
  - Advance: 2 AP (50% speed)
  - Run: 4 AP (75% speed, 1 stamina)
  - Sprint: All AP (100% speed, 3 stamina)
  - Melee/Ranged Attack: varies by weapon speed
  - Defend/Aim/Reload: varies
- Heavy armor and experience penalties reduce effective AP

### Stamina

- Separate resource from AP
- Drains on sprint, dodge, melee attacks, power attacks
- Heavy armor adds +1 stamina cost
- Recovers 2 per turn
- Exhaustion at stamina ≤ 0: -1 AP penalty

### Wound System

- Wound threshold = 2x location armor
- Damage exceeding threshold causes wounds
- **Severity**: Minor (0-3 excess), Moderate (3-7), Severe (7+)
- **Effects by location**:
  - Arms: Skill penalty, disables two-handed weapons (severe)
  - Legs: Movement penalty, halves movement (severe)
  - Torso: Skill penalty, bleeding per turn
  - Head: Toughness check for knockdown
- Wounds persist and stack

### Morale System

- D100 morale check when taking casualties or losing leaders
- **Status progression**: Steady → Shaken → Broken → Routed
- Each failure worsens morale status
- **Shaken**: Penalties to actions
- **Broken**: Unit tries to flee
- **Routed**: Unit removed from combat
- Rally command can attempt to recover morale

### Engagement

- Units within 1.5m become engaged in melee
- Engaged units cannot freely disengage
- Overwatch allows reaction attacks on approaching enemies

### Ammo System

- Ranged units have finite ammunition
- Multiple ammo types per unit (e.g., standard arrows, bodkin arrows)
- Each type has: quantity, armor piercing, damage bonus
- Reload command to switch ammo slots

---

## Terrain & Obstacles

### Obstacle Types

- [x] **Trees**: Pine, oak, willow - cylindrical collision
- [x] **Houses**: Stone, cottage, hall - large rectangular collision
- [x] **Rocks**: Medium collision, natural obstacles
- [x] **Stone Walls & Fences**: Rectangular barriers
- [x] **Rivers & Brooks**: Passable with speed reduction
- [x] **Bridges**: Passable, cross rivers

### Pathfinding

- [x] A* grid-based pathfinding (0.5m cell size)
- [x] Units navigate around obstacles
- [x] Clearance margin for unit radius

---

## Scenarios

### Scenario Structure

```typescript
{
  id: string,
  name: string,
  description: string,
  mapSize: { width: number, height: number },
  playerUnits: ScenarioUnit[],   // type, position, faction, elevation
  enemyUnits: ScenarioUnit[],
  obstacles: ScenarioObstacle[], // type, position, rotation, scale, length
  objectives: string[]
}
```

### Implemented Scenarios

1. **Quick Skirmish**
   - 2 warriors vs 2 goblins
   - Small 20x20 map, minimal obstacles
   - Fast introductory battle

2. **Duel**
   - Knight vs Orc Warrior
   - Small 15x15 arena
   - 1v1 combat

3. **Tutorial: First Blood**
   - 3 warriors vs 5 goblins
   - 30x30 map with rocks
   - Learn basic combat

4. **Forest Ambush**
   - Knight, 2 warriors, 2 archers vs 8 goblins
   - 40x40 forest with many trees
   - Surrounded by enemies

5. **Orc Patrol**
   - Knight, 2 warriors, 2 archers, healer vs 3 orc warriors, 2 orc archers
   - 40x40 village with houses, rocks, trees
   - Tougher enemies

6. **Troll Bridge**
   - 2 knights, 2 warriors, 3 archers, healer vs troll + goblins
   - 50x30 map with river and bridge
   - Boss encounter

---

## AI System

### AI Personalities

- **Aggressive**: Charges nearest enemies, prioritizes offense
- **Cunning**: Evaluates threats, flanks, targets wounded units
- **Cautious**: Defensive positioning, engages only when advantageous
- **Brutal**: Focuses on weakest targets, maximum damage
- **Honorable**: Engages strongest opponents, fair combat

### Threat Assessment

AI evaluates each enemy based on:
- Threat level (combat effectiveness)
- Distance
- Wounded status
- Engagement state
- Reachability

---

## UI Elements

### HUD

- [x] Selected unit info panel (name, health, stats, commands)
- [x] Combat log (scrolling event feed with color coding)
- [x] Floating combat text (damage numbers, status changes)
- [x] Body diagram (visual wound/armor display per location)
- [x] Command queue display with AP costs
- [x] Toast notifications

### Perception-Based UI

- Distance estimation varies by unit perception skill:
  - Poor (0-20): "Close" or "Far"
  - Low (21-35): ±50% error
  - Average (36-55): ±25% error
  - Good (56-75): ±10% error
  - Excellent (76+): Exact distance

### Body Diagram

- Visual representation of each body location
- Shows armor values per location
- Displays wound severity with color coding:
  - Yellow: Minor wound
  - Orange: Moderate wound
  - Red: Severe wound
- Shows active wound effects (skill penalties, bleeding, movement restriction)

---

## Art Style

### Visual Direction

- Simple 3D primitives (cylinders, cones) for units and obstacles
- Color-coded factions (blue for player, red for enemy)
- Clear visual indicators for selection and targeting
- Dark fantasy color palette

---

## Resolved Design Decisions

| Decision    | Choice             | Rationale                                         |
| ----------- | ------------------ | ------------------------------------------------- |
| Combat      | Turn-based         | Better tactical depth, planning phase             |
| Resolution  | D100 dice rolls    | Granular probability, RPG-style mechanics         |
| Movement    | Grid pathfinding   | Predictable, fair movement costs                  |
| Art style   | 3D primitives      | Fast to implement, clear visibility               |
| Build tool  | Vite               | Fast development, good TypeScript support         |
| Architecture| ECS pattern        | Clean separation of data (components) and logic (systems) |
