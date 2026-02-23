# Wound Effects System Design

## Overview

When weapons hit body locations with insufficient armor, they can cause **wound effects** — persistent debuffs that degrade a unit's combat ability, mobility, or cause bleeding. This makes armor meaningful beyond raw damage reduction: armor prevents crippling injuries.

## Trigger Mechanics

A wound effect roll is triggered when **final damage exceeds 2x the location's armor value**:

- Armor 0: any damage triggers (threshold 0)
- Armor 2: need 5+ final damage (threshold 4)
- Armor 5: need 11+ final damage (threshold 10)

**Severity** is determined by how much final damage exceeds the threshold:

| Excess over threshold | Severity |
|---|---|
| 1–3 | Minor |
| 4–7 | Moderate |
| 8+ | Severe |

Head and weapon hits do **not** trigger wound effects (head already has 3x multiplier + knockout; weapon hits have no body part).

## Location-Specific Effects

### Arms — affects combat ability

| Severity | Name | Effect |
|---|---|---|
| Minor | Grazed arm | -5% melee and ranged skills |
| Moderate | Wounded arm | -15% melee and ranged skills |
| Severe | Disabled arm | -30% melee/ranged, can't use two-handed weapons |

### Legs — affects mobility

| Severity | Name | Effect |
|---|---|---|
| Minor | Grazed leg | -1 base movement speed |
| Moderate | Wounded leg | Movement speed halved |
| Severe | Disabled leg | Can't sprint or run (walk/advance only) |

### Torso — causes bleeding

| Severity | Name | Effect |
|---|---|---|
| Minor | Shallow cut | -1 HP per turn |
| Moderate | Deep wound | -3 HP per turn |
| Severe | Gut wound | -5 HP per turn, -10% all skills |

## Stacking

Wound effects **stack** — multiple arm wounds each contribute their penalty. A unit with a minor arm wound (-5%) and a moderate arm wound (-15%) has a total -20% to melee/ranged skills.

## Persistence

Wound effects persist until the unit goes down. No healing/treatment mechanic in this iteration.

## Architecture

### New component: `WoundEffectsComponent`

```typescript
interface WoundEffect {
  location: 'arms' | 'legs' | 'torso';
  severity: 'minor' | 'moderate' | 'severe';
  skillPenalty: number;
  movementPenalty: number;
  bleedingPerTurn: number;
  disablesTwoHanded: boolean;
  restrictsMoveMode: boolean;
  halvesMovement: boolean;
}

interface WoundEffectsComponent extends Component {
  type: 'woundEffects';
  effects: WoundEffect[];
}
```

### New system: `WoundEffectsSystem`

Static methods following existing system patterns:
- `checkAndApplyWoundEffect()` — called after damage, checks threshold, adds effect
- `getSkillPenalty()` — total skill penalty from all wounds
- `getMovementPenalty()` — flat movement speed reduction
- `halvesMovement()` — any moderate+ leg wound
- `canUseTwoHanded()` — checks for severe arm wound
- `canSprint()` / `canRun()` — checks for severe leg wound
- `applyBleeding()` — end-of-turn HP loss

### New event: `WoundEffectApplied`

### Integration points

1. **TurnResolutionSystem.resolveAttackCommand** — call wound check after `DamageSystem.applyDamage`
2. **TurnResolutionSystem attack/defense modifiers** — add wound skill penalties
3. **TurnResolutionSystem.processEndOfTurn** — apply bleeding tick
4. **MovementSystem** — consult wound movement penalties

## Files

**Create:**
- `src/engine/systems/WoundEffectsSystem.ts`
- `tests/engine/systems/WoundEffectsSystem.test.ts`

**Modify:**
- `src/engine/components/index.ts` — add types
- `src/engine/types/index.ts` — add event type
- `src/engine/systems/TurnResolutionSystem.ts` — integrate
- `src/engine/systems/MovementSystem.ts` — integrate movement penalties
