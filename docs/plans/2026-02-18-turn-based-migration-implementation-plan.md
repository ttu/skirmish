# Turn-Based Migration Implementation Plan

> Gap analysis and implementation plan for migrating from real-time to turn-based combat per the design doc.

**Status: ✅ MIGRATION COMPLETE** (all tasks implemented)

**Reference:** [2026-02-18-turn-based-rpg-combat-design.md](./2026-02-18-turn-based-rpg-combat-design.md)

---

## 1. Migration Checklist vs Design Doc

### What the migration section lists (lines 444–452)

| Item | Status | Notes |
|------|--------|------|
| Remove real-time update loop for combat | ✅ | Real-time removed; `TurnBasedGame` only |
| Add planning phase UI | ✅ | Click unit, click ground/enemy to queue move/attack; Resolve button |
| Implement turn resolution system | ✅ | `GameEngine.resolvePhase()` calls `TurnResolutionSystem.resolveTurn()` |
| Add D100 dice system | ✅ | `DiceRoller` with D100 implemented |
| Replace simple damage with location-based | ✅ | `CombatResolver` does D100, location roll, armor per location |
| Add AP tracking per unit | ✅ | `ActionPointsComponent` implemented |
| Implement command queue system | ✅ | `CommandQueueComponent`, `queueCommand`, `clearCommands` |

### What the design doc defines beyond the checklist

| System | Status | Notes |
|--------|--------|------|
| Defensive reactions (parry/block/dodge, one free per turn) | ✅ | AI chooses block/parry/dodge; one free reaction per turn enforced “one reaction per turn” limit |
| Facing & positioning (front/side/rear, flanking) | ✅ | `getAttackArc`; side +10%, rear +20%; flanking bonus |
| Stamina & fatigue | ✅ | `StaminaSystem`, `StaminaComponent` |
| Ammunition | ✅ | `AmmoSystem`, `AmmoComponent` |
| Morale | ✅ | `MoraleSystem`, morale checks, shaken/broken/routed |
| Wound states | ✅ | `HealthComponent.woundState`, `calculateWoundState` |
| Initiative by weapon speed | ✅ | `priority` derived from `weapon.speed` for attacks |
| Conditional commands | ✅ | `condition` on BaseCommand; inRange, targetDead, hpBelow, enemyApproaches (“When in range: Attack”) |
| Order persistence between turns | ✅ | Unexecuted commands carry over; removeExecutedCommand only removes executed |
| Command preview | ✅ | Movement paths (yellow) and attack lines (red) during planning phase |
| Combat log UI | ✅ | `CombatLogUI` shows rolls and combat events |
| Scenario loading into engine | ✅ | `ScenarioLoader` loads scenarios into engine World |
| Snapshot/save/replay UI | ✅ | Save/Load buttons; Replay UI with step-through event log |
| Engagement zones (disengage, provoke) | ✅ | Disengage 2 AP; sprint provokes +20% from each engaged enemy |
| Height/terrain advantage | ✅ | PositionComponent.elevation; +10% hit/defense, +1 damage from height |

---

## 2. High-Level Implementation Phases

### Phase A: Wire Engine and Disable Real-Time Combat (Foundation)

1. Invoke turn resolution from `GameEngine.resolvePhase()`.
2. Add scenario loader to populate engine `World` from scenario data.
3. Add entry point or mode to run turn-based engine instead of `Game.ts`.
4. Remove or gate real-time combat update when in turn-based mode.

### Phase B: Planning Phase UI

1. Build `CommandUI` for planning phase (click unit, click target/ground, choose action).
2. Wire input to `TurnResolutionSystem.queueCommand()`.
3. Add “End Turn” / “Resolve” control.
4. Show AP remaining and command queue per unit.

### Phase C: Combat Log and Dice Visibility

1. Add `CombatLogUI` that subscribes to `EventBus`.
2. Show attack rolls, defense rolls, hit location, damage breakdown.
3. Optional: short animation / highlighting for each roll.

### Phase D: Combat System Gaps

1. Defender reaction choice: let defender choose parry/block/dodge when attacked (or AI choose).
2. One free reaction per turn: track reactions used, enforce limit.
3. Multiple attackers: defender chooses which attack to react to; others hit unopposed.
4. Facing: compute side/rear bonuses from attacker position vs defender facing.
5. Weapon speed: derive `priority` from `weapon.speed` for initiative.

### Phase E: Command and Engagement Refinements

1. Conditional commands: extend `UnitCommand` with optional `condition` field.
2. Order persistence: do not clear queues; carry over incomplete commands to next turn.
3. Command preview: project movement path and attack arcs before resolving.
4. Engagement: implement disengage (2 AP) and provoke-on-sprint.

### Phase F: Save/Load/Replay and Polish

