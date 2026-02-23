import { WorldImpl } from '../ecs/World';
import { DiceRoller } from './DiceRoller';
import { EventBusImpl } from './EventBus';
import { TurnResolutionSystem } from '../systems/TurnResolutionSystem';
import { loadScenario as loadScenarioIntoWorld, LoadedScenario } from '../data/ScenarioLoader';
import { Component, EntityId, GameEvent, GameSnapshot, ReplayTurn } from '../types';
import { UnitCommand, FactionComponent } from '../components';
import { Scenario } from '../../types';

export interface GameEngineOptions {
  seed: number;
}

export class GameEngine {
  private world: WorldImpl;
  private diceRoller: DiceRoller;
  private eventBus: EventBusImpl;
  private turn: number = 0;
  private phase: 'planning' | 'resolution' = 'planning';
  private loadedScenario: LoadedScenario | null = null;

  constructor(options: GameEngineOptions) {
    this.world = new WorldImpl();
    this.diceRoller = new DiceRoller(options.seed);
    this.eventBus = new EventBusImpl();
  }

  // World access
  createEntity(): EntityId {
    return this.world.createEntity();
  }

  removeEntity(entityId: EntityId): void {
    this.world.removeEntity(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): void {
    this.world.addComponent(entityId, component);
  }

  getComponent<T extends Component>(entityId: EntityId, type: string): T | undefined {
    return this.world.getComponent<T>(entityId, type);
  }

  hasComponent(entityId: EntityId, type: string): boolean {
    return this.world.hasComponent(entityId, type);
  }

  query(...componentTypes: string[]): EntityId[] {
    return this.world.query(...componentTypes);
  }

  // Turn management
  getTurn(): number {
    return this.turn;
  }

  getPhase(): 'planning' | 'resolution' {
    return this.phase;
  }

  endPlanningPhase(): void {
    if (this.phase !== 'planning') {
      throw new Error('Not in planning phase');
    }
    this.phase = 'resolution';
    this.emitEvent({
      type: 'ResolutionPhaseStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
  }

  resolvePhase(): void {
    if (this.phase !== 'resolution') {
      throw new Error('Not in resolution phase');
    }
    TurnResolutionSystem.resolveTurn(
      this.world,
      this.eventBus,
      this.diceRoller,
      this.turn,
      this.loadedScenario?.mapSize
    );
    this.endTurn();
  }

  endTurn(): void {
    this.turn++;
    this.phase = 'planning';
    this.emitEvent({
      type: 'TurnStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
    this.emitEvent({
      type: 'PlanningPhaseStarted',
      turn: this.turn,
      timestamp: Date.now(),
      data: {},
    });
  }

  // Dice
  rollD100(): number {
    return this.diceRoller.rollD100();
  }

  roll(dice: number, sides: number, bonus: number = 0): number {
    return this.diceRoller.roll(dice, sides, bonus);
  }

  getDiceRoller(): DiceRoller {
    return this.diceRoller;
  }

  // Events
  emitEvent(event: GameEvent): void {
    this.eventBus.emit(event);
  }

  getEventHistory(): GameEvent[] {
    return this.eventBus.getHistory();
  }

  subscribeToEvent(type: GameEvent['type'], callback: (event: GameEvent) => void): () => void {
    return this.eventBus.subscribe(type, callback);
  }

  getEventBus(): EventBusImpl {
    return this.eventBus;
  }

  getWorld(): WorldImpl {
    return this.world;
  }

  // Scenario loading
  loadScenario(scenario: Scenario): LoadedScenario {
    this.world.clear();
    this.eventBus.clearHistory();
    this.turn = 0;
    this.phase = 'planning';
    this.loadedScenario = loadScenarioIntoWorld(this.world, scenario);
    this.emitEvent({
      type: 'TurnStarted',
      turn: 0,
      timestamp: Date.now(),
      data: { scenarioId: this.loadedScenario.scenarioId },
    });
    this.emitEvent({
      type: 'PlanningPhaseStarted',
      turn: 0,
      timestamp: Date.now(),
      data: {},
    });
    return this.loadedScenario;
  }

  getLoadedScenario(): LoadedScenario | null {
    return this.loadedScenario;
  }

  queueCommand(entityId: EntityId, command: UnitCommand): boolean {
    return TurnResolutionSystem.queueCommand(this.world, entityId, command);
  }

  clearCommands(entityId: EntityId): void {
    TurnResolutionSystem.clearCommands(this.world, entityId);
  }

  // Snapshots
  createSnapshot(): GameSnapshot {
    const entities: Record<EntityId, Record<string, Component>> = {};
    for (const entityId of this.world.getAllEntities()) {
      entities[entityId] = this.world.getEntityComponents(entityId);
    }

    const turnLog = this.eventBus.getHistory();
    const replayTurns: ReplayTurn[] = [];
    const byTurn = new Map<number, GameEvent[]>();
    for (const e of turnLog) {
      const list = byTurn.get(e.turn) ?? [];
      list.push(e);
      byTurn.set(e.turn, list);
    }
    for (const [turn, events] of byTurn) {
      replayTurns.push({ turn, events });
    }
    replayTurns.sort((a, b) => a.turn - b.turn);

    const snapshot: GameSnapshot = {
      turn: this.turn,
      phase: this.phase,
      timestamp: Date.now(),
      entities,
      randomState: this.diceRoller.getState(),
      turnLog,
      replayTurns,
    };
    if (this.loadedScenario) {
      snapshot.scenarioId = this.loadedScenario.scenarioId;
      snapshot.mapSize = this.loadedScenario.mapSize;
    }
    return snapshot;
  }

  loadSnapshot(snapshot: GameSnapshot): void {
    // Clear current state
    this.world.clear();
    this.eventBus.clearHistory();

    // Restore entities
    for (const [entityId, components] of Object.entries(snapshot.entities)) {
      this.world.loadEntity(entityId, components);
    }

    // Restore game state
    this.turn = snapshot.turn;
    this.phase = snapshot.phase;
    this.diceRoller.setState(snapshot.randomState);

    // Restore event history
    for (const event of snapshot.turnLog) {
      this.eventBus.emit(event);
    }

    // Restore loaded scenario metadata
    if (snapshot.scenarioId && snapshot.mapSize) {
      const factionEntities = this.world.query('faction', 'position');
      const playerUnitIds = factionEntities.filter((id) => {
        const f = this.world.getComponent<FactionComponent>(id, 'faction');
        return f?.faction === 'player';
      });
      const enemyUnitIds = factionEntities.filter((id) => {
        const f = this.world.getComponent<FactionComponent>(id, 'faction');
        return f?.faction === 'enemy';
      });
      this.loadedScenario = {
        scenarioId: snapshot.scenarioId,
        scenarioName: snapshot.scenarioId,
        mapSize: snapshot.mapSize,
        playerUnitIds,
        enemyUnitIds,
        objectives: [],
      };
    } else {
      this.loadedScenario = null;
    }
  }
}
