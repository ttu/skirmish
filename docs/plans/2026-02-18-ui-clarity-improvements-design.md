# UI Clarity Improvements Design

## Problem Statement

The current game UI has three key clarity issues:
1. **Action clarity** - Hard to tell what action a unit is using
2. **AP cost transparency** - Why something costs 2 AP is unclear
3. **Combat status** - Difficult to know if unit is in combat or will charge

## Solution Overview

Expand the selection info panel with detailed command breakdowns, combat status badges, and enhanced visual indicators on the battlefield.

---

## Selection Panel Layout

The expanded selection panel has four sections:

```
┌─────────────────────────────────┐
│ Warrior #1                      │
├─────────────────────────────────┤
│ COMBAT STATUS                   │
│ [In Melee] [Will Charge]        │
├─────────────────────────────────┤
│ STATS                           │
│ HP      85/100 (bloodied)       │
│ AP      3/5 remaining           │
│ Stamina 8/10                    │
│ Morale  steady                  │
│ Weapon  Sword (melee, 2 AP)     │
├─────────────────────────────────┤
│ QUEUED COMMANDS (4 AP total)    │
│ ┌─────────────────────────────┐ │
│ │ 1. Move (advance)      2 AP │ │
│ │    → 3.2m toward enemy      │ │
│ │ 2. Attack Orc #1       2 AP │ │
│ │    → melee, sword           │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Clear Commands]                │
└─────────────────────────────────┘
```

### Combat Status Badges

| Badge | Color | Meaning |
|-------|-------|---------|
| In Melee | Red | Currently within engagement range (1.5m) of enemy |
| Will Charge | Orange | Has move + attack queued against same target |
| Engaged | Yellow | In melee range, leaving triggers free attack |
| Exhausted | Gray | 0 stamina, penalties active |

---

## Queued Commands Detail

Each command shows type, target, AP cost, and details. Hover reveals formula.

### Move Command

```
┌────────────────────────────────────┐
│ 1. Move (advance)             2 AP │
│    → 3.2m toward Orc #1            │
└────────────────────────────────────┘
```

**Tooltip:** "Advance = 2 AP for up to 50% speed (3.2m max)"

### Attack Command

```
┌────────────────────────────────────┐
│ 2. Attack Orc #1              2 AP │
│    → melee, sword                  │
└────────────────────────────────────┘
```

**Tooltip:** "Sword attack = 2 AP. Damage: 1d10+4"

### Defend Command

```
┌────────────────────────────────────┐
│ 1. Defend (block)             2 AP │
│    → +20% defense, +1 reaction     │
└────────────────────────────────────┘
```

**Tooltip:** "2 AP defense grants +20% to all defense rolls and one extra reaction"

### AP Cost Reference

| Action | AP Cost | Notes |
|--------|---------|-------|
| Walk | 1 | 25% speed |
| Advance | 2 | 50% speed |
| Run | 4 | 75% speed, 1 stamina |
| Sprint | All | 100% speed, 3 stamina |
| Attack | Weapon-based | Sword=2, Dagger=1, etc. |
| Defend | 1-3 | Scales with bonus |

---

## Visual Indicators on Battlefield

### Range Circles (around selected unit)

- **Green circle** - Current melee attack range (1.0m)
- **Yellow dashed circle** - Range after queued movement completes
- **Red tint on enemies** - Enemies attackable this turn (in range after moves)

### Movement Path Preview

- **Orange line** - Movement path from current position
- **Orange dot** - Destination marker
- **Small label on path** - Shows pace + AP cost (e.g., "Advance 2 AP")

### Attack Indicators

- **Red line** - From attack origin to target
- **Sword icon** - At midpoint of attack line
- **Multiple red lines** - If multiple attacks queued

### Engagement Warning

- **Red pulsing ring** - Around enemies that have you in their engagement zone
- **Warning icon** - On movement path if passing through enemy engagement zone

---

## Interactions

### Clear Commands

- **Clear Commands button** - Removes all queued commands, restores AP
- **Click ✕ on command** - Removes individual command

### Keyboard Shortcuts

- `Escape` - Clear all commands for selected unit
- `Backspace` - Remove last queued command

---

## Edge Cases

| Situation | UI Response |
|-----------|-------------|
| Target dies before turn resolves | Show "(target may be dead)" in gray |
| Not enough AP for full queue | Red warning: "3 AP queued, only 2 remaining" |
| Movement blocked by obstacle | Path shows shortened with "blocked" indicator |
| Unit exhausted | Stamina row shows red, commands that cost stamina disabled |
| Enemy moves away | Attack shows "target may move" note |

---

## Enemy Info Box

When clicking an enemy, the right panel shows:
- Condition (healthy/hurt/wounded - no exact HP)
- Weapon type
- Whether they have commands queued ("Planning..." or "Ready")
- Distance from selected unit
- "In Range" / "Out of Range" badge

---

## Implementation Notes

### Files to Modify

- `src/game/TurnBasedGame.ts` - Main UI updates, panel rendering
- `src/ui/CombatLogUI.ts` - May need tooltip infrastructure

### New Files

- `src/ui/SelectionPanelUI.ts` - Extract panel logic for cleaner code
- `src/ui/CommandPreviewRenderer.ts` - 3D visual indicators

### Key Functions

- `renderQueuedCommands()` - Generate command list HTML
- `getCombatStatusBadges()` - Determine which badges to show
- `updateRangeIndicators()` - Update 3D circles/lines
- `getCommandTooltip()` - Generate hover text for command
