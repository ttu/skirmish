import * as THREE from "three";
import { GameEngine } from "../engine/core/GameEngine";
import { CameraController } from "../core/Camera";
import { EntityId } from "../engine/types";
import { FloatingCombatText } from "../ui/FloatingCombatText";

export interface MoveDestination {
  x: number;
  y: number;
  /** Full A* path from current position to final destination (recomputed each turn). */
  fullPath?: { x: number; y: number }[];
}

export interface GameContext {
  readonly engine: GameEngine;
  readonly scene: THREE.Scene;
  readonly cameraController: CameraController;
  readonly canvas: HTMLCanvasElement;
  getSelectedEntityId(): EntityId | null;
  setSelectedEntityId(id: EntityId | null): void;
  getPlayerUnitIds(): EntityId[];
  getEntityMeshes(): Map<EntityId, THREE.Group>;
  getLastAttackTargetByUnit(): Map<EntityId, EntityId>;
  getLastMoveDestinationByUnit(): Map<EntityId, MoveDestination>;
  getFloatingText(): FloatingCombatText;
  /** Update selection ring position (e.g., during movement animation). */
  updateSelectionRingAt(x: number, z: number): void;
  /** Trigger UI/preview refresh after command changes. */
  onCommandsChanged(): void;
  /** Show a brief toast message. */
  showTemporaryMessage(msg: string): void;
  /** Trigger turn resolution (e.g., when all units are on overwatch). */
  onResolveTurn(): void;
  /** Whether the game is actively in-game (not in menu). */
  isInGame(): boolean;
  /** Whether the game-over screen is showing. */
  isGameOver(): boolean;
  /** Update the selection ring to track the selected entity's current position. */
  updateSelectionRing(): void;
  /** Command builder delegates for UI button handlers. */
  clearSelectedUnitCommands(): void;
  queueOverwatchCommand(): void;
  removeCommandAtIndex(idx: number): void;
  /** Save/load/replay delegates. */
  saveGame(): void;
  loadGame(): void;
  showReplayUI(): void;
}
