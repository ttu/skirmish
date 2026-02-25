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
  SkillsComponent,
  ArmorComponent,
  WoundEffectsComponent,
  AttackCommand,
} from "../engine/components";
import { MovementSystem } from "../engine/systems/MovementSystem";
import { CombatLogUI } from "../ui/CombatLogUI";
import { FloatingCombatText } from "../ui/FloatingCombatText";
import { ScreenStateManager } from "../ui/ScreenStateManager";
import { ToastManager } from "../ui/ToastManager";
import { EntityId, GameEvent } from "../engine/types";
import { GameEngine } from "../engine/core/GameEngine";
import { renderCombatStatusBadges } from "../ui/CombatStatusHelpers";
import { getCombatStatus } from "./CombatStatusQuery";
import {
  formatQueuedCommands,
  renderCommandList,
} from "../ui/CommandFormatters";
import {
  renderBodyDiagram,
  renderEnemyBodyDiagram,
} from "../ui/BodyDiagramUI";
import { DiceRollSidebar } from "../ui/DiceRollSidebar";
import { makeDraggable } from "../utils/makeDraggable";
import { Scenario } from "../types";
import { scenarios } from "../data/scenarios";
import { ScreenState } from "../ui/ScreenStateManager";
import { GameContext } from "./GameContext";

export class UIManager {
  private readonly ctx: GameContext;
  private combatLog: CombatLogUI;
  private floatingText: FloatingCombatText;
  private diceRollSidebar: DiceRollSidebar;
  private screenState: ScreenStateManager;
  private toastManager: ToastManager;
  private playerUnitIds: EntityId[] = [];
  private combatEventQueue: GameEvent[] = [];
  private isPlayingCombatEvents = false;
  private readonly COMBAT_EVENT_DELAY = 950;

  constructor(ctx: GameContext) {
    this.ctx = ctx;

    this.combatLog = new CombatLogUI((id) => {
      const world = ctx.engine.getWorld();
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      if (!identity) return String(id);
      const typeName =
        identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
      return identity.shortId != null
        ? `${typeName} #${identity.shortId}`
        : identity.name;
    });
    document
      .getElementById("game-container")!
      .appendChild(this.combatLog.getElement());
    this.combatLog.subscribeToEvents((type, fn) =>
      ctx.engine.subscribeToEvent(type, fn)
    );

    this.floatingText = new FloatingCombatText(ctx.scene);
    this.setupCombatTextEvents();

    this.diceRollSidebar = new DiceRollSidebar();
    this.diceRollSidebar.setEntityNameResolver((id) => {
      const world = ctx.engine.getWorld();
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      if (!identity) return String(id);
      const typeName =
        identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
      return identity.shortId != null
        ? `${typeName} #${identity.shortId}`
        : identity.name;
    });
    this.diceRollSidebar.setFactionResolver((id) => {
      const world = ctx.engine.getWorld();
      const faction = world.getComponent<FactionComponent>(id, "faction");
      return faction?.faction ?? "enemy";
    });
    document
      .getElementById("game-container")!
      .appendChild(this.diceRollSidebar.getElement());

    this.screenState = new ScreenStateManager();
    this.toastManager = new ToastManager(
      document.getElementById("game-container")!
    );
  }

  getFloatingText(): FloatingCombatText {
    return this.floatingText;
  }

  getScreenState(): ScreenStateManager {
    return this.screenState;
  }

  getPlayerUnitIds(): EntityId[] {
    return this.playerUnitIds;
  }

  setPlayerUnitIds(ids: EntityId[]): void {
    this.playerUnitIds = ids;
  }

  showTemporaryMessage(message: string): void {
    this.toastManager.show(message);
  }

  isInGame(): boolean {
    return this.screenState.isInGame();
  }

  isGameOver(): boolean {
    return this.screenState.isGameOver();
  }

  isPauseMenuVisible(): boolean {
    return this.screenState.isPauseMenuVisible();
  }