1. Save/load UI using `createSnapshot`/`loadSnapshot`.
2. Replay UI for deterministic playback.
3. Optional: height/terrain and terrain-based modifiers.

---

## 3. Task Breakdown

### A1: Invoke Turn Resolution in GameEngine

**Goal:** `resolvePhase()` actually runs a full turn.

**Tasks:**
1. Add `TurnResolutionSystem.resolveTurn(world, eventBus, roller, turn)` to `GameEngine.resolvePhase()`.
2. After resolution, call `endTurn()` (or equivalent) to advance turn and reset phase.
3. Ensure `resolvePhase()` is invoked when the player confirms “Resolve” in the UI.

**Files:** `src/engine/core/GameEngine.ts`

**Tests:** Extend `GameEngine.test.ts` so that `resolvePhase()` runs systems and updates world state as expected.

---

### A2: Scenario Loader for Engine

**Goal:** Load a scenario into the engine `World` with units, obstacles, and victory conditions.

**Tasks:**
1. Add `loadScenario(scenarioId: string)` (or load from scenario data) in `GameEngine`.
2. Use `UnitFactory` to create entities from scenario unit definitions.
3. Create obstacle/terrain entities if needed (or map to existing components).
4. Store scenario metadata (victory conditions, map size) for `VictorySystem` and UI.

**Files:** `src/engine/core/GameEngine.ts`, `src/engine/data/` (e.g. `ScenarioLoader.ts`), align with `src/data/scenarios.ts`.

**Tests:** Integration test: load scenario → correct entities and components in world.

---

### A3: Entry Point for Turn-Based Mode

**Goal:** Run the turn-based engine instead of (or alongside) the real-time game.

**Tasks:**
1. Add a mode flag or route (e.g. `?mode=turnbased` or menu choice).
2. When turn-based: boot `GameEngine`, load scenario, show planning UI.
3. When turn-based: do **not** run `Game.ts` update loop for combat; only run render/UI updates.
4. Optional: keep `Game.ts` for rendering and feed it snapshots from the engine.

**Files:** `main.ts`, `src/game/Game.ts`, or a new `src/App.ts` that switches modes.

**Tests:** Manual or E2E: select turn-based mode, confirm no real-time combat progression.

---

### A4: Disable Real-Time Combat Loop

**Goal:** When in turn-based mode, combat and unit updates only occur during resolution.

**Tasks:**
1. Gate `update()` logic: if turn-based, skip `unit.update()`, `aiController.update()`, projectile/combat updates for the old system.
2. Or: create a `TurnBasedGame` class that uses `GameEngine` and only advances on “Resolve”.

**Files:** `src/game/Game.ts`, `main.ts` (or new entry point)

---

### B1: CommandUI – Planning Phase Interface

**Goal:** During planning, player assigns commands to units via a dedicated UI.

**Tasks:**
1. Add `CommandUI` component: unit panel, action buttons (Move, Attack, Defend, etc.), target selection.
2. On click (ground): offer Move with speed mode.
3. On click (enemy): offer Attack (melee/ranged if applicable).
4. Show AP cost and remaining AP.
5. Call `TurnResolutionSystem.queueCommand(world, entityId, command)` on confirm.
6. Show queued commands and allow removal.

**Files:** `src/ui/CommandUI.ts`, integrate with `UIManager`.

**Tests:** UI tests or manual: queue a move and attack, confirm they appear and costs are correct.

---

### B2: End Turn / Resolve Button

**Goal:** Single action to end planning and run resolution.

**Tasks:**
1. Add “Resolve” or “End Turn” button in planning phase.
2. On click: `gameEngine.endPlanningPhase()` then `gameEngine.resolvePhase()`.
3. After resolution, show results; optionally auto-advance to next planning phase or require another click.
4. Disable the button or show “Planning…” during resolution.

**Files:** `CommandUI` or `UIManager`, `main.ts` or `Game.ts` (or `TurnBasedGame`).

---

### B3: AP Display and Queue Preview

**Goal:** Player sees AP and planned actions for selected unit(s).

**Tasks:**
1. Subscribe to engine state or pass `World` + selected entity IDs to UI.
2. Display `ActionPointsComponent.current` and `max`.
3. Display `CommandQueueComponent.commands` as a list.
4. Update when commands are queued or removed.

**Files:** `CommandUI`, `UIManager`, `HUD` or equivalent.

---

### C1: CombatLogUI

**Goal:** Show dice rolls and combat events in real time.

**Tasks:**
1. Add `CombatLogUI` that subscribes to `EventBus` for combat-related events.
2. Support events: `AttackDeclared`, `AttackRolled`, `DefenseRolled`, `HitLocationRolled`, `DamageDealt`, `UnitDown`, etc.
3. Format: e.g. “Attacker rolled 42 vs 55 → Hit. Defender rolled 68 vs 40 → Failed. Location: torso. Damage: 5.”
4. Optional: scrollable log, color by success/failure, link to entity names.

