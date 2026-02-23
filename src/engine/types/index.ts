// Entity is just a string ID
export type EntityId = string;

// Base component interface - all components must have a type
export interface Component {
  readonly type: string;
}

// System context passed to all systems
export interface SystemContext {
  deltaTime: number;
  turn: number;
  phase: 'planning' | 'resolution';
}

// System interface
export interface System {
  readonly name: string;
  readonly requiredComponents: readonly string[];
  run(world: World, entities: EntityId[], context: SystemContext): void;
}

// Forward declaration for World (will be implemented in ecs/)
export interface World {
  createEntity(): EntityId;
  removeEntity(entityId: EntityId): void;
  addComponent<T extends Component>(entityId: EntityId, component: T): void;
  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined;
  hasComponent(entityId: EntityId, type: string): boolean;
  removeComponent(entityId: EntityId, type: string): void;
  query(...componentTypes: string[]): EntityId[];
  getAllEntities(): EntityId[];
  clear(): void;
}

// Game event types
export type GameEventType =
  | 'TurnStarted'
  | 'PlanningPhaseStarted'
  | 'ResolutionPhaseStarted'
  | 'TurnEnded'
  | 'UnitMoved'
  | 'UnitTurned'
  | 'UnitEngaged'
  | 'UnitDisengaged'
  | 'AttackDeclared'
  | 'AttackRolled'
  | 'AttackOutOfRange'
  | 'DefenseRolled'
  | 'HitLocationRolled'
  | 'DamageDealt'
  | 'UnitWounded'
  | 'UnitDown'
  | 'MoraleChecked'
  | 'UnitShaken'
  | 'UnitBroken'
  | 'UnitRouted'
  | 'UnitRallied'
  | 'AmmoSpent'
  | 'StaminaDrained'
  | 'Exhausted'
  | 'OverwatchSet'
  | 'OverwatchTriggered'
  | 'WoundEffectApplied'
  | 'BleedingDamage'
  | 'ArmorImpact'
  | 'VictoryAchieved'
  | 'DefeatSuffered';

// Game event structure
export interface GameEvent {
  type: GameEventType;
  turn: number;
  timestamp: number;
  entityId?: EntityId;
  targetId?: EntityId;
  data: Record<string, unknown>;
}

// Replay turn for step-through replay
export interface ReplayTurn {
  turn: number;
  events: GameEvent[];
}

// Snapshot for save/load
export interface GameSnapshot {
  turn: number;
  phase: 'planning' | 'resolution';
  timestamp: number;
  entities: Record<EntityId, Record<string, Component>>;
  randomState: {
    seed: number;
    callCount: number;
  };
  turnLog: GameEvent[];
  scenarioId?: string;
  mapSize?: { width: number; height: number };
  replayTurns?: ReplayTurn[]; // Events grouped by turn for replay UI
}
