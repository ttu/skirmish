# Architecture Audit: ECS/UI Separation & Three.js Best Practices

**Date**: 2026-02-24
**Status**: Audit complete — refactoring not yet started

## Summary

The engine layer (`src/engine/`) is **cleanly isolated** — zero Three.js, DOM, or external-layer imports. It could run headlessly today. However, the UI layer reaches directly into the ECS world, the game mediator is a 2,745-line god object, and Three.js resource management has significant gaps (no geometry reuse, missing disposal, memory leaks).

## Findings

### 1. Engine Layer — CLEAN

- Zero `three`/`THREE` imports in `src/engine/`
- Zero DOM API references (`document`, `window`, etc.)
- All imports are internal to the engine directory
- Engine EventBus is typed with `GameEvent`/`GameEventType`, used by 9 systems
- **Verdict**: Fully portable, no changes needed

### 2. UI Layer — 3 Files Violate Separation

#### CombatStatusHelpers.ts (HIGH)

- 10 `world.getComponent()` calls across 6 component types (lines 37-42, 64, 70, 77, 94)
- Reimplements charge-detection logic (lines 89-121): iterates command queue, simulates post-move position, calculates distances
- Calls `MovementSystem.calculateDistance()` (lines 79, 112-113) and reads `MovementSystem.ENGAGEMENT_RANGE` (line 82)
- **Fix**: Engine should expose `getCombatStatus(entityId)` returning a flat read-only status object

#### CommandFormatters.ts (HIGH)

- 4 `world.getComponent()` calls (lines 28, 82, 151-152) for identity, weapon, commandQueue, position
- Calls `MovementSystem.calculateDistance()` (line 52) and `MovementSystem.getMovementModeCost()` (line 54)
- **Fix**: Format functions should receive pre-extracted data, not a world reference

#### BodyDiagramUI.ts (MEDIUM)

- Imports `WorldImpl` concrete class (line 9), not an interface
- 6 `world.getComponent()` calls (lines 257-259, 292-294) for health, armor, woundEffects
- **Fix**: Accept `{ health, armor, wounds }` data objects instead of `(world, entityId)`

#### Clean UI examples (preserve as patterns)

- `CombatLogUI.ts` — event-driven via `subscribeToEvents()`
- `FloatingCombatText.ts` — event-driven via `handleEvent()`
- `DiceRollSidebar.ts` — consumes event data, never accesses World

### 3. Entities Layer — Dead Code & Mixed Concerns

#### Obstacle.ts (MEDIUM)

- `collidesWithPoint()` (lines 661-713): Full collision detection — **never called by any file**
- `getSpeedMultiplier()` (lines 716-729): Terrain speed modifier — **never called by any file**
- Both are dead code, disconnected from the engine's Pathfinder
- **Fix**: Delete dead code, or extract into engine-layer components

### 4. Game Layer — God Object

#### TurnBasedGame.ts (ARCHITECTURAL)

- **2,745 lines**, 41 import lines spanning every layer
- **88 `world.getComponent()` calls** throughout
- Mixes rendering, input handling, UI wiring, command building, scene management
- **Fix**: Decompose into:
  - `GameSceneManager` — Three.js scene setup, mesh lifecycle, camera
  - `CommandBuilder` — translates user input into engine commands
  - `UnitInfoProvider` (query facade) — wraps getComponent calls, returns typed view objects
  - `TurnBasedGame` (reduced) — orchestrates the above

### 5. EventBus — CLEAN

| Bus | Location | Event Type | Used By |
|-----|----------|-----------|---------|
| Engine | `engine/core/EventBus.ts` | Typed `GameEvent` | 9 engine systems + GameEngine |
| Utility | `utils/EventBus.ts` | Generic strings | TurnBasedGame, InputManager, Camera |

No file imports both. No confusion. No changes needed.

### 6. Three.js Resource Management — SIGNIFICANT GAPS

#### No geometry/material reuse

| File | Instances created | Reuse | dispose() calls |
|------|-------------------|-------|-----------------|
| `Obstacle.ts` | ~75+ (many in loops) | None | 0 |
| `UnitMeshBuilder.ts` | ~30+ per unit | None | 0 |
| `TurnBasedGame.ts` | ~55+ | Minimal | 6 (partial) |

#### Memory leak patterns

1. **Stone wall** (Obstacle.ts:360-378): `new BoxGeometry` + `new Material` per stone in nested loop (~20 pairs per wall)
2. **`clearScenario()`** (TurnBasedGame.ts:722-729): `scene.remove()` without `dispose()` — all unit and terrain geometries/materials leak on scenario reload
3. **Loop-created geometries**: Willow branches (6/tree), brook pebbles (6/brook), bridge planks (N/bridge), fence rails (N/fence) — all unique, never disposed

#### Recommended Three.js improvements

1. **Geometry/Material cache**: Shared geometry pools (e.g., one `CylinderGeometry(0.3, 0.3, 1)` for all pine trunks). Materials shared by type.
2. **Disposal on cleanup**: Add `dispose()` to `Obstacle` traversing mesh hierarchy. Call from `clearScenario()`.
3. **`clearScenario()` fix**: Traverse scene children, call `geometry.dispose()` + `material.dispose()` before `scene.remove()`.
4. **`InstancedMesh`** for repeated elements: Stone wall stones, fence rails, tree branches — use `THREE.InstancedMesh` for draw call reduction.

## Refactoring Priority

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| 1 | Fix `clearScenario()` disposal leak | Prevents memory leaks on replay | Low |
| 2 | Add `dispose()` to Obstacle + UnitMeshBuilder | Complete resource cleanup | Low |
| 3 | ~~Extract UI query facade (UnitInfoProvider)~~ | ~~Decouples 3 UI files from ECS~~ | ~~Medium~~ | **DONE** |
| 4 | ~~Move charge-detection out of CombatStatusHelpers~~ | ~~Eliminates duplicated engine logic~~ | ~~Medium~~ | **DONE** (moved to `game/CombatStatusQuery.ts`) |
| 5 | Geometry/material caching | Performance + memory | Medium |
| 6 | Delete dead code in Obstacle.ts | Code hygiene | Low |
| 7 | ~~Decompose TurnBasedGame.ts~~ | ~~Maintainability~~ | ~~High~~ | **DONE** (2,745 → 366 lines, 5 modules) |
| 8 | InstancedMesh for repeated elements | Draw call optimization | Medium |
