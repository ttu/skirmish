# Dice Roll Sidebar Design

## Overview

A dedicated sidebar panel showing visual probability bars for combat dice rolls, letting players see exactly what was needed to hit, block, dodge, etc.

## Placement & Layout

- Right side of screen, ~280px wide, fixed position
- Opposite the combat log (left side)
- Shows only the latest combat exchange, replaced on each new attack
- Empty state: crossed-swords icon + "No combat this turn" in muted text

## Exchange Structure

Each combat exchange displays up to 4 sections, shown conditionally:

```
┌─── COMBAT ROLL ──────────────┐
│  ⚔ Warrior → Goblin          │
│                               │
│  ATTACK (Melee: 55%)          │
│  [████████████░░░░░░░░]       │
│           ▲ 42   ✅ HIT       │
│  base 50 + flanking 10 - wound 5│
│                               │
│  DEFENSE (Block: 25%)         │
│  [█████░░░░░░░░░░░░░░░]       │
│                     ▲ 78  ❌   │
│  base 25                      │
│                               │
│  LOCATION: Arms               │
│  [hd|torso|##arms##|legs|wpn] │
│  roll 47                      │
│                               │
│  DAMAGE                       │
│  Raw: 9  Armor: 2  Final: 7  │
└───────────────────────────────┘
```

### Section 1: Header

- "Attacker → Target" with faction colors (blue for player, red for enemy)
- Appears instantly when `AttackDeclared` event fires

### Section 2: Attack Roll

- Label: "ATTACK (Melee/Ranged: X%)"
- Probability bar filled to effective skill threshold
- Die marker (▼) positioned at the roll value
- Marker colored green (success) or red (failure)
- Pass/fail label: "HIT" or "MISS"
- Modifier breakdown below: "base 50 + flanking 10 - wound 5"
- Only section shown if attack misses (no defense/location/damage)

### Section 3: Defense Roll

- Label: "DEFENSE (Block/Dodge/Parry: X%)"
- Same probability bar format as attack
- Pass/fail label: "BLOCKED"/"DODGED"/"PARRIED" or "FAIL"
- Modifier breakdown below
- Skipped if attack missed
- If defense succeeds, no location/damage sections shown

### Section 4: Hit Location

- Segmented bar showing 5 zones with proportional widths:
  - Head: 15% (rolls 1-15)
  - Torso: 20% (rolls 16-35)
  - Arms: 20% (rolls 36-55)
  - Legs: 25% (rolls 56-80)
  - Weapon: 20% (rolls 81-100)
- Hit zone highlighted in gold, others dim
- Roll number shown below
- Skipped if attack missed or defense succeeded

### Section 5: Damage

- Raw damage, armor absorbed, final damage
- Final numbers only (no dice formula)
- Skipped if attack missed or defense succeeded

## Animation & Timing

- Sections appear **sequentially** with ~0.5s animated reveals
- Attack bar: fills to threshold, then marker drops onto roll position, result fades in
- Defense bar: same animation pattern
- Location: zone highlights
- Damage: fades in
- **Total duration**: ~2.5s full exchange, ~1s for misses, ~1.5s for successful defenses
- **Click sidebar** to skip animation and show final state instantly
- **New exchange arriving** instantly completes current animation before starting

## Visual Design

### Probability Bar

- Horizontal strip ~240px wide, ~16px tall
- Filled portion: faction color (muted blue-green for player, muted red for enemy)
- Unfilled portion: dark gray
- Threshold line at pass/fail boundary with skill % label
- Die marker: inverted triangle (▼) above bar with roll number

### Location Strip

- Segmented horizontal bar with proportional zone widths
- Hit zone: gold highlight
- Other zones: dim/muted

### Color & Typography

- Dark panel background (`--bg-darker`) matching existing theme
- Monospace font for numbers/rolls (consistent with PrintedMaterial aesthetic)
- Sans-serif for labels
- Green markers for successful rolls, red for failures
- Gold for hit location highlight

## Data Flow

Event-driven, consuming existing `GameEvent` bus. No engine changes needed.

### Events consumed (in order):

1. `AttackDeclared` — sets header (attacker name, target name)
2. `AttackRolled` — triggers attack bar (`roll`, `baseSkill`, `modifiers[]`, `effectiveSkill`, `hit`)
3. `DefenseRolled` — triggers defense bar (`defenseType`, `roll`, `baseSkill`, `modifiers[]`, `effectiveSkill`, `success`). Skipped if attack missed.
4. `DamageDealt` — triggers location + damage (`damage`, `location`, `rawDamage`, `armorAbsorbed`). Skipped if defense succeeded.

## Integration

- New file: `src/ui/DiceRollSidebar.ts`
- Instantiated in `src/game/TurnBasedGame.ts` alongside `CombatLogUI` and `FloatingCombatText`
- Subscribes to same event bus
- HTML/CSS panel appended to document body
