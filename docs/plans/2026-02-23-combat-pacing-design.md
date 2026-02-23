# Combat Pacing Rework — Design Document

**Date**: 2026-02-23
**Goal**: Slow-paced combat where every action matters. Armor is powerful but exhausting, unarmored areas are extremely vulnerable, and stamina management is critical.

---

## 1. Armor Classification & Defense Restrictions

Each unit's armor is classified by **total armor value** (sum of head + torso + arms + legs):

| Class | Total Armor | Dodge Modifier |
|-------|------------|----------------|
| Unarmored | 0–4 | Full dodge (no penalty) |
| Light | 5–8 | Dodge at -15 |
| Medium | 9–14 | Dodge at -30 |
| Heavy | 15+ | **Cannot dodge** |

### Defense Type Selection

- **Unarmored/Light units** prefer dodge (complete avoidance), falling back to parry if dodge skill is very low.
- **Medium units** can dodge but at significant penalty; prefer block (shield) or parry.
- **Heavy units** cannot dodge at all; must block (shield) or parry (weapon).

### Examples with Current Templates

| Unit | Armor Total | Class | Dodge |
|------|------------|-------|-------|
| Goblin | 1 | Unarmored | Full |
| Archer | 5 | Light | -15 |
| Militia | 5 | Light | -15 |
| Healer | 1 | Unarmored | Full |
| Scout | 5 | Light | -15 |
| Warrior | 14 | Medium | -30 |
| Veteran | 14 | Medium | -30 |
| Knight | 24 | Heavy | Cannot |
| Orc Warrior | 10 | Medium | -30 |
| Orc Brute | 9 | Medium | -30 |
| Troll | 18 | Heavy | Cannot |

---

## 2. Armor Deflection & Stamina Drain

When a hit lands on an armored location:

1. Calculate **raw damage** from weapon dice roll
2. **Armor absorbs** up to its value (as today): `absorbed = min(armor, rawDamage)`
3. **Stamina drain** from impact: `drain = ceil(absorbed / 2)`
4. **Remaining damage** passes through to HP: `finalDamage = max(0, rawDamage - armor)`

### Key Properties

- Fully absorbed hits (0 HP damage) still cost stamina
- Heavier blows drain more stamina through armor
- Armor piercing reduces effective armor before this calculation
- Stamina drain happens **regardless of defense roll outcome** — if the attack hit and the defense failed, you take the impact

### Example

Knight (torso armor 8) hit by Great Axe (2d8+4, average 13):
- Raw damage: 13
- Absorbed: 8 (armor)
- Stamina drain: ceil(8/2) = 4
- HP damage: 13 - 8 = 5
- Plus wound check on the 5 remaining damage

Knight hit by Rusty Knife (1d4, average 2.5):
- Raw damage: 3
- Absorbed: 3 (armor absorbs all)
- Stamina drain: ceil(3/2) = 2
- HP damage: 0
- No wound, but still tires the knight

---

## 3. Critical Wound Table (Unarmored Hits)

When a hit lands on a location with **0 effective armor** (base armor is 0, or armor was fully penetrated by armor-piercing), the hit triggers a **critical wound roll** instead of the normal threshold-based wound system.

### Critical Wound Roll

Roll D100 against damage tier:

| D100 Roll | Light (1–4 dmg) | Medium (5–8 dmg) | Heavy (9+ dmg) |
|-----------|-----------------|-------------------|-----------------|
| 01–30 | Minor wound | Moderate wound | **Severe wound** |
| 31–60 | Minor wound | Minor wound | Moderate wound |
| 61–80 | No wound | Minor wound | Minor wound |
| 81–100 | No wound | No wound | Minor wound |

### Key Properties

- Heavy hits on unarmored flesh have 30% chance of severe wounds
- Even light hits have 60% chance of causing at least a minor wound
- Heavy hits **always** cause at least a minor wound (no "no wound" result)
- The existing wound effect table (arms: skill penalty, legs: movement, torso: bleeding) applies based on severity

### Armored Locations

