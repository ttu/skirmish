import * as THREE from "three";
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  IdentityComponent,
  ActionPointsComponent,
  WeaponComponent,
  CommandQueueComponent,
  getAttackType,
  isRangedWeapon,
} from "../engine/components";
import { MovementSystem } from "../engine/systems/MovementSystem";
import { TurnResolutionSystem } from "../engine/systems/TurnResolutionSystem";
import { UnitFactory } from "../engine/data/UnitFactory";
import { EntityId } from "../engine/types";
import { getSelectionAfterUnitClick } from "./selection";
import { GameContext, MoveDestination } from "./GameContext";

export class CommandBuilder {
  private readonly ctx: GameContext;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private lastAttackTargetByUnit: Map<EntityId, EntityId> = new Map();
  private lastMoveDestinationByUnit: Map<EntityId, MoveDestination> =
    new Map();
  /** Flag to bypass unspent AP warning after user confirms. */
  private confirmResolveWithUnspentAP = false;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  getLastAttackTargetByUnit(): Map<EntityId, EntityId> {
    return this.lastAttackTargetByUnit;
  }

  getLastMoveDestinationByUnit(): Map<EntityId, MoveDestination> {
    return this.lastMoveDestinationByUnit;
  }

  getConfirmResolveWithUnspentAP(): boolean {
    return this.confirmResolveWithUnspentAP;
  }

  setConfirmResolveWithUnspentAP(value: boolean): void {
    this.confirmResolveWithUnspentAP = value;
  }

  clearState(): void {
    this.lastAttackTargetByUnit.clear();
    this.lastMoveDestinationByUnit.clear();
    this.confirmResolveWithUnspentAP = false;
  }

