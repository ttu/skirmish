# Environment Variety Design

**Date**: 2026-02-20
**Status**: Draft

## Overview

Add visual and gameplay variety to the map environment: multiple tree types with gameplay differences, house size/style variants, a new stone wall obstacle type, and brooks (passable streams that slow movement).

## New Obstacle Types

### Updated `ObstacleType`

```typescript
export type ObstacleType =
  | "tree" | "tree_oak" | "tree_pine" | "tree_willow"
  | "house" | "house_cottage" | "house_stone" | "house_hall"
  | "rock" | "stone_wall"
  | "river" | "brook" | "bridge"
  | "fence";
```

The old `"tree"` normalizes to `"tree_oak"` and old `"house"` normalizes to `"house_stone"` for backward compatibility.

### Updated `ObstacleData`

```typescript
export interface ObstacleData {
  type: ObstacleType;
  position: { x: number; z: number };
  rotation?: number;
  scale?: number;
  length?: number;  // For stone_wall and brook (default: 4 and 6 respectively)
}
```

## Tree Variants

Three tree types with distinct visuals and gameplay properties.

| Type | Visual | Collision Radius | Gameplay |
|------|--------|-----------------|----------|
| `tree_oak` | Round canopy (sphere), thick trunk, dark green | 0.7 × scale | Large — blocks movement and ranged attacks |
| `tree_pine` | Tall cone (existing style), thin trunk, forest green | 0.4 × scale | Narrow — blocks movement, partial ranged cover |
| `tree_willow` | Wide drooping canopy (inverted cone + sphere), yellow-green | 1.0 × scale | Wide area, can slow units passing near it |

### Visual Construction

**tree_oak:**
- Thick trunk: CylinderGeometry(0.2, 0.25, 1.0) — color `0x6B4226`
- Round canopy: SphereGeometry(1.0, 8, 6) — color `0x2D5A1E`, squashed vertically (scaleY: 0.7)
- Optional: second smaller sphere offset for asymmetry

**tree_pine:**
- Thin trunk: CylinderGeometry(0.12, 0.18, 1.2) — color `0x8B4513` (existing style)
- Layered cones (existing): ConeGeometry(0.8, 2.0) + ConeGeometry(0.6, 1.5) — color `0x228B22`
- This is essentially the current tree, kept as-is

**tree_willow:**
- Medium trunk: CylinderGeometry(0.18, 0.22, 0.9) — color `0x7B6B3A`
- Wide canopy: SphereGeometry(1.2, 8, 6) — color `0x6B8E23`, squashed (scaleY: 0.5)
- Drooping branches: 6-8 thin CylinderGeometry hanging from canopy edges — color `0x556B2F`

## House Variants

Three house types with different sizes and visual styles.

| Type | Visual | Collision Radius | Notes |
|------|--------|-----------------|-------|
| `house_cottage` | Small, thatched roof (yellow-brown), no chimney | 1.0 × scale | Compact footprint |
| `house_stone` | Medium, grey stone walls, slate roof (dark grey), chimney | 1.5 × scale | Current house size |
| `house_hall` | Large, timber frame (brown beams on cream walls), steep red roof | 2.2 × scale | Imposing building |

### Visual Construction

**house_cottage:**
- Small base: BoxGeometry(1.4, 1.0, 1.4) — color `0xD2B48C` (tan)
- Thatched roof: ConeGeometry(1.2, 0.8, 4) — color `0xBDB76B` (dark khaki), rotated 45°
- Small door: BoxGeometry(0.3, 0.6, 0.1) — color `0x654321`

**house_stone:**
- Medium base: BoxGeometry(2.0, 1.5, 2.0) — color `0xA0A0A0` (grey stone)
- Slate roof: ConeGeometry(1.6, 1.0, 4) — color `0x505050` (dark grey), rotated 45°
- Door: BoxGeometry(0.4, 0.8, 0.1) — color `0x654321`
- Chimney: BoxGeometry(0.3, 0.8, 0.3) — color `0x696969`, offset to one corner, positioned on roof

**house_hall:**
- Large base: BoxGeometry(3.0, 2.0, 2.5) — color `0xFFF8DC` (cornsilk/cream)
- Timber beams: 4 vertical BoxGeometry strips on walls — color `0x654321`
- Steep roof: ConeGeometry(2.2, 1.5, 4) — color `0x8B0000` (dark red), rotated 45°
- Double door: BoxGeometry(0.6, 1.0, 0.1) — color `0x654321`