Locations with armor > 0 that still take penetrating damage use the **existing threshold system** (wound threshold = 2x armor, excess determines severity). This rewards having even light armor.

---

## 4. Stamina-Based Defense Degradation

As stamina drops, all defense skills (block, dodge, parry) suffer penalties:

| Stamina % of Max | Defense Penalty |
|------------------|----------------|
| 75–100% | 0 (fresh) |
| 50–74% | -10 |
| 25–49% | -20 |
| 1–24% | -30 |
| 0 (exhausted) | -40 |

### The Attrition Feedback Loop

1. Heavy armor unit takes hits → armor absorbs → stamina drains
2. Stamina drops → defense penalty increases → more attacks get through
3. More hits land → more stamina drain + HP damage
4. Unit becomes exhausted → -40 defense → nearly every attack hits
5. Any hit on an unarmored gap → critical wound table → devastating

This creates the slow, grinding combat the design wants. Fights are wars of attrition where stamina management is as important as HP.

---

## 5. Stamina Rebalancing

### Doubled Stamina Pools

All unit stamina values are doubled to account for the new drain mechanic:

| Unit | Old Stamina | New Stamina |
|------|------------|------------|
| Militia | 10 | 20 |
| Warrior | 10 | 20 |
| Veteran | 12 | 24 |
| Knight | 10 | 20 |
| Archer | 10 | 20 |
| Crossbowman | 10 | 20 |
| Healer | 8 | 16 |
| Scout | 12 | 24 |
| Goblin | 8 | 16 |
| Orc Warrior | 12 | 24 |
| Orc Archer | 10 | 20 |
| Orc Brute | 15 | 30 |
| Troll | 20 | 40 |

### Conditional Recovery

- **Unhit turn**: Recover 3 stamina per turn (unit took no damage this turn)
- **Hit turn**: Recover 1 stamina per turn (unit was hit at least once)

This encourages tactical retreats and rotation of frontline fighters. A knight that falls back for a turn recovers 3 stamina instead of 1, creating natural breathing room in combat.

---

## 6. System Interaction Summary

### Unarmored Scout vs Orc Warrior

The scout relies on dodge (unarmored class, full dodge skill). At full stamina, dodge is very effective. But if the orc lands even one hit, the critical wound table triggers — 30%+ chance of moderate/severe wound. The scout needs to stay evasive or die fast.

### Knight vs Orc Brute

The knight can't dodge (heavy armor) but blocks with shield. Each great axe hit that gets through block drains ~4 stamina from armor absorption. After 5 absorbed hits, the knight is at 0 stamina, -40 defense penalty. The orc's attacks start landing consistently, and any hit on the knight's unarmored gaps (if any) triggers the critical table.

### Tactical Implications

- **Rotation**: Pull exhausted units back, let them recover stamina
- **Focus fire**: Drain a target's stamina, then pile on when defenses crumble
- **Armor gaps matter**: Even heavy armor has weak points (any 0-armor location)
- **Light units flank**: Use mobility to avoid attrition, strike at exhausted enemies
- **Shields critical**: Block doesn't drain stamina like armor absorption does

---

## 7. Implementation Changes

### Files to Modify

1. **`engine/components/index.ts`** — Add `armorClass` helper function, update `StaminaComponent` with `hitThisTurn` flag
2. **`engine/systems/CombatResolver.ts`** — Add critical wound table, armor class calculation
3. **`engine/systems/DamageSystem.ts`** — Add stamina drain on armor absorption
4. **`engine/systems/StaminaSystem.ts`** — Add defense penalty calculation, conditional recovery, stamina defense modifier
5. **`engine/systems/WoundEffectsSystem.ts`** — Integrate critical wound table for unarmored hits
6. **`engine/systems/TurnResolutionSystem.ts`** — Wire armor class dodge restriction into defense type selection, apply stamina defense penalty as modifier
7. **`engine/data/UnitTemplates.ts`** — Double all stamina values

### Files to Update Tests

All corresponding test files in `tests/engine/systems/` and `tests/integration/`.