**Files:** `src/ui/CombatLogUI.ts`, wire into `UIManager` or layout.

**Tests:** Unit test: given mock events, log renders correct text.

---

### D1: Defender Reaction Choice

**Goal:** Defender chooses parry/block/dodge (or AI chooses) instead of always blocking.

**Tasks:**
1. Extend combat resolution: after attack roll hits, ask defender (or AI) for reaction type.
2. Use `CombatResolver.resolveDefenseRoll(defenseType, skill, modifiers, roller)` with that choice.
3. AI: simple policy (e.g. use block if shield, else dodge; parry only for melee).
4. Player: add reaction UI or default (e.g. “best” option based on skills/situation).

**Files:** `TurnResolutionSystem.ts`, `AICommandSystem.ts`, `CombatResolver.ts`, optional reaction UI.

**Tests:** CombatResolver tests for each defense type; integration test: attack with different defender choices.

---

### D2: One Free Reaction Per Turn

**Goal:** Each unit gets at most one free reaction per turn.

**Tasks:**
1. Add `reactionsUsedThisTurn: number` (or similar) to a component or turn context.
2. When resolving attacks, only allow a reaction if `reactionsUsedThisTurn < 1` (or configured limit).
3. Increment when a reaction is used.
4. Reset at start of each turn.

**Files:** New component or extend `MoraleStateComponent` / turn context, `TurnResolutionSystem.ts`.

**Tests:** Multiple attacks on one defender; only first gets a reaction.

---

### D3: Multiple Attackers – One Reaction

**Goal:** Defender picks which attack to react to; others hit unopposed.

**Tasks:**
1. Collect all attacks against a defender before resolving.
2. If more than one, defender (or AI) selects one to react to.
3. Resolve that attack with reaction; resolve others without reaction.
4. Apply damage for all hits.

**Files:** `TurnResolutionSystem.ts`, `CombatResolver.ts`, `AICommandSystem.ts`.

**Tests:** Three attackers vs one defender; defender reacts to one; other two hit.

---

### D4: Facing (Side/Rear Bonuses)

**Goal:** Attacks from side/rear get modifiers per the design.

**Tasks:**
1. Add helper: `getAttackArc(attackerPos, defenderPos, defenderFacing)` → `front` | `side` | `rear`.
2. Apply modifiers: side +10%, rear +20%, shield/parry rules.
3. Use in `TurnResolutionSystem` when building attack modifiers.

**Files:** `MovementSystem.ts` or new `PositionUtils.ts`, `TurnResolutionSystem.ts`.

**Tests:** Unit tests for arc calculation; combat test for modifier application.

---

### D5: Initiative from Weapon Speed

**Goal:** Within a turn, actions resolve by weapon speed (lower = first).

**Tasks:**
1. When collecting actions, derive `priority` from attacker’s weapon `speed` when the command is an attack.
2. For non-attacks, use a default priority or action-type priority.
3. Ensure `collectAndSortActions` uses this for ordering.

**Files:** `TurnResolutionSystem.ts`, `UnitCommand` / `AttackCommand`.

**Tests:** Two units with different weapon speeds; faster weapon resolves first.

---

### E1: Conditional Commands

**Goal:** Commands like “When in range: Attack” or “If target dies: Attack nearest”.

**Tasks:**
1. Extend `UnitCommand` (or `QueuedCommand`) with optional `condition?: CommandCondition`.
2. Add condition types: `inRange`, `targetDead`, `enemyApproaches`, `hpBelow`, etc.
3. During resolution (or start-of-turn planning), evaluate conditions; skip or replace commands as needed.
4. UI: add “When…” / “If…” options when queuing commands (can be Phase 2).

**Files:** `src/engine/components/index.ts` (CommandQueueComponent), `TurnResolutionSystem.ts`, `CommandUI`.

**Tests:** Conditional move-then-attack; attack-then-attack-nearest if target dies.

---

### E2: Order Persistence Between Turns

**Goal:** Unused commands remain for the next turn instead of being cleared.

**Tasks:**
1. Change resolution: do **not** call `clearCommands` for all entities.
2. Keep commands that were not executed (e.g. not enough AP, condition not met).
3. Reset AP and possibly adjust queue (e.g. remove spent commands, keep rest).
4. Add UI to modify or remove persisted commands.

**Files:** `TurnResolutionSystem.ts`, `CommandUI`.

**Tests:** Queue 3 commands, only 2 fit in AP; confirm 1 remains next turn.

---

### E3: Command Preview

**Goal:** Show projected movement paths and attack arcs before resolving.

**Tasks:**
1. During planning, for each queued move, compute path (or line) from current position to target.
2. Draw path/line in the scene (e.g. dashed line).
3. For attacks, show range/arc from attacker to target.
4. Clear preview when commands change or resolution starts.

