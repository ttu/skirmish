export type Faction = "player" | "enemy";

export type UnitType =
  | "militia"
  | "warrior"
  | "veteran"
  | "archer"
  | "crossbowman"
  | "knight"
  | "healer"
  | "scout"
  | "goblin"
  | "orc_warrior"
  | "orc_archer"
  | "orc_brute"
  | "troll";

export interface ScenarioUnit {
  type: UnitType;
  position: { x: number; z: number; elevation?: number };
  faction: Faction;
}

export type ObstacleType =
  | "tree"
  | "tree_oak"
  | "tree_pine"
  | "tree_willow"
  | "house"
  | "house_cottage"
  | "house_stone"
  | "house_hall"
  | "rock"
  | "stone_wall"
  | "river"
  | "brook"
  | "bridge"
  | "fence";

export interface ScenarioObstacle {
  type: ObstacleType;
  position: { x: number; z: number };
  rotation?: number;
  scale?: number;
  length?: number;
}
export interface Scenario {
  id: string;
  name: string;
  description: string;
  mapSize: { width: number; height: number };
  playerUnits: ScenarioUnit[];
  enemyUnits: ScenarioUnit[];
  obstacles?: ScenarioObstacle[];
  objectives: string[];
}
