import * as THREE from "three";
import { eventBus } from "../utils/EventBus";
import { GameEngine } from "../engine/core/GameEngine";
import { AICommandSystem } from "../engine/systems/AICommandSystem";
import { InputManager } from "../core/InputManager";
import { CameraController } from "../core/Camera";
import { Scenario } from "../types";
import { scenarios } from "../data/scenarios";
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  IdentityComponent,
  ActionPointsComponent,
  WeaponComponent,
  CommandQueueComponent,
  StaminaComponent,
  MoraleStateComponent,
  getAttackType,
  isRangedWeapon,
} from "../engine/components";
import { MovementSystem } from "../engine/systems/MovementSystem";
import { Pathfinder } from "../engine/systems/Pathfinder";
import { TurnResolutionSystem } from "../engine/systems/TurnResolutionSystem";
import { UnitFactory } from "../engine/data/UnitFactory";
import { buildUnitMesh } from "../entities/UnitMeshBuilder";
import { Obstacle, ObstacleType } from "../entities/Obstacle";
import { UnitType } from "../types";
import { CombatLogUI } from "../ui/CombatLogUI";
import { FloatingCombatText } from "../ui/FloatingCombatText";
import { ScreenStateManager } from "../ui/ScreenStateManager";
import { ToastManager } from "../ui/ToastManager";
import { EntityId, GameEvent } from "../engine/types";
import { getSelectionAfterUnitClick } from "./selection";
import { getCombatStatus, renderCombatStatusBadges } from "../ui/CombatStatusHelpers";
import { formatQueuedCommands, renderCommandList } from "../ui/CommandFormatters";
import { renderBodyDiagram, renderEnemyBodyDiagram } from "../ui/BodyDiagramUI";
import { SkillsComponent } from "../engine/components";
import { DiceRollSidebar } from "../ui/DiceRollSidebar";