  /**
   * At start of planning phase: for each unit that attacked an enemy last turn,
   * if that enemy still exists and is in range, queue attacks automatically.
   */
  autoContinueAttacks(): void {
    const world = this.ctx.engine.getWorld();
    let anyQueued = false;
    for (const [unitId, targetId] of this.lastAttackTargetByUnit) {
      if (
        !world.hasComponent(unitId, "position") ||
        !world.hasComponent(targetId, "position")
      ) {
        continue;
      }
      const unitHealth = world.getComponent<HealthComponent>(unitId, "health");
      const targetHealth = world.getComponent<HealthComponent>(
        targetId,
        "health"
      );
      if (
        unitHealth?.woundState === "down" ||
        targetHealth?.woundState === "down"
      ) {
        continue;
      }
      const unitFaction = world.getComponent<FactionComponent>(
        unitId,
        "faction"
      );
      const targetFaction = world.getComponent<FactionComponent>(
        targetId,
        "faction"
      );
      if (
        unitFaction?.faction !== "player" ||
        targetFaction?.faction !== "enemy"
      ) {
        continue;
      }
      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const targetPos = world.getComponent<PositionComponent>(
        targetId,
        "position"
      );
      const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
      const ap = world.getComponent<ActionPointsComponent>(
        unitId,
        "actionPoints"
      );
      const queue = world.getComponent<CommandQueueComponent>(
        unitId,
        "commandQueue"
      );
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
      const effectiveRange = weapon
        ? isRangedWeapon(weapon)
          ? weapon.range
          : Math.max(weapon.range, MovementSystem.MELEE_ATTACK_RANGE)
        : MovementSystem.MELEE_ATTACK_RANGE;
      const distance = MovementSystem.calculateDistance(
        fromX,
        fromY,
        targetPos.x,
        targetPos.y
      );
      if (distance > effectiveRange) continue;

      const totalQueuedAp =
        queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
      const remainingAp = ap.current - totalQueuedAp;
      if (remainingAp < attackAp) continue;

      while (
        this.ctx.engine.queueCommand(unitId, {
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
      this.ctx.onCommandsChanged();
    }
  }

  /**
   * At start of planning phase: for each unit with a stored multi-turn destination,
   * auto-queue the next movement leg toward that destination.
   */
  autoContinueMovement(): void {
    const world = this.ctx.engine.getWorld();
    let anyQueued = false;

    for (const [unitId, finalDest] of this.lastMoveDestinationByUnit) {
      const unitHealth = world.getComponent<HealthComponent>(unitId, "health");
      if (unitHealth?.woundState === "down") {
        this.lastMoveDestinationByUnit.delete(unitId);
        continue;
      }
      const unitFaction = world.getComponent<FactionComponent>(
        unitId,
        "faction"
      );
      if (unitFaction?.faction !== "player") continue;

      const queue = world.getComponent<CommandQueueComponent>(
        unitId,
        "commandQueue"
      );
      if (queue && queue.commands.length > 0) continue;

      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const ap = world.getComponent<ActionPointsComponent>(
        unitId,
        "actionPoints"
      );
      if (!pos || !ap) continue;

      const distToFinal = MovementSystem.calculateDistance(
        pos.x,
        pos.y,
        finalDest.x,
        finalDest.y
      );
      if (distToFinal < 0.5) {
        this.lastMoveDestinationByUnit.delete(unitId);
        continue;
      }

      const baseSpeed = UnitFactory.getBaseSpeed(world, unitId);
      const mode = "advance" as const;
      const maxMoveDistance =
        baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
      const dest = MovementSystem.getClampedDestination(
        world,
        unitId,
        pos.x,
        pos.y,
        finalDest.x,
        finalDest.y,
        this.ctx.engine.getLoadedScenario()?.mapSize,
        maxMoveDistance
      );

      const apCost = MovementSystem.getMovementApCost(
        pos.x,
        pos.y,
        dest.x,
        dest.y,
        mode,
        baseSpeed,
        ap.current
      );
      if (apCost > ap.current || apCost === 0) continue;

      const success = this.ctx.engine.queueCommand(unitId, {
        type: "move",
        targetX: dest.x,
        targetY: dest.y,
        mode,
        apCost,
        priority: 2,
      });

      if (success) {
        anyQueued = true;
        const postMoveDist = MovementSystem.calculateDistance(
          dest.x,
          dest.y,
          finalDest.x,
          finalDest.y
        );
        if (postMoveDist < 0.5) {
          this.lastMoveDestinationByUnit.delete(unitId);
        } else {
          const mapSz = this.ctx.engine.getLoadedScenario()?.mapSize;
          const fullPathResult = mapSz
            ? MovementSystem.getPathfindingDestination(
                world,
                unitId,
                pos.x,
                pos.y,
                finalDest.x,
                finalDest.y,
                mapSz
              )
            : null;
          finalDest.fullPath = fullPathResult?.path;
        }
      }
    }

    if (anyQueued) {
      this.ctx.onCommandsChanged();
    }
  }

  clearSelectedUnitCommands(): void {
    const selectedEntityId = this.ctx.getSelectedEntityId();
    if (!selectedEntityId) return;
    if (this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(
      selectedEntityId,
      "faction"
    );
    if (faction?.faction !== "player") return;

    this.ctx.engine.clearCommands(selectedEntityId);
    this.lastAttackTargetByUnit.delete(selectedEntityId);
    this.lastMoveDestinationByUnit.delete(selectedEntityId);
    this.ctx.onCommandsChanged();
  }

  removeLastCommand(): void {
    const selectedEntityId = this.ctx.getSelectedEntityId();
    if (!selectedEntityId) return;
    if (this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(
      selectedEntityId,
      "faction"
    );
    if (faction?.faction !== "player") return;

    const queue = world.getComponent<CommandQueueComponent>(
      selectedEntityId,
      "commandQueue"
    );
    if (!queue || queue.commands.length === 0) return;

    const newCommands = queue.commands.slice(0, -1);
    world.addComponent<CommandQueueComponent>(selectedEntityId, {
      type: "commandQueue",
      commands: newCommands,
      currentCommandIndex: 0,
    });

    this.ctx.onCommandsChanged();
  }

  removeCommandAtIndex(index: number): void {
    const selectedEntityId = this.ctx.getSelectedEntityId();
    if (!selectedEntityId) return;
    if (this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(
      selectedEntityId,
      "faction"
    );
    if (faction?.faction !== "player") return;

    const queue = world.getComponent<CommandQueueComponent>(
      selectedEntityId,
      "commandQueue"
    );
    if (!queue || index < 0 || index >= queue.commands.length) return;

    const sortedCommands = [...queue.commands].sort(
      (a, b) => a.priority - b.priority
    );
    const commandToRemove = sortedCommands[index];

    const newCommands = queue.commands.filter((cmd) => cmd !== commandToRemove);
    world.addComponent<CommandQueueComponent>(selectedEntityId, {
      type: "commandQueue",
      commands: newCommands,
      currentCommandIndex: 0,
    });

    if (commandToRemove.type === "move") {
      this.lastMoveDestinationByUnit.delete(selectedEntityId);
    }

    this.ctx.onCommandsChanged();
  }

  queueOverwatchCommand(): void {
    const selectedEntityId = this.ctx.getSelectedEntityId();
    if (!selectedEntityId) return;
    this.queueOverwatchForUnit(selectedEntityId, true);
  }

  queueOverwatchForUnit(unitId: EntityId, showMessage: boolean = false): boolean {
    if (this.ctx.engine.getPhase() !== "planning") return false;

    const world = this.ctx.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(unitId, "faction");
    if (faction?.faction !== "player") return false;

    const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
    const attackType = weapon ? getAttackType(weapon) : "melee";

    const success = this.ctx.engine.queueCommand(unitId, {
      type: "overwatch",
      attackType,
      apCost: 2,
      priority: 1,
    });

    if (success) {
      this.lastMoveDestinationByUnit.delete(unitId);
      if (showMessage) {
        this.ctx.showTemporaryMessage(
          `Overwatch (${attackType}) queued - will attack enemies entering range`
        );
        this.ctx.onCommandsChanged();
      }
      this.checkOverwatchAutoResolve();
    }

    return success;
  }

  queueOverwatchForAllUnspent(
    units: Array<{ id: EntityId; name: string; unspentAP: number }>
  ): number {
    let count = 0;
    for (const unit of units) {
      if (unit.unspentAP >= 2) {
        if (this.queueOverwatchForUnit(unit.id, false)) {
          count++;
        }
      }
    }
    if (count > 0) {
      this.ctx.showTemporaryMessage(
        `Overwatch set for ${count} unit${count > 1 ? "s" : ""}`
      );
      this.ctx.onCommandsChanged();
    }
    return count;
  }

  getUnitsWithUnspentAP(): Array<{
    id: EntityId;
    name: string;
    unspentAP: number;
  }> {
    const loaded = this.ctx.engine.getLoadedScenario();
    if (!loaded) return [];

    const world = this.ctx.engine.getWorld();
    const result: Array<{ id: EntityId; name: string; unspentAP: number }> = [];

    for (const id of loaded.playerUnitIds) {
      const health = world.getComponent<HealthComponent>(id, "health");
      if (health?.woundState === "down") continue;

      const ap = world.getComponent<ActionPointsComponent>(
        id,
        "actionPoints"
      );
      const queue = world.getComponent<CommandQueueComponent>(
        id,
        "commandQueue"
      );
      const identity = world.getComponent<IdentityComponent>(id, "identity");

      if (!ap) continue;

      const hasOverwatch =
        queue?.commands.some((c) => c.type === "overwatch") ?? false;
      if (hasOverwatch) continue;

      const queuedAP =
        queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
      const unspentAP = ap.current - queuedAP;

      if (unspentAP > 0) {
        const name = identity?.name ?? "Unit";
        result.push({ id, name, unspentAP });
      }
    }

    return result;
  }

  showUnspentAPWarning(
    units: Array<{ id: EntityId; name: string; unspentAP: number }>
  ): void {
    const existing = document.getElementById("unspent-ap-warning");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "unspent-ap-warning";

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

    const anyCanOverwatch = units.some((u) => u.unspentAP >= 2);

    modal.innerHTML = `
      <div class="warning-title">Units with Unspent AP</div>
      <div class="unit-list">${unitListHtml}</div>
      <div class="warning-buttons">
        <button id="unspent-ap-cancel" class="cancel-btn">Cancel</button>
        ${anyCanOverwatch ? '<button id="unspent-ap-overwatch-all" class="overwatch-all-btn">Overwatch All</button>' : ""}
        <button id="unspent-ap-confirm" class="confirm-btn">Resolve Anyway</button>
      </div>
    `;

    document.getElementById("game-container")!.appendChild(modal);

    modal.querySelectorAll(".unit-overwatch-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(
          (e.target as HTMLElement).dataset.unitIdx ?? "0",
          10
        );
        const unit = units[idx];
        if (unit && this.queueOverwatchForUnit(unit.id, false)) {
          const button = e.target as HTMLButtonElement;
          button.textContent = "✓ Set";
          button.disabled = true;
          button.classList.add("overwatch-set");
          const row = button.closest(".unspent-unit-row");
          if (row) {
            const apSpan = row.querySelector(".unit-ap");
            if (apSpan) {
              const newAp = unit.unspentAP - 2;
              if (newAp <= 0) {
                apSpan.innerHTML =
                  '<span style="color:#6bcf7b">0 AP</span>';
              } else {
                apSpan.innerHTML = `<span style="color:var(--accent-gold)">${newAp} AP</span>`;
              }
            }
          }
          unit.unspentAP -= 2;
        }
      });
    });

    const overwatchAllBtn = document.getElementById(
      "unspent-ap-overwatch-all"
    );
    if (overwatchAllBtn) {
      overwatchAllBtn.addEventListener("click", () => {
        const count = this.queueOverwatchForAllUnspent(units);
        if (count > 0) {
          modal
            .querySelectorAll(".unit-overwatch-btn:not([disabled])")
            .forEach((btn) => {
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
                      apSpan.innerHTML =
                        '<span style="color:#6bcf7b">0 AP</span>';
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

    document
      .getElementById("unspent-ap-cancel")!
      .addEventListener("click", () => {
        modal.remove();
      });

    document
      .getElementById("unspent-ap-confirm")!
      .addEventListener("click", () => {
        modal.remove();
        this.confirmResolveWithUnspentAP = true;
        this.ctx.onResolveTurn();
      });
  }

  onCanvasClick(event: MouseEvent): void {
    if (!this.ctx.isInGame()) return;
    if (this.ctx.isGameOver()) return;

    const rect = this.ctx.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.ctx.cameraController.camera);
    const meshes = Array.from(this.ctx.getEntityMeshes().values()).flatMap(
      (g) => g.children
    );
    const intersects = this.raycaster.intersectObjects(
      meshes as THREE.Object3D[],
      true
    );

    if (intersects.length > 0) {
      this.handleEntityClick(intersects, event);
    } else {
      this.handleGroundClick(event);
    }
  }

  private handleEntityClick(
    intersects: THREE.Intersection[],
    event: MouseEvent
  ): void {
    const obj = intersects[0].object;
    let group = obj.parent as THREE.Group;
    while (group && !group.userData.entityId) {
      group = group.parent as THREE.Group;
    }
    const clickedId = group?.userData?.entityId as EntityId | undefined;
    if (!clickedId) return;

    const world = this.ctx.engine.getWorld();
    const clickedFaction = world.getComponent<FactionComponent>(
      clickedId,
      "faction"
    );
    let handled = false;

    const clickedHealth = world.getComponent<HealthComponent>(
      clickedId,
      "health"
    );
    const selectedEntityId = this.ctx.getSelectedEntityId();

    if (
      selectedEntityId &&
      clickedFaction?.faction === "enemy" &&
      clickedHealth?.woundState !== "down" &&
      this.ctx.engine.getPhase() === "planning"
    ) {
      handled = this.handleAttackClick(selectedEntityId, clickedId, event);
    }

    if (!handled) {
      this.ctx.setSelectedEntityId(
        getSelectionAfterUnitClick(
          this.ctx.getSelectedEntityId(),
          clickedId,
          clickedFaction?.faction === "enemy" ? "enemy" : "player"
        )
      );
      this.ctx.onCommandsChanged();
      this.ctx.updateSelectionRing();
    }
  }

  private handleAttackClick(
    selectedEntityId: EntityId,
    clickedId: EntityId,
    event: MouseEvent
  ): boolean {
    const world = this.ctx.engine.getWorld();
    const selFaction = world.getComponent<FactionComponent>(
      selectedEntityId,
      "faction"
    );
    if (selFaction?.faction !== "player") return false;

    const weapon = world.getComponent<WeaponComponent>(
      selectedEntityId,
      "weapon"
    );
    const pos = world.getComponent<PositionComponent>(
      selectedEntityId,
      "position"
    );
    const targetPos = world.getComponent<PositionComponent>(
      clickedId,
      "position"
    );
    const queue = world.getComponent<CommandQueueComponent>(
      selectedEntityId,
      "commandQueue"
    );
    const ap = world.getComponent<ActionPointsComponent>(
      selectedEntityId,
      "actionPoints"
    );

    if (!pos || !targetPos || !ap) return false;

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
    const effectiveRange = weapon
      ? isRangedWeapon(weapon)
        ? weapon.range
        : Math.max(weapon.range, MovementSystem.MELEE_ATTACK_RANGE)
      : MovementSystem.MELEE_ATTACK_RANGE;
    const totalQueuedAp =
      queue?.commands.reduce((sum, c) => sum + c.apCost, 0) ?? 0;
    const remainingAp = ap.current - totalQueuedAp;

    if (distance <= effectiveRange) {
      return this.queueDirectAttack(
        selectedEntityId,
        clickedId,
        attackType,
        attackAp,
        weapon,
        event.shiftKey
      );
    } else {
      return this.queueMoveAndAttack(
        selectedEntityId,
        clickedId,
        attackType,
        attackAp,
        weapon,
        fromX,
        fromY,
        targetPos,
        effectiveRange,
        remainingAp,
        event.shiftKey
      );
    }
  }

  private queueDirectAttack(
    selectedEntityId: EntityId,
    targetId: EntityId,
    attackType: "melee" | "ranged",
    attackAp: number,
    weapon: WeaponComponent | undefined,
    fillAp: boolean
  ): boolean {
    let attackQueued = false;

    if (fillAp) {
      while (
        this.ctx.engine.queueCommand(selectedEntityId, {
          type: "attack",
          targetId,
          attackType,
          apCost: attackAp,
          priority: weapon?.speed ?? 5,
        })
      ) {
        attackQueued = true;
      }
    } else {
      attackQueued = this.ctx.engine.queueCommand(selectedEntityId, {
        type: "attack",
        targetId,
        attackType,
        apCost: attackAp,
        priority: weapon?.speed ?? 5,
      });
    }

    if (attackQueued) {
      this.lastAttackTargetByUnit.set(selectedEntityId, targetId);
      this.lastMoveDestinationByUnit.delete(selectedEntityId);
      this.ctx.onCommandsChanged();
    }
    return attackQueued;
  }

  private queueMoveAndAttack(
    selectedEntityId: EntityId,
    targetId: EntityId,
    attackType: "melee" | "ranged",
    attackAp: number,
    weapon: WeaponComponent | undefined,
    fromX: number,
    fromY: number,
    targetPos: PositionComponent,
    effectiveRange: number,
    remainingAp: number,
    fillAp: boolean
  ): boolean {
    const world = this.ctx.engine.getWorld();
    const baseSpeed = UnitFactory.getBaseSpeed(world, selectedEntityId);
    const mode = "advance";
    const maxMoveDist =
      baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
    const dest = MovementSystem.getClampedDestination(
      world,
      selectedEntityId,
      fromX,
      fromY,
      targetPos.x,
      targetPos.y,
      this.ctx.engine.getLoadedScenario()?.mapSize,
      maxMoveDist,
      targetId
    );

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
        const moveSuccess = this.ctx.engine.queueCommand(selectedEntityId, {
          type: "move",
          targetX: dest.x,
          targetY: dest.y,
          mode,
          apCost: moveApCost,
          priority: 2,
        });
        if (moveSuccess) {
          this.lastMoveDestinationByUnit.delete(selectedEntityId);
          this.ctx.showTemporaryMessage(
            "Moving closer - won't reach attack range this turn"
          );
          this.ctx.onCommandsChanged();
          return true;
        }
      }
      return false;
    }

    // Will be in range after move - queue move then attacks
    const moveSuccess =
      moveApCost <= remainingAp &&
      this.ctx.engine.queueCommand(selectedEntityId, {
        type: "move",
        targetX: dest.x,
        targetY: dest.y,
        mode,
        apCost: moveApCost,
        priority: 2,
      });

    if (moveSuccess) {
      if (fillAp) {
        while (
          this.ctx.engine.queueCommand(selectedEntityId, {
            type: "attack",
            targetId,
            attackType,
            apCost: attackAp,
            priority: weapon?.speed ?? 5,
          })
        ) {
          /* fill remaining AP with attacks */
        }
      } else {
        this.ctx.engine.queueCommand(selectedEntityId, {
          type: "attack",
          targetId,
          attackType,
          apCost: attackAp,
          priority: weapon?.speed ?? 5,
        });
      }

      this.lastAttackTargetByUnit.set(selectedEntityId, targetId);
      this.lastMoveDestinationByUnit.delete(selectedEntityId);
      this.ctx.onCommandsChanged();
      return true;
    }

    return false;
  }

  private handleGroundClick(event: MouseEvent): void {
    const selectedEntityId = this.ctx.getSelectedEntityId();
    const worldPos = this.ctx.cameraController.screenToWorld(
      new THREE.Vector2(event.clientX, event.clientY),
      this.ctx.canvas
    );

    if (!selectedEntityId || this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    const faction = world.getComponent<FactionComponent>(
      selectedEntityId,
      "faction"
    );
    if (faction?.faction !== "player") return;

    const pos = world.getComponent<PositionComponent>(
      selectedEntityId,
      "position"
    );
    const queue = world.getComponent<CommandQueueComponent>(
      selectedEntityId,
      "commandQueue"
    );
    const ap = world.getComponent<ActionPointsComponent>(
      selectedEntityId,
      "actionPoints"
    );
    if (!pos || !ap) return;

    let fromX = pos.x;
    let fromZ = pos.y;
    for (const cmd of queue?.commands ?? []) {
      if (cmd.type === "move") {
        fromX = cmd.targetX;
        fromZ = cmd.targetY;
      }
    }

    const baseSpeed = UnitFactory.getBaseSpeed(world, selectedEntityId);
    const mode = "advance";
    const maxMoveDistance =
      baseSpeed * MovementSystem.getMovementModeCost(mode).speedMultiplier;
    const dest = MovementSystem.getClampedDestination(
      world,
      selectedEntityId,
      fromX,
      fromZ,
      worldPos.x,
      worldPos.z,
      this.ctx.engine.getLoadedScenario()?.mapSize,
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

    const success = this.ctx.engine.queueCommand(selectedEntityId, {
      type: "move",
      targetX: dest.x,
      targetY: dest.y,
      mode,
      apCost,
      priority: 2,
    });
    if (success) {
      const clickedX = worldPos.x;
      const clickedZ = worldPos.z;
      const distToFinal = MovementSystem.calculateDistance(
        dest.x,
        dest.y,
        clickedX,
        clickedZ
      );
      if (distToFinal > 0.5) {
        const mapSz = this.ctx.engine.getLoadedScenario()?.mapSize;
        const fullPathResult = mapSz
          ? MovementSystem.getPathfindingDestination(
              world,
              selectedEntityId,
              fromX,
              fromZ,
              clickedX,
              clickedZ,
              mapSz
            )
          : null;
        this.lastMoveDestinationByUnit.set(selectedEntityId, {
          x: clickedX,
          y: clickedZ,
          fullPath: fullPathResult?.path,
        });
      } else {
        this.lastMoveDestinationByUnit.delete(selectedEntityId);
      }
      this.ctx.onCommandsChanged();
    }
  }

  checkOverwatchAutoResolve(): void {
    if (this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    if (TurnResolutionSystem.areAllPlayerUnitsOnOverwatch(world)) {
      this.confirmResolveWithUnspentAP = true;
      this.ctx.onResolveTurn();
    }
  }
}
