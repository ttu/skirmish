import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { DiceRoller } from '../core/DiceRoller';
import { EntityId } from '../types';
import {
  CommandQueueComponent,
  UnitCommand,
  PositionComponent,
  FactionComponent,
  HealthComponent,
  SkillsComponent,
  ActionPointsComponent,
  ArmorComponent,
  WeaponComponent,
  AmmoComponent,
  MoraleStateComponent,
  EngagementComponent,
  OffHandComponent,
  DefensiveStanceComponent,
  OverwatchComponent,
  OverwatchCommand,
  getWoundPenalty,
  getAttackType,
} from '../components';
import { CombatResolver, Modifier, DefenseType, HitLocation } from './CombatResolver';
import { DamageSystem } from './DamageSystem';
import { MovementSystem } from './MovementSystem';
import { StaminaSystem } from './StaminaSystem';
import { AmmoSystem } from './AmmoSystem';
import { MoraleSystem } from './MoraleSystem';
import { UnitFactory } from '../data/UnitFactory';
import { WoundEffectsSystem } from './WoundEffectsSystem';

export interface QueuedAction {
  entityId: EntityId;
  command: UnitCommand;
  priority: number;
}

export interface TurnResolutionResult {
  actionsResolved: number;
  entitiesActed: EntityId[];
  eventsGenerated: number;
}

export class TurnResolutionSystem {
  /**
   * Queue a command for an entity
   */
  static queueCommand(world: WorldImpl, entityId: EntityId, command: UnitCommand): boolean {
    let queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');

    if (!queue) {
      queue = {
        type: 'commandQueue',
        commands: [],
        currentCommandIndex: 0,
      };
      world.addComponent<CommandQueueComponent>(entityId, queue);
    }

    // Check if entity has enough AP for the command
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    if (!ap) return false;

    const totalQueuedCost = queue.commands.reduce((sum, cmd) => sum + cmd.apCost, 0);
    if (totalQueuedCost + command.apCost > ap.current) {
      return false; // Not enough AP
    }

    // Add command to queue
    world.addComponent<CommandQueueComponent>(entityId, {
      ...queue,
      commands: [...queue.commands, command],
    });

    return true;
  }

  /**
   * Clear all queued commands for an entity
   */
  static clearCommands(world: WorldImpl, entityId: EntityId): void {
    world.addComponent<CommandQueueComponent>(entityId, {
      type: 'commandQueue',
      commands: [],
      currentCommandIndex: 0,
    });
  }

  /**
   * Check if all player units are on overwatch (either active component or queued command).
   * Excludes downed and routed units.
   * Returns false if there are no player units.
   */
  static areAllPlayerUnitsOnOverwatch(world: WorldImpl): boolean {
    const playerUnits = world.query('faction').filter((entityId) => {
      const faction = world.getComponent<FactionComponent>(entityId, 'faction');
      return faction?.faction === 'player';
    });

    if (playerUnits.length === 0) return false;

    for (const entityId of playerUnits) {
      // Skip downed units
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      if (health && health.woundState === 'down') continue;

      // Skip routed units
      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');
      if (morale && morale.status === 'routed') continue;

      // Check for active overwatch component
      const overwatchComponent = world.getComponent<OverwatchComponent>(entityId, 'overwatch');
      if (overwatchComponent) continue;

      // Check for queued overwatch command
      const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
      const hasOverwatchQueued = queue?.commands.some((cmd) => cmd.type === 'overwatch');
      if (hasOverwatchQueued) continue;

      // Check if unit has any non-overwatch commands queued
      const hasOtherCommands = queue?.commands.some((cmd) => cmd.type !== 'overwatch');
      if (hasOtherCommands) return false;

      // Unit has neither active overwatch nor queued overwatch
      return false;
    }

    return true;
  }

  /**
   * Remove a specific executed command from an entity's queue (for order persistence)
   */
  static removeExecutedCommand(world: WorldImpl, entityId: EntityId, executedCommand: UnitCommand): void {
    const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
    if (!queue) return;

    const idx = queue.commands.findIndex((c) => this.commandsEqual(c, executedCommand));
    if (idx < 0) return;

    const newCommands = queue.commands.filter((_, i) => i !== idx);
    world.addComponent<CommandQueueComponent>(entityId, {
      ...queue,
      commands: newCommands,
    });
  }

  private static commandsEqual(a: UnitCommand, b: UnitCommand): boolean {
    if (a.type !== b.type || a.apCost !== b.apCost) return false;
    if (a.type === 'move' && b.type === 'move') {
      return a.targetX === b.targetX && a.targetY === b.targetY && a.mode === b.mode;
    }
    if (a.type === 'attack' && b.type === 'attack') {
      return a.targetId === b.targetId && a.attackType === b.attackType;
    }
    return true;
  }

