# AGENTS.md

Context and instructions for AI coding agents working on this project.

## Project Overview

A browser-based medieval/fantasy tactical skirmish game built with Three.js. Top-down perspective with turn-based combat using an ECS (Entity Component System) architecture.

**Tech Stack**: Three.js, TypeScript, Vite, Vitest

## Setup & Build

```bash
npm install
npm run dev      # Development server
npm run build    # Production build (tsc && vite build)
npm run preview  # Preview production build
npm test         # Run tests (watch mode)
npm run test:run # Run tests once
```

## Project Structure

```
src/
├── main.ts                          # Entry point
├── types/index.ts                   # Shared TypeScript types
├── core/                            # Input & Camera
│   ├── InputManager.ts
│   └── Camera.ts
├── engine/                          # Game engine (ECS-based)
│   ├── components/index.ts          # ECS components
│   ├── core/
│   │   ├── DiceRoller.ts            # Dice rolling mechanics
│   │   ├── EventBus.ts              # Engine event system
│   │   └── GameEngine.ts            # Main engine orchestrator
│   ├── data/
│   │   ├── ScenarioLoader.ts        # Scenario loading
│   │   ├── UnitFactory.ts           # Unit creation
│   │   └── UnitTemplates.ts         # Unit type definitions
│   ├── ecs/
│   │   └── World.ts                 # ECS world (entities & components)
│   ├── systems/                     # ECS systems
│   │   ├── AICommandSystem.ts       # AI decision-making
│   │   ├── AmmoSystem.ts            # Ammunition management
│   │   ├── CombatResolver.ts        # Combat resolution
│   │   ├── DamageSystem.ts          # Damage calculation
│   │   ├── MoraleSystem.ts          # Morale & routing
│   │   ├── MovementSystem.ts        # Unit movement
│   │   ├── Pathfinder.ts            # Pathfinding (A*)
│   │   ├── StaminaSystem.ts         # Stamina management
│   │   ├── TurnResolutionSystem.ts  # Turn resolution pipeline
│   │   ├── VictorySystem.ts         # Win/loss conditions
│   │   └── WoundEffectsSystem.ts    # Wound status effects
│   └── types/index.ts               # Engine-specific types
├── entities/                        # Visual representations
│   ├── Obstacle.ts                  # Obstacle meshes
│   └── UnitMeshBuilder.ts           # Unit mesh construction
├── game/                            # Game loop & interaction
│   ├── TurnBasedGame.ts             # Turn-based game loop
│   └── selection.ts                 # Unit selection logic
├── data/
│   └── scenarios.ts                 # Battle scenario definitions
├── ui/                              # UI layer
│   ├── CombatLogUI.ts               # Combat log display
│   ├── CombatStatusHelpers.ts       # Status display helpers
│   ├── CommandFormatters.ts         # Command text formatting
│   ├── FloatingCombatText.ts        # Floating damage numbers
│   └── PerceptionHelpers.ts         # Perception/visibility helpers
└── utils/
    ├── EventBus.ts                  # Utility event bus
    └── PrintedMaterial.ts           # Printed material styling

tests/
├── engine/
│   ├── core/                        # DiceRoller, EventBus, GameEngine tests
│   ├── data/                        # ScenarioLoader, UnitFactory tests
│   ├── ecs/                         # World tests
│   └── systems/                     # All system tests
├── integration/                     # Integration tests (combat, turns, AI)
└── ui/                              # UI helper tests
```

## Code Conventions

- **TypeScript**: Strict typing; avoid `any`
- **Architecture**: ECS pattern — components hold data, systems hold logic
- **Three.js**: Orthographic camera; simple 3D primitives (cylinders, cones) for units and obstacles
- **Naming**: PascalCase for classes, camelCase for functions/variables
- **Testing**: Vitest; tests mirror `src/` structure under `tests/`

## Commit Conventions

- **Format**: `type: description` + optional bullet details + `Refs: #issue`
- **Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `ci`, `build`, `perf`
- **No scopes**: Use `feat:` not `feat(scope):`
- **Implementation steps**: Use types (`chore` setup, `feat` feature, etc.) not "Step X:"
- **No Co-Authored-By/Generated-with** in commit messages
- **Never commit with `--no-verify`** — run pre-commit hooks (format, type-check, lint, test, build) and fix failures instead of skipping

## Key Systems

| System           | Location                         | Purpose                                        |
| ---------------- | -------------------------------- | ---------------------------------------------- |
| ECS World        | `engine/ecs/World.ts`            | Entity-component storage and queries           |
| Game Engine      | `engine/core/GameEngine.ts`      | Orchestrates systems, manages game state        |
| Turn Resolution  | `engine/systems/TurnResolution*` | Turn-based command resolution pipeline         |
| Combat           | `engine/systems/CombatResolver*` | Hit resolution, dice rolls, combat mechanics   |
| Damage           | `engine/systems/DamageSystem.ts` | Damage application, wounds, kills              |
| AI               | `engine/systems/AICommandSystem*`| AI decision-making for enemy units             |
| Movement         | `engine/systems/MovementSystem*` | Unit movement with stamina costs               |
| Pathfinding      | `engine/systems/Pathfinder.ts`   | A* pathfinding with terrain costs              |
| Morale           | `engine/systems/MoraleSystem.ts` | Morale checks, routing, rally                  |
| Victory          | `engine/systems/VictorySystem*`  | Win/loss condition evaluation                  |
| Wound Effects    | `engine/systems/WoundEffects*`   | Wound penalties and status effects             |
| Stamina          | `engine/systems/StaminaSystem*`  | Stamina consumption and recovery               |
| Ammo             | `engine/systems/AmmoSystem.ts`   | Ammunition tracking for ranged units           |
| Game Loop        | `game/TurnBasedGame.ts`          | Turn-based game loop, rendering, UI            |
| Scenarios        | `data/scenarios.ts`              | Battle setups with units, obstacles, map size  |
| Unit Templates   | `engine/data/UnitTemplates.ts`   | Unit type stats and definitions                |

## Documentation

- `docs/GAME_DESIGN.md` - Unit stats, behaviors, UI, art direction
- `docs/TECHNICAL_ARCHITECTURE.md` - Architecture, data flow, state machines
- `docs/ROADMAP.md` - Phases, milestones, current status
- `docs/plans/` - Design and implementation plans

## Guidelines for Agents

1. **Read docs first** - Check `/docs` for design and architecture before implementing
2. **Follow TDD** - Write tests first, then implement, then refactor
3. **Preserve ECS patterns** - Components hold data, systems hold logic; use the World for entity queries
4. **Use EventBus** for cross-system communication
5. **Unit definitions** live in `engine/data/UnitTemplates.ts`; scenarios in `data/scenarios.ts`
6. **Run tests** - Use `npm run test:run` to verify changes
7. **Always build and test after implementation** - Run `npm run build` and `npm run test:run` (or equivalent) before considering work complete