**Files:** `CommandUI`, `ActionIndicatorManager` or similar, `SelectionManager`.

**Tests:** Manual: queue move, see path; queue attack, see arc.

---

### E4: Engagement – Disengage and Provoke

**Goal:** Leaving engagement costs 2 AP (disengage) or provokes a free attack when sprinting.

**Tasks:**
1. When moving out of engagement, check if unit disengages (2 AP) or sprints.
2. If sprint: provoke free attack from each engaged enemy at +20%.
3. If disengage: deduct 2 AP, allow normal move.
4. Fighting retreat (half speed, no provoke): implement if needed.

**Files:** `MovementSystem.ts`, `TurnResolutionSystem.ts`.

**Tests:** Unit in engagement; disengage moves safely; sprint provokes attacks.

---

### F1: Save/Load UI

**Goal:** Player can save and load game state.

**Tasks:**
1. Add Save/Load buttons (or shortcuts).
2. Save: `engine.createSnapshot()` → serialize → `localStorage` or download.
3. Load: read snapshot → `engine.loadSnapshot()` → refresh UI from world.

**Files:** `UIManager`, `GameEngine` integration.

**Tests:** Save, load, confirm world state matches.

---

### F2: Replay UI (Optional)

**Goal:** Replay a battle from recorded commands and initial snapshot.

**Tasks:**
1. Record commands per turn with snapshot.
2. Replay: load snapshot, replay commands, step through turns.
3. Optional: deterministic replay validation using same seed.

**Files:** New `ReplayManager`, UI for replay controls.

---

## 4. Implementation Status (2026-02-18)

**Completed:**
- A1: Turn resolution wired in GameEngine.resolvePhase()
- A2: ScenarioLoader loads scenarios into engine World
- A3: Entry point via ?mode=turnbased, menu link "Play Turn-Based Mode"
- A4: Turn-based mode uses TurnBasedGame (no real-time loop)
- B1-B3: CommandUI, Resolve button, AP/queue display
- C1: CombatLogUI
- D1-D5: Defender reaction choice, one free reaction, facing (side/rear), weapon speed initiative
- E1: Conditional commands (inRange, targetDead, hpBelow, enemyApproaches)
- E2: Order persistence between turns (unexecuted commands carry over)
- E3: Command preview (movement paths and attack lines during planning)
- E4: Engagement – disengage (2 AP) and provoke (+20% on sprint)
- F1: Save/Load UI
- F2: Replay UI (step-through event log from saved game)

**All migration tasks complete.**

---

## 5. Suggested Implementation Order

| Order | Task | Depends on | Est. effort |
|-------|------|------------|-------------|
| 1 | A1: Invoke Turn Resolution | - | Small |
| 2 | A2: Scenario Loader | - | Medium |
| 3 | A3: Entry Point | A1 | Small |
| 4 | A4: Disable Real-Time Loop | A3 | Small |
| 5 | B1: CommandUI | A3 | Large |
| 6 | B2: End Turn Button | B1, A1 | Small |
| 7 | B3: AP/Queue Display | B1 | Small |
| 8 | C1: CombatLogUI | A1 | Medium |
| 9 | D1: Defender Reaction Choice | - | Medium |
| 10 | D2: One Free Reaction | D1 | Small |
| 11 | D3: Multiple Attackers | D2 | Medium |
| 12 | D4: Facing | - | Small |
| 13 | D5: Weapon Speed Initiative | - | Small |
| 14 | E1: Conditional Commands | B1 | Medium |
| 15 | E2: Order Persistence | A1 | Medium |
| 16 | E3: Command Preview | B1 | Medium |
| 17 | E4: Engagement Refinement | - | Medium |
| 18 | F1: Save/Load UI | A3 | Medium |
| 19 | F2: Replay (optional) | F1 | Large |

---

## 5. Summary of Gaps vs Migration Checklist

**Checklist items**

- **Done:** Real-time loop removed, planning phase UI
- **Done:** Turn resolution wired in GameEngine
- **Done:** D100 dice, location-based damage, AP tracking, command queue

**Additional design gaps**

- Defender reaction choice and “one free reaction” rule
- Multiple attackers (defender chooses one to react to)
- Facing and side/rear bonuses
- Initiative from weapon speed
- Conditional commands and order persistence
- Command preview
- Combat log UI
- Scenario loading into engine
- Save/load/replay UI
- Engagement disengage/provoke logic

---

## 6. References

- Design doc: `docs/plans/2026-02-18-turn-based-rpg-combat-design.md`
- Migration section: lines 444–452
- Existing engine: `src/engine/` (ECS, DiceRoller, TurnResolutionSystem, etc.)
- Current game: `src/game/Game.ts`, `main.ts`