  /**
   * Evaluate a command condition; returns true if command should execute
   */
  static evaluateCondition(world: WorldImpl, entityId: EntityId, command: UnitCommand): boolean {
    const cond = command.condition;
    if (!cond) return true;

    switch (cond.type) {
      case 'targetDead': {
        const targetId = cond.params.targetId as EntityId;
        const health = world.getComponent<HealthComponent>(targetId, 'health');
        return health?.woundState === 'down';
      }
      case 'inRange': {
        const targetId = cond.params.targetId as EntityId;
        const range = (cond.params.range as number) ?? 5;
        const myPos = world.getComponent<PositionComponent>(entityId, 'position');
        const targetPos = world.getComponent<PositionComponent>(targetId, 'position');
        if (!myPos || !targetPos) return false;
        const dist = MovementSystem.calculateDistance(myPos.x, myPos.y, targetPos.x, targetPos.y);
        return dist <= range;
      }
      case 'hpBelow': {
        const threshold = (cond.params.threshold as number) ?? 0;
        const health = world.getComponent<HealthComponent>(entityId, 'health');
        return health ? health.current < threshold : false;
      }
      case 'enemyApproaches': {
        // Simplified: check if any enemy is within range (e.g. 8)
        const range = (cond.params.range as number) ?? 8;
        const myPos = world.getComponent<PositionComponent>(entityId, 'position');
        const myFaction = world.getComponent<FactionComponent>(entityId, 'faction');
        if (!myPos || !myFaction) return false;
        const enemies = world.query('position', 'faction');
        for (const eid of enemies) {
          if (eid === entityId) continue;
          const fac = world.getComponent<FactionComponent>(eid, 'faction');
          if (!fac || fac.faction === myFaction.faction) continue;
          const ep = world.getComponent<PositionComponent>(eid, 'position');
          if (!ep) continue;
          if (MovementSystem.calculateDistance(myPos.x, myPos.y, ep.x, ep.y) <= range) return true;
        }
        return false;
      }
      default:
        return true;
    }
  }

