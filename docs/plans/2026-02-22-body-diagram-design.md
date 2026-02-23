# Unit Body Diagram - Design Document

## Overview

A visual body silhouette integrated into the unit selection panel showing armor values per body region, wound severity coloring, and active wound effect labels. Replaces the current text-only HP/armor display for both player and enemy units.

## Visual Design

### Silhouette

An inline SVG front-facing human outline divided into 4 zones matching existing `HitLocation` types:

- **Head** - circle/oval at top
- **Torso** - central rectangle
- **Arms** - combined left/right (matches single `arms` armor slot)
- **Legs** - combined left/right (matches single `legs` armor slot)

The 5th hit location ("weapon", rolls 81-100) has no body zone — weapon hits appear only in the combat log.

### Zone Coloring by Wound Severity

| State | Color |
|-------|-------|
| No wounds | Dimmed gray |
| Minor wound | Yellow |
| Moderate wound | Orange |
| Severe wound | Red |
| Down | Dark/black |

When multiple wounds affect the same region, the zone color reflects the **worst** severity.

### Armor Values

Small shield-icon + number overlaid on each region (e.g. "5" on torso for a Knight's chestplate).

### Wound Effect Labels

Small text labels adjacent to the affected zone:

- **Arms**: "-5 skill", "-15 skill", "-30 skill", or "No 2H" (severe)
- **Legs**: "-1 move", "½ move", "No run" (severe restricts move mode)
- **Torso**: blood-drop icon + "1/turn", "3/turn", or "5/turn" for bleeding

Cumulative penalties shown when multiple wounds stack (e.g. "-20 skill" for minor + moderate arm wounds).

### HP Bar

Thin bar beneath the silhouette showing current/max HP numerically. Retains existing functionality.

### Hover Tooltips

Each body zone shows a tooltip on hover with:
- Exact armor value
- List of individual wound effects with their penalties
- Damage absorbed this battle

## Enemy Units - Perception Filtering

When selecting an enemy, the same silhouette appears in the right panel (`#enemy-info-box`), filtered by the selected player unit's perception skill tier (from `PerceptionHelpers.ts`):

| Perception Tier | Armor Display | Wound Colors | Effect Labels |
|----------------|---------------|--------------|---------------|
| Excellent (70+) | Exact values | Accurate per-severity | Full detail |
| Good (55-69) | Ranges (e.g. "3-5") | Accurate | Visible |
| Average (40-54) | Relative ("Light"/"Medium"/"Heavy") | Reduced precision (minor+moderate both yellow) | Generic "wounded" marker only |
| Low (25-39) | Hidden | Binary: "hurt" (yellow) / "badly hurt" (red) | Hidden |
| Poor (<25) | Hidden | Fully grayed + "?" overlay | Hidden |

Perception tier is determined by the **currently selected player unit**, so switching units changes enemy detail level.

## Implementation

### Technology

Pure HTML/CSS inline SVG in the existing DOM-based selection panel. No canvas or Three.js needed.

### New File

**`src/ui/BodyDiagramUI.ts`**:
- `renderBodyDiagram(unit, world)` — returns HTML string with inline SVG for player units
- `renderEnemyBodyDiagram(unit, observer, world)` — perception-filtered version
- Helper functions: wound severity → color, wound effects → labels, perception tier → info level

### Integration Point

In `TurnBasedGame.ts` → `updateTurnBasedUI()`: replace the current HP/armor text block with a call to `renderBodyDiagram()`. AP, stamina, morale, weapon, and command queue sections remain unchanged below.

### SVG Template

Single reusable silhouette with `<path>` elements per zone, styled via CSS classes (`.zone-healthy`, `.zone-minor`, `.zone-moderate`, `.zone-severe`, `.zone-down`). Armor badges and wound labels as SVG `<text>` elements.

### Data Sources (all existing)

- `ArmorComponent` — armor values per location
- `WoundEffectsComponent` — wound effects per location
- `HealthComponent` — overall HP and wound state
- `SkillsComponent.perception` — enemy perception filtering

### Edge Cases

- **No wound effects but HP damaged**: zones stay gray, HP bar reflects damage (wound threshold not exceeded)
- **Multiple wounds stacking**: worst severity sets color, cumulative penalties shown, tooltip lists individual wounds
- **Unit down**: all zones go dark/black, wound labels remain visible
- **Weapon hit location**: no body zone, shown in combat log only

### Testing

- Unit tests for mapping logic (wound severity → color, perception tier → info level, wound effects → labels)
- SVG rendering tested manually