  transitionTo(state: ScreenState): void {
    this.screenState.transitionTo(state);
  }

  setupUI(): void {
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
        btn.addEventListener("click", () => this.onScenarioSelected?.(scenario));
        scenarioList.appendChild(btn);
      }
    }

    this.setupScrollArrows(scenarioList);

    const restartBtn = document.getElementById("restart-btn")!;
    restartBtn.addEventListener("click", () => this.onRestartRequested?.());
    const menuBtn = document.getElementById("menu-btn")!;
    menuBtn.addEventListener("click", () => this.onReturnToMenuRequested?.());

    document
      .getElementById("pause-resume-btn")!
      .addEventListener("click", () => this.hidePauseMenu());
    document
      .getElementById("pause-menu-btn")!
      .addEventListener("click", () => {
        this.hidePauseMenu();
        this.onReturnToMenuRequested?.();
      });
  }

  /** Callbacks wired by TurnBasedGame coordinator. */
  onScenarioSelected: ((scenario: Scenario) => void) | null = null;
  onRestartRequested: (() => void) | null = null;
  onReturnToMenuRequested: (() => void) | null = null;

  private setupScrollArrows(list: HTMLElement): void {
    const arrowUp = document.getElementById("scroll-arrow-up");
    const arrowDown = document.getElementById("scroll-arrow-down");
    if (!arrowUp || !arrowDown) return;

    const scrollAmount = 200;

    const updateArrows = () => {
      const atTop = list.scrollTop <= 0;
      const atBottom =
        list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      arrowUp.classList.toggle("hidden", atTop);
      arrowDown.classList.toggle("hidden", atBottom);
    };

    arrowUp.addEventListener("click", () => {
      list.scrollBy({ top: -scrollAmount, behavior: "smooth" });
    });
    arrowDown.addEventListener("click", () => {
      list.scrollBy({ top: scrollAmount, behavior: "smooth" });
    });
    list.addEventListener("scroll", updateArrows);
    requestAnimationFrame(updateArrows);
  }

  showMenu(): void {
    this.screenState.transitionTo("menu");
    this.combatLog?.hide();
    this.diceRollSidebar?.hide();
  }

  hideMenu(): void {
    this.screenState.transitionTo("game");
    this.combatLog?.show();
    this.diceRollSidebar?.show();
  }

  showPauseMenu(): void {
    this.screenState.showPauseMenu();
  }

  hidePauseMenu(): void {
    this.screenState.hidePauseMenu();
  }

  createTurnBasedPanel(): void {
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
    document.getElementById("game-container")!.appendChild(panel);
    this.screenState.setTurnBasedPanel(panel);

    const infoBox = document.createElement("div");
    infoBox.id = "selection-info-box";
    infoBox.className = "selection-info-box";
    infoBox.innerHTML = `
      <div id="selection-info-title" class="selection-info-title">Selection</div>
      <div id="tb-unit-info" class="tb-unit-info"></div>
    `;
    document.getElementById("game-container")!.appendChild(infoBox);
    makeDraggable(
      infoBox,
      infoBox.querySelector(".selection-info-title") as HTMLElement
    );

    const enemyInfoBox = document.createElement("div");
    enemyInfoBox.id = "enemy-info-box";
    enemyInfoBox.className = "enemy-info-box";
    enemyInfoBox.innerHTML = `
      <div id="enemy-info-title" class="enemy-info-title">Enemy</div>
      <div id="tb-enemy-info" class="tb-enemy-info"></div>
    `;
    document.getElementById("game-container")!.appendChild(enemyInfoBox);
    makeDraggable(
      enemyInfoBox,
      enemyInfoBox.querySelector(".enemy-info-title") as HTMLElement
    );

    document.getElementById("tb-resolve")!.addEventListener("click", () => {
      this.ctx.onResolveTurn();
    });
    document.getElementById("tb-save")!.addEventListener("click", () => {
      this.ctx.saveGame();
    });
    document.getElementById("tb-load")!.addEventListener("click", () => {
      this.ctx.loadGame();
    });
    document.getElementById("tb-replay")!.addEventListener("click", () => {
      this.ctx.showReplayUI();
    });
  }

  createUnitQuickBar(): void {
    document.getElementById("unit-quick-bar")?.remove();

    const bar = document.createElement("div");
    bar.id = "unit-quick-bar";
    bar.className = "unit-quick-bar";

    const world = this.ctx.engine.getWorld();
    for (const id of this.playerUnitIds) {
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      const typeName = identity
        ? identity.unitType.charAt(0).toUpperCase() +
          identity.unitType.slice(1)
        : "Unit";
      const displayName =
        identity?.shortId != null
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
        this.ctx.setSelectedEntityId(id);
        this.ctx.onCommandsChanged();
        this.ctx.updateSelectionRing();
        this.updateUnitQuickBar();
      });
      bar.appendChild(btn);
    }

    document.getElementById("game-container")!.appendChild(bar);
    this.updateUnitQuickBar();
  }

  updateUnitQuickBar(): void {
    const bar = document.getElementById("unit-quick-bar");
    if (!bar) return;

    const world = this.ctx.engine.getWorld();
    const buttons = bar.querySelectorAll<HTMLButtonElement>(".unit-quick-btn");
    const selectedEntityId = this.ctx.getSelectedEntityId();

    for (const btn of buttons) {
      const id = btn.dataset.entityId as EntityId;

      const health = world.getComponent<HealthComponent>(id, "health");
      const ap = world.getComponent<ActionPointsComponent>(
        id,
        "actionPoints"
      );

      btn.classList.toggle("selected", id === selectedEntityId);

      const isDead = health?.woundState === "down";
      btn.classList.toggle("dead", isDead);

      const hpFill = btn.querySelector<HTMLElement>('[data-bar="hp"]');
      if (hpFill && health) {
        const hpPct = Math.max(0, (health.current / health.max) * 100);
        hpFill.style.width = `${hpPct}%`;
        hpFill.classList.toggle("low", hpPct <= 25);
        hpFill.classList.toggle("mid", hpPct > 25 && hpPct <= 50);
      }

      const apFill = btn.querySelector<HTMLElement>('[data-bar="ap"]');
      if (apFill && ap) {
        const queue = world.getComponent<CommandQueueComponent>(
          id,
          "commandQueue"
        );
        const queuedAp =
          queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
        const remainingAp = Math.max(0, ap.current - queuedAp);
        const apPct = Math.max(0, (remainingAp / ap.max) * 100);
        apFill.style.width = `${apPct}%`;
      }
    }
  }

  updateTurnBasedUI(): void {
    const turnEl = document.getElementById("tb-turn");
    const phaseEl = document.getElementById("tb-phase");
    const infoEl = document.getElementById("tb-unit-info");
    const titleEl = document.getElementById("selection-info-title");
    const infoBox = document.getElementById("selection-info-box");
    const enemyInfoEl = document.getElementById("tb-enemy-info");
    const enemyTitleEl = document.getElementById("enemy-info-title");
    const enemyInfoBox = document.getElementById("enemy-info-box");

    if (turnEl)
      turnEl.textContent = `Turn: ${this.ctx.engine.getTurn() + 1}`;
    if (phaseEl)
      phaseEl.textContent =
        this.ctx.engine.getPhase() === "planning" ? "Planning" : "Resolution";

    const selectedEntityId = this.ctx.getSelectedEntityId();

    if (selectedEntityId) {
      const world = this.ctx.engine.getWorld();
      const id = selectedEntityId;
      const faction = world.getComponent<FactionComponent>(id, "faction");
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      const name = identity?.name ?? "Unit";

      if (faction?.faction === "enemy") {
        this.renderEnemyInfoPanel(
          world,
          id,
          name,
          enemyTitleEl,
          enemyInfoEl,
          enemyInfoBox,
          infoBox,
          infoEl,
          titleEl
        );
      } else {
        this.renderPlayerInfoPanel(
          world,
          id,
          name,
          titleEl,
          infoEl,
          infoBox,
          enemyInfoBox,
          enemyInfoEl,
          enemyTitleEl
        );
      }
    } else {
      if (titleEl) titleEl.textContent = "Selection";
      if (infoEl) {
        infoEl.innerHTML =
          "<div style='color:#888'>Click a unit to see its info here.</div>";
        infoEl.style.color = "#aaa";
      }
      if (infoBox) infoBox.style.display = "block";
      if (enemyInfoBox) enemyInfoBox.style.display = "none";
      if (enemyInfoEl) enemyInfoEl.innerHTML = "";
    }
  }

  private renderEnemyInfoPanel(
    world: ReturnType<GameEngine["getWorld"]>,
    id: EntityId,
    name: string,
    enemyTitleEl: HTMLElement | null,
    enemyInfoEl: HTMLElement | null,
    enemyInfoBox: HTMLElement | null,
    infoBox: HTMLElement | null,
    infoEl: HTMLElement | null,
    titleEl: HTMLElement | null
  ): void {
    if (enemyTitleEl) enemyTitleEl.textContent = name;
    if (enemyInfoEl) {
      const weapon = world.getComponent<WeaponComponent>(id, "weapon");
      const enemyPos = world.getComponent<PositionComponent>(id, "position");
      const queue = world.getComponent<CommandQueueComponent>(
        id,
        "commandQueue"
      );
      const weaponStr = weapon
        ? weapon.name +
          " (" +
          getAttackType(weapon) +
          ", range " +
          weapon.range +
          "m)"
        : "—";
      const label = (l: string) =>
        '<span style="color:#888">' + l + "</span> ";
      const observerPerception = this.getObserverPerception(world);

      let closestDistance = Infinity;
      let inRange = false;
      const playerUnits = world.query("position", "faction", "health");
      for (const playerId of playerUnits) {
        const playerFaction = world.getComponent<FactionComponent>(
          playerId,
          "faction"
        );
        const playerHealth = world.getComponent<HealthComponent>(
          playerId,
          "health"
        );
        if (playerFaction?.faction !== "player") continue;
        if (playerHealth?.woundState === "down") continue;

        const playerPos = world.getComponent<PositionComponent>(
          playerId,
          "position"
        );
        if (!playerPos || !enemyPos) continue;

        const dist = MovementSystem.calculateDistance(
          playerPos.x,
          playerPos.y,
          enemyPos.x,
          enemyPos.y
        );
        if (dist < closestDistance) {
          closestDistance = dist;
          inRange =
            dist <=
            (weapon
              ? isRangedWeapon(weapon)
                ? weapon.range
                : Math.max(weapon.range, MovementSystem.MELEE_ATTACK_RANGE)
              : MovementSystem.MELEE_ATTACK_RANGE);
        }
      }

      const distanceStr =
        closestDistance < Infinity ? closestDistance.toFixed(1) + "m" : "—";
      const rangeIndicator = inRange
        ? '<span class="distance-indicator distance-in-range">In Range</span>'
        : '<span class="distance-indicator distance-out-of-range">Out of Range</span>';

      const queueStatus =
        queue && queue.commands.length > 0
          ? '<span style="color:#ffd700">Planning...</span>'
          : '<span style="color:#888">Ready</span>';

      const eHealth = world.getComponent<HealthComponent>(id, "health");
      const eArmor = world.getComponent<ArmorComponent>(id, "armor");
      const eWounds = world.getComponent<WoundEffectsComponent>(id, "woundEffects");

      const lines = [
        renderEnemyBodyDiagram(observerPerception, eHealth, eArmor, eWounds),
        "<div>" + label("Weapon") + weaponStr + "</div>",
        "<div>" +
          label("Distance") +
          distanceStr +
          " " +
          rangeIndicator +
          "</div>",
        "<div>" + label("Status") + queueStatus + "</div>",
      ];
      enemyInfoEl.innerHTML = lines.join("");
      enemyInfoEl.style.color = "#e0e0e0";
    }
    if (enemyInfoBox) enemyInfoBox.style.display = "block";
    if (infoBox && infoEl && titleEl) {
      titleEl.textContent = "Selection";
      infoEl.innerHTML =
        "<div style='color:#888'>Click a unit to see its info here.</div>";
      infoEl.style.color = "#aaa";
      infoBox.style.display = "block";
    }
  }

  private renderPlayerInfoPanel(
    world: ReturnType<GameEngine["getWorld"]>,
    id: EntityId,
    name: string,
    titleEl: HTMLElement | null,
    infoEl: HTMLElement | null,
    infoBox: HTMLElement | null,
    enemyInfoBox: HTMLElement | null,
    enemyInfoEl: HTMLElement | null,
    enemyTitleEl: HTMLElement | null
  ): void {
    if (titleEl) titleEl.textContent = name;
    if (infoEl) {
      const ap = world.getComponent<ActionPointsComponent>(
        id,
        "actionPoints"
      );
      const weapon = world.getComponent<WeaponComponent>(id, "weapon");
      const stamina = world.getComponent<StaminaComponent>(id, "stamina");
      const morale = world.getComponent<MoraleStateComponent>(
        id,
        "moraleState"
      );
      const queue = world.getComponent<CommandQueueComponent>(
        id,
        "commandQueue"
      );
      const pos = world.getComponent<PositionComponent>(id, "position");
      const queuedAp =
        queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
      const remainingAp = (ap?.current ?? 0) - queuedAp;
      const weaponStr = weapon
        ? weapon.name +
          " (" +
          getAttackType(weapon) +
          ", range " +
          weapon.range +
          "m, " +
          weapon.apCost +
          " AP)"
        : "—";
      const label = (l: string) =>
        '<span style="color:#888">' + l + "</span> ";

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
      const effectiveRange = weapon
        ? isRangedWeapon(weapon)
          ? weapon.range
          : Math.max(weapon.range, MovementSystem.MELEE_ATTACK_RANGE)
        : MovementSystem.MELEE_ATTACK_RANGE;
      const enemyUnits = world.query("position", "faction", "health");
      for (const enemyId of enemyUnits) {
        const enemyFaction = world.getComponent<FactionComponent>(
          enemyId,
          "faction"
        );
        const enemyHealth = world.getComponent<HealthComponent>(
          enemyId,
          "health"
        );
        if (enemyFaction?.faction !== "enemy") continue;
        if (enemyHealth?.woundState === "down") continue;
        const enemyPos = world.getComponent<PositionComponent>(
          enemyId,
          "position"
        );
        if (!enemyPos) continue;
        const dist = MovementSystem.calculateDistance(
          fromX,
          fromY,
          enemyPos.x,
          enemyPos.y
        );
        if (dist < closestEnemyDist) {
          closestEnemyDist = dist;
          closestEnemyInRange = dist <= effectiveRange;
        }
      }
      const distanceStr =
        closestEnemyDist < Infinity
          ? closestEnemyDist.toFixed(1) + "m"
          : "—";
      const hasQueuedAttack =
        queue?.commands.some((c) => c.type === "attack") ?? false;
      const rangeWarning =
        hasQueuedAttack && closestEnemyInRange
          ? '<div style="color:#e8c547;font-size:11px;margin-top:2px">⚠ Enemy may move away</div>'
          : "";
      const rangeIndicator =
        closestEnemyDist < Infinity
          ? closestEnemyInRange
            ? '<span style="color:#6bcf7b;margin-left:8px">✓ In Range</span>' +
              rangeWarning
            : '<span style="color:#ff6b6b;margin-left:8px">✗ Out of Range</span>'
          : "";

      const combatStatus = getCombatStatus(world, id);
      const badges = renderCombatStatusBadges(combatStatus);

      // Build target name map for attack commands
      const targetNames = new Map<EntityId, string>();
      for (const cmd of queue?.commands ?? []) {
        if (cmd.type === "attack") {
          const targetId = (cmd as AttackCommand).targetId;
          if (!targetNames.has(targetId)) {
            const tIdentity = world.getComponent<IdentityComponent>(targetId, "identity");
            if (tIdentity) {
              const tType = tIdentity.unitType.charAt(0).toUpperCase() + tIdentity.unitType.slice(1);
              targetNames.set(targetId, tIdentity.shortId != null ? `${tType} #${tIdentity.shortId}` : tIdentity.name);
            } else {
              targetNames.set(targetId, "Unknown");
            }
          }
        }
      }
      const formattedCommands = formatQueuedCommands({
        commands: queue?.commands ?? [],
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        weaponName: weapon?.name,
        weaponDamage: weapon?.damage,
        targetNames,
      });
      const commandListHtml = renderCommandList(
        formattedCommands,
        ap?.current ?? 0,
        true
      );

      const lines = [
        badges ? '<div class="status-badges">' + badges + "</div>" : "",
        renderBodyDiagram(
          world.getComponent<HealthComponent>(id, "health"),
          world.getComponent<ArmorComponent>(id, "armor"),
          world.getComponent<WoundEffectsComponent>(id, "woundEffects")
        ),
        "<div>" +
          label("AP") +
          remainingAp +
          " / " +
          (ap?.max ?? 0) +
          " remaining" +
          (queuedAp > 0
            ? ' <span style="color:#ffd700">(' + queuedAp + " queued)</span>"
            : "") +
          "</div>",
        "<div>" +
          label("Stamina") +
          (stamina?.current ?? 0) +
          " / " +
          (stamina?.max ?? 0) +
          (stamina?.exhausted
            ? ' <span style="color:#f44336">exhausted</span>'
            : "") +
          "</div>",
        "<div>" + label("Morale") + (morale?.status ?? "—") + "</div>",
        "<div>" + label("Weapon") + weaponStr + "</div>",
        "<div>" + label("Distance") + distanceStr + rangeIndicator + "</div>",
        commandListHtml,
        '<div class="action-buttons" style="display:flex;gap:8px;margin-top:8px;">',
        remainingAp >= 2
          ? '<button class="overwatch-btn" id="overwatch-btn">Overwatch (2 AP)</button>'
          : "",
        queuedAp > 0
          ? '<button class="clear-commands-btn" id="clear-commands-btn">Clear All</button>'
          : "",
        "</div>",
        '<div class="command-hint">Click enemy: 1 attack · Shift+click: fill AP · Overwatch: react to enemies</div>',
      ];
      infoEl.innerHTML = lines.join("");
      infoEl.style.color = "#e0e0e0";

      const clearBtn = document.getElementById("clear-commands-btn");
      if (clearBtn) {
        clearBtn.addEventListener("click", () =>
          this.ctx.clearSelectedUnitCommands()
        );
      }

      const overwatchBtn = document.getElementById("overwatch-btn");
      if (overwatchBtn) {
        overwatchBtn.addEventListener("click", () =>
          this.ctx.queueOverwatchCommand()
        );
      }

      document.querySelectorAll(".cmd-remove-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const idx = parseInt(
            (e.target as HTMLElement).dataset.cmdIdx ?? "0",
            10
          );
          this.ctx.removeCommandAtIndex(idx);
        });
      });

      if (
        combatStatus.engagedEnemyIds.length > 0 &&
        enemyInfoBox &&
        enemyInfoEl &&
        enemyTitleEl
      ) {
        this.renderEngagedEnemies(
          world,
          combatStatus.engagedEnemyIds,
          fromX,
          fromY,
          enemyTitleEl,
          enemyInfoEl,
          enemyInfoBox
        );
      } else {
        if (enemyInfoBox) enemyInfoBox.style.display = "none";
        if (enemyInfoEl) enemyInfoEl.innerHTML = "";
      }
    }
    if (infoBox) infoBox.style.display = "block";
  }

  private renderEngagedEnemies(
    world: ReturnType<GameEngine["getWorld"]>,
    engagedEnemyIds: EntityId[],
    fromX: number,
    fromY: number,
    enemyTitleEl: HTMLElement,
    enemyInfoEl: HTMLElement,
    enemyInfoBox: HTMLElement
  ): void {
    enemyTitleEl.textContent = `Engaged Enemies (${engagedEnemyIds.length})`;
    const enemyCards: string[] = [];
    const elabel = (l: string) =>
      '<span style="color:#888">' + l + "</span> ";
    const observerPerception = this.getObserverPerception(world);

    for (const enemyId of engagedEnemyIds) {
      const eHealth = world.getComponent<HealthComponent>(enemyId, "health");
      if (eHealth?.woundState === "down") continue;

      const eIdentity = world.getComponent<IdentityComponent>(
        enemyId,
        "identity"
      );
      const eWeapon = world.getComponent<WeaponComponent>(enemyId, "weapon");
      const ePos = world.getComponent<PositionComponent>(enemyId, "position");
      const eQueue = world.getComponent<CommandQueueComponent>(
        enemyId,
        "commandQueue"
      );

      const eName = eIdentity?.name ?? "Enemy";
      const eWeaponStr = eWeapon
        ? eWeapon.name +
          " (" +
          (isRangedWeapon(eWeapon) ? "ranged" : "melee") +
          ")"
        : "—";

      const dist = ePos
        ? MovementSystem.calculateDistance(fromX, fromY, ePos.x, ePos.y)
        : Infinity;
      const distStr = dist < Infinity ? dist.toFixed(1) + "m" : "—";
      const effectiveEnemyRange = eWeapon
        ? isRangedWeapon(eWeapon)
          ? eWeapon.range
          : Math.max(eWeapon.range, MovementSystem.MELEE_ATTACK_RANGE)
        : MovementSystem.MELEE_ATTACK_RANGE;
      const eInRange = dist <= effectiveEnemyRange;
      const eRangeIndicator = eInRange
        ? '<span class="distance-indicator distance-in-range">In Range</span>'
        : '<span class="distance-indicator distance-out-of-range">Out of Range</span>';

      const eQueueStatus =
        eQueue && eQueue.commands.length > 0
          ? '<span style="color:#ffd700">Planning...</span>'
          : '<span style="color:#888">Ready</span>';

      enemyCards.push(
        '<div style="border-bottom:1px solid rgba(255,255,255,0.08);padding:6px 0;' +
          (enemyCards.length === 0 ? "" : "margin-top:2px;") +
          '">' +
          '<div style="color:#ff8080;font-weight:600;margin-bottom:3px">' +
          eName +
          "</div>" +
          renderEnemyBodyDiagram(
            observerPerception,
            eHealth,
            world.getComponent<ArmorComponent>(enemyId, "armor"),
            world.getComponent<WoundEffectsComponent>(enemyId, "woundEffects")
          ) +
          "<div>" +
          elabel("Weapon") +
          eWeaponStr +
          "</div>" +
          "<div>" +
          elabel("Distance") +
          distStr +
          " " +
          eRangeIndicator +
          "</div>" +
          "<div>" +
          elabel("Status") +
          eQueueStatus +
          "</div>" +
          "</div>"
      );
    }

    enemyInfoEl.innerHTML = enemyCards.join("");
    enemyInfoEl.style.color = "#e0e0e0";
    enemyInfoBox.style.display = "block";
  }

  updateObjectives(objectives: string[]): void {
    const list = document.getElementById("objective-list");
    if (!list) return;
    list.innerHTML = objectives.map((o) => "<li>" + o + "</li>").join("");
  }

  private getObserverPerception(
    world: ReturnType<GameEngine["getWorld"]>
  ): number {
    const playerUnits = world.query("faction", "skills", "health");
    for (const pId of playerUnits) {
      const f = world.getComponent<FactionComponent>(pId, "faction");
      const h = world.getComponent<HealthComponent>(pId, "health");
      if (f?.faction === "player" && h?.woundState !== "down") {
        const skills = world.getComponent<SkillsComponent>(pId, "skills");
        return skills?.perception ?? 40;
      }
    }
    return 40;
  }

  checkVictory(): void {
    const loaded = this.ctx.engine.getLoadedScenario();
    if (!loaded) return;

    const world = this.ctx.engine.getWorld();
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

  private setupCombatTextEvents(): void {
    const queuedEventTypes: GameEvent["type"][] = [
      "AttackDeclared",
      "AttackRolled",
      "DefenseRolled",
      "DamageDealt",
      "AttackOutOfRange",
      "UnitDown",
      "OverwatchTriggered",
    ];

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
      this.ctx.engine.subscribeToEvent(eventType, (event) => {
        if (
          this.ctx.engine.getPhase() === "resolution" ||
          this.isPlayingCombatEvents
        ) {
          this.combatEventQueue.push(event);
        } else {
          this.floatingText.handleEvent(event);
        }
      });
    }

    for (const eventType of immediateEventTypes) {
      this.ctx.engine.subscribeToEvent(eventType, (event) => {
        this.floatingText.handleEvent(event);
      });
    }
  }

  async playCombatEventsWithDelay(
    showActiveHighlight: (id: EntityId) => void,
    hideActiveHighlight: () => void
  ): Promise<void> {
    if (this.combatEventQueue.length === 0) {
      hideActiveHighlight();
      return;
    }

    this.isPlayingCombatEvents = true;

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

    for (let i = 0; i < fightSequences.length; i++) {
      const sequence = fightSequences[i];
      const declaredEvent = sequence.find(
        (e) => e.type === "AttackDeclared"
      );
      if (declaredEvent?.entityId) {
        showActiveHighlight(declaredEvent.entityId);
      }
      if (
        declaredEvent?.type === "AttackDeclared" &&
        declaredEvent.entityId != null &&
        declaredEvent.targetId != null
      ) {
        const world = this.ctx.engine.getWorld();
        const attackerFaction =
          world.getComponent<FactionComponent>(
            declaredEvent.entityId,
            "faction"
          )?.faction ?? "enemy";
        const defenderFaction =
          world.getComponent<FactionComponent>(
            declaredEvent.targetId,
            "faction"
          )?.faction ?? "enemy";
        this.diceRollSidebar.setFactionsForNextExchange(
          attackerFaction,
          defenderFaction
        );
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

    hideActiveHighlight();
    this.combatEventQueue = [];
    this.isPlayingCombatEvents = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  updateFloatingTextPositions(): void {
    const world = this.ctx.engine.getWorld();
    for (const [id] of this.ctx.getEntityMeshes()) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      if (pos) {
        this.floatingText.updateEntityPosition(id, pos.x, pos.y);
      }
    }
  }

  onStartScenario(scenario: Scenario): void {
    this.combatLog.clear();
    this.diceRollSidebar.clear();
    this.createTurnBasedPanel();
    this.createUnitQuickBar();
    this.hideMenu();
    this.updateTurnBasedUI();
    this.updateObjectives(scenario.objectives);
  }

  onClearScenario(): void {
    this.playerUnitIds = [];
    document.getElementById("unit-quick-bar")?.remove();
  }
}