  /**
   * Get all queued actions across all entities, sorted by priority.
   * Only includes commands whose conditions are met (E1: conditional commands).
   */
  static collectAndSortActions(world: WorldImpl): QueuedAction[] {
    const actions: QueuedAction[] = [];
    const entities = world.query('commandQueue');

    for (const entityId of entities) {
      const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
      if (!queue || queue.commands.length === 0) continue;

      // Check if entity can act
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      if (health && health.woundState === 'down') continue;

      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');
      if (morale && morale.status === 'routed') continue;

      for (const command of queue.commands) {
        if (!this.evaluateCondition(world, entityId, command)) continue;
        actions.push({
          entityId,
          command,
          priority: command.priority,
        });
      }
    }

    // Sort by priority (lower = faster)
    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Resolve all queued actions for a turn
   */
  static resolveTurn(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    turn: number,
    mapSize?: { width: number; height: number }
  ): TurnResolutionResult {
    const initialEventCount = eventBus.getHistory().length;
    const entitiesActed = new Set<EntityId>();
    const reactionsUsed = new Map<EntityId, number>(); // defender -> count of reactions used
    let actionsResolved = 0;

    // Emit turn resolution started
    eventBus.emit({
      type: 'ResolutionPhaseStarted',
      turn,
      timestamp: Date.now(),
      data: {},
    });

    // Refresh engagement state before resolving
    const entitiesWithEngagement = world.query('position', 'engagement');
    MovementSystem.updateEngagements(world, entitiesWithEngagement);

    // Collect and sort all actions
    const actions = this.collectAndSortActions(world);

    // Process each action
    for (const action of actions) {
      // Skip if entity can no longer act (went down during resolution)
      const health = world.getComponent<HealthComponent>(action.entityId, 'health');
      if (health && health.woundState === 'down') continue;

      const success = this.resolveAction(
        world,
        eventBus,
        roller,
        action.entityId,
        action.command,
        turn,
        reactionsUsed,
        mapSize
      );
      if (success) {
        actionsResolved++;
        entitiesActed.add(action.entityId);
        this.removeExecutedCommand(world, action.entityId, action.command);
      }
    }

    // Build set of entities that were hit this turn (for conditional stamina recovery)
    const hitEntities = new Set<EntityId>();
    for (const evt of eventBus.getHistory()) {
      if (evt.turn !== turn) continue;
      if (evt.type === 'DamageDealt' && evt.targetId) {
        hitEntities.add(evt.targetId as EntityId);
      }
      if (evt.type === 'WeaponHitDeflected' && evt.entityId) {
        hitEntities.add(evt.entityId as EntityId);
      }
    }

    // End of turn processing
    this.processEndOfTurn(world, eventBus, roller, turn, hitEntities);

    // E2: Order persistence - do NOT clear queues; unexecuted commands carry over

    // Emit turn ended
    eventBus.emit({
      type: 'TurnEnded',
      turn,
      timestamp: Date.now(),
      data: { actionsResolved },
    });

    return {
      actionsResolved,
      entitiesActed: Array.from(entitiesActed),
      eventsGenerated: eventBus.getHistory().length - initialEventCount,
    };
  }

  /**
   * Resolve a single action
   */
  static resolveAction(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    entityId: EntityId,
    command: UnitCommand,
    turn: number,
    reactionsUsed?: Map<EntityId, number>,
    mapSize?: { width: number; height: number }
  ): boolean {
    const used = reactionsUsed ?? new Map<EntityId, number>();
    switch (command.type) {
      case 'move':
        return this.resolveMoveCommand(world, eventBus, roller, entityId, command, turn, used, mapSize);
      case 'attack':
        return this.resolveAttackCommand(world, eventBus, roller, entityId, command, turn, used, false, mapSize);
      case 'defend':
        return this.resolveDefendCommand(world, entityId, command);
      case 'aim':
        return this.resolveAimCommand(world, entityId, command);
      case 'reload':
        return this.resolveReloadCommand(world, eventBus, entityId, command, turn);
      case 'rally':
        return this.resolveRallyCommand(world, eventBus, roller, entityId, turn);
      case 'wait':
        return this.resolveWaitCommand(world, entityId, command);
      case 'overwatch':
        return this.resolveOverwatchCommand(world, eventBus, entityId, command, turn);
      default:
        return false;
    }
  }

  /**
   * Resolve move command (E4: engagement - disengage or provoke)
   */
  private static resolveMoveCommand(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    entityId: EntityId,
    command: { targetX: number; targetY: number; mode: 'walk' | 'advance' | 'run' | 'sprint'; apCost: number },
    turn: number,
    reactionsUsed: Map<EntityId, number>,
    mapSize?: { width: number; height: number }
  ): boolean {
    // Enforce wound movement restrictions
    let mode = command.mode;
    if (!WoundEffectsSystem.canSprint(world, entityId) && mode === 'sprint') mode = 'advance';
    if (!WoundEffectsSystem.canRun(world, entityId) && mode === 'run') mode = 'advance';

    // Calculate effective speed with wound penalties
    let baseSpeed = UnitFactory.getBaseSpeed(world, entityId);
    baseSpeed = Math.max(1, baseSpeed - WoundEffectsSystem.getMovementPenalty(world, entityId));
    if (WoundEffectsSystem.halvesMovement(world, entityId)) {
      baseSpeed = Math.max(1, Math.floor(baseSpeed / 2));
    }

    const position = world.getComponent<PositionComponent>(entityId, 'position');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const engagement = world.getComponent<EngagementComponent>(entityId, 'engagement');

    if (!position || !ap) return false;

    const dest = MovementSystem.getMoveDestination(
      position.x,
      position.y,
      command.targetX,
      command.targetY,
      mode,
      baseSpeed
    );

    const leavingEngagement =
      engagement?.engagedWith.filter((engagedId) => {
        const ep = world.getComponent<PositionComponent>(engagedId, 'position');
        if (!ep) return false;
        const dist = MovementSystem.calculateDistance(dest.x, dest.y, ep.x, ep.y);
        return dist > MovementSystem.ENGAGEMENT_RANGE;
      }) ?? [];

    if (leavingEngagement.length > 0) {
      if (mode === 'sprint') {
        for (const attackerId of leavingEngagement) {
          const weapon = world.getComponent<WeaponComponent>(attackerId, 'weapon');
          const attackType = weapon ? getAttackType(weapon) : 'melee';
          this.resolveAttackCommand(
            world,
            eventBus,
            roller,
            attackerId,
            {
              targetId: entityId,
              attackType,
              apCost: 0,
            },
            turn,
            reactionsUsed,
            true
          );
        }
      } else {
        const moveCost = command.apCost;
        if (ap.current < 2 + moveCost) return false;
        MovementSystem.disengage(world, eventBus, entityId, turn);
      }
    }

    // Store old position for overwatch check
    const oldX = position.x;
    const oldY = position.y;

    MovementSystem.moveUnit(
      world,
      eventBus,
      entityId,
      command.targetX,
      command.targetY,
      mode,
      baseSpeed,
      turn,
      mapSize
    );

    const entitiesWithPos = world.query('position', 'engagement');
    MovementSystem.updateEngagements(world, entitiesWithPos);

    // Check if any enemy overwatch is triggered by this movement
    const newPos = world.getComponent<PositionComponent>(entityId, 'position');
    if (newPos) {
      this.checkOverwatchTriggers(
        world,
        eventBus,
        roller,
        entityId,
        oldX,
        oldY,
        newPos.x,
        newPos.y,
        turn,
        reactionsUsed
      );
    }

    return true;
  }

  /**
   * Resolve attack command
   */
  private static resolveAttackCommand(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    attackerId: EntityId,
    command: {
      targetId: EntityId;
      attackType: 'melee' | 'ranged';
      apCost: number;
      chosenLocation?: HitLocation;
    },
    turn: number,
    reactionsUsed: Map<EntityId, number>,
    isProvoke = false,
    mapSize?: { width: number; height: number }
  ): boolean {
    const attackerSkills = world.getComponent<SkillsComponent>(attackerId, 'skills');
    const attackerWeapon = world.getComponent<WeaponComponent>(attackerId, 'weapon');
    const attackerHealth = world.getComponent<HealthComponent>(attackerId, 'health');
    const attackerMorale = world.getComponent<MoraleStateComponent>(attackerId, 'moraleState');

    const defenderSkills = world.getComponent<SkillsComponent>(command.targetId, 'skills');
    const defenderArmor = world.getComponent<ArmorComponent>(command.targetId, 'armor');
    const defenderHealth = world.getComponent<HealthComponent>(command.targetId, 'health');

    if (!attackerSkills || !attackerWeapon || !defenderSkills || !defenderArmor) {
      return false;
    }

    // Don't attack units that are already down
    if (defenderHealth && defenderHealth.woundState === 'down') {
      return true; // consume the command but skip the attack
    }

    // Melee attacks require units to be within the weapon's range.
    // Use at least MELEE_ATTACK_RANGE so short weapons (e.g. knife range 1.0)
    // can attack at MIN_UNIT_SEPARATION distance without floating-point issues.
    if (command.attackType === 'melee') {
      const attackerPos = world.getComponent<PositionComponent>(attackerId, 'position');
      const defenderPos = world.getComponent<PositionComponent>(command.targetId, 'position');
      if (attackerPos && defenderPos) {
        const weaponRange = Math.max(attackerWeapon.range, MovementSystem.MELEE_ATTACK_RANGE);
        let dist = MovementSystem.calculateDistance(
          attackerPos.x, attackerPos.y,
          defenderPos.x, defenderPos.y
        );

        // If out of range, try to auto-close distance before attacking
        if (dist > weaponRange) {
          const ap = world.getComponent<ActionPointsComponent>(attackerId, 'actionPoints');
          const baseSpeed = UnitFactory.getBaseSpeed(world, attackerId);
          const moveApCost = 2; // 'advance' mode costs 2 AP

          // Only auto-move if we have enough AP for BOTH moving AND attacking
          // Otherwise we'd use the attack's AP budget for movement
          if (ap && ap.current >= moveApCost + command.apCost && baseSpeed > 0) {
            const mode = 'advance' as const;

            // Move toward the target
            MovementSystem.moveUnit(
              world,
              eventBus,
              attackerId,
              defenderPos.x,
              defenderPos.y,
              mode,
              baseSpeed,
              turn,
              mapSize
            );

            // Update engagements after move
            const entitiesWithPos = world.query('position', 'engagement');
            MovementSystem.updateEngagements(world, entitiesWithPos);

            // Re-check distance after move
            const newPos = world.getComponent<PositionComponent>(attackerId, 'position');
            if (newPos) {
              dist = MovementSystem.calculateDistance(
                newPos.x, newPos.y,
                defenderPos.x, defenderPos.y
              );
            }
          }

          // If still out of range after moving (or couldn't move), emit event and remove command
          if (dist > weaponRange) {
            eventBus.emit({
              type: 'AttackOutOfRange',
              turn,
              timestamp: Date.now(),
              entityId: attackerId,
              targetId: command.targetId,
              data: { distance: dist, requiredRange: weaponRange },
            });
            // Return true to remove the command from queue - we tried our best
            return true;
          }
        }
      }
    }

    // Build attack modifiers
    const attackModifiers: Modifier[] = [];

    // Wound penalty
    if (attackerHealth) {
      const woundPenalty = getWoundPenalty(attackerHealth.woundState);
      if (woundPenalty > 0) {
        attackModifiers.push({ source: 'wounds', value: -woundPenalty });
      }
    }

    // Wound effect skill penalty (from arm/torso wounds)
    const attackerWoundPenalty = WoundEffectsSystem.getSkillPenalty(world, attackerId);
    if (attackerWoundPenalty > 0) {
      attackModifiers.push({ source: 'wound_effects', value: -attackerWoundPenalty });
    }

    // Morale penalty
    if (attackerMorale) {
      const moralePenalty = MoraleSystem.getMoralePenalty(attackerMorale.status);
      if (moralePenalty > 0) {
        attackModifiers.push({ source: 'morale', value: -moralePenalty });
      }
    }

    // Flanking bonus
    const flankingBonus = this.calculateFlankingBonus(world, attackerId, command.targetId);
    if (flankingBonus > 0) {
      attackModifiers.push({ source: 'flanking', value: flankingBonus });
    }

    // Facing/arc bonus (side +10%, rear +20%)
    const attackerPos = world.getComponent<PositionComponent>(attackerId, 'position');
    const defenderPos = world.getComponent<PositionComponent>(command.targetId, 'position');
    if (attackerPos && defenderPos) {
      const arc = MovementSystem.getAttackArc(
        defenderPos.x,
        defenderPos.y,
        defenderPos.facing,
        attackerPos.x,
        attackerPos.y
      );
      if (arc === 'side') attackModifiers.push({ source: 'side_attack', value: 10 });
      if (arc === 'rear') attackModifiers.push({ source: 'rear_attack', value: 20 });
    }

    // Height advantage: attacker on higher ground gets +10% to hit
    const attackerElevation = attackerPos?.elevation ?? 0;
    const defenderElevation = defenderPos?.elevation ?? 0;
    if (attackerElevation > defenderElevation) {
      attackModifiers.push({ source: 'height_advantage', value: 10 });
    }

    if (isProvoke) attackModifiers.push({ source: 'provoke', value: 20 });

    // Emit attack declared
    eventBus.emit({
      type: 'AttackDeclared',
      turn,
      timestamp: Date.now(),
      entityId: attackerId,
      targetId: command.targetId,
      data: { attackType: command.attackType },
    });

    // Roll attack
    const skill = command.attackType === 'melee' ? attackerSkills.melee : attackerSkills.ranged;
    const attackResult = CombatResolver.resolveAttackRoll(skill, attackModifiers, roller);

    eventBus.emit({
      type: 'AttackRolled',
      turn,
      timestamp: Date.now(),
      entityId: attackerId,
      data: {
        roll: attackResult.roll,
        baseSkill: attackResult.baseSkill,
        modifiers: attackResult.modifiers,
        effectiveSkill: attackResult.effectiveSkill,
        hit: attackResult.hit,
        attackType: command.attackType,
      },
    });

    if (!isProvoke) {
      this.deductAP(world, attackerId, command.apCost);
      if (command.attackType === 'ranged') {
        AmmoSystem.consumeAmmo(world, eventBus, attackerId, turn);
      }
      StaminaSystem.drainStamina(world, eventBus, attackerId, 2, turn);
    }

    if (!attackResult.hit) {
      return true; // Attack resolved, but missed
    }

    // Defender gets 1 + extraReactions (from defensive stance) per turn
    const stance = world.getComponent<DefensiveStanceComponent>(command.targetId, 'defensiveStance');
    const maxReactions = 1 + (stance?.extraReactions ?? 0);
    const reactionsUsedCount = reactionsUsed.get(command.targetId) ?? 0;
    const defenderCanReact = reactionsUsedCount < maxReactions;
    let defenseSucceeded = false;

    if (defenderCanReact) {
      const defenseModifiers: Modifier[] = [];
      if (defenderHealth) {
        const woundPenalty = getWoundPenalty(defenderHealth.woundState);
        if (woundPenalty > 0) {
          defenseModifiers.push({ source: 'wounds', value: -woundPenalty });
        }
      }
      // Wound effect skill penalty on defender
      const defenderWoundPenalty = WoundEffectsSystem.getSkillPenalty(world, command.targetId);
      if (defenderWoundPenalty > 0) {
        defenseModifiers.push({ source: 'wound_effects', value: -defenderWoundPenalty });
      }
      if (stance && stance.bonusPercent > 0) {
        defenseModifiers.push({ source: 'defensive_stance', value: stance.bonusPercent });
      }
      // Height advantage: defender on higher ground gets +10% to defense
      if ((defenderPos?.elevation ?? 0) > (attackerPos?.elevation ?? 0)) {
        defenseModifiers.push({ source: 'height_advantage', value: 10 });
      }

      // Stamina defense penalty
      const staminaDefensePenalty = StaminaSystem.getStaminaDefensePenalty(world, command.targetId);
      if (staminaDefensePenalty < 0) {
        defenseModifiers.push({ source: 'stamina_fatigue', value: staminaDefensePenalty });
      }

      const defenseType = this.chooseDefenseType(world, command.targetId, command.attackType);

      // Armor dodge penalty (applied when dodging in armor)
      if (defenseType === 'dodge') {
        const defenderArmorForClass = world.getComponent<ArmorComponent>(command.targetId, 'armor');
        if (defenderArmorForClass) {
          const armorClass = CombatResolver.getArmorClass(defenderArmorForClass);
          const dodgePen = CombatResolver.getDodgePenalty(armorClass);
          if (dodgePen !== null && dodgePen < 0) {
            defenseModifiers.push({ source: 'armor_weight', value: dodgePen });
          }
        }
      }

      // Shield wall: +10% block when adjacent to ally with shield (only when blocking)
      if (defenseType === 'block') {
        const shieldWallBonus = this.getShieldWallBonus(world, command.targetId);
        if (shieldWallBonus > 0) {
          defenseModifiers.push({ source: 'shield_wall', value: shieldWallBonus });
        }
      }
      const defenseSkill =
        defenseType === 'block'
          ? defenderSkills.block
          : defenseType === 'parry'
            ? defenderSkills.melee
            : defenderSkills.dodge;

      const defenseResult = CombatResolver.resolveDefenseRoll(
        defenseType,
        defenseSkill,
        defenseModifiers,
        roller
      );

      eventBus.emit({
        type: 'DefenseRolled',
        turn,
        timestamp: Date.now(),
        entityId: command.targetId,
        data: {
          roll: defenseResult.roll,
          baseSkill: defenseResult.baseSkill,
          modifiers: defenseResult.modifiers,
          effectiveSkill: defenseResult.effectiveSkill,
          success: defenseResult.success,
          defenseType,
        },
      });

      defenseSucceeded = defenseResult.success;
      reactionsUsed.set(command.targetId, reactionsUsedCount + 1);
    }

    if (defenseSucceeded) {
      return true; // Attack blocked
    }

    // Determine hit location (aimed shot uses chosen location)
    const location: HitLocation =
      command.chosenLocation != null
        ? command.chosenLocation
        : CombatResolver.resolveHitLocation(roller);
    const armor = CombatResolver.getArmorForLocation(defenderArmor, location);

    eventBus.emit({
      type: 'HitLocationRolled',
      turn,
      timestamp: Date.now(),
      entityId: command.targetId,
      data: { location, armor },
    });

    // Calculate damage (height advantage: +1 damage when attacker is higher)
    const damageResult = CombatResolver.calculateDamage(attackerWeapon.damage, armor, roller);

    // Weapon hit: deflected by weapon/shield — no HP damage, but impact shock + break chance
    if (location === 'weapon') {
      const staminaDrain = StaminaSystem.calculateArmorStaminaDrain(damageResult.rawDamage);
      if (staminaDrain > 0) {
        StaminaSystem.drainStamina(world, eventBus, command.targetId, staminaDrain, turn);
      }

      eventBus.emit({
        type: 'WeaponHitDeflected',
        turn,
        timestamp: Date.now(),
        entityId: command.targetId,
        data: { rawDamage: damageResult.rawDamage, staminaDrain },
      });

      // Roll for weapon/shield break
      const breakChance = CombatResolver.calculateWeaponBreakChance(damageResult.rawDamage);
      const breakRoll = roller.rollD100();
      if (breakRoll <= breakChance) {
        const offHand = world.getComponent<OffHandComponent>(command.targetId, 'offHand');
        if (offHand?.itemType === 'shield') {
          // Shield breaks: lose block bonus
          world.addComponent<OffHandComponent>(command.targetId, {
            ...offHand,
            blockBonus: 0,
          });
          eventBus.emit({
            type: 'WeaponBroken',
            turn,
            timestamp: Date.now(),
            entityId: command.targetId,
            data: { item: 'shield', breakRoll, breakChance },
          });
        } else {
          // Weapon damaged: reduce damage bonus by 1
          const defenderWeapon = world.getComponent<WeaponComponent>(command.targetId, 'weapon');
          if (defenderWeapon) {
            world.addComponent<WeaponComponent>(command.targetId, {
              ...defenderWeapon,
              damage: {
                ...defenderWeapon.damage,
                bonus: Math.max(0, defenderWeapon.damage.bonus - 1),
              },
            });
            eventBus.emit({
              type: 'WeaponBroken',
              turn,
              timestamp: Date.now(),
              entityId: command.targetId,
              data: { item: 'weapon', breakRoll, breakChance },
            });
          }
        }
      }

      return true;
    }

    const multiplier = CombatResolver.getLocationDamageMultiplier(location);
    let finalDamage = Math.floor(damageResult.finalDamage * multiplier);
    if (attackerElevation > defenderElevation) {
      finalDamage += 1;
    }

    // Armor stamina drain: absorbed damage tires the defender
    const absorbed = damageResult.armorAbsorbed;
    if (absorbed > 0) {
      StaminaSystem.applyArmorStaminaDrain(world, eventBus, command.targetId, absorbed, turn);
    }

    if (finalDamage > 0) {
      // Apply damage
      DamageSystem.applyDamage(world, eventBus, command.targetId, finalDamage, location, turn, attackerId, damageResult.rawDamage, damageResult.armorAbsorbed);

      // Check for wound effects (arms/legs/torso only; uses critical table for unarmored)
      WoundEffectsSystem.checkAndApplyWoundEffect(
        world, eventBus, command.targetId, location, finalDamage, armor, turn
      );

      // Head hit knockout: if head hit and raw damage > 5, roll Toughness or go down
      const rawDamageForLocation = damageResult.rawDamage * (location === 'head' ? 3 : 1);
      if (location === 'head' && rawDamageForLocation > 5) {
        const defenderHealthNow = world.getComponent<HealthComponent>(command.targetId, 'health');
        const defenderSkills = world.getComponent<SkillsComponent>(command.targetId, 'skills');
        if (defenderHealthNow && defenderHealthNow.woundState !== 'down') {
          const toughness = defenderSkills?.toughness ?? 40;
          const roll = roller.rollD100();
          if (roll > toughness) {
            world.addComponent<HealthComponent>(command.targetId, {
              ...defenderHealthNow,
              current: 0,
              woundState: 'down',
            });
            eventBus.emit({
              type: 'UnitDown',
              turn,
              timestamp: Date.now(),
              entityId: command.targetId,
              data: { reason: 'head_knockout', toughnessRoll: roll, toughness },
            });
          }
        }
      }

      // Check if defender needs morale check (on significant damage)
      if (finalDamage >= 20) {
        const moraleModifiers: Modifier[] = [{ source: 'heavy_damage', value: -10 }];
        const moraleResult = MoraleSystem.testMorale(
          world,
          eventBus,
          command.targetId,
          moraleModifiers,
          roller,
          turn
        );

        if (!moraleResult.passed) {
          MoraleSystem.applyMoraleFailure(
            world,
            eventBus,
            command.targetId,
            moraleResult.failureMargin,
            turn
          );
        }
      }
    }

    return true;
  }

  /**
   * Resolve defend command (sets defensive stance: 1 AP = +10%, 2 AP = +20% + 1 extra reaction, 3 AP = +30% + 2 extra)
   */
  private static resolveDefendCommand(
    world: WorldImpl,
    entityId: EntityId,
    command: { defenseType: 'block' | 'dodge' | 'parry'; apCost: number }
  ): boolean {
    this.deductAP(world, entityId, command.apCost);
    const apCost = Math.min(3, Math.max(1, command.apCost));
    const bonusPercent = apCost === 1 ? 10 : apCost === 2 ? 20 : 30;
    const extraReactions = apCost === 1 ? 0 : apCost === 2 ? 1 : 2;
    world.addComponent<DefensiveStanceComponent>(entityId, {
      type: 'defensiveStance',
      bonusPercent,
      extraReactions,
    });
    return true;
  }

  /**
   * Resolve aim command (accumulates aim bonus)
   */
  private static resolveAimCommand(
    world: WorldImpl,
    entityId: EntityId,
    command: { targetId: EntityId; aimBonus: number; apCost: number }
  ): boolean {
    // Deduct AP
    this.deductAP(world, entityId, command.apCost);
    // Aim bonus would be applied to next attack on target
    // For now, this is a placeholder
    return true;
  }

  /**
   * Resolve reload command
   */
  private static resolveReloadCommand(
    world: WorldImpl,
    _eventBus: EventBusImpl,
    entityId: EntityId,
    command: { slotIndex: number; apCost: number },
    _turn: number
  ): boolean {
    const ammo = world.getComponent<AmmoComponent>(entityId, 'ammo');
    if (!ammo) return false;

    // Switch to the specified slot
    if (command.slotIndex >= 0 && command.slotIndex < ammo.slots.length) {
      AmmoSystem.switchAmmoSlot(world, entityId, command.slotIndex);
    }

    // Deduct AP
    this.deductAP(world, entityId, command.apCost);

    return true;
  }

  /**
   * Resolve rally command
   */
  private static resolveRallyCommand(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    entityId: EntityId,
    turn: number
  ): boolean {
    const modifiers: Modifier[] = [];

    // Leadership bonus from nearby allies
    const leadershipBonus = MoraleSystem.checkLeadershipBonus(world, entityId, 6);
    if (leadershipBonus > 0) {
      modifiers.push({ source: 'leadership', value: leadershipBonus });
    }

    return MoraleSystem.attemptRally(world, eventBus, entityId, modifiers, roller, turn);
  }

  /**
   * Resolve wait command
   */
  private static resolveWaitCommand(
    world: WorldImpl,
    entityId: EntityId,
    command: { apCost: number }
  ): boolean {
    // Deduct AP (usually 0)
    this.deductAP(world, entityId, command.apCost);
    return true;
  }

  /**
   * Resolve overwatch command - sets up overwatch stance for reactive attacks
   */
  private static resolveOverwatchCommand(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    command: OverwatchCommand,
    turn: number
  ): boolean {
    // Deduct AP
    this.deductAP(world, entityId, command.apCost);

    // Set overwatch component
    world.addComponent<OverwatchComponent>(entityId, {
      type: 'overwatch',
      attackType: command.attackType,
      watchDirection: command.watchDirection,
      watchArc: command.watchArc,
      triggered: false,
    });

    // Emit overwatch event
    eventBus.emit({
      type: 'OverwatchSet',
      turn,
      timestamp: Date.now(),
      entityId,
      data: { attackType: command.attackType },
    });

    return true;
  }

  /**
   * Check and trigger overwatch attacks when an enemy moves into range
   */
  static checkOverwatchTriggers(
    world: WorldImpl,
    eventBus: EventBusImpl,
    roller: DiceRoller,
    movingEntityId: EntityId,
    oldX: number,
    oldY: number,
    newX: number,
    newY: number,
    turn: number,
    reactionsUsed: Map<EntityId, number>
  ): void {
    const movingFaction = world.getComponent<FactionComponent>(movingEntityId, 'faction');
    if (!movingFaction) return;

    // Find all entities with active overwatch
    const overwatchEntities = world.query('overwatch', 'position', 'faction', 'weapon');

    for (const watcherId of overwatchEntities) {
      const overwatch = world.getComponent<OverwatchComponent>(watcherId, 'overwatch');
      const watcherFaction = world.getComponent<FactionComponent>(watcherId, 'faction');
      const watcherPos = world.getComponent<PositionComponent>(watcherId, 'position');
      const watcherWeapon = world.getComponent<WeaponComponent>(watcherId, 'weapon');
      const watcherHealth = world.getComponent<HealthComponent>(watcherId, 'health');

      if (!overwatch || !watcherFaction || !watcherPos || !watcherWeapon) continue;
      if (overwatch.triggered) continue; // Already triggered this turn
      if (watcherFaction.faction === movingFaction.faction) continue; // Same faction
      if (watcherHealth && watcherHealth.woundState === 'down') continue; // Down

      // Check if target was outside range and is now inside range
      // Use weapon's actual range for both melee and ranged overwatch
      const effectiveRange = watcherWeapon.range;

      const oldDist = MovementSystem.calculateDistance(watcherPos.x, watcherPos.y, oldX, oldY);
      const newDist = MovementSystem.calculateDistance(watcherPos.x, watcherPos.y, newX, newY);

      // Trigger if enemy moved INTO range (was out, now in)
      if (oldDist > effectiveRange && newDist <= effectiveRange) {
        // Check watch direction/arc if specified
        if (overwatch.watchDirection !== undefined && overwatch.watchArc !== undefined) {
          const angleToTarget = Math.atan2(newY - watcherPos.y, newX - watcherPos.x);
          const angleDiff = Math.abs(this.normalizeAngle(angleToTarget - overwatch.watchDirection));
          if (angleDiff > overwatch.watchArc / 2) continue; // Target not in watched arc
        }

        // Mark overwatch as triggered
        world.addComponent<OverwatchComponent>(watcherId, {
          ...overwatch,
          triggered: true,
        });

        // Emit overwatch triggered event
        eventBus.emit({
          type: 'OverwatchTriggered',
          turn,
          timestamp: Date.now(),
          entityId: watcherId,
          targetId: movingEntityId,
          data: { attackType: overwatch.attackType },
        });

        // Execute the overwatch attack (free attack, no AP cost)
        this.resolveAttackCommand(
          world,
          eventBus,
          roller,
          watcherId,
          {
            targetId: movingEntityId,
            attackType: overwatch.attackType,
            apCost: 0, // Free attack
          },
          turn,
          reactionsUsed,
          true // isProvoke - gives +20% to attacker
        );
      }
    }
  }

  /**
   * Normalize angle to [-PI, PI]
   */
  private static normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * Process end of turn effects
   */
  private static processEndOfTurn(
    world: WorldImpl,
    eventBus: EventBusImpl,
    _roller: DiceRoller,
    turn: number,
    hitEntities: Set<EntityId> = new Set()
  ): void {
    const entities = world.query('health', 'faction');

    for (const entityId of entities) {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      if (health && health.woundState === 'down') continue;

      // Apply bleeding from wound effects
      WoundEffectsSystem.applyBleeding(world, eventBus, entityId, turn);

      // Clear defensive stance (turn-scoped)
      world.removeComponent(entityId, 'defensiveStance');

      // Clear overwatch stance (turn-scoped)
      world.removeComponent(entityId, 'overwatch');

      // Conditional stamina recovery: 3 if unhit, 1 if hit this turn
      StaminaSystem.recoverStamina(world, entityId, hitEntities.has(entityId));

      // Reset AP to max
      this.resetAP(world, entityId);
    }
  }

  /**
   * Deduct AP from an entity
   */
  private static deductAP(world: WorldImpl, entityId: EntityId, amount: number): void {
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    if (!ap) return;

    world.addComponent<ActionPointsComponent>(entityId, {
      ...ap,
      current: Math.max(0, ap.current - amount),
    });
  }

  /**
   * Reset AP to max for an entity
   */
  private static resetAP(world: WorldImpl, entityId: EntityId): void {
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    if (!ap) return;

    world.addComponent<ActionPointsComponent>(entityId, {
      ...ap,
      current: ap.max,
    });
  }

  /**
   * AI/heuristic: choose defense type with armor class restrictions.
   * Heavy armor cannot dodge. Medium/light armor dodge at penalty.
   */
  private static chooseDefenseType(
    world: WorldImpl,
    defenderId: EntityId,
    attackType: 'melee' | 'ranged'
  ): DefenseType {
    const offHand = world.getComponent<OffHandComponent>(defenderId, 'offHand');
    const skills = world.getComponent<SkillsComponent>(defenderId, 'skills');
    const armor = world.getComponent<ArmorComponent>(defenderId, 'armor');
    if (!skills) return 'dodge';

    // Determine armor class and whether dodge is available
    const armorClass = armor
      ? CombatResolver.getArmorClass(armor)
      : 'unarmored';
    const dodgePenalty = CombatResolver.getDodgePenalty(armorClass);
    const canDodge = dodgePenalty !== null;
    const effectiveDodge = canDodge ? skills.dodge + dodgePenalty : -Infinity;

    if (attackType === 'ranged') {
      if (offHand?.itemType === 'shield' && skills.block >= effectiveDodge) return 'block';
      if (canDodge) return 'dodge';
      return 'block';
    }

    // Melee: block (shield) > parry > dodge, weighted by effective skill
    if (offHand?.itemType === 'shield' && skills.block >= Math.max(skills.melee, effectiveDodge)) return 'block';
    if (skills.melee >= effectiveDodge) return 'parry';
    if (canDodge) return 'dodge';
    return offHand?.itemType === 'shield' ? 'block' : 'parry';
  }

  /**
   * Shield wall: +10% block when defender has shield and is adjacent to an ally with shield
   */
  private static getShieldWallBonus(world: WorldImpl, defenderId: EntityId): number {
    const offHand = world.getComponent<OffHandComponent>(defenderId, 'offHand');
    if (!offHand || offHand.itemType !== 'shield') return 0;

    const defenderPos = world.getComponent<PositionComponent>(defenderId, 'position');
    const defenderFaction = world.getComponent<FactionComponent>(defenderId, 'faction');
    if (!defenderPos || !defenderFaction) return 0;

    const SHIELD_WALL_RANGE = 2.5; // meters - adjacent for formation
    const entities = world.query('position', 'faction');
    for (const eid of entities) {
      if (eid === defenderId) continue;
      const fac = world.getComponent<FactionComponent>(eid, 'faction');
      if (!fac || fac.faction !== defenderFaction.faction) continue;
      const oh = world.getComponent<OffHandComponent>(eid, 'offHand');
      if (!oh || oh.itemType !== 'shield') continue;
      const pos = world.getComponent<PositionComponent>(eid, 'position');
      if (!pos) continue;
      const dist = MovementSystem.calculateDistance(defenderPos.x, defenderPos.y, pos.x, pos.y);
      if (dist <= SHIELD_WALL_RANGE) return 10;
    }
    return 0;
  }

  /**
   * Calculate flanking bonus based on number of allies engaged with target
   */
  private static calculateFlankingBonus(
    world: WorldImpl,
    attackerId: EntityId,
    targetId: EntityId
  ): number {
    const attackerFaction = world.getComponent<FactionComponent>(attackerId, 'faction');
    const targetEngagement = world.getComponent<EngagementComponent>(targetId, 'engagement');

    if (!attackerFaction || !targetEngagement) return 0;

    // Count allies engaged with target
    let alliesEngaged = 0;
    for (const engagedId of targetEngagement.engagedWith) {
      if (engagedId === attackerId) continue;
      const engagedFaction = world.getComponent<FactionComponent>(engagedId, 'faction');
      if (engagedFaction && engagedFaction.faction === attackerFaction.faction) {
        alliesEngaged++;
      }
    }

    // +10% per additional ally (up to +30%)
    return Math.min(alliesEngaged * 10, 30);
  }
}
