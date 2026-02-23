# Perception Skill Design

## Overview

Add a **Perception** skill to units that affects how accurately they can assess battlefield information - specifically distance estimation and enemy condition assessment.

## Skill Definition

**Perception** is a new D100 skill added to `SkillsComponent`, following the same pattern as melee, ranged, block, dodge, morale, and toughness.

- **Storage:** `SkillsComponent.perception: number` (D100 value, 0-100)
- **Not roll-based:** Unlike combat skills, perception is a passive threshold determining information quality. No dice rolls involved.

## Perception Tiers

| Tier | Perception | Distance Display | Enemy Condition Display |
|------|------------|------------------|------------------------|
| **Poor** | 0-20 | "Far" / "Close" (threshold: 10m) | No info shown |
| **Low** | 21-40 | ±50% error ("~8-12m" for 10m) | "Healthy" / "Hurt" (threshold: 50% HP) |
| **Average** | 41-60 | ±25% error ("~10-12m") | Wound state name (bloodied, wounded, critical) |
| **Good** | 61-80 | ±10% error ("10.5-11.5m") | Wound state + approximate HP ("~60%") |
| **Excellent** | 81+ | Exact distance ("11.2m") | Exact HP values ("72/100 HP") |

### Implementation Notes

- Distance error is randomized within the range (seeded per unit pair for consistency)
- "Close" = within 10m, "Far" = beyond 10m
- Wound states already exist in codebase: healthy, bloodied, wounded, critical, down

## Unit Perception Values

### Player Units

| Unit | Perception | Tier | Rationale |
|------|------------|------|-----------|
| Scout | 70 | Good | Specialist role |
| Archer | 55 | Average | Judges distance for shots |
| Crossbowman | 50 | Average | Similar to archer |
| Veteran | 55 | Average | Experience aids awareness |
| Knight | 50 | Average | Trained, but helm limits vision |
| Warrior | 45 | Average | Competent soldier |
| Healer | 50 | Average | Observant for patient care |
| Militia | 35 | Low | Untrained |

### Enemy Units

| Unit | Perception | Tier | Rationale |
|------|------------|------|-----------|
| Goblin | 40 | Low | Cunning but undisciplined |
| Orc Warrior | 35 | Low | Brute force focus |
| Orc Archer | 40 | Low | Needs some awareness |
| Orc Brute | 25 | Poor | All muscle |
| Troll | 20 | Poor | Dim-witted |

## UI Display Rules

### When a friendly unit is selected
- Hovering over enemies shows info filtered through the selected unit's perception
- Distance and condition displays use that unit's perception tier

### When no friendly unit is selected
- Player has "god view" - exact distances and full HP values shown
- Reduces frustration while rewarding tactical unit selection

### Display Format Examples

| Perception | Distance Display | Condition Display |
|------------|------------------|-------------------|
| Poor (Troll) | "Far" | — |
| Low (Militia) | "~8-12m" | "Hurt" |
| Average (Warrior) | "~10-12m" | "Wounded" |
| Good (Scout) | "10.5-11.5m" | "Wounded (~40%)" |
| God view | "11.2m" | "42/100 HP" |

### Where This Appears
- Unit info tooltip/panel when hovering enemies
- Targeting UI when issuing attack commands

## Implementation Scope

### Files to Modify

1. **src/engine/components/index.ts**
   - Add `perception: number` to `SkillsComponent`

2. **src/engine/data/UnitTemplates.ts**
   - Add `perception` to each unit's `skills` object

3. **New file: src/ui/PerceptionHelpers.ts**
   - `getPerceptionTier(perception: number): PerceptionTier`
   - `formatDistance(actualDistance: number, perception: number, seed: number): string`
   - `formatEnemyCondition(health: HealthComponent, perception: number): string`

4. **UI integration** (existing UI files)
   - Update enemy info display to use perception helpers
   - Pass selected unit's perception (or null for god view)

### Not in Scope (Future Work)
- Fog of war / line of sight
- Perception skill rolls
- Perception affecting combat mechanics
