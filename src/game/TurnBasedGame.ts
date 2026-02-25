import * as THREE from "three";
import { eventBus } from "../utils/EventBus";
import { GameEngine } from "../engine/core/GameEngine";
import { AICommandSystem } from "../engine/systems/AICommandSystem";
import { InputManager } from "../core/InputManager";
import { CameraController } from "../core/Camera";
import { Scenario } from "../types";
import { scenarios } from "../data/scenarios";
import { CommandQueueComponent } from "../engine/components";
import { EntityId } from "../engine/types";
import { CommandPreviewRenderer } from "./CommandPreviewRenderer";
import { MovementAnimator } from "./MovementAnimator";
import { SceneManager } from "./SceneManager";
import { CommandBuilder } from "./CommandBuilder";
import { UIManager } from "./UIManager";
import { GameContext } from "./GameContext";

export class TurnBasedGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;
  private cameraController: CameraController;
  private engine: GameEngine;

  private sceneManager!: SceneManager;
  private commandPreview!: CommandPreviewRenderer;
  private commandBuilder!: CommandBuilder;
  private movementAnimator!: MovementAnimator;
  private uiManager!: UIManager;
  private selectedEntityId: EntityId | null = null;

  constructor() {
    this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    const aspect = window.innerWidth / window.innerHeight;
    this.cameraController = new CameraController(aspect);
    void new InputManager(this.canvas);

    const seed = Math.floor(Math.random() * 1000000);
    this.engine = new GameEngine({ seed });

    this.sceneManager = new SceneManager(this.asContext());
    this.commandPreview = new CommandPreviewRenderer(this.asContext());
    this.movementAnimator = new MovementAnimator(this.asContext());
    this.commandBuilder = new CommandBuilder(this.asContext());
    this.uiManager = new UIManager(this.asContext());

    // Wire up UIManager callbacks
    this.uiManager.onScenarioSelected = (scenario) => this.startScenario(scenario);
    this.uiManager.onRestartRequested = () => this.restartScenario();
    this.uiManager.onReturnToMenuRequested = () => this.returnToMenu();

    this.uiManager.setupUI();
    this.setupEvents();
    window.addEventListener("resize", this.onResize.bind(this));

    this.uiManager.transitionTo("menu");
  }

  private setupEvents(): void {
    this.canvas.addEventListener("click", (e) => this.commandBuilder.onCanvasClick(e));
    this.engine.subscribeToEvent("PlanningPhaseStarted", () => {
      this.commandBuilder.autoContinueMovement();
      this.commandBuilder.autoContinueAttacks();
    });
    eventBus.on("escape", () => {
      if (this.uiManager.isPauseMenuVisible()) {
        this.uiManager.hidePauseMenu();
        return;
      }

      if (this.selectedEntityId && this.engine.getPhase() === "planning") {
        const world = this.engine.getWorld();
        const queue = world.getComponent<CommandQueueComponent>(this.selectedEntityId, "commandQueue");
        if (queue && queue.commands.length > 0) {
          this.commandBuilder.clearSelectedUnitCommands();
          return;
        }
      }

      if (this.uiManager.isInGame()) {
        this.uiManager.showPauseMenu();
      }
    });
    eventBus.on("backspace", () => {
      this.commandBuilder.removeLastCommand();
    });
    eventBus.on("cameraPanDrag", (data: unknown) => {
      const { deltaX, deltaY, canvasWidth, canvasHeight } = data as {
        deltaX: number;
        deltaY: number;
        canvasWidth: number;
        canvasHeight: number;
      };
      this.cameraController.panByScreenDelta(deltaX, deltaY, canvasWidth, canvasHeight);
    });
  }

  private startScenario(scenario: Scenario): void {
    this.clearScenario();

    const loaded = this.engine.loadScenario(scenario);
    this.uiManager.setPlayerUnitIds(loaded.playerUnitIds);
    this.sceneManager.createEntityMeshes(loaded.playerUnitIds.concat(loaded.enemyUnitIds));

    this.sceneManager.setupTerrain(scenario.mapSize.width, scenario.mapSize.height, scenario.obstacles);
    this.cameraController.setBounds(scenario.mapSize.width, scenario.mapSize.height);
    this.cameraController.zoomToFit(scenario.mapSize.width, scenario.mapSize.height);
    this.cameraController.setPosition(0, 0);

    this.uiManager.onStartScenario(scenario);
  }

  private clearScenario(): void {
    this.sceneManager.clearAll();
    this.selectedEntityId = null;
    this.commandBuilder.clearState();
    this.commandPreview.clear();
    this.uiManager.onClearScenario();
  }

  private onResolveTurn(): void {
    if (this.engine.getPhase() !== "planning") return;

    const unitsWithUnspentAP = this.commandBuilder.getUnitsWithUnspentAP();
    if (unitsWithUnspentAP.length > 0 && !this.commandBuilder.getConfirmResolveWithUnspentAP()) {
      this.commandBuilder.showUnspentAPWarning(unitsWithUnspentAP);
      return;
    }
    this.commandBuilder.setConfirmResolveWithUnspentAP(false);

    this.commandPreview.clear();
    const oldPositions = new Map<EntityId, { x: number; y: number }>();
    for (const [id, group] of this.sceneManager.getEntityMeshes()) {
      oldPositions.set(id, { x: group.position.x, y: group.position.z });
    }

    AICommandSystem.generateCommands(
      this.engine.getWorld(),
      this.engine.getEventBus(),
      "enemy",
      this.engine.getLoadedScenario()?.mapSize
    );

    this.engine.endPlanningPhase();
    this.engine.resolvePhase();

    this.movementAnimator.start(oldPositions, () => this.finishTurnResolution());
  }

  private async finishTurnResolution(): Promise<void> {
    this.sceneManager.syncMeshPositions();
    this.movementAnimator.clearAllTrails();
    this.uiManager.updateFloatingTextPositions();

    await this.uiManager.playCombatEventsWithDelay(
      (id) => this.sceneManager.showActiveHighlight(id),
      () => this.sceneManager.hideActiveHighlight()
    );

    this.uiManager.updateTurnBasedUI();
    this.uiManager.checkVictory();
  }

  private saveGame(): void {
    const snapshot = this.engine.createSnapshot();
    const json = JSON.stringify(snapshot);
    localStorage.setItem("skirmish_save", json);
    console.log("Game saved");
  }

  private showReplayUI(): void {
    const json = localStorage.getItem("skirmish_save");
    if (!json) {
      alert("No saved game to replay");
      return;
    }

    let snapshot: { replayTurns?: { turn: number; events: unknown[] }[] };
    try {
      snapshot = JSON.parse(json);
    } catch {
      alert("Invalid save data");
      return;
    }

    const replayTurns = snapshot.replayTurns ?? [];
    if (replayTurns.length === 0) {
      alert("No replay data in save");
      return;
    }

    let currentTurnIndex = 0;
    const modal = document.createElement("div");
    modal.id = "replay-modal";

    const logEl = document.createElement("div");
    logEl.className = "replay-log";

    const updateLog = () => {
      const rt = replayTurns[currentTurnIndex];
      if (!rt) return;
      const lines = (rt.events as Array<{ type: string; entityId?: string; targetId?: string; data?: Record<string, unknown> }>).map((e) => {
        const extra = e.entityId ? ` (${e.entityId})` : "";
        const target = e.targetId ? ` → ${e.targetId}` : "";
        const dataStr = e.data && Object.keys(e.data).length ? ` ${JSON.stringify(e.data)}` : "";
        return `[T${rt.turn}] ${e.type}${extra}${target}${dataStr}`;
      });
      logEl.innerHTML = `<div style="color:var(--accent-gold);font-family:var(--font-display);margin-bottom:8px;">Turn ${rt.turn}</div>` + lines.join("<br>");
    };

    const controls = document.createElement("div");
    controls.className = "replay-controls";
    controls.innerHTML = `
      <button id="replay-prev">Prev Turn</button>
      <button id="replay-next">Next Turn</button>
      <button id="replay-close">Close</button>
    `;

    controls.querySelector("#replay-prev")!.addEventListener("click", () => {
      currentTurnIndex = Math.max(0, currentTurnIndex - 1);
      updateLog();
    });
    controls.querySelector("#replay-next")!.addEventListener("click", () => {
      currentTurnIndex = Math.min(replayTurns.length - 1, currentTurnIndex + 1);
      updateLog();
    });
    controls.querySelector("#replay-close")!.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    modal.appendChild(logEl);
    modal.appendChild(controls);
    document.body.appendChild(modal);
    updateLog();
  }

  private loadGame(): void {
    const json = localStorage.getItem("skirmish_save");
    if (!json) return;

    try {
      const snapshot = JSON.parse(json);
      this.engine.loadSnapshot(snapshot);
      this.clearScenario();
      const loaded = this.engine.getLoadedScenario();
      if (!loaded) return;

      const scenario = scenarios.find((s) => s.id === loaded.scenarioId);
      if (!scenario) return;

      this.sceneManager.setupTerrain(
        scenario.mapSize.width,
        scenario.mapSize.height,
        scenario.obstacles
      );
      this.cameraController.setBounds(scenario.mapSize.width, scenario.mapSize.height);
      this.uiManager.setPlayerUnitIds(loaded.playerUnitIds);
      this.sceneManager.createEntityMeshes(loaded.playerUnitIds.concat(loaded.enemyUnitIds));
      this.sceneManager.syncMeshPositions();
      this.uiManager.createUnitQuickBar();
      this.uiManager.updateTurnBasedUI();
    } catch (e) {
      console.error("Failed to load save:", e);
    }
  }

  private restartScenario(): void {
    const loaded = this.engine.getLoadedScenario();
    if (!loaded) return;

    const scenario = scenarios.find((s) => s.id === loaded.scenarioId);
    if (scenario) this.startScenario(scenario);
  }

  private returnToMenu(): void {
    this.clearScenario();
    this.uiManager.showMenu();
  }

  private asContext(): GameContext {
    return {
      engine: this.engine,
      scene: this.scene,
      cameraController: this.cameraController,
      canvas: this.canvas,
      getSelectedEntityId: () => this.selectedEntityId,
      setSelectedEntityId: (id) => { this.selectedEntityId = id; },
      getPlayerUnitIds: () => this.uiManager?.getPlayerUnitIds() ?? [],
      getEntityMeshes: () => this.sceneManager.getEntityMeshes(),
      getLastAttackTargetByUnit: () => this.commandBuilder.getLastAttackTargetByUnit(),
      getLastMoveDestinationByUnit: () => this.commandBuilder.getLastMoveDestinationByUnit(),
      getFloatingText: () => this.uiManager.getFloatingText(),
      updateSelectionRingAt: (x: number, z: number) => {
        this.sceneManager.updateSelectionRingAt(x, z);
      },
      onCommandsChanged: () => {
        this.uiManager.updateTurnBasedUI();
        this.commandPreview.update();
        this.commandBuilder.checkOverwatchAutoResolve();
      },
      showTemporaryMessage: (msg: string) => {
        this.uiManager.showTemporaryMessage(msg);
      },
      onResolveTurn: () => {
        this.onResolveTurn();
      },
      isInGame: () => this.uiManager.isInGame(),
      isGameOver: () => this.uiManager.isGameOver(),
      updateSelectionRing: () => {
        this.sceneManager.updateSelectionRing();
      },
      clearSelectedUnitCommands: () => {
        this.commandBuilder.clearSelectedUnitCommands();
      },
      queueOverwatchCommand: () => {
        this.commandBuilder.queueOverwatchCommand();
      },
      removeCommandAtIndex: (idx: number) => {
        this.commandBuilder.removeCommandAtIndex(idx);
      },
      saveGame: () => {
        this.saveGame();
      },
      loadGame: () => {
        this.loadGame();
      },
      showReplayUI: () => {
        this.showReplayUI();
      },
    };
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraController.resize(w / h);
  }

  start(): void {
    const animate = () => {
      requestAnimationFrame(animate);
      const dt = 1 / 60;
      for (const obs of this.sceneManager.getTerrainObstacles()) {
        obs.update(dt);
      }
      this.movementAnimator.update(performance.now());
      this.sceneManager.updateActiveHighlightPulse();
      this.uiManager.getFloatingText().update();
      this.renderer.render(this.scene, this.cameraController.camera);
    };
    animate();
  }
}