## Stone Wall (`stone_wall`)

A long, low dry-stone wall made of stacked irregular stones — typical rural field boundary.

### Properties
- **Length**: Configurable via `length` property (default: 4 units, range: 2-10+)
- **Height**: ~0.6 units — low enough to see over from top-down, blocks ground movement
- **Collision**: Rectangular AABB based on length and width (~0.5 units), respects rotation
- **Gameplay**: Impassable. Provides cover for adjacent units.

### Visual Construction
- Generate 2-3 rows of random-sized `BoxGeometry` stones
- Stone sizes: width 0.3-0.6, height 0.15-0.3, depth 0.3-0.5
- Colors: Mix of `0x808080`, `0x909090`, `0x707060` (grey/brown tones)
- Slight random position offsets (±0.05) for natural irregular look
- Stones placed along the length with slight gaps

### Collision
```typescript
// Rectangular collision check (AABB in local space)
const halfLength = (this.length / 2);
const halfWidth = 0.4;
// Transform point to local space using rotation, check bounds
```

## Brook (`brook`)

A narrow animated stream — passable but slows movement.

### Properties
- **Width**: ~1 unit (vs river's ~3 units)
- **Length**: Configurable via `length` property (default: 6 units)
- **Collision**: Passable — `isPassable = true`
- **Gameplay**: Units overlapping a brook move at **50% speed**

### Visual Construction
- Thin bezier-curved water shape (same approach as river, scaled down)
- Shader: Same flow shader as river but lighter blue tones and faster ripple frequency
  - Base: `vec3(0.25, 0.50, 0.90)` — lighter blue
  - Ripple speed: `uTime * 2.5` (faster than river's 1.5)
- Small pebbles along banks: 4-6 tiny DodecahedronGeometry (radius 0.08-0.12) in brown/grey
- Thin bank edges: ~0.15 unit wide strips — color `0x8B7355`

### Speed Penalty System

New method on `Obstacle`:
```typescript
getSpeedMultiplier(x: number, z: number, radius: number): number {
  if (this.type !== "brook") return 1.0;
  // Check if point overlaps brook area (similar to river collision but returns multiplier)
  return overlaps ? 0.5 : 1.0;
}
```

The movement system queries all obstacles for speed multipliers and applies the minimum value.

## Scenario Updates

Update all 6 scenarios with environmental variety.

### Quick Skirmish (20×20)
- Replace trees with 1 oak + 1 pine
- Add a small brook running diagonally across one corner

### The Duel (15×15)
- Replace trees with pine variants
- Add a short stone wall for tactical cover near center

### Tutorial (30×30)
- Mix tree types: 2 oak, 2 pine, 1 willow
- Upgrade house to `house_cottage`
- Add a stone wall near the player spawn area

### Forest Ambush (40×40)
- Heavy mix: 6 pine, 4 oak, 2 willow
- Add a brook running through the forest (north-south)
- Add willows near the brook

### Orc Patrol (40×40)
- Village variety: 1 `house_cottage`, 2 `house_stone`, 1 `house_hall`
- Add stone walls between/around buildings
- Add a brook running through the village
- Mix tree types in surrounding areas

### Troll Bridge (50×30)
- Add brook feeding into the river from the east
- Add willows along river/brook banks
- Add stone walls near the existing house
- Mix tree types on both sides

## Implementation Notes

### Files to Modify
1. **`src/entities/Obstacle.ts`** — Add new types, creation methods, speed multiplier, backward compat normalization
2. **`src/types/index.ts`** — Update `ObstacleType` if defined there, add `length` to obstacle data
3. **`src/data/scenarios.ts`** — Update all scenarios with new variety
4. **`src/engine/systems/MovementSystem.ts`** — Check brook speed penalties during movement

### Backward Compatibility
- `"tree"` → normalized to `"tree_oak"` in constructor
- `"house"` → normalized to `"house_stone"` in constructor
- All existing scenario data continues to work without changes

### Performance Considerations
- Stone wall generation uses seeded randomness (based on position) so walls look consistent across frames
- Brook shader reuses river shader pattern — no additional shader compilation
- New obstacle types use same primitive geometry approach — no texture loading needed