export class TurnBasedGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;
  private cameraController: CameraController;
  private engine: GameEngine;

  private entityMeshes: Map<EntityId, THREE.Group> = new Map();
  private terrainGroup: THREE.Group | null = null;
  private terrainObstacles: Obstacle[] = [];
  private previewGroup: THREE.Group = new THREE.Group();
  private selectionRing: THREE.Mesh | null = null;
  private activeHighlightRing: THREE.Mesh | null = null;
  private activeHighlightEntityId: EntityId | null = null;
  private selectedEntityId: EntityId | null = null;
  private movementAnimations: Array<{
    id: EntityId;
    from: { x: number; y: number };
    to: { x: number; y: number };
    /** Path waypoints for curved/routed movement. If present, animation follows these instead of straight line. */
    path?: { x: number; y: number }[];
    /** Cumulative distances along path segments (for uniform-speed interpolation). */
    pathDistances?: number[];
    /** Total path length. */
    pathLength?: number;
    startTime: number;
  }> = [];
  private readonly MOVE_ANIM_DURATION = 400;
  private combatLog: CombatLogUI;
  private floatingText: FloatingCombatText;
  private diceRollSidebar: DiceRollSidebar;
  private movementTrails: Map<EntityId, THREE.Line> = new Map();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  /** Unit -> last enemy it was ordered to attack (for auto-continue on next turn). */
  private lastAttackTargetByUnit: Map<EntityId, EntityId> = new Map();
  /** Unit -> final movement destination and full A* path for multi-turn waypoint movement. */
  private lastMoveDestinationByUnit: Map<EntityId, {
    x: number;
    y: number;
    /** Full A* path from current position to final destination (recomputed each turn). */
    fullPath?: { x: number; y: number }[];
  }> = new Map();
  /** Flag to bypass unspent AP warning after user confirms. */
  private confirmResolveWithUnspentAP = false;
  /** Queue of combat events to play back with delays after movement. */
  private combatEventQueue: GameEvent[] = [];
  /** Whether we're currently playing back combat events. */
  private isPlayingCombatEvents = false;
  /** Player unit IDs for the quick-select bar. */
  private playerUnitIds: EntityId[] = [];
  /** Delay between combat event groups (ms). */
  private readonly COMBAT_EVENT_DELAY = 950;
  private screenState: ScreenStateManager;
  private toastManager: ToastManager;
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
    this.scene.add(this.previewGroup);
    this.initSelectionRing();
    this.initActiveHighlightRing();

    const aspect = window.innerWidth / window.innerHeight;
    this.cameraController = new CameraController(aspect);
    void new InputManager(this.canvas);

    const seed = Math.floor(Math.random() * 1000000);
    this.engine = new GameEngine({ seed });

    this.combatLog = new CombatLogUI((id) => {
      const world = this.engine.getWorld();
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      if (!identity) return String(id);
      const typeName = identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
      return identity.shortId != null ? `${typeName} #${identity.shortId}` : identity.name;
    });
    document.getElementById("game-container")!.appendChild(this.combatLog.getElement());
    this.combatLog.subscribeToEvents((type, fn) =>
      this.engine.subscribeToEvent(type, fn)
    );

    // Initialize floating combat text
    this.floatingText = new FloatingCombatText(this.scene);
    this.setupCombatTextEvents();

    // Initialize dice roll sidebar
    this.diceRollSidebar = new DiceRollSidebar();
    this.diceRollSidebar.setEntityNameResolver((id) => {
      const world = this.engine.getWorld();
      const identity = world.getComponent<IdentityComponent>(id, 'identity');
      if (!identity) return String(id);
      const typeName = identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
      return identity.shortId != null ? `${typeName} #${identity.shortId}` : identity.name;
    });
    this.diceRollSidebar.setFactionResolver((id) => {
      const world = this.engine.getWorld();
      const faction = world.getComponent<FactionComponent>(id, 'faction');
      return faction?.faction ?? 'enemy';
    });
    document.getElementById('game-container')!.appendChild(this.diceRollSidebar.getElement());

    this.screenState = new ScreenStateManager();
    this.toastManager = new ToastManager(document.getElementById("game-container")!);

    this.setupLighting();
    this.setupUI();
    this.setupEvents();
    window.addEventListener("resize", this.onResize.bind(this));

    this.screenState.transitionTo("menu");
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    this.scene.add(directional);
  }

  private setupUI(): void {
    const scenarioList = document.getElementById("scenario-list")!;
    scenarioList.innerHTML = "";

    if (scenarios.length === 0) {
      const msg = document.createElement("p");
      msg.style.cssText = "color: #888; font-size: 14px;";
      msg.textContent = "No scenarios available.";
      scenarioList.appendChild(msg);
    } else {
      for (const scenario of scenarios) {
        const btn = document.createElement("button");
        btn.className = "scenario-btn";
        btn.innerHTML = `<h3>${scenario.name}</h3><p>${scenario.description}</p>`;
        btn.addEventListener("click", () => this.startScenario(scenario));
        scenarioList.appendChild(btn);
      }
    }

    this.setupScrollArrows(scenarioList);

    const restartBtn = document.getElementById("restart-btn")!;
    restartBtn.addEventListener("click", () => this.restartScenario());
    const menuBtn = document.getElementById("menu-btn")!;
    menuBtn.addEventListener("click", () => this.returnToMenu());

    document.getElementById("pause-resume-btn")!.addEventListener("click", () => this.hidePauseMenu());
    document.getElementById("pause-menu-btn")!.addEventListener("click", () => {
      this.hidePauseMenu();
      this.returnToMenu();
    });
  }

  private setupScrollArrows(list: HTMLElement): void {
    const arrowUp = document.getElementById("scroll-arrow-up");
    const arrowDown = document.getElementById("scroll-arrow-down");
    if (!arrowUp || !arrowDown) return;

    const scrollAmount = 200;

    const updateArrows = () => {
      const atTop = list.scrollTop <= 0;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      const isScrollable = list.scrollHeight > list.clientHeight;

      arrowUp.classList.toggle("visible", isScrollable && !atTop);
      arrowDown.classList.toggle("visible", isScrollable && !atBottom);
    };

    list.addEventListener("scroll", updateArrows, { passive: true });
    arrowUp.addEventListener("click", () => { list.scrollBy({ top: -scrollAmount, behavior: "smooth" }); });
    arrowDown.addEventListener("click", () => { list.scrollBy({ top: scrollAmount, behavior: "smooth" }); });

    // Initial check after content renders
    requestAnimationFrame(updateArrows);
  }

  private setupEvents(): void {
    this.canvas.addEventListener("click", (e) => this.onCanvasClick(e));
    this.engine.subscribeToEvent("PlanningPhaseStarted", () => {
      this.autoContinueMovement();
      this.autoContinueAttacks();
    });
    eventBus.on("escape", () => {
      // If pause menu is open, close it
      if (this.screenState.isPauseMenuVisible()) {
        this.hidePauseMenu();
        return;
      }

      // First try to clear commands if a unit is selected
      if (this.selectedEntityId && this.engine.getPhase() === "planning") {
        const world = this.engine.getWorld();
        const queue = world.getComponent<CommandQueueComponent>(this.selectedEntityId, "commandQueue");
        if (queue && queue.commands.length > 0) {
          this.clearSelectedUnitCommands();
          return;
        }
      }

      // Otherwise, open pause menu (only if in-game)
      if (this.screenState.isInGame()) {
        this.showPauseMenu();
      }
    });
    eventBus.on("backspace", () => {
      this.removeLastCommand();
    });
    eventBus.on("cameraPanDrag", (data: unknown) => {
      const { deltaX, deltaY, canvasWidth, canvasHeight } = data as {
        deltaX: number;
        deltaY: number;
        canvasWidth: number;
        canvasHeight: number;
      };
      this.cameraController.panByScreenDelta(
        deltaX,
        deltaY,
        canvasWidth,
        canvasHeight
      );
    });
  }

  /**
   * At start of planning phase: for each unit that attacked an enemy last turn,
   * if that enemy still exists and is in range, queue attacks automatically.
   */
  private autoContinueAttacks(): void {
    const world = this.engine.getWorld();
    let anyQueued = false;
    for (const [unitId, targetId] of this.lastAttackTargetByUnit) {
      if (!world.hasComponent(unitId, "position") || !world.hasComponent(targetId, "position")) {
        continue;
      }
      const unitHealth = world.getComponent<HealthComponent>(unitId, "health");
      const targetHealth = world.getComponent<HealthComponent>(targetId, "health");
      if (unitHealth?.woundState === "down" || targetHealth?.woundState === "down") {
        continue;
      }
      const unitFaction = world.getComponent<FactionComponent>(unitId, "faction");
      const targetFaction = world.getComponent<FactionComponent>(targetId, "faction");
      if (unitFaction?.faction !== "player" || targetFaction?.faction !== "enemy") {
        continue;
      }
      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const targetPos = world.getComponent<PositionComponent>(targetId, "position");
      const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
      const ap = world.getComponent<ActionPointsComponent>(unitId, "actionPoints");
      const queue = world.getComponent<CommandQueueComponent>(unitId, "commandQueue");
      if (!pos || !targetPos || !ap) continue;

      let fromX = pos.x;
      let fromY = pos.y;
      for (const cmd of queue?.commands ?? []) {
        if (cmd.type === "move") {
          fromX = cmd.targetX;
          fromY = cmd.targetY;
        }
      }
      const attackType = weapon ? getAttackType(weapon) : "melee";
      const attackAp = weapon?.apCost ?? 2;
      const effectiveRange = weapon?.range ?? 1.2;
      const distance = MovementSystem.calculateDistance(
        fromX,
        fromY,
        targetPos.x,
        targetPos.y
      );
      if (distance > effectiveRange) continue;

      const totalQueuedAp = queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
      const remainingAp = ap.current - totalQueuedAp;
      if (remainingAp < attackAp) continue;

      while (
        this.engine.queueCommand(unitId, {
          type: "attack",
          targetId,
          attackType,
          apCost: attackAp,
          priority: weapon?.speed ?? 5,
        })
      ) {
        anyQueued = true;
      }
    }
    if (anyQueued) {
      this.updateTurnBasedUI();
      this.updateCommandPreview();
      this.checkOverwatchAutoResolve();
    }
  }

  /**
   * At start of planning phase: for each unit with a stored multi-turn destination,
   * auto-queue the next movement leg toward that destination.
   */
  private autoContinueMovement(): void {
    const world = this.engine.getWorld();
    let anyQueued = false;

    for (const [unitId, finalDest] of this.lastMoveDestinationByUnit) {
      const unitHealth = world.getComponent<HealthComponent>(unitId, "health");
      if (unitHealth?.woundState === "down") {
        this.lastMoveDestinationByUnit.delete(unitId);
        continue;
      }
      const unitFaction = world.getComponent<FactionComponent>(unitId, "faction");
      if (unitFaction?.faction !== "player") continue;

      // Skip if unit already has queued commands (user may have manually planned)
      const queue = world.getComponent<CommandQueueComponent>(unitId, "commandQueue");
      if (queue && queue.commands.length > 0) continue;

      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const ap = world.getComponent<ActionPointsComponent>(unitId, "actionPoints");
      if (!pos || !ap) continue;

      const distToFinal = MovementSystem.calculateDistance(pos.x, pos.y, finalDest.x, finalDest.y);
      if (distToFinal < 0.5) {
        // Already at destination
        this.lastMoveDestinationByUnit.delete(unitId);
        continue;
      }

      const baseSpeed = UnitFactory.getBaseSpeed(world, unitId);
      const mode = "advance" as const;
      const maxMoveDistance = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
      const dest = MovementSystem.getClampedDestination(
        world, unitId, pos.x, pos.y, finalDest.x, finalDest.y,
        this.engine.getLoadedScenario()?.mapSize, maxMoveDistance
      );

      const apCost = MovementSystem.getMovementApCost(
        pos.x, pos.y, dest.x, dest.y, mode, baseSpeed, ap.current
      );
      if (apCost > ap.current || apCost === 0) continue;

      const success = this.engine.queueCommand(unitId, {
        type: "move",
        targetX: dest.x,
        targetY: dest.y,
        mode,
        apCost,
        priority: 2,
      });

      if (success) {
        anyQueued = true;
        // If this move reaches the final destination, clear it
        const postMoveDist = MovementSystem.calculateDistance(dest.x, dest.y, finalDest.x, finalDest.y);
        if (postMoveDist < 0.5) {
          this.lastMoveDestinationByUnit.delete(unitId);
        } else {
          // Recompute full path from current position for updated preview
          const mapSz = this.engine.getLoadedScenario()?.mapSize;
          const fullPathResult = mapSz
            ? MovementSystem.getPathfindingDestination(
                world, unitId, pos.x, pos.y, finalDest.x, finalDest.y, mapSz
              )
            : null;
          finalDest.fullPath = fullPathResult?.path;
        }
      }
    }

    if (anyQueued) {
      this.updateTurnBasedUI();
      this.updateCommandPreview();
      this.checkOverwatchAutoResolve();
    }
  }

  private showMenu(): void {
    this.screenState.transitionTo("menu");
    this.combatLog?.hide();
    this.diceRollSidebar?.hide();
  }

  private showPauseMenu(): void {
    this.screenState.showPauseMenu();
  }

  private hidePauseMenu(): void {
    this.screenState.hidePauseMenu();
  }

  private hideMenu(): void {
    this.screenState.transitionTo("game");
    this.combatLog?.show();
    this.diceRollSidebar?.show();
  }

  private createTurnBasedPanel(): void {
    if (document.getElementById("turn-based-panel")) return;

    const panel = document.createElement("div");
    panel.id = "turn-based-panel";
    panel.className = "turn-based-panel";
    panel.innerHTML = `
      <div class="tb-controls">
        <span id="tb-turn" class="turn-indicator">Turn: 1</span>
        <span id="tb-phase" class="phase-indicator">Planning</span>
        <button id="tb-resolve" class="resolve-btn">Resolve Turn</button>
        <button id="tb-save" class="secondary-btn">Save</button>
        <button id="tb-load" class="secondary-btn">Load</button>
        <button id="tb-replay" class="secondary-btn">Replay</button>
      </div>
    `;
    // All styling now handled by CSS classes in index.html
    document.getElementById("game-container")!.appendChild(panel);
    this.screenState.setTurnBasedPanel(panel);

    // Own-unit selection info box (bottom-left)
    const infoBox = document.createElement("div");
    infoBox.id = "selection-info-box";
    infoBox.className = "selection-info-box";
    infoBox.innerHTML = `
      <div id="selection-info-title" class="selection-info-title">Selection</div>
      <div id="tb-unit-info" class="tb-unit-info"></div>
    `;
    // All styling now handled by CSS classes in index.html
    document.getElementById("game-container")!.appendChild(infoBox);

    // Enemy unit info box (bottom-right) — separate area when clicking enemy
    const enemyInfoBox = document.createElement("div");
    enemyInfoBox.id = "enemy-info-box";
    enemyInfoBox.className = "enemy-info-box";
    enemyInfoBox.innerHTML = `
      <div id="enemy-info-title" class="enemy-info-title">Enemy</div>
      <div id="tb-enemy-info" class="tb-enemy-info"></div>
    `;
    // All styling now handled by CSS classes in index.html
    document.getElementById("game-container")!.appendChild(enemyInfoBox);

    // Wire up event listeners
    document.getElementById("tb-resolve")!.addEventListener("click", () => {
      this.onResolveTurn();
    });
    document.getElementById("tb-save")!.addEventListener("click", () => {
      this.saveGame();
    });
    document.getElementById("tb-load")!.addEventListener("click", () => {
      this.loadGame();
    });
    document.getElementById("tb-replay")!.addEventListener("click", () => {
      this.showReplayUI();
    });
  }

  private createUnitQuickBar(): void {
    // Remove existing bar if any
    document.getElementById("unit-quick-bar")?.remove();

    const bar = document.createElement("div");
    bar.id = "unit-quick-bar";
    bar.className = "unit-quick-bar";

    const world = this.engine.getWorld();
    for (const id of this.playerUnitIds) {
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      const typeName = identity
        ? identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1)
        : "Unit";
      const displayName = identity?.shortId != null
        ? `${typeName} #${identity.shortId}`
        : (identity?.name ?? "Unit");

      const btn = document.createElement("button");
      btn.className = "unit-quick-btn";
      btn.dataset.entityId = String(id);
      btn.innerHTML = `
        <span class="unit-quick-name">${displayName}</span>
        <div class="unit-quick-bars">
          <div class="unit-quick-bar-row">
            <span class="unit-quick-bar-label">HP</span>
            <div class="unit-quick-bar-track"><div class="unit-quick-bar-fill hp" data-bar="hp"></div></div>
          </div>
          <div class="unit-quick-bar-row">
            <span class="unit-quick-bar-label">AP</span>
            <div class="unit-quick-bar-track"><div class="unit-quick-bar-fill ap" data-bar="ap"></div></div>
          </div>
        </div>
      `;
      btn.addEventListener("click", () => {
        this.selectedEntityId = id;
        this.updateTurnBasedUI();
        this.updateCommandPreview();
        this.updateSelectionRing();
        this.updateUnitQuickBar();
      });
      bar.appendChild(btn);
    }

    document.getElementById("game-container")!.appendChild(bar);
    this.updateUnitQuickBar();
  }

  private updateUnitQuickBar(): void {
    const bar = document.getElementById("unit-quick-bar");
    if (!bar) return;

    const world = this.engine.getWorld();
    const buttons = bar.querySelectorAll<HTMLButtonElement>(".unit-quick-btn");

    for (const btn of buttons) {
      const id = btn.dataset.entityId as EntityId;

      const health = world.getComponent<HealthComponent>(id, "health");
      const ap = world.getComponent<ActionPointsComponent>(id, "actionPoints");

      // Selected state
      btn.classList.toggle("selected", id === this.selectedEntityId);

      // Dead state
      const isDead = health?.woundState === "down";
      btn.classList.toggle("dead", isDead);

      // HP bar
      const hpFill = btn.querySelector<HTMLElement>('[data-bar="hp"]');
      if (hpFill && health) {
        const hpPct = Math.max(0, (health.current / health.max) * 100);
        hpFill.style.width = `${hpPct}%`;
        hpFill.classList.toggle("low", hpPct <= 25);
        hpFill.classList.toggle("mid", hpPct > 25 && hpPct <= 50);
      }

      // AP bar (account for queued command costs)
      const apFill = btn.querySelector<HTMLElement>('[data-bar="ap"]');
      if (apFill && ap) {
        const queue = world.getComponent<CommandQueueComponent>(id, "commandQueue");
        const queuedAp = queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
        const remainingAp = Math.max(0, ap.current - queuedAp);
        const apPct = Math.max(0, (remainingAp / ap.max) * 100);
        apFill.style.width = `${apPct}%`;
      }
    }
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
    // All styling now handled by CSS #replay-modal selector in index.html

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

      this.setupTerrain(
        scenario.mapSize.width,
        scenario.mapSize.height,
        scenario.obstacles
      );
      this.cameraController.setBounds(scenario.mapSize.width, scenario.mapSize.height);
      this.playerUnitIds = loaded.playerUnitIds;
      this.createEntityMeshes(loaded.playerUnitIds.concat(loaded.enemyUnitIds));
      this.syncMeshPositions();
      this.createUnitQuickBar();
      this.updateTurnBasedUI();
    } catch (e) {
      console.error("Failed to load save:", e);
    }
  }

  private startScenario(scenario: Scenario): void {
    this.clearScenario();

    const loaded = this.engine.loadScenario(scenario);
    this.playerUnitIds = loaded.playerUnitIds;
    this.createEntityMeshes(loaded.playerUnitIds.concat(loaded.enemyUnitIds));
    this.combatLog.clear();
    this.diceRollSidebar.clear();

    this.setupTerrain(scenario.mapSize.width, scenario.mapSize.height, scenario.obstacles);
    this.cameraController.setBounds(scenario.mapSize.width, scenario.mapSize.height);
    this.cameraController.zoomToFit(scenario.mapSize.width, scenario.mapSize.height);
    this.cameraController.setPosition(0, 0);

    this.createTurnBasedPanel();
    this.createUnitQuickBar();
    this.hideMenu();
    this.updateTurnBasedUI();
    this.updateObjectives(scenario.objectives);
  }

  private clearScenario(): void {
    for (const mesh of this.entityMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.entityMeshes.clear();
    if (this.terrainGroup) {
      this.scene.remove(this.terrainGroup);
      this.terrainGroup = null;
    }
    this.selectedEntityId = null;
    this.lastAttackTargetByUnit.clear();
    this.lastMoveDestinationByUnit.clear();
    this.playerUnitIds = [];
    this.terrainObstacles = [];
    this.clearCommandPreview();
    this.updateSelectionRing();
    document.getElementById("unit-quick-bar")?.remove();
  }

  private initSelectionRing(): void {
    const ringGeom = new THREE.RingGeometry(0.48, 0.55, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
    });
    this.selectionRing = new THREE.Mesh(ringGeom, ringMat);
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
  }

  private initActiveHighlightRing(): void {
    const ringGeom = new THREE.RingGeometry(0.5, 0.58, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.activeHighlightRing = new THREE.Mesh(ringGeom, ringMat);
    this.activeHighlightRing.visible = false;
    this.scene.add(this.activeHighlightRing);
  }

  private showActiveHighlight(entityId: EntityId): void {
    this.activeHighlightEntityId = entityId;
    if (!this.activeHighlightRing) return;
    const group = this.entityMeshes.get(entityId);
    if (!group) {
      this.activeHighlightRing.visible = false;
      return;
    }
    this.activeHighlightRing.position.set(group.position.x, 0.03, group.position.z);
    this.activeHighlightRing.visible = true;
  }

  private hideActiveHighlight(): void {
    this.activeHighlightEntityId = null;
    if (this.activeHighlightRing) {
      this.activeHighlightRing.visible = false;
    }
  }

  private updateActiveHighlightPulse(): void {
    if (!this.activeHighlightRing || !this.activeHighlightRing.visible) return;
    // Pulse opacity between 0.4 and 0.9
    const t = performance.now() / 400;
    const opacity = 0.65 + 0.25 * Math.sin(t);
    (this.activeHighlightRing.material as THREE.MeshBasicMaterial).opacity = opacity;

    // Track the highlighted entity's position (it may be animating)
    if (this.activeHighlightEntityId) {
      const group = this.entityMeshes.get(this.activeHighlightEntityId);
      if (group) {
        this.activeHighlightRing.position.set(group.position.x, 0.03, group.position.z);
      }
    }
  }

  private updateSelectionRing(): void {
    if (!this.selectionRing) return;
    if (!this.selectedEntityId) {
      this.selectionRing.visible = false;
      return;
    }
    const world = this.engine.getWorld();
    const pos = world.getComponent<PositionComponent>(this.selectedEntityId, "position");
    if (!pos) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.position.set(pos.x, 0.02, pos.y);
    this.selectionRing.visible = true;
  }

  private createEntityMeshes(entityIds: EntityId[]): void {
    const world = this.engine.getWorld();

    for (const id of entityIds) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const faction = world.getComponent<FactionComponent>(id, "faction");
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      if (!pos || !faction) continue;

      const color = faction.faction === "player" ? 0x3366ff : 0xff3333;
      const unitType = (identity?.unitType ?? "warrior") as UnitType;
      const bodyGroup = buildUnitMesh(unitType, color, 1);

      bodyGroup.position.set(pos.x, 0.06, pos.y);
      bodyGroup.userData = { entityId: id };

      this.scene.add(bodyGroup);
      this.entityMeshes.set(id, bodyGroup);

      // Initialize floating text position
      this.floatingText.updateEntityPosition(id, pos.x, pos.y);
    }
  }

  private setupTerrain(
    width: number,
    height: number,
    obstacles?: Array<{
      type: string;
      position: { x: number; z: number };
      rotation?: number;
      scale?: number;
      length?: number;
    }>
  ): void {
    const group = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(width, height, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(width, height),
      Math.max(width, height) / 2,
      0x2a2a4a,
      0x2a2a4a
    );
    grid.position.y = 0.01;
    group.add(grid);

    this.terrainObstacles = [];
    if (obstacles?.length) {
      for (const def of obstacles) {
        const obstacle = new Obstacle({
          type: def.type as ObstacleType,
          position: def.position,
          rotation: def.rotation,
          scale: def.scale,
          length: def.length,
        });
        group.add(obstacle.mesh);
        this.terrainObstacles.push(obstacle);
      }
    }

    this.scene.add(group);
    this.terrainGroup = group;
  }

  private syncMeshPositions(): void {
    const world = this.engine.getWorld();

    for (const [id, group] of this.entityMeshes) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const health = world.getComponent<HealthComponent>(id, "health");
      if (!pos) continue;

      group.position.set(pos.x, 0.06, pos.y);

      // Update floating text position
      this.floatingText.updateEntityPosition(id, pos.x, pos.y);

      if (health && health.woundState === "down") {
        // Make fallen units grey and lay them down
        group.visible = true;
        group.rotation.x = Math.PI / 2; // Lay flat
        group.position.y = 0.02; // Lower to ground
        this.setMeshGroupColor(group, 0x555555); // Grey color
      }
    }
    this.updateSelectionRing();
  }

  private setMeshGroupColor(group: THREE.Group, color: number): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.color) {
          mat.color.setHex(color);
        }
      }
    });
  }

  private clearCommandPreview(): void {
    while (this.previewGroup.children.length > 0) {
      const obj = this.previewGroup.children[0];
      this.previewGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const mat = obj.material as THREE.Material;
        if (mat) mat.dispose();
      } else if (obj instanceof THREE.Sprite) {
        (obj.material as THREE.SpriteMaterial).map?.dispose();
        (obj.material as THREE.SpriteMaterial).dispose();
      }
    }
  }

  /** Create a 3D sprite showing AP cost and pace for a movement segment */
  private createAPLabelSprite(
    apCost: number,
    x: number,
    z: number,
    pace?: "walk" | "advance" | "run" | "sprint"
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const width = 160;
    const height = 40;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Pace-specific styling
    const paceConfig: Record<string, { color: string; bgColor: string; label: string }> = {
      walk: { color: "#6bcf7b", bgColor: "rgba(107, 207, 123, 0.15)", label: "Walk" },
      advance: { color: "#4fc3f7", bgColor: "rgba(79, 195, 247, 0.15)", label: "Advance" },
      run: { color: "#ffb74d", bgColor: "rgba(255, 183, 77, 0.15)", label: "Run" },
      sprint: { color: "#ff7043", bgColor: "rgba(255, 112, 67, 0.15)", label: "Sprint" },
    };
    const config = pace ? paceConfig[pace] : null;
    const accentColor = config?.color || "#e8c547";

    // Draw rounded rectangle background with glass effect
    const radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, height);
    ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();

    // Dark glass background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "rgba(20, 20, 28, 0.92)");
    bgGradient.addColorStop(1, "rgba(13, 13, 18, 0.95)");
    ctx.fillStyle = bgGradient;
    ctx.fill();

    // Subtle inner glow at top
    ctx.save();
    ctx.clip();
    const innerGlow = ctx.createLinearGradient(0, 0, 0, 12);
    innerGlow.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    innerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = innerGlow;
    ctx.fillRect(0, 0, width, 12);
    ctx.restore();

    // Border with accent color
    ctx.strokeStyle = `${accentColor}40`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const apText = apCost === Infinity || apCost >= 99 ? "ALL" : String(apCost);

    if (pace && config) {
      // Left side: colored indicator bar
      ctx.beginPath();
      ctx.roundRect(8, 10, 3, height - 20, 1.5);
      ctx.fillStyle = config.color;
      ctx.fill();

      // Pace label
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "rgba(240, 240, 245, 0.9)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(config.label, 18, height / 2);

      // Separator dot
      ctx.beginPath();
      ctx.arc(width / 2 + 8, height / 2, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fill();

      // AP cost badge on right
      const apBadgeWidth = 42;
      const apBadgeX = width - apBadgeWidth - 8;
      ctx.beginPath();
      ctx.roundRect(apBadgeX, 8, apBadgeWidth, height - 16, 10);
      ctx.fillStyle = "rgba(232, 197, 71, 0.15)";
      ctx.fill();

      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#e8c547";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${apText} AP`, apBadgeX + apBadgeWidth / 2, height / 2);
    } else {
      // Simple centered AP display
      ctx.font = "700 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#e8c547";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${apText} AP`, width / 2, height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(1.8, 0.45, 1);
    return sprite;
  }

  private updateCommandPreview(): void {
    this.clearCommandPreview();
    if (this.engine.getPhase() !== "planning") return;

    const world = this.engine.getWorld();
    const loaded = this.engine.getLoadedScenario();
    if (!loaded) return;

    // Show commands for ALL player units, not just the selected one
    for (const unitId of loaded.playerUnitIds) {
      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const queue = world.getComponent<CommandQueueComponent>(unitId, "commandQueue");
      const health = world.getComponent<HealthComponent>(unitId, "health");
      if (!pos || health?.woundState === "down") continue;
      if (!queue || queue.commands.length === 0) continue;

      // Use brighter colors for selected unit, dimmer for others
      const isSelected = unitId === this.selectedEntityId;
      const moveOpacity = isSelected ? 0.8 : 0.4;
      const attackOpacity = isSelected ? 0.8 : 0.4;
      const markerOpacity = isSelected ? 0.8 : 0.5;

      let lastX = pos.x;
      let lastZ = pos.y;

      // Track attack targets for counting multiple attacks
      const attacksByTarget = new Map<EntityId, number>();

      for (const cmd of queue.commands) {
        if (cmd.type === "move") {
          // Use the stored full A* path to draw the current-turn portion accurately
          const storedDest = this.lastMoveDestinationByUnit.get(unitId);
          const storedPath = storedDest?.fullPath;

          const points: THREE.Vector3[] = [];

          if (storedPath && storedPath.length >= 2) {
            // Walk along the stored A* path and collect points up to the move target
            const turnEndX = cmd.targetX;
            const turnEndY = cmd.targetY;
            const moveDistance = MovementSystem.calculateDistance(lastX, lastZ, turnEndX, turnEndY);

            // Collect path segments up to the move distance along the path
            let distAccum = 0;
            points.push(new THREE.Vector3(storedPath[0].x, 0.12, storedPath[0].y));
            for (let i = 1; i < storedPath.length; i++) {
              const segLen = MovementSystem.calculateDistance(
                storedPath[i - 1].x, storedPath[i - 1].y,
                storedPath[i].x, storedPath[i].y
              );
              if (distAccum + segLen >= moveDistance) {
                // Turn endpoint falls on this segment
                points.push(new THREE.Vector3(turnEndX, 0.12, turnEndY));
                break;
              }
              distAccum += segLen;
              points.push(new THREE.Vector3(storedPath[i].x, 0.12, storedPath[i].y));
            }
            // Ensure we end at the turn target
            if (points.length >= 1) {
              const last = points[points.length - 1];
              if (MovementSystem.calculateDistance(last.x, last.z, turnEndX, turnEndY) > 0.3) {
                points.push(new THREE.Vector3(turnEndX, 0.12, turnEndY));
              }
            }
          } else {
            // No stored path — straight line (single-turn move or no multi-turn dest)
            points.push(
              new THREE.Vector3(lastX, 0.12, lastZ),
              new THREE.Vector3(cmd.targetX, 0.12, cmd.targetY),
            );
          }

          const geom = new THREE.BufferGeometry().setFromPoints(points);
          const lineMat = new THREE.LineDashedMaterial({
            color: 0x4fc3f7,
            dashSize: 0.25,
            gapSize: 0.12,
            transparent: true,
            opacity: moveOpacity,
          });
          const line = new THREE.Line(geom, lineMat);
          line.computeLineDistances();
          this.previewGroup.add(line);

          // Destination marker
          const destMarker = this.createDestinationMarker(cmd.targetX, cmd.targetY, markerOpacity);
          this.previewGroup.add(destMarker);

          // Only show AP labels for selected unit to reduce clutter
          if (isSelected) {
            const midX = (lastX + cmd.targetX) / 2;
            const midZ = (lastZ + cmd.targetY) / 2;
            const apSprite = this.createAPLabelSprite(
              cmd.apCost,
              midX,
              midZ,
              cmd.mode
            );
            this.previewGroup.add(apSprite);
          }

          lastX = cmd.targetX;
          lastZ = cmd.targetY;
        } else if (cmd.type === "attack") {
          const count = (attacksByTarget.get(cmd.targetId) ?? 0) + 1;
          attacksByTarget.set(cmd.targetId, count);
        }
      }

      // Draw attack lines with count indicator
      for (const [targetId, count] of attacksByTarget) {
        const targetPos = world.getComponent<PositionComponent>(targetId, "position");
        if (targetPos) {
          const attackPoints = [
            new THREE.Vector3(lastX, 0.14, lastZ),
            new THREE.Vector3(targetPos.x, 0.14, targetPos.y),
          ];
          const geom = new THREE.BufferGeometry().setFromPoints(attackPoints);
          const attackMat = new THREE.LineDashedMaterial({
            color: 0xef5350,
            dashSize: 0.3,
            gapSize: 0.15,
            transparent: true,
            opacity: attackOpacity,
          });
          const line = new THREE.Line(geom, attackMat);
          line.computeLineDistances();
          this.previewGroup.add(line);

          // Only show attack indicators for selected unit to reduce clutter
          if (isSelected) {
            const midX = (lastX + targetPos.x) / 2;
            const midZ = (lastZ + targetPos.y) / 2;
            const attackSprite = this.createAttackIndicatorSprite(count, midX, midZ);
            this.previewGroup.add(attackSprite);
          }
        }
      }

      // Add post-move range circle only for selected unit (shows weapon range)
      if (isSelected && (lastX !== pos.x || lastZ !== pos.y)) {
        const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
        const meleeRange = weapon?.range ?? 1.2;
        const postMoveRangeCircle = this.createRangeCircle(
          lastX,
          lastZ,
          meleeRange,
          0xffcc00,
          true // dashed
        );
        this.previewGroup.add(postMoveRangeCircle);
      }

      // Draw faded path to final multi-turn destination (only for selected unit)
      if (isSelected) {
        const finalDest = this.lastMoveDestinationByUnit.get(unitId);
        if (finalDest) {
          const distToFinal = MovementSystem.calculateDistance(lastX, lastZ, finalDest.x, finalDest.y);
          if (distToFinal > 0.5) {
            const pathPoints: THREE.Vector3[] = [];

            if (finalDest.fullPath && finalDest.fullPath.length >= 2) {
              // Walk along the stored path, skipping segments until we pass the turn endpoint,
              // then collect the remaining segments to the final destination
              const moveDistFromStart = Pathfinder.pathLength(finalDest.fullPath) - distToFinal;
              let distAccum = 0;
              let started = false;

              for (let i = 1; i < finalDest.fullPath.length; i++) {
                const segLen = MovementSystem.calculateDistance(
                  finalDest.fullPath[i - 1].x, finalDest.fullPath[i - 1].y,
                  finalDest.fullPath[i].x, finalDest.fullPath[i].y
                );

                if (!started) {
                  if (distAccum + segLen >= moveDistFromStart - 0.1) {
                    // Turn endpoint falls on or just past this segment
                    started = true;
                    pathPoints.push(new THREE.Vector3(lastX, 0.12, lastZ));
                    pathPoints.push(new THREE.Vector3(finalDest.fullPath[i].x, 0.12, finalDest.fullPath[i].y));
                  }
                  distAccum += segLen;
                } else {
                  pathPoints.push(new THREE.Vector3(finalDest.fullPath[i].x, 0.12, finalDest.fullPath[i].y));
                }
              }
            }

            // Fallback if stored path extraction didn't produce enough points
            if (pathPoints.length < 2) {
              pathPoints.length = 0;
              // Compute fresh A* from turn endpoint to final destination
              const mapSize = this.engine.getLoadedScenario()?.mapSize;
              if (mapSize) {
                const freshPath = Pathfinder.findPath(
                  world, unitId, lastX, lastZ, finalDest.x, finalDest.y,
                  mapSize.width, mapSize.height
                );
                if (freshPath && freshPath.length >= 2) {
                  for (const p of freshPath) {
                    pathPoints.push(new THREE.Vector3(p.x, 0.12, p.y));
                  }
                }
              }
              if (pathPoints.length < 2) {
                pathPoints.length = 0;
                pathPoints.push(new THREE.Vector3(lastX, 0.12, lastZ));
                pathPoints.push(new THREE.Vector3(finalDest.x, 0.12, finalDest.y));
              }
            }

            const geom = new THREE.BufferGeometry().setFromPoints(pathPoints);
            const lineMat = new THREE.LineDashedMaterial({
              color: 0xffb74d,
              dashSize: 0.15,
              gapSize: 0.2,
              transparent: true,
              opacity: 0.3,
            });
            const line = new THREE.Line(geom, lineMat);
            line.computeLineDistances();
            this.previewGroup.add(line);

            // Final destination marker
            const marker = this.createFinalDestinationMarker(finalDest.x, finalDest.y);
            this.previewGroup.add(marker);
          }
        }
      }
    }
  }

  private createDestinationMarker(x: number, z: number, opacity: number = 0.8): THREE.Mesh {
    // Simple small dot marker
    const dotGeometry = new THREE.CircleGeometry(0.15, 16);
    dotGeometry.rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, 0.03, z);
    return dot;
  }

  private createFinalDestinationMarker(x: number, z: number): THREE.Group {
    const group = new THREE.Group();

    // Outer ring in amber/gold
    const ringGeometry = new THREE.RingGeometry(0.18, 0.25, 24);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(x, 0.04, z);
    group.add(ring);

    // Inner dot
    const dotGeometry = new THREE.CircleGeometry(0.08, 16);
    dotGeometry.rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.5,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, 0.04, z);
    group.add(dot);

    return group;
  }

  private createAttackIndicatorSprite(attackCount: number, x: number, z: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const width = 100;
    const height = 36;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Draw rounded rectangle background
    const radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, height);
    ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();

    // Dark glass background with red tint
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "rgba(40, 18, 18, 0.92)");
    bgGradient.addColorStop(1, "rgba(25, 12, 12, 0.95)");
    ctx.fillStyle = bgGradient;
    ctx.fill();

    // Subtle inner glow at top
    ctx.save();
    ctx.clip();
    const innerGlow = ctx.createLinearGradient(0, 0, 0, 10);
    innerGlow.addColorStop(0, "rgba(255, 120, 120, 0.1)");
    innerGlow.addColorStop(1, "rgba(255, 120, 120, 0)");
    ctx.fillStyle = innerGlow;
    ctx.fillRect(0, 0, width, 10);
    ctx.restore();

    // Border with red accent
    ctx.strokeStyle = "rgba(232, 90, 90, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Left indicator bar
    ctx.beginPath();
    ctx.roundRect(8, 9, 3, height - 18, 1.5);
    ctx.fillStyle = "#e85a5a";
    ctx.fill();

    // Attack text
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(240, 240, 245, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Attack", 17, height / 2);

    // Count badge if multiple attacks
    if (attackCount > 1) {
      const badgeX = width - 28;
      ctx.beginPath();
      ctx.arc(badgeX, height / 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232, 90, 90, 0.3)";
      ctx.fill();

      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#ff8080";
      ctx.textAlign = "center";
      ctx.fillText(`×${attackCount}`, badgeX, height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(1.1, 0.4, 1);
    return sprite;
  }

  private createRangeCircle(
    x: number,
    z: number,
    radius: number,
    color: number,
    dashed: boolean = false
  ): THREE.Line {
    const segments = 64;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          x + Math.cos(angle) * radius,
          0.02,
          z + Math.sin(angle) * radius
        )
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color,
          dashSize: 0.15,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.6,
        })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });

    const circle = new THREE.Line(geometry, material);
    if (dashed) {
      circle.computeLineDistances();
    }
    return circle;
  }

  private onResolveTurn(): void {
    if (this.engine.getPhase() !== "planning") return;

    // Check for units with unspent AP
    const unitsWithUnspentAP = this.getUnitsWithUnspentAP();
    if (unitsWithUnspentAP.length > 0 && !this.confirmResolveWithUnspentAP) {
      this.showUnspentAPWarning(unitsWithUnspentAP);
      return;
    }
    this.confirmResolveWithUnspentAP = false;

    this.clearCommandPreview();
    const oldPositions = new Map<EntityId, { x: number; y: number }>();
    for (const [id, group] of this.entityMeshes) {
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

    this.startMovementAnimations(oldPositions);
  }

  private startMovementAnimations(
    oldPositions: Map<EntityId, { x: number; y: number }>
  ): void {
    const world = this.engine.getWorld();
    const now = performance.now();

    // Clear any existing trails
    this.clearAllMovementTrails();

    // Build a map of entityId -> path from UnitMoved events
    const eventHistory = this.engine.getEventBus().getHistory();
    const pathsByEntity = new Map<EntityId, { x: number; y: number }[]>();
    for (let i = eventHistory.length - 1; i >= 0; i--) {
      const evt = eventHistory[i];
      if (evt.type === "TurnEnded") break; // Only look at current turn's events
      if (evt.type === "UnitMoved" && evt.entityId != null && evt.data.path) {
        pathsByEntity.set(evt.entityId, evt.data.path as { x: number; y: number }[]);
      }
    }

    for (const [id] of this.entityMeshes) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const health = world.getComponent<HealthComponent>(id, "health");
      if (!pos || (health && health.woundState === "down")) continue;

      const old = oldPositions.get(id);
      const dx = pos.x - (old?.x ?? pos.x);
      const dy = pos.y - (old?.y ?? pos.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) continue;

      const from = { x: old?.x ?? pos.x, y: old?.y ?? pos.y };
      const to = { x: pos.x, y: pos.y };
      const eventPath = pathsByEntity.get(id);

      // Use path waypoints if available (2+ points), otherwise straight line
      let path: { x: number; y: number }[] | undefined;
      let pathDistances: number[] | undefined;
      let pathLength: number | undefined;

      if (eventPath && eventPath.length >= 2) {
        path = eventPath;
        // Precompute cumulative distances for uniform-speed interpolation
        pathDistances = [0];
        let cumDist = 0;
        for (let i = 1; i < path.length; i++) {
          const segDx = path[i].x - path[i - 1].x;
          const segDy = path[i].y - path[i - 1].y;
          cumDist += Math.sqrt(segDx * segDx + segDy * segDy);
          pathDistances.push(cumDist);
        }
        pathLength = cumDist;
      }

      // Create movement trail along path
      this.createMovementTrail(id, from.x, from.y, to.x, to.y, path);

      this.movementAnimations.push({
        id,
        from,
        to,
        path,
        pathDistances,
        pathLength,
        startTime: now,
      });
    }

    if (this.movementAnimations.length === 0) {
      this.finishTurnResolution();
    }
  }

  private updateMovementAnimations(now: number): void {
    if (this.movementAnimations.length === 0) return;

    const duration = this.MOVE_ANIM_DURATION;
    const remaining: typeof this.movementAnimations = [];

    for (const anim of this.movementAnimations) {
      const elapsed = now - anim.startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const group = this.entityMeshes.get(anim.id);
      if (!group) continue;

      let x: number;
      let y: number;

      if (anim.path && anim.pathDistances && anim.pathLength && anim.pathLength > 0) {
        // Interpolate along path waypoints
        const targetDist = eased * anim.pathLength;
        // Find which segment we're on
        let segIdx = 0;
        for (let i = 1; i < anim.pathDistances.length; i++) {
          if (anim.pathDistances[i] >= targetDist) {
            segIdx = i - 1;
            break;
          }
          segIdx = i - 1;
        }
        const segStart = anim.pathDistances[segIdx];
        const segEnd = anim.pathDistances[segIdx + 1] ?? segStart;
        const segLen = segEnd - segStart;
        const segT = segLen > 0 ? (targetDist - segStart) / segLen : 0;
        const p0 = anim.path[segIdx];
        const p1 = anim.path[segIdx + 1] ?? p0;
        x = p0.x + (p1.x - p0.x) * segT;
        y = p0.y + (p1.y - p0.y) * segT;
      } else {
        // Straight line interpolation
        x = anim.from.x + (anim.to.x - anim.from.x) * eased;
        y = anim.from.y + (anim.to.y - anim.from.y) * eased;
      }

      group.position.set(x, 0.06, y);

      // Update floating text position during animation
      this.floatingText.updateEntityPosition(anim.id, x, y);

      if (this.selectedEntityId === anim.id) {
        if (this.selectionRing) this.selectionRing.position.set(x, 0.02, y);
      }

      if (t < 1) {
        remaining.push(anim);
      } else {
        // Clear trail when animation finishes
        this.clearMovementTrail(anim.id);
      }
    }

    this.movementAnimations = remaining;

    if (this.movementAnimations.length === 0) {
      this.finishTurnResolution();
    }
  }

  private async finishTurnResolution(): Promise<void> {
    this.syncMeshPositions();
    this.clearAllMovementTrails();
    this.updateFloatingTextPositions();

    // Play back combat events with staggered delays
    await this.playCombatEventsWithDelay();

    this.updateTurnBasedUI();
    this.checkVictory();
  }

  private clearSelectedUnitCommands(): void {
    if (!this.selectedEntityId) return;
    if (this.engine.getPhase() !== "planning") return;

    const world = this.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(this.selectedEntityId, "faction");
    if (faction?.faction !== "player") return;

    this.engine.clearCommands(this.selectedEntityId);
    this.lastAttackTargetByUnit.delete(this.selectedEntityId);
    this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
    this.updateTurnBasedUI();
    this.updateCommandPreview();
    this.checkOverwatchAutoResolve();
  }

  private removeLastCommand(): void {
    if (!this.selectedEntityId) return;
    if (this.engine.getPhase() !== "planning") return;

    const world = this.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(this.selectedEntityId, "faction");
    if (faction?.faction !== "player") return;

    const queue = world.getComponent<CommandQueueComponent>(this.selectedEntityId, "commandQueue");
    if (!queue || queue.commands.length === 0) return;

    // Remove the last command
    const newCommands = queue.commands.slice(0, -1);
    world.addComponent<CommandQueueComponent>(this.selectedEntityId, {
      type: "commandQueue",
      commands: newCommands,
      currentCommandIndex: 0,
    });

    this.updateTurnBasedUI();
    this.updateCommandPreview();
    this.checkOverwatchAutoResolve();
  }

  private removeCommandAtIndex(index: number): void {
    if (!this.selectedEntityId) return;
    if (this.engine.getPhase() !== "planning") return;

    const world = this.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(this.selectedEntityId, "faction");
    if (faction?.faction !== "player") return;

    const queue = world.getComponent<CommandQueueComponent>(this.selectedEntityId, "commandQueue");
    if (!queue || index < 0 || index >= queue.commands.length) return;

    // Commands are displayed sorted by priority, so we need to find the actual command
    const sortedCommands = [...queue.commands].sort((a, b) => a.priority - b.priority);
    const commandToRemove = sortedCommands[index];

    // Find and remove the command from the original queue
    const newCommands = queue.commands.filter(cmd => cmd !== commandToRemove);
    world.addComponent<CommandQueueComponent>(this.selectedEntityId, {
      type: "commandQueue",
      commands: newCommands,
      currentCommandIndex: 0,
    });

    // If a move command was removed, clear saved multi-turn destination
    // so it doesn't auto-resume next turn
    if (commandToRemove.type === "move") {
      this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
    }

    this.updateTurnBasedUI();
    this.updateCommandPreview();
    this.checkOverwatchAutoResolve();
  }

  private queueOverwatchCommand(): void {
    if (!this.selectedEntityId) return;
    this.queueOverwatchForUnit(this.selectedEntityId, true);
  }

  /** Queue overwatch for a specific unit. Returns true if successful. */
  private queueOverwatchForUnit(unitId: EntityId, showMessage: boolean = false): boolean {
    if (this.engine.getPhase() !== "planning") return false;

    const world = this.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(unitId, "faction");
    if (faction?.faction !== "player") return false;

    const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
    const attackType = weapon ? getAttackType(weapon) : "melee";

    const success = this.engine.queueCommand(unitId, {
      type: "overwatch",
      attackType,
      apCost: 2,
      priority: 1, // High priority - set up overwatch early in resolution
    });

    if (success) {
      this.lastMoveDestinationByUnit.delete(unitId);
      if (showMessage) {
        this.showTemporaryMessage(`Overwatch (${attackType}) queued - will attack enemies entering range`);
        this.updateTurnBasedUI();
        this.updateCommandPreview();
      }
      this.checkOverwatchAutoResolve();
    }

    return success;
  }

  /** Queue overwatch for all units with unspent AP (that have at least 2 AP). */
  private queueOverwatchForAllUnspent(units: Array<{ id: EntityId; name: string; unspentAP: number }>): number {
    let count = 0;
    for (const unit of units) {
      if (unit.unspentAP >= 2) {
        if (this.queueOverwatchForUnit(unit.id, false)) {
          count++;
        }
      }
    }
    if (count > 0) {
      this.showTemporaryMessage(`Overwatch set for ${count} unit${count > 1 ? "s" : ""}`);
      this.updateTurnBasedUI();
      this.updateCommandPreview();
    }
    return count;
  }

  private showTemporaryMessage(message: string): void {
    this.toastManager.show(message);
  }

  /** Get all player units that have unspent AP (AP not allocated to commands). */
  private getUnitsWithUnspentAP(): Array<{ id: EntityId; name: string; unspentAP: number }> {
    const loaded = this.engine.getLoadedScenario();
    if (!loaded) return [];

    const world = this.engine.getWorld();
    const result: Array<{ id: EntityId; name: string; unspentAP: number }> = [];

    for (const id of loaded.playerUnitIds) {
      const health = world.getComponent<HealthComponent>(id, "health");
      if (health?.woundState === "down") continue;

      const ap = world.getComponent<ActionPointsComponent>(id, "actionPoints");
      const queue = world.getComponent<CommandQueueComponent>(id, "commandQueue");
      const identity = world.getComponent<IdentityComponent>(id, "identity");

      if (!ap) continue;

      // Skip units on overwatch - they intentionally reserve AP for reactions
      const hasOverwatch = queue?.commands.some(c => c.type === "overwatch") ?? false;
      if (hasOverwatch) continue;

      const queuedAP = queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
      const unspentAP = ap.current - queuedAP;

      if (unspentAP > 0) {
        const name = identity?.name ?? "Unit";
        result.push({ id, name, unspentAP });
      }
    }

    return result;
  }

  /** Show warning dialog about units with unspent AP. */
  private showUnspentAPWarning(units: Array<{ id: EntityId; name: string; unspentAP: number }>): void {
    const existing = document.getElementById("unspent-ap-warning");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "unspent-ap-warning";
    // All styling now handled by CSS classes in index.html

    // Build unit list with individual overwatch buttons
    const unitListHtml = units
      .map((u, idx) => {
        const canOverwatch = u.unspentAP >= 2;
        const overwatchBtn = canOverwatch
          ? `<button class="unit-overwatch-btn" data-unit-idx="${idx}">Overwatch</button>`
          : `<span class="insufficient-ap">Need 2 AP</span>`;
        return `<div class="unspent-unit-row">
          <span class="unit-name">${u.name}</span>
          <span class="unit-ap"><span style="color:var(--accent-gold)">${u.unspentAP} AP</span></span>
          ${overwatchBtn}
        </div>`;
      })
      .join("");

    // Check if any unit can use overwatch
    const anyCanOverwatch = units.some(u => u.unspentAP >= 2);

    modal.innerHTML = `
      <div class="warning-title">Units with Unspent AP</div>
      <div class="unit-list">${unitListHtml}</div>
      <div class="warning-buttons">
        <button id="unspent-ap-cancel" class="cancel-btn">Cancel</button>
        ${anyCanOverwatch ? '<button id="unspent-ap-overwatch-all" class="overwatch-all-btn">Overwatch All</button>' : ''}
        <button id="unspent-ap-confirm" class="confirm-btn">Resolve Anyway</button>
      </div>
    `;

    document.getElementById("game-container")!.appendChild(modal);

    // Wire up individual overwatch buttons
    modal.querySelectorAll(".unit-overwatch-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset.unitIdx ?? "0", 10);
        const unit = units[idx];
        if (unit && this.queueOverwatchForUnit(unit.id, false)) {
          // Update the button to show it's done
          const button = e.target as HTMLButtonElement;
          button.textContent = "✓ Set";
          button.disabled = true;
          button.classList.add("overwatch-set");
          // Update remaining AP display
          const row = button.closest(".unspent-unit-row");
          if (row) {
            const apSpan = row.querySelector(".unit-ap");
            if (apSpan) {
              const newAp = unit.unspentAP - 2;
              if (newAp <= 0) {
                apSpan.innerHTML = '<span style="color:#6bcf7b">0 AP</span>';
              } else {
                apSpan.innerHTML = `<span style="color:var(--accent-gold)">${newAp} AP</span>`;
              }
            }
          }
          unit.unspentAP -= 2; // Update local state
        }
      });
    });

    // Wire up "Overwatch All" button
    const overwatchAllBtn = document.getElementById("unspent-ap-overwatch-all");
    if (overwatchAllBtn) {
      overwatchAllBtn.addEventListener("click", () => {
        const count = this.queueOverwatchForAllUnspent(units);
        if (count > 0) {
          // Update all buttons to show they're done
          modal.querySelectorAll(".unit-overwatch-btn:not([disabled])").forEach((btn) => {
            const button = btn as HTMLButtonElement;
            const idx = parseInt(button.dataset.unitIdx ?? "0", 10);
            const unit = units[idx];
            if (unit && unit.unspentAP >= 2) {
              button.textContent = "✓ Set";
              button.disabled = true;
              button.classList.add("overwatch-set");
              const row = button.closest(".unspent-unit-row");
              if (row) {
                const apSpan = row.querySelector(".unit-ap");
                if (apSpan) {
                  const newAp = unit.unspentAP - 2;
                  if (newAp <= 0) {
                    apSpan.innerHTML = '<span style="color:#6bcf7b">0 AP</span>';
                  } else {
                    apSpan.innerHTML = `<span style="color:var(--accent-gold)">${newAp} AP</span>`;
                  }
                }
              }
            }
          });
          overwatchAllBtn.textContent = `✓ ${count} Set`;
          (overwatchAllBtn as HTMLButtonElement).disabled = true;
        }
      });
    }

    document.getElementById("unspent-ap-cancel")!.addEventListener("click", () => {
      modal.remove();
    });

    document.getElementById("unspent-ap-confirm")!.addEventListener("click", () => {
      modal.remove();
      this.confirmResolveWithUnspentAP = true;
      this.onResolveTurn();
    });
  }

  /** Returns HTML for enemy condition: visual "how healthy they look", no HP numbers. */
  private getObserverPerception(world: ReturnType<GameEngine['getWorld']>): number {
    const playerUnits = world.query('faction', 'skills', 'health');
    for (const pId of playerUnits) {
      const f = world.getComponent<FactionComponent>(pId, 'faction');
      const h = world.getComponent<HealthComponent>(pId, 'health');
      if (f?.faction === 'player' && h?.woundState !== 'down') {
        const skills = world.getComponent<SkillsComponent>(pId, 'skills');
        return skills?.perception ?? 40;
      }
    }
    return 40;
  }

  private updateTurnBasedUI(): void {
    const turnEl = document.getElementById("tb-turn");
    const phaseEl = document.getElementById("tb-phase");
    const infoEl = document.getElementById("tb-unit-info");
    const titleEl = document.getElementById("selection-info-title");
    const infoBox = document.getElementById("selection-info-box");
    const enemyInfoEl = document.getElementById("tb-enemy-info");
    const enemyTitleEl = document.getElementById("enemy-info-title");
    const enemyInfoBox = document.getElementById("enemy-info-box");

    if (turnEl) turnEl.textContent = `Turn: ${this.engine.getTurn() + 1}`;
    if (phaseEl) phaseEl.textContent = this.engine.getPhase() === "planning" ? "Planning" : "Resolution";

    if (this.selectedEntityId) {
      const world = this.engine.getWorld();
      const id = this.selectedEntityId;
      const faction = world.getComponent<FactionComponent>(id, "faction");
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      const name = identity?.name ?? "Unit";

      if (faction?.faction === "enemy") {
        // Enemy: show in right-hand enemy info box only
        if (enemyTitleEl) enemyTitleEl.textContent = name;
        if (enemyInfoEl) {
          const weapon = world.getComponent<WeaponComponent>(id, "weapon");
          const enemyPos = world.getComponent<PositionComponent>(id, "position");
          const queue = world.getComponent<CommandQueueComponent>(id, "commandQueue");
          const weaponStr = weapon ? weapon.name + " (" + getAttackType(weapon) + ", range " + weapon.range + "m)" : "—";
          const label = (l: string) => '<span style="color:#888">' + l + "</span> ";
          const observerPerception = this.getObserverPerception(world);

          // Calculate distance to closest player unit
          let closestDistance = Infinity;
          let inRange = false;
          const playerUnits = world.query("position", "faction", "health");
          for (const playerId of playerUnits) {
            const playerFaction = world.getComponent<FactionComponent>(playerId, "faction");
            const playerHealth = world.getComponent<HealthComponent>(playerId, "health");
            if (playerFaction?.faction !== "player") continue;
            if (playerHealth?.woundState === "down") continue;

            const playerPos = world.getComponent<PositionComponent>(playerId, "position");
            if (!playerPos || !enemyPos) continue;

            const dist = MovementSystem.calculateDistance(playerPos.x, playerPos.y, enemyPos.x, enemyPos.y);
            if (dist < closestDistance) {
              closestDistance = dist;
              inRange = dist <= (weapon?.range ?? 1.2);
            }
          }

          // Distance display with in-range indicator
          const distanceStr = closestDistance < Infinity
            ? closestDistance.toFixed(1) + "m"
            : "—";
          const rangeIndicator = inRange
            ? '<span class="distance-indicator distance-in-range">In Range</span>'
            : '<span class="distance-indicator distance-out-of-range">Out of Range</span>';

          // Has commands queued?
          const queueStatus = queue && queue.commands.length > 0
            ? '<span style="color:#ffd700">Planning...</span>'
            : '<span style="color:#888">Ready</span>';

          const lines = [
            renderEnemyBodyDiagram(id, observerPerception, world),
            "<div>" + label("Weapon") + weaponStr + "</div>",
            "<div>" + label("Distance") + distanceStr + " " + rangeIndicator + "</div>",
            "<div>" + label("Status") + queueStatus + "</div>",
          ];
          enemyInfoEl.innerHTML = lines.join("");
          enemyInfoEl.style.color = "#e0e0e0";
        }
        if (enemyInfoBox) enemyInfoBox.style.display = "block";
        if (infoBox && infoEl && titleEl) {
          titleEl.textContent = "Selection";
          infoEl.innerHTML = "<div style='color:#888'>Click a unit to see its info here.</div>";
          infoEl.style.color = "#aaa";
          infoBox.style.display = "block";
        }
      } else {
        // Player: show in left-hand selection info box only
        if (titleEl) titleEl.textContent = name;
        if (infoEl) {
          const ap = world.getComponent<ActionPointsComponent>(id, "actionPoints");
          const weapon = world.getComponent<WeaponComponent>(id, "weapon");
          const stamina = world.getComponent<StaminaComponent>(id, "stamina");
          const morale = world.getComponent<MoraleStateComponent>(id, "moraleState");
          const queue = world.getComponent<CommandQueueComponent>(id, "commandQueue");
          const pos = world.getComponent<PositionComponent>(id, "position");
          const queuedAp = queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
          const remainingAp = (ap?.current ?? 0) - queuedAp;
          const weaponStr = weapon ? weapon.name + " (" + getAttackType(weapon) + ", range " + weapon.range + "m, " + weapon.apCost + " AP)" : "—";
          const label = (l: string) => '<span style="color:#888">' + l + "</span> ";

          // Calculate distance to closest enemy (accounting for queued moves)
          let fromX = pos?.x ?? 0;
          let fromY = pos?.y ?? 0;
          for (const cmd of queue?.commands ?? []) {
            if (cmd.type === "move") {
              fromX = cmd.targetX;
              fromY = cmd.targetY;
            }
          }
          let closestEnemyDist = Infinity;
          let closestEnemyInRange = false;
          const effectiveRange = weapon?.range ?? 1.2;
          const enemyUnits = world.query("position", "faction", "health");
          for (const enemyId of enemyUnits) {
            const enemyFaction = world.getComponent<FactionComponent>(enemyId, "faction");
            const enemyHealth = world.getComponent<HealthComponent>(enemyId, "health");
            if (enemyFaction?.faction !== "enemy") continue;
            if (enemyHealth?.woundState === "down") continue;
            const enemyPos = world.getComponent<PositionComponent>(enemyId, "position");
            if (!enemyPos) continue;
            const dist = MovementSystem.calculateDistance(fromX, fromY, enemyPos.x, enemyPos.y);
            if (dist < closestEnemyDist) {
              closestEnemyDist = dist;
              closestEnemyInRange = dist <= effectiveRange;
            }
          }
          const distanceStr = closestEnemyDist < Infinity
            ? closestEnemyDist.toFixed(1) + "m"
            : "—";
          // Check if any queued attack might fail due to enemy movement
          const hasQueuedAttack = queue?.commands.some(c => c.type === "attack") ?? false;
          const rangeWarning = hasQueuedAttack && closestEnemyInRange
            ? '<div style="color:#e8c547;font-size:11px;margin-top:2px">⚠ Enemy may move away</div>'
            : "";
          const rangeIndicator = closestEnemyDist < Infinity
            ? (closestEnemyInRange
                ? '<span style="color:#6bcf7b;margin-left:8px">✓ In Range</span>' + rangeWarning
                : '<span style="color:#ff6b6b;margin-left:8px">✗ Out of Range</span>')
            : "";

          // Combat status badges
          const combatStatus = getCombatStatus(world, id);
          const badges = renderCombatStatusBadges(combatStatus);

          // Format queued commands (pass true to enable remove buttons)
          const formattedCommands = formatQueuedCommands(world, id);
          const commandListHtml = renderCommandList(formattedCommands, ap?.current ?? 0, true);

          const lines = [
            badges ? '<div class="status-badges">' + badges + '</div>' : '',
            renderBodyDiagram(id, world),
            "<div>" + label("AP") + remainingAp + " / " + (ap?.max ?? 0) + " remaining" + (queuedAp > 0 ? " <span style=\"color:#ffd700\">(" + queuedAp + " queued)</span>" : "") + "</div>",
            "<div>" + label("Stamina") + (stamina?.current ?? 0) + " / " + (stamina?.max ?? 0) + (stamina?.exhausted ? " <span style=\"color:#f44336\">exhausted</span>" : "") + "</div>",
            "<div>" + label("Morale") + (morale?.status ?? "—") + "</div>",
            "<div>" + label("Weapon") + weaponStr + "</div>",
            "<div>" + label("Distance") + distanceStr + rangeIndicator + "</div>",
            commandListHtml,
            '<div class="action-buttons" style="display:flex;gap:8px;margin-top:8px;">',
            remainingAp >= 2 ? '<button class="overwatch-btn" id="overwatch-btn">Overwatch (2 AP)</button>' : '',
            queuedAp > 0 ? '<button class="clear-commands-btn" id="clear-commands-btn">Clear All</button>' : '',
            '</div>',
            '<div class="command-hint">Click enemy: 1 attack · Shift+click: fill AP · Overwatch: react to enemies</div>',
          ];
          infoEl.innerHTML = lines.join("");
          infoEl.style.color = "#e0e0e0";

          // Wire up clear commands button
          const clearBtn = document.getElementById("clear-commands-btn");
          if (clearBtn) {
            clearBtn.addEventListener("click", () => this.clearSelectedUnitCommands());
          }

          // Wire up overwatch button
          const overwatchBtn = document.getElementById("overwatch-btn");
          if (overwatchBtn) {
            overwatchBtn.addEventListener("click", () => this.queueOverwatchCommand());
          }

          // Wire up individual command remove buttons
          document.querySelectorAll(".cmd-remove-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
              const idx = parseInt((e.target as HTMLElement).dataset.cmdIdx ?? "0", 10);
              this.removeCommandAtIndex(idx);
            });
          });
          // Show engaged enemies in right-hand panel when player unit is in combat
          if (combatStatus.engagedEnemyIds.length > 0 && enemyInfoBox && enemyInfoEl && enemyTitleEl) {
            enemyTitleEl.textContent = `Engaged Enemies (${combatStatus.engagedEnemyIds.length})`;
            const enemyCards: string[] = [];
            const elabel = (l: string) => '<span style="color:#888">' + l + "</span> ";
            const observerPerception = this.getObserverPerception(world);

            for (const enemyId of combatStatus.engagedEnemyIds) {
              const eHealth = world.getComponent<HealthComponent>(enemyId, "health");
              if (eHealth?.woundState === "down") continue;

              const eIdentity = world.getComponent<IdentityComponent>(enemyId, "identity");
              const eWeapon = world.getComponent<WeaponComponent>(enemyId, "weapon");
              const ePos = world.getComponent<PositionComponent>(enemyId, "position");
              const eQueue = world.getComponent<CommandQueueComponent>(enemyId, "commandQueue");

              const eName = eIdentity?.name ?? "Enemy";
              const eWeaponStr = eWeapon ? eWeapon.name + " (" + (isRangedWeapon(eWeapon) ? "ranged" : "melee") + ")" : "—";

              const dist = ePos ? MovementSystem.calculateDistance(fromX, fromY, ePos.x, ePos.y) : Infinity;
              const distStr = dist < Infinity ? dist.toFixed(1) + "m" : "—";
              const effectiveEnemyRange = eWeapon?.range ?? 1.2;
              const eInRange = dist <= effectiveEnemyRange;
              const eRangeIndicator = eInRange
                ? '<span class="distance-indicator distance-in-range">In Range</span>'
                : '<span class="distance-indicator distance-out-of-range">Out of Range</span>';

              const eQueueStatus = eQueue && eQueue.commands.length > 0
                ? '<span style="color:#ffd700">Planning...</span>'
                : '<span style="color:#888">Ready</span>';

              enemyCards.push(
                '<div style="border-bottom:1px solid rgba(255,255,255,0.08);padding:6px 0;' + (enemyCards.length === 0 ? '' : 'margin-top:2px;') + '">' +
                '<div style="color:#ff8080;font-weight:600;margin-bottom:3px">' + eName + '</div>' +
                renderEnemyBodyDiagram(enemyId, observerPerception, world) +
                '<div>' + elabel("Weapon") + eWeaponStr + '</div>' +
                '<div>' + elabel("Distance") + distStr + ' ' + eRangeIndicator + '</div>' +
                '<div>' + elabel("Status") + eQueueStatus + '</div>' +
                '</div>'
              );
            }

            enemyInfoEl.innerHTML = enemyCards.join("");
            enemyInfoEl.style.color = "#e0e0e0";
            enemyInfoBox.style.display = "block";
          } else {
            if (enemyInfoBox) enemyInfoBox.style.display = "none";
            if (enemyInfoEl) enemyInfoEl.innerHTML = "";
          }
        }
        if (infoBox) infoBox.style.display = "block";
      }
    } else {
      if (titleEl) titleEl.textContent = "Selection";
      if (infoEl) {
        infoEl.innerHTML = "<div style='color:#888'>Click a unit to see its info here.</div>";
        infoEl.style.color = "#aaa";
      }
      if (infoBox) infoBox.style.display = "block";
      if (enemyInfoBox) enemyInfoBox.style.display = "none";
      if (enemyInfoEl) enemyInfoEl.innerHTML = "";
    }
  }

  private updateObjectives(objectives: string[]): void {
    const list = document.getElementById("objective-list");
    if (!list) return;
    list.innerHTML = objectives.map((o) => "<li>" + o + "</li>").join("");
  }

  private checkVictory(): void {
    const loaded = this.engine.getLoadedScenario();
    if (!loaded) return;

    const world = this.engine.getWorld();
    const playerAlive = loaded.playerUnitIds.some((id) => {
      const h = world.getComponent<HealthComponent>(id, "health");
      return h && h.woundState !== "down";
    });
    const enemyAlive = loaded.enemyUnitIds.some((id) => {
      const h = world.getComponent<HealthComponent>(id, "health");
      return h && h.woundState !== "down";
    });

    if (!playerAlive) {
      this.screenState.transitionTo("game-over-defeat");
    } else if (!enemyAlive) {
      this.screenState.transitionTo("game-over-victory");
    }

    this.updateUnitQuickBar();
  }

  private onCanvasClick(event: MouseEvent): void {
    if (!this.screenState.isInGame()) return;
    if (this.screenState.isGameOver()) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.cameraController.camera);
    const meshes = Array.from(this.entityMeshes.values()).flatMap((g) => g.children);
    const intersects = this.raycaster.intersectObjects(
      meshes as THREE.Object3D[],
      true
    );

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      let group = obj.parent as THREE.Group;
      while (group && !group.userData.entityId) {
        group = group.parent as THREE.Group;
      }
      const clickedId = group?.userData?.entityId as EntityId | undefined;
      if (clickedId) {
        const world = this.engine.getWorld();
        const clickedFaction = world.getComponent<FactionComponent>(clickedId, "faction");
        let handled = false;

        const clickedHealth = world.getComponent<HealthComponent>(clickedId, "health");

        if (
          this.selectedEntityId &&
          clickedFaction?.faction === "enemy" &&
          clickedHealth?.woundState !== "down" &&
          this.engine.getPhase() === "planning"
        ) {
          const selFaction = world.getComponent<FactionComponent>(
            this.selectedEntityId,
            "faction"
          );
          if (selFaction?.faction === "player") {
            const weapon = world.getComponent<WeaponComponent>(
              this.selectedEntityId,
              "weapon"
            );
            const pos = world.getComponent<PositionComponent>(
              this.selectedEntityId,
              "position"
            );
            const targetPos = world.getComponent<PositionComponent>(
              clickedId,
              "position"
            );
            const queue = world.getComponent<CommandQueueComponent>(
              this.selectedEntityId,
              "commandQueue"
            );
            const ap = world.getComponent<ActionPointsComponent>(
              this.selectedEntityId,
              "actionPoints"
            );

            if (pos && targetPos && ap) {
              const attackType = weapon ? getAttackType(weapon) : "melee";
              const attackAp = weapon?.apCost ?? 2;

              let fromX = pos.x;
              let fromY = pos.y;
              for (const cmd of queue?.commands ?? []) {
                if (cmd.type === "move") {
                  fromX = cmd.targetX;
                  fromY = cmd.targetY;
                }
              }

              const distance = MovementSystem.calculateDistance(
                fromX,
                fromY,
                targetPos.x,
                targetPos.y
              );
              const effectiveRange = weapon?.range ?? 1.2;
              const totalQueuedAp = queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
              const remainingAp = ap.current - totalQueuedAp;

              if (distance <= effectiveRange) {
                // Single click = 1 attack, Shift+click = fill AP with attacks
                const fillAp = event.shiftKey;
                let attackQueued = false;

                if (fillAp) {
                  // Queue as many attacks as AP allows
                  while (
                    this.engine.queueCommand(this.selectedEntityId, {
                      type: "attack",
                      targetId: clickedId,
                      attackType,
                      apCost: attackAp,
                      priority: weapon?.speed ?? 5,
                    })
                  ) {
                    attackQueued = true;
                  }
                } else {
                  // Queue single attack
                  attackQueued = this.engine.queueCommand(this.selectedEntityId, {
                    type: "attack",
                    targetId: clickedId,
                    attackType,
                    apCost: attackAp,
                    priority: weapon?.speed ?? 5,
                  });
                }

                if (attackQueued) {
                  this.lastAttackTargetByUnit.set(this.selectedEntityId, clickedId);
                  this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
                  handled = true;
                  this.updateTurnBasedUI();
                  this.updateCommandPreview();
                  this.checkOverwatchAutoResolve();
                }
              } else {
                // Target out of range - try to move closer
                const baseSpeed = UnitFactory.getBaseSpeed(
                  world,
                  this.selectedEntityId
                );
                const mode = "advance";
                const maxMoveDist = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
                const dest = MovementSystem.getClampedDestination(
                  world,
                  this.selectedEntityId,
                  fromX,
                  fromY,
                  targetPos.x,
                  targetPos.y,
                  this.engine.getLoadedScenario()?.mapSize,
                  maxMoveDist,
                  clickedId
                );

                // Verify post-move distance to target
                const postMoveDistance = MovementSystem.calculateDistance(
                  dest.x,
                  dest.y,
                  targetPos.x,
                  targetPos.y
                );

                const moveApCost = MovementSystem.getMovementApCost(
                  fromX,
                  fromY,
                  dest.x,
                  dest.y,
                  mode,
                  baseSpeed,
                  remainingAp
                );

                if (postMoveDistance > effectiveRange) {
                  // Can't reach attack range this turn - just queue move
                  if (moveApCost <= remainingAp) {
                    const moveSuccess = this.engine.queueCommand(this.selectedEntityId, {
                      type: "move",
                      targetX: dest.x,
                      targetY: dest.y,
                      mode,
                      apCost: moveApCost,
                      priority: 2, // Moves execute before attacks
                    });
                    if (moveSuccess) {
                      this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
                      this.showTemporaryMessage("Moving closer - won't reach attack range this turn");
                      handled = true;
                      this.updateTurnBasedUI();
                      this.updateCommandPreview();
                      this.checkOverwatchAutoResolve();
                    }
                  }
                } else {
                  // Will be in range after move - queue move then attacks
                  const moveSuccess =
                    moveApCost <= remainingAp &&
                    this.engine.queueCommand(this.selectedEntityId, {
                      type: "move",
                      targetX: dest.x,
                      targetY: dest.y,
                      mode,
                      apCost: moveApCost,
                      priority: 2, // Moves execute before attacks
                    });

                  if (moveSuccess) {
                    // Single click = 1 attack, Shift+click = fill AP
                    const fillAp = event.shiftKey;

                    if (fillAp) {
                      while (
                        this.engine.queueCommand(this.selectedEntityId, {
                          type: "attack",
                          targetId: clickedId,
                          attackType,
                          apCost: attackAp,
                          priority: weapon?.speed ?? 5,
                        })
                      ) {
                        /* fill remaining AP with attacks */
                      }
                    } else {
                      this.engine.queueCommand(this.selectedEntityId, {
                        type: "attack",
                        targetId: clickedId,
                        attackType,
                        apCost: attackAp,
                        priority: weapon?.speed ?? 5,
                      });
                    }

                    this.lastAttackTargetByUnit.set(this.selectedEntityId, clickedId);
                    this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
                    handled = true;
                    this.updateTurnBasedUI();
                    this.updateCommandPreview();
                    this.checkOverwatchAutoResolve();
                  }
                }
              }
            }
          }
        }

        if (!handled) {
          this.selectedEntityId = getSelectionAfterUnitClick(
            this.selectedEntityId,
            clickedId,
            clickedFaction?.faction === "enemy" ? "enemy" : "player"
          );
          this.updateTurnBasedUI();
          this.updateCommandPreview();
          this.updateSelectionRing();
        }
      }
    } else {
      const worldPos = this.cameraController.screenToWorld(
        new THREE.Vector2(event.clientX, event.clientY),
        this.canvas
      );

      if (this.selectedEntityId && this.engine.getPhase() === "planning") {
        const world = this.engine.getWorld();
        const faction = world.getComponent<FactionComponent>(this.selectedEntityId, "faction");
        if (faction?.faction === "player") {
          const pos = world.getComponent<PositionComponent>(this.selectedEntityId, "position");
          const queue = world.getComponent<CommandQueueComponent>(this.selectedEntityId, "commandQueue");
          const ap = world.getComponent<ActionPointsComponent>(this.selectedEntityId, "actionPoints");
          if (!pos || !ap) return;

          let fromX = pos.x;
          let fromZ = pos.y;
          for (const cmd of queue?.commands ?? []) {
            if (cmd.type === "move") {
              fromX = cmd.targetX;
              fromZ = cmd.targetY;
            }
          }

          const baseSpeed = UnitFactory.getBaseSpeed(world, this.selectedEntityId);
          const mode = "advance";
          const maxMoveDistance = baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
          const dest = MovementSystem.getClampedDestination(
            world,
            this.selectedEntityId,
            fromX,
            fromZ,
            worldPos.x,
            worldPos.z,
            this.engine.getLoadedScenario()?.mapSize,
            maxMoveDistance
          );
          const apCost = MovementSystem.getMovementApCost(
            fromX,
            fromZ,
            dest.x,
            dest.y,
            mode,
            baseSpeed,
            ap.current
          );

          const success = this.engine.queueCommand(this.selectedEntityId, {
            type: "move",
            targetX: dest.x,
            targetY: dest.y,
            mode,
            apCost,
            priority: 2, // Moves execute before attacks
          });
          if (success) {
            // Store final destination for multi-turn waypoint movement
            const clickedX = worldPos.x;
            const clickedZ = worldPos.z;
            const distToFinal = MovementSystem.calculateDistance(dest.x, dest.y, clickedX, clickedZ);
            if (distToFinal > 0.5) {
              // Destination is beyond this turn's reach — remember it with full A* path
              const mapSz = this.engine.getLoadedScenario()?.mapSize;
              const fullPathResult = mapSz
                ? MovementSystem.getPathfindingDestination(
                    world, this.selectedEntityId, fromX, fromZ, clickedX, clickedZ, mapSz
                  )
                : null;
              this.lastMoveDestinationByUnit.set(this.selectedEntityId, {
                x: clickedX,
                y: clickedZ,
                fullPath: fullPathResult?.path,
              });
            } else {
              // Reachable this turn — no need for multi-turn tracking
              this.lastMoveDestinationByUnit.delete(this.selectedEntityId);
            }
            this.updateTurnBasedUI();
            this.updateCommandPreview();
            this.checkOverwatchAutoResolve();
          }
        }
      }
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
    this.showMenu();
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
      const dt = 1 / 60; // approximate delta for obstacle animations
      for (const obs of this.terrainObstacles) {
        obs.update(dt);
      }
      this.updateMovementAnimations(performance.now());
      this.updateActiveHighlightPulse();
      this.floatingText.update();
      this.renderer.render(this.scene, this.cameraController.camera);
    };
    animate();
  }

  private setupCombatTextEvents(): void {
    // Events that should be queued and played back with delays
    const queuedEventTypes: GameEvent["type"][] = [
      "AttackDeclared",
      "AttackRolled",
      "DefenseRolled",
      "DamageDealt",
      "AttackOutOfRange",
      "UnitDown",
      "OverwatchTriggered",
    ];

    // Events that show immediately (not part of attack sequences)
    const immediateEventTypes: GameEvent["type"][] = [
      "UnitShaken",
      "UnitBroken",
      "UnitRouted",
      "UnitRallied",
      "StaminaDrained",
      "Exhausted",
      "OverwatchSet",
    ];

    for (const eventType of queuedEventTypes) {
      this.engine.subscribeToEvent(eventType, (event) => {
        if (this.engine.getPhase() === "resolution" || this.isPlayingCombatEvents) {
          // Queue combat events during resolution for staggered playback
          this.combatEventQueue.push(event);
        } else {
          this.floatingText.handleEvent(event);
        }
      });
    }

    for (const eventType of immediateEventTypes) {
      this.engine.subscribeToEvent(eventType, (event) => {
        this.floatingText.handleEvent(event);
      });
    }
  }

  /**
   * Play back queued combat events with delays between attack sequences.
   * Groups events by AttackDeclared markers and adds delays between fights.
   */
  private async playCombatEventsWithDelay(): Promise<void> {
    if (this.combatEventQueue.length === 0) {
      this.hideActiveHighlight();
      return;
    }

    this.isPlayingCombatEvents = true;

    // Group events into "fight sequences" starting with AttackDeclared
    const fightSequences: GameEvent[][] = [];
    let currentSequence: GameEvent[] = [];

    for (const event of this.combatEventQueue) {
      if (event.type === "AttackDeclared" && currentSequence.length > 0) {
        fightSequences.push(currentSequence);
        currentSequence = [];
      }
      currentSequence.push(event);
    }
    if (currentSequence.length > 0) {
      fightSequences.push(currentSequence);
    }

    // Play each fight sequence with a delay (index 0 = oldest; sidebar inserts at beginning so newest ends up on top)
    for (let i = 0; i < fightSequences.length; i++) {
      const sequence = fightSequences[i];
      const declaredEvent = sequence.find(e => e.type === "AttackDeclared");
      if (declaredEvent?.entityId) {
        this.showActiveHighlight(declaredEvent.entityId);
      }
      if (declaredEvent?.type === "AttackDeclared" && declaredEvent.entityId != null && declaredEvent.targetId != null) {
        const world = this.engine.getWorld();
        const attackerFaction = world.getComponent<FactionComponent>(declaredEvent.entityId, "faction")?.faction ?? "enemy";
        const defenderFaction = world.getComponent<FactionComponent>(declaredEvent.targetId, "faction")?.faction ?? "enemy";
        this.diceRollSidebar.setFactionsForNextExchange(attackerFaction, defenderFaction);
      }
      for (const event of sequence) {
        this.diceRollSidebar.handleEvent(event);
      }
      for (const event of sequence) {
        if (event.type !== "AttackDeclared") {
          this.floatingText.handleEvent(event);
        }
      }
      await this.delay(this.COMBAT_EVENT_DELAY);
    }

    this.hideActiveHighlight();
    this.combatEventQueue = [];
    this.isPlayingCombatEvents = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateFloatingTextPositions(): void {
    const world = this.engine.getWorld();
    for (const [id] of this.entityMeshes) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      if (pos) {
        this.floatingText.updateEntityPosition(id, pos.x, pos.y);
      }
    }
  }

  private createMovementTrail(
    entityId: EntityId,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    path?: { x: number; y: number }[]
  ): void {
    // Remove existing trail for this entity
    this.clearMovementTrail(entityId);

    // Create a dashed line trail along the path or straight line
    let points: THREE.Vector3[];
    if (path && path.length >= 2) {
      points = path.map((p) => new THREE.Vector3(p.x, 0.1, p.y));
    } else {
      points = [
        new THREE.Vector3(fromX, 0.1, fromZ),
        new THREE.Vector3(toX, 0.1, toZ),
      ];
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x4fc3f7,
      dashSize: 0.2,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.scene.add(line);
    this.movementTrails.set(entityId, line);
  }

  private clearMovementTrail(entityId: EntityId): void {
    const existing = this.movementTrails.get(entityId);
    if (existing) {
      this.scene.remove(existing);
      existing.geometry.dispose();
      (existing.material as THREE.Material).dispose();
      this.movementTrails.delete(entityId);
    }
  }

  private clearAllMovementTrails(): void {
    for (const [id] of this.movementTrails) {
      this.clearMovementTrail(id);
    }
  }

  /**
   * If all player units are on overwatch, immediately resolve the turn.
   * Called after command changes during planning phase.
   */
  private checkOverwatchAutoResolve(): void {
    if (this.engine.getPhase() !== "planning") return;

    const world = this.engine.getWorld();
    if (TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world)) {
      this.confirmResolveWithUnspentAP = true;
      this.onResolveTurn();
    }
  }
}
