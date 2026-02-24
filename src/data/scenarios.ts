import { Scenario } from "../types";

export const scenarios: Scenario[] = [
  // === HUMAN VS HUMAN SCENARIOS ===
  {
    id: "warrior_duel",
    name: "Warrior's Duel",
    description:
      "Two warriors settle a dispute in single combat. A mirror match to test melee balance.",
    mapSize: { width: 15, height: 15 },
    playerUnits: [
      { type: "warrior", position: { x: -4, z: 0 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "warrior", position: { x: 4, z: 0 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "rock", position: { x: 0, z: 3 } },
      { type: "rock", position: { x: 0, z: -3 } },
      { type: "fence", position: { x: -6, z: 0 }, rotation: 0, length: 6 },
      { type: "fence", position: { x: 6, z: 0 }, rotation: 0, length: 6 },
    ],
    objectives: ["Defeat the enemy warrior"],
  },
  {
    id: "skirmish_line",
    name: "Skirmish Line",
    description:
      "3v3 melee clash. Warriors and a veteran on each side test mixed melee combat.",
    mapSize: { width: 25, height: 25 },
    playerUnits: [
      { type: "veteran", position: { x: -6, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -6, z: 3 }, faction: "player" },
      { type: "warrior", position: { x: -6, z: -3 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "veteran", position: { x: 6, z: 0 }, faction: "enemy" },
      { type: "warrior", position: { x: 6, z: 3 }, faction: "enemy" },
      { type: "warrior", position: { x: 6, z: -3 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "tree_oak", position: { x: -2, z: 8 } },
      { type: "tree_oak", position: { x: 2, z: -8 } },
      { type: "rock", position: { x: 0, z: 0 }, scale: 1.2 },
      { type: "stone_wall", position: { x: 0, z: 5 }, rotation: 0, length: 3 },
      { type: "stone_wall", position: { x: 0, z: -5 }, rotation: 0, length: 3 },
    ],
    objectives: ["Defeat all enemies"],
  },
  {
    id: "rival_warband",
    name: "Rival Warband",
    description:
      "5v5 with ranged and melee. Two rival warbands clash over a contested crossing.",
    mapSize: { width: 35, height: 35 },
    playerUnits: [
      { type: "knight", position: { x: -10, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -10, z: 3 }, faction: "player" },
      { type: "warrior", position: { x: -10, z: -3 }, faction: "player" },
      { type: "archer", position: { x: -13, z: 2 }, faction: "player" },
      { type: "archer", position: { x: -13, z: -2 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "knight", position: { x: 10, z: 0 }, faction: "enemy" },
      { type: "warrior", position: { x: 10, z: 3 }, faction: "enemy" },
      { type: "warrior", position: { x: 10, z: -3 }, faction: "enemy" },
      { type: "archer", position: { x: 13, z: 2 }, faction: "enemy" },
      { type: "archer", position: { x: 13, z: -2 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "brook", position: { x: 0, z: 0 }, rotation: 0.1, length: 36 },
      { type: "rock", position: { x: -3, z: 6 } },
      { type: "rock", position: { x: 3, z: -6 } },
      { type: "tree_pine", position: { x: -6, z: 10 } },
      { type: "tree_pine", position: { x: -6, z: -10 } },
      { type: "tree_oak", position: { x: 6, z: 10 } },
      { type: "tree_oak", position: { x: 6, z: -10 } },
      { type: "stone_wall", position: { x: -5, z: 0 }, rotation: 0, length: 4 },
      { type: "stone_wall", position: { x: 5, z: 0 }, rotation: 0, length: 4 },
    ],
    objectives: ["Defeat the rival warband"],
  },
  {
    id: "battle_of_the_crossroads",
    name: "Battle of the Crossroads",
    description:
      "8v8 full warband battle. All unit roles represented on both sides — the ultimate balance test.",
    mapSize: { width: 50, height: 40 },
    playerUnits: [
      { type: "knight", position: { x: -15, z: 0 }, faction: "player" },
      { type: "veteran", position: { x: -15, z: 3 }, faction: "player" },
      { type: "warrior", position: { x: -15, z: -3 }, faction: "player" },
      { type: "warrior", position: { x: -15, z: 6 }, faction: "player" },
      { type: "archer", position: { x: -18, z: 2 }, faction: "player" },
      { type: "archer", position: { x: -18, z: -2 }, faction: "player" },
      { type: "crossbowman", position: { x: -18, z: 5 }, faction: "player" },
      { type: "healer", position: { x: -18, z: 0 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "knight", position: { x: 15, z: 0 }, faction: "enemy" },
      { type: "veteran", position: { x: 15, z: 3 }, faction: "enemy" },
      { type: "warrior", position: { x: 15, z: -3 }, faction: "enemy" },
      { type: "warrior", position: { x: 15, z: 6 }, faction: "enemy" },
      { type: "archer", position: { x: 18, z: 2 }, faction: "enemy" },
      { type: "archer", position: { x: 18, z: -2 }, faction: "enemy" },
      { type: "crossbowman", position: { x: 18, z: 5 }, faction: "enemy" },
      { type: "healer", position: { x: 18, z: 0 }, faction: "enemy" },
    ],
    obstacles: [
      // Crossroads in the center
      { type: "stone_wall", position: { x: -3, z: 8 }, rotation: 0, length: 4 },
      { type: "stone_wall", position: { x: -3, z: -8 }, rotation: 0, length: 4 },
      { type: "stone_wall", position: { x: 3, z: 8 }, rotation: 0, length: 4 },
      { type: "stone_wall", position: { x: 3, z: -8 }, rotation: 0, length: 4 },
      // Buildings flanking the crossroads
      { type: "house_cottage", position: { x: -5, z: 12 }, rotation: 0.2 },
      { type: "house_stone", position: { x: 5, z: 12 }, rotation: -0.2 },
      { type: "house_stone", position: { x: -5, z: -12 }, rotation: -0.1 },
      { type: "house_hall", position: { x: 5, z: -12 }, rotation: 0.1 },
      // Terrain
      { type: "rock", position: { x: 0, z: 0 }, scale: 1.3 },
      { type: "tree_oak", position: { x: -10, z: 14 } },
      { type: "tree_oak", position: { x: 10, z: 14 } },
      { type: "tree_pine", position: { x: -10, z: -14 } },
      { type: "tree_pine", position: { x: 10, z: -14 } },
      { type: "tree_willow", position: { x: -20, z: 10 } },
      { type: "tree_willow", position: { x: 20, z: -10 } },
      // Brook on the flank
      { type: "brook", position: { x: -22, z: 0 }, rotation: 0.1, length: 41 },
    ],
    objectives: ["Defeat all enemies"],
  },
  // === MONSTER SCENARIOS ===
  {
    id: "quick_skirmish",
    name: "Quick Skirmish",
    description: "2 warriors vs 2 goblins. Fast battle to learn the basics.",
    mapSize: { width: 20, height: 20 },
    playerUnits: [
      { type: "warrior", position: { x: -5, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -5, z: 2 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "goblin", position: { x: 5, z: 0 }, faction: "enemy" },
      { type: "goblin", position: { x: 5, z: 2 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "tree_oak", position: { x: -2, z: 4 } },
      { type: "tree_pine", position: { x: 2, z: -3 } },
      { type: "rock", position: { x: 0, z: 2 }, scale: 0.9 },
      { type: "rock", position: { x: -1, z: -4 } },
      // Brook crossing from north edge to south edge
      { type: "brook", position: { x: 5, z: 0 }, rotation: 0.3, length: 21 },
    ],
    objectives: ["Defeat all enemies"],
  },
  {
    id: "duel",
    name: "The Duel",
    description: "A knight faces an orc warrior in single combat.",
    mapSize: { width: 15, height: 15 },
    playerUnits: [
      { type: "knight", position: { x: -4, z: 0 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "orc_warrior", position: { x: 4, z: 0 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "rock", position: { x: 0, z: 3 }, scale: 1.1 },
      { type: "rock", position: { x: 1, z: -2 } },
      { type: "tree_pine", position: { x: -6, z: 5 } },
      { type: "tree_pine", position: { x: 6, z: -4 } },
      { type: "stone_wall", position: { x: 0, z: 0 }, rotation: 0.3, length: 3 },
    ],
    objectives: ["Defeat the orc warrior"],
  },
  {
    id: "tutorial",
    name: "Tutorial: First Blood",
    description: "3 warriors face 5 goblins. Learn the basics of combat.",
    mapSize: { width: 30, height: 30 },
    playerUnits: [
      { type: "warrior", position: { x: -8, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -8, z: 3 }, faction: "player" },
      { type: "warrior", position: { x: -8, z: -3 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "goblin", position: { x: 8, z: 0 }, faction: "enemy" },
      { type: "goblin", position: { x: 8, z: 2 }, faction: "enemy" },
      { type: "goblin", position: { x: 8, z: -2 }, faction: "enemy" },
      { type: "goblin", position: { x: 10, z: 1 }, faction: "enemy" },
      { type: "goblin", position: { x: 10, z: -1 }, faction: "enemy" },
    ],
    obstacles: [
      { type: "rock", position: { x: 0, z: 6 } },
      { type: "rock", position: { x: 0, z: -6 } },
      { type: "rock", position: { x: 6, z: 2 } },
      { type: "tree_oak", position: { x: -4, z: 8 } },
      { type: "tree_pine", position: { x: 6, z: 4 } },
      { type: "tree_pine", position: { x: 6, z: -6 } },
      { type: "tree_oak", position: { x: -2, z: -10 } },
      { type: "tree_willow", position: { x: 10, z: -8 } },
      { type: "house_cottage", position: { x: 12, z: 10 }, rotation: 0.2, scale: 0.9 },
      { type: "stone_wall", position: { x: -10, z: -3 }, rotation: 0, length: 4 },
      // Brook crossing from north edge to south edge
      { type: "brook", position: { x: 3, z: 0 }, rotation: 0.15, length: 31 },
    ],
    objectives: ["Defeat all enemies"],
  },
  {
    id: "forest_ambush",
    name: "Forest Ambush",
    description: "Your warband is ambushed by a goblin horde in the forest.",
    mapSize: { width: 40, height: 40 },
    playerUnits: [
      { type: "knight", position: { x: 0, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -2, z: 2 }, faction: "player" },
      { type: "warrior", position: { x: -2, z: -2 }, faction: "player" },
      { type: "archer", position: { x: -4, z: 1 }, faction: "player" },
      { type: "archer", position: { x: -4, z: -1 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "goblin", position: { x: 10, z: 5 }, faction: "enemy" },
      { type: "goblin", position: { x: 12, z: 3 }, faction: "enemy" },
      { type: "goblin", position: { x: 10, z: -5 }, faction: "enemy" },
      { type: "goblin", position: { x: 12, z: -3 }, faction: "enemy" },
      { type: "goblin", position: { x: 8, z: 8 }, faction: "enemy" },
      { type: "goblin", position: { x: 8, z: -8 }, faction: "enemy" },
      { type: "goblin", position: { x: 14, z: 0 }, faction: "enemy" },
      { type: "goblin", position: { x: 15, z: 2 }, faction: "enemy" },
    ],
    obstacles: [
      // Pine trees scattered around
      { type: "tree_pine", position: { x: -8, z: 8 } },
      { type: "tree_pine", position: { x: -10, z: 5 } },
      { type: "tree_pine", position: { x: -12, z: 10 } },
      { type: "tree_pine", position: { x: -8, z: -8 } },
      { type: "tree_pine", position: { x: -10, z: -5 } },
      { type: "tree_pine", position: { x: -12, z: -10 } },
      // Oak trees
      { type: "tree_oak", position: { x: 5, z: 12 } },
      { type: "tree_oak", position: { x: 3, z: 10 } },
      { type: "tree_oak", position: { x: 5, z: -12 } },
      { type: "tree_oak", position: { x: 3, z: -10 } },
      // Willows near the brook
      { type: "tree_willow", position: { x: 12, z: 8 } },
      { type: "tree_willow", position: { x: 12, z: -8 } },
      { type: "tree_pine", position: { x: 18, z: 5 } },
      { type: "tree_pine", position: { x: 18, z: -5 } },
      // Rocks
      { type: "rock", position: { x: 0, z: 8 } },
      { type: "rock", position: { x: 0, z: -8 } },
      { type: "rock", position: { x: 8, z: 0 }, scale: 1.2 },
      // Brook crossing the forest from north edge to south edge
      { type: "brook", position: { x: 15, z: 0 }, rotation: 0.2, length: 41 },
    ],
    objectives: ["Survive the ambush", "Defeat all enemies"],
  },
  {
    id: "orc_patrol",
    name: "Orc Patrol",
    description: "Engage an orc patrol blocking your path.",
    mapSize: { width: 40, height: 40 },
    playerUnits: [
      { type: "knight", position: { x: -10, z: 0 }, faction: "player" },
      { type: "warrior", position: { x: -12, z: 2 }, faction: "player" },
      { type: "warrior", position: { x: -12, z: -2 }, faction: "player" },
      { type: "archer", position: { x: -14, z: 3 }, faction: "player" },
      { type: "archer", position: { x: -14, z: -3 }, faction: "player" },
      { type: "healer", position: { x: -14, z: 0 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "orc_warrior", position: { x: 5, z: 0 }, faction: "enemy" },
      { type: "orc_warrior", position: { x: 7, z: 3 }, faction: "enemy" },
      { type: "orc_warrior", position: { x: 7, z: -3 }, faction: "enemy" },
      { type: "orc_archer", position: { x: 10, z: 5 }, faction: "enemy" },
      { type: "orc_archer", position: { x: 10, z: -5 }, faction: "enemy" },
    ],
    obstacles: [
      // Village buildings - variety
      { type: "house_cottage", position: { x: -5, z: 10 }, rotation: 0.3 },
      { type: "house_stone", position: { x: -2, z: 12 }, rotation: -0.2 },
      { type: "house_stone", position: { x: -5, z: -10 }, rotation: -0.3 },
      { type: "house_hall", position: { x: -2, z: -12 }, rotation: 0.2 },
      // Stone walls around village
      { type: "stone_wall", position: { x: -6, z: 6 }, rotation: 0, length: 5 },
      { type: "stone_wall", position: { x: -6, z: -6 }, rotation: 0, length: 5 },
      // Rocks along the path
      { type: "rock", position: { x: 0, z: 6 }, scale: 1.2 },
      { type: "rock", position: { x: 0, z: -6 }, scale: 1.2 },
      { type: "rock", position: { x: 12, z: 0 }, scale: 0.8 },
      // Trees - mixed types
      { type: "tree_pine", position: { x: 15, z: 10 } },
      { type: "tree_oak", position: { x: 17, z: 8 } },
      { type: "tree_pine", position: { x: 15, z: -10 } },
      { type: "tree_oak", position: { x: 17, z: -8 } },
      // Brook crossing through the village from north to south
      { type: "brook", position: { x: -8, z: 0 }, rotation: 0.15, length: 41 },
    ],
    objectives: ["Defeat the orc patrol"],
  },
  {
    id: "troll_bridge",
    name: "Troll Bridge",
    description: "A massive troll guards the only bridge across the river.",
    mapSize: { width: 50, height: 30 },
    playerUnits: [
      { type: "knight", position: { x: -15, z: 0 }, faction: "player" },
      { type: "knight", position: { x: -17, z: 2 }, faction: "player" },
      { type: "warrior", position: { x: -17, z: -2 }, faction: "player" },
      { type: "warrior", position: { x: -19, z: 2 }, faction: "player" },
      { type: "archer", position: { x: -20, z: 4 }, faction: "player" },
      { type: "archer", position: { x: -20, z: -4 }, faction: "player" },
      { type: "archer", position: { x: -21, z: 2 }, faction: "player" },
      { type: "healer", position: { x: -22, z: 2 }, faction: "player" },
    ],
    enemyUnits: [
      { type: "troll", position: { x: 0, z: 0 }, faction: "enemy" },
      { type: "goblin", position: { x: 5, z: 3 }, faction: "enemy" },
      { type: "goblin", position: { x: 5, z: -3 }, faction: "enemy" },
      { type: "goblin", position: { x: 8, z: 0 }, faction: "enemy" },
    ],
    obstacles: [
      // River crossing from north edge to south edge
      { type: "river", position: { x: -5, z: 0 }, rotation: 0, length: 30 },
      // Bridge across the river
      { type: "bridge", position: { x: -5, z: 0 }, rotation: 0 },
      // Brook crossing from north edge to south edge
      { type: "brook", position: { x: 15, z: 0 }, rotation: 0.2, length: 31 },
      // Trees - willows near water, mixed elsewhere
      { type: "tree_willow", position: { x: -12, z: 10 } },
      { type: "tree_willow", position: { x: -10, z: 12 } },
      { type: "tree_oak", position: { x: -12, z: -10 } },
      { type: "tree_pine", position: { x: -10, z: -12 } },
      { type: "tree_oak", position: { x: 12, z: 10 } },
      { type: "tree_willow", position: { x: 10, z: 12 } },
      { type: "tree_pine", position: { x: 12, z: -10 } },
      { type: "tree_oak", position: { x: 10, z: -12 } },
      // Rocks near the bridge
      { type: "rock", position: { x: 3, z: 5 } },
      { type: "rock", position: { x: 3, z: -5 } },
      // Structures
      { type: "house_stone", position: { x: -18, z: 6 }, rotation: 0.4, scale: 0.85 },
      { type: "stone_wall", position: { x: -20, z: 0 }, rotation: 0, length: 6 },
    ],
    objectives: ["Defeat the troll", "Clear the bridge"],
  },
];
