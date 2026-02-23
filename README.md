# 2D Skirmish Game

A browser-based medieval/fantasy tactical skirmish game built with Three.js.

## Concept

Command your warband in turn-based tactical battles. Plan moves and attacks during the planning phase, then resolve both sides simultaneously (WeGo) with D100 dice.

## Features

- Top-down perspective with free camera control (WASD + mouse wheel zoom)
- Turn-based tactical combat: planning phase to queue move/attack, Resolve to run
- D100 opposed rolls, AP tracking, flanking, facing, morale
- Multiple unit types:
  - **Player**: Warrior, Archer, Knight, Healer
  - **Enemy**: Goblin, Orc Warrior, Orc Archer, Troll
- Enemy AI (aggressive, cunning, cautious personalities)
- 4 predefined battle scenarios
- Save/Load
- Combat log with dice roll visibility

## Controls

| Action | Control |
|--------|---------|
| Move camera | Right-click drag |
| Zoom | Mouse wheel |
| Select unit | Left click on unit |
| Queue move | Select unit, then click ground |
| Queue attack | Select unit, then click enemy |
| Resolve turn | Click "Resolve Turn" button |

## Scenarios

1. **Tutorial: First Blood** - 3 warriors vs 5 goblins
2. **Forest Ambush** - Mixed warband vs goblin horde in a forest
3. **Orc Patrol** - Engage orcs near a village
4. **Troll Bridge** - Boss fight against a troll guarding a river crossing

## Documentation

- [Game Design Document](docs/GAME_DESIGN.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Development Roadmap](docs/ROADMAP.md)

## Tech Stack

- Three.js (3D rendering)
- TypeScript
- Vite (build tool)

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── main.ts                 # Entry point
├── game/TurnBasedGame.ts   # Main game loop (turn-based)
├── engine/                 # ECS, systems, DiceRoller
├── core/                   # Input, Camera
├── ui/CombatLogUI.ts       # Combat log
├── data/scenarios.ts       # Scenario definitions
└── types/                  # TypeScript types
```

## Status

**Turn-based only** - Real-time mode removed. Playable with planning/resolve, D100 combat.
