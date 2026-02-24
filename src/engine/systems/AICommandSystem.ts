import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { EntityId } from '../types';
import {
  PositionComponent,
  HealthComponent,
  SkillsComponent,
  ActionPointsComponent,
  WeaponComponent,
  MoraleStateComponent,
  EngagementComponent,
  IdentityComponent,
  MoveCommand,
  AttackCommand,
  RallyCommand,
  WaitCommand,
  UnitCommand,
  getAttackType,
} from '../components';
import { TurnResolutionSystem } from './TurnResolutionSystem';
import { MovementSystem } from './MovementSystem';
import { VictorySystem } from './VictorySystem';
import { UnitFactory } from '../data/UnitFactory';
import { isRangedWeapon } from '../components';

export type AIPersonality = 'aggressive' | 'cunning' | 'cautious' | 'brutal' | 'honorable';

export interface AIControllerComponent {
  type: 'aiController';
  personality: AIPersonality;
  currentGoal: string;
  targetId?: EntityId;
  fearTarget?: EntityId; // For cautious AI - unit to avoid
}

export interface ThreatAssessment {
  entityId: EntityId;
  threatLevel: number;
  distance: number;
  isWounded: boolean;
  isEngaged: boolean;
  canReach: boolean;
}

export interface BattlefieldAnalysis {
  ownUnits: EntityId[];
  enemyUnits: EntityId[];
  ownStrength: number;
  enemyStrength: number;
  ownCasualties: number;
  enemyCasualties: number;
  isWinning: boolean;
  isLosing: boolean;
  threats: ThreatAssessment[];
  mapSize?: { width: number; height: number };
}

export class AICommandSystem {
  /** Returns the weapon's effective attack range.
   *  For melee weapons, uses at least MELEE_ATTACK_RANGE so the AI queues attacks
   *  when within touching distance. TurnResolution's auto-close handles the gap. */
  private static getEffectiveAttackRange(weapon: WeaponComponent): number {
    if (!isRangedWeapon(weapon)) {
      return Math.max(weapon.range, MovementSystem.MELEE_ATTACK_RANGE);
    }
    return weapon.range;
  }
  /**
   * Generate commands for all AI-controlled units
   */
  static generateCommands(
    world: WorldImpl,
    _eventBus: EventBusImpl,
    aiFaction: 'player' | 'enemy' = 'enemy',
    mapSize?: { width: number; height: number }
  ): void {
    const aiUnits = this.getAIUnits(world, aiFaction);
    const analysis = this.analyzeBattlefield(world, aiFaction);
    analysis.mapSize = mapSize;

    for (const entityId of aiUnits) {
      const controller = world.getComponent<AIControllerComponent>(entityId, 'aiController');
      const personality = controller?.personality || 'aggressive';

      const commands = this.decideCommands(world, entityId, personality, analysis);

      for (const command of commands) {
        TurnResolutionSystem.queueCommand(world, entityId, command);
      }
    }
  }

  /**
   * Get all AI-controlled units for a faction
   */
  private static getAIUnits(world: WorldImpl, faction: 'player' | 'enemy'): EntityId[] {
    const units = VictorySystem.getUnitsForFaction(world, faction);

    return units.filter((entityId) => {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

      // Skip downed or routed units
      if (health && health.woundState === 'down') return false;
      if (morale && morale.status === 'routed') return false;

      return true;
    });
  }

  /**
   * Analyze the current battlefield state
   */
  static analyzeBattlefield(world: WorldImpl, aiFaction: 'player' | 'enemy'): BattlefieldAnalysis {
    const enemyFaction = aiFaction === 'player' ? 'enemy' : 'player';

    const ownUnits = this.getAIUnits(world, aiFaction);
    const enemyUnits = VictorySystem.getUnitsForFaction(world, enemyFaction).filter((id) => {
      const health = world.getComponent<HealthComponent>(id, 'health');
      const morale = world.getComponent<MoraleStateComponent>(id, 'moraleState');
      if (health && health.woundState === 'down') return false;
      if (morale && morale.status === 'routed') return false;
      return true;
    });

    const ownStrength = VictorySystem.calculateFactionPoints(world, aiFaction);
    const enemyStrength = VictorySystem.calculateFactionPoints(world, enemyFaction);
    const ownCasualties = VictorySystem.getCasualtyRate(world, aiFaction);
    const enemyCasualties = VictorySystem.getCasualtyRate(world, enemyFaction);

    // Assess threats from each enemy unit
    const threats: ThreatAssessment[] = enemyUnits.map((enemyId) => {
      return this.assessThreat(world, ownUnits, enemyId);
    });

    // Sort threats by threat level (highest first)
    threats.sort((a, b) => b.threatLevel - a.threatLevel);

    return {
      ownUnits,
      enemyUnits,
      ownStrength,
      enemyStrength,
      ownCasualties,
      enemyCasualties,
      isWinning: ownStrength > enemyStrength * 1.2 && ownCasualties < enemyCasualties,
      isLosing: enemyStrength > ownStrength * 1.2 || ownCasualties > 50,
      threats,
    };
  }

  /**
   * Assess threat level of an enemy unit
   */
  private static assessThreat(
    world: WorldImpl,
    ownUnits: EntityId[],
    enemyId: EntityId
  ): ThreatAssessment {
    const enemyHealth = world.getComponent<HealthComponent>(enemyId, 'health');
    const enemyPos = world.getComponent<PositionComponent>(enemyId, 'position');
    const enemyWeapon = world.getComponent<WeaponComponent>(enemyId, 'weapon');
    const enemySkills = world.getComponent<SkillsComponent>(enemyId, 'skills');
    const enemyIdentity = world.getComponent<IdentityComponent>(enemyId, 'identity');
    const enemyEngagement = world.getComponent<EngagementComponent>(enemyId, 'engagement');

    let threatLevel = 50; // Base threat

    // Adjust based on health
    const isWounded =
      enemyHealth !== undefined &&
      (enemyHealth.woundState === 'wounded' || enemyHealth.woundState === 'critical');
    if (isWounded) {
      threatLevel -= 20; // Wounded enemies are less threatening
    }

    // Adjust based on weapon damage potential
    if (enemyWeapon) {
      const avgDamage =
        (enemyWeapon.damage.dice * (enemyWeapon.damage.sides + 1)) / 2 + enemyWeapon.damage.bonus;
      threatLevel += avgDamage * 2;
    }

    // Adjust based on skill
    if (enemySkills) {
      threatLevel += (enemySkills.melee - 50) / 2;
    }

    // High-value targets are more threatening
    if (enemyIdentity) {
      if (enemyIdentity.unitType === 'knight') threatLevel += 30;
      if (enemyIdentity.unitType === 'archer') threatLevel += 15;
      if (enemyIdentity.unitType === 'healer') threatLevel += 25; // Priority target
    }

    // Calculate average distance to own units
    let totalDistance = 0;
    let closestDistance = Infinity;
    for (const ownId of ownUnits) {
      const ownPos = world.getComponent<PositionComponent>(ownId, 'position');
      if (ownPos && enemyPos) {
        const dist = MovementSystem.calculateDistance(ownPos.x, ownPos.y, enemyPos.x, enemyPos.y);
        totalDistance += dist;
        if (dist < closestDistance) {
          closestDistance = dist;
        }
      }
    }
    const avgDistance = ownUnits.length > 0 ? totalDistance / ownUnits.length : 100;

    // Closer enemies are more threatening
    if (closestDistance < 3) {
      threatLevel += 20;
    }

    const isEngaged = enemyEngagement !== undefined && enemyEngagement.engagedWith.length > 0;

    return {
      entityId: enemyId,
      threatLevel,
      distance: avgDistance,
      isWounded,
      isEngaged,
      canReach: closestDistance < 10,
    };
  }

  /**
   * Decide commands for a unit based on personality
   */
  static decideCommands(
    world: WorldImpl,
    entityId: EntityId,
    personality: AIPersonality,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    switch (personality) {
      case 'aggressive':
        return this.aggressiveBehavior(world, entityId, analysis);
      case 'cunning':
        return this.cunningBehavior(world, entityId, analysis);
      case 'cautious':
        return this.cautiousBehavior(world, entityId, analysis);
      case 'brutal':
        return this.brutalBehavior(world, entityId, analysis);
      case 'honorable':
        return this.honorableBehavior(world, entityId, analysis);
      default:
        return this.aggressiveBehavior(world, entityId, analysis);
    }
  }

  /**
   * Aggressive: Charges early, focuses damage, fights to the last
   */
  private static aggressiveBehavior(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    const commands: UnitCommand[] = [];
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

    if (!pos || !weapon || !ap) return commands;

    // If shaken, try to rally first
    if (morale && morale.status === 'shaken') {
      commands.push({
        type: 'rally',
        apCost: 1,
        priority: 2,
      } as RallyCommand);
    }

    // Find nearest enemy
    const target = this.findNearestEnemy(world, entityId, analysis.enemyUnits);
    if (!target) return commands;

    const targetPos = world.getComponent<PositionComponent>(target, 'position');
    if (!targetPos) return commands;

    const distance = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);

    // If in range, attack
    if (distance <= this.getEffectiveAttackRange(weapon)) {
      commands.push({
        type: 'attack',
        targetId: target,
        attackType: getAttackType(weapon),
        apCost: weapon.apCost,
        priority: weapon.speed,
      } as AttackCommand);

      // Attack again if we have AP
      if (ap.current >= weapon.apCost * 2) {
        commands.push({
          type: 'attack',
          targetId: target,
          attackType: getAttackType(weapon),
          apCost: weapon.apCost,
          priority: weapon.speed,
        } as AttackCommand);
      }
    } else {
      // Charge towards enemy (run mode for aggression)
      commands.push(
        this.createMoveCommand(world, entityId, pos.x, pos.y, targetPos.x, targetPos.y, 'run', analysis.mapSize, target)
      );
    }

    return commands;
  }

  /**
   * Cunning: Flanks constantly, targets wounded, sets ambushes
   */
  private static cunningBehavior(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    const commands: UnitCommand[] = [];
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');

    if (!pos || !weapon || !ap) return commands;

    // Prioritize wounded targets
    const woundedTarget = analysis.threats.find((t) => t.isWounded && t.canReach);
    const target = woundedTarget?.entityId || this.findNearestEnemy(world, entityId, analysis.enemyUnits);

    if (!target) return commands;

    const targetPos = world.getComponent<PositionComponent>(target, 'position');
    if (!targetPos) return commands;

    const distance = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);

    // If in range, attack
    if (distance <= this.getEffectiveAttackRange(weapon)) {
      commands.push({
        type: 'attack',
        targetId: target,
        attackType: getAttackType(weapon),
        apCost: weapon.apCost,
        priority: weapon.speed,
      } as AttackCommand);
    } else {
      // Try to flank - move to side of target
      const flankPos = this.calculateFlankingPosition(world, entityId, target, analysis);
      commands.push(
        this.createMoveCommand(world, entityId, pos.x, pos.y, flankPos.x, flankPos.y, 'advance', analysis.mapSize)
      );
    }

    return commands;
  }

  /**
   * Cautious: Holds position, waits for player, retreats early
   */
  private static cautiousBehavior(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    const commands: UnitCommand[] = [];
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

    if (!pos || !weapon || !ap) return commands;

    // Retreat if losing
    if (analysis.isLosing || (morale && morale.status === 'shaken')) {
      const retreatPos = this.calculateRetreatPosition(world, entityId, analysis);
      commands.push(
        this.createMoveCommand(world, entityId, pos.x, pos.y, retreatPos.x, retreatPos.y, 'walk', analysis.mapSize)
      );

      if (morale && morale.status === 'shaken') {
        commands.push({
          type: 'rally',
          apCost: 1,
          priority: 2,
        } as RallyCommand);
      }
      return commands;
    }

    // Hold position and attack only if enemy approaches
    const nearbyEnemy = this.findNearestEnemy(world, entityId, analysis.enemyUnits);
    if (nearbyEnemy) {
      const targetPos = world.getComponent<PositionComponent>(nearbyEnemy, 'position');
      if (targetPos) {
        const distance = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);

        if (distance <= this.getEffectiveAttackRange(weapon)) {
          commands.push({
            type: 'attack',
            targetId: nearbyEnemy,
            attackType: getAttackType(weapon),
            apCost: weapon.apCost,
            priority: weapon.speed,
          } as AttackCommand);
        } else {
          // Wait in position
          commands.push({
            type: 'wait',
            apCost: 0,
            priority: 10,
          } as WaitCommand);
        }
      }
    }

    return commands;
  }

  /**
   * Brutal: Targets weakest, intimidates, no mercy
   */
  private static brutalBehavior(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    const commands: UnitCommand[] = [];
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');

    if (!pos || !weapon || !ap) return commands;

    // Target the weakest enemy (lowest HP %)
    let weakestTarget: EntityId | null = null;
    let lowestHpPercent = 100;

    for (const enemyId of analysis.enemyUnits) {
      const health = world.getComponent<HealthComponent>(enemyId, 'health');
      if (health) {
        const hpPercent = (health.current / health.max) * 100;
        if (hpPercent < lowestHpPercent) {
          lowestHpPercent = hpPercent;
          weakestTarget = enemyId;
        }
      }
    }

    if (!weakestTarget) {
      weakestTarget = this.findNearestEnemy(world, entityId, analysis.enemyUnits);
    }

    if (!weakestTarget) return commands;

    const targetPos = world.getComponent<PositionComponent>(weakestTarget, 'position');
    if (!targetPos) return commands;

    const distance = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);

    if (distance <= this.getEffectiveAttackRange(weapon)) {
      // Attack twice if possible (brutal assault)
      commands.push({
        type: 'attack',
        targetId: weakestTarget,
        attackType: getAttackType(weapon),
        apCost: weapon.apCost,
        priority: weapon.speed,
      } as AttackCommand);

      if (ap.current >= weapon.apCost * 2) {
        commands.push({
          type: 'attack',
          targetId: weakestTarget,
          attackType: getAttackType(weapon),
          apCost: weapon.apCost,
          priority: weapon.speed,
        } as AttackCommand);
      }
    } else {
      // Sprint to target (brutal charge)
      commands.push(
        this.createMoveCommand(world, entityId, pos.x, pos.y, targetPos.x, targetPos.y, 'sprint', analysis.mapSize, weakestTarget)
      );
    }

    return commands;
  }

  /**
   * Honorable: Challenges strong enemies, doesn't flank, fair fight
   */
  private static honorableBehavior(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): UnitCommand[] {
    const commands: UnitCommand[] = [];
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');

    if (!pos || !weapon || !ap) return commands;

    // Target the strongest enemy (highest threat that isn't already engaged)
    let strongestTarget: EntityId | null = null;
    for (const threat of analysis.threats) {
      if (!threat.isEngaged && threat.canReach) {
        strongestTarget = threat.entityId;
        break;
      }
    }

    if (!strongestTarget) {
      strongestTarget = this.findNearestEnemy(world, entityId, analysis.enemyUnits);
    }

    if (!strongestTarget) return commands;

    const targetPos = world.getComponent<PositionComponent>(strongestTarget, 'position');
    if (!targetPos) return commands;

    const distance = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);

    if (distance <= this.getEffectiveAttackRange(weapon)) {
      // Single attack (honorable combat)
      commands.push({
        type: 'attack',
        targetId: strongestTarget,
        attackType: getAttackType(weapon),
        apCost: weapon.apCost,
        priority: weapon.speed,
      } as AttackCommand);
    } else {
      // Advance with dignity
      commands.push(
        this.createMoveCommand(world, entityId, pos.x, pos.y, targetPos.x, targetPos.y, 'advance', analysis.mapSize, strongestTarget)
      );
    }

    return commands;
  }

  /**
   * Create a move command with distance-based AP cost.
   * When the target is closer than one full move, extends the target along the same
   * direction so the unit always uses its full movement (avoids stalling just outside attack range).
   */
  private static createMoveCommand(
    world: WorldImpl,
    entityId: EntityId,
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
    mode: 'walk' | 'advance' | 'run' | 'sprint',
    mapSize?: { width: number; height: number },
    approachTargetId?: EntityId
  ): MoveCommand {
    const baseSpeed = UnitFactory.getBaseSpeed(world, entityId);
    const ap = world.getComponent<ActionPointsComponent>(entityId, 'actionPoints');
    const modeCost = MovementSystem.getMovementModeCost(mode);
    const maxDistance = baseSpeed * modeCost.speedMultiplier;

    // Try pathfinding first
    const dest = MovementSystem.getClampedDestination(
      world,
      entityId,
      fromX,
      fromY,
      targetX,
      targetY,
      mapSize,
      maxDistance,
      approachTargetId
    );
    const apCost =
      mode === 'sprint' && ap
        ? ap.current
        : MovementSystem.getMovementApCost(fromX, fromY, dest.x, dest.y, mode, baseSpeed, ap?.current);
    return {
      type: 'move',
      targetX: dest.x,
      targetY: dest.y,
      mode,
      apCost,
      priority: 5,
    };
  }

  /**
   * Find the nearest enemy unit
   */
  private static findNearestEnemy(
    world: WorldImpl,
    entityId: EntityId,
    enemies: EntityId[]
  ): EntityId | null {
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    if (!pos) return null;

    let nearestEnemy: EntityId | null = null;
    let nearestDistance = Infinity;

    for (const enemyId of enemies) {
      const enemyPos = world.getComponent<PositionComponent>(enemyId, 'position');
      if (!enemyPos) continue;

      const distance = MovementSystem.calculateDistance(pos.x, pos.y, enemyPos.x, enemyPos.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = enemyId;
      }
    }

    return nearestEnemy;
  }

  /**
   * Calculate a flanking position (to the side of target)
   */
  private static calculateFlankingPosition(
    world: WorldImpl,
    entityId: EntityId,
    targetId: EntityId,
    _analysis: BattlefieldAnalysis
  ): { x: number; y: number } {
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    const targetPos = world.getComponent<PositionComponent>(targetId, 'position');

    if (!pos || !targetPos) {
      return { x: pos?.x || 0, y: pos?.y || 0 };
    }

    // Calculate perpendicular offset for flanking
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      return { x: targetPos.x + 1, y: targetPos.y };
    }

    // Normalize and rotate 90 degrees
    const perpX = -dy / dist;
    const perpY = dx / dist;

    // Move to side of target
    return {
      x: targetPos.x + perpX * 2,
      y: targetPos.y + perpY * 2,
    };
  }

  /**
   * Calculate a retreat position (away from enemies)
   */
  private static calculateRetreatPosition(
    world: WorldImpl,
    entityId: EntityId,
    analysis: BattlefieldAnalysis
  ): { x: number; y: number } {
    const pos = world.getComponent<PositionComponent>(entityId, 'position');
    if (!pos) return { x: 0, y: 0 };

    // Calculate average enemy position
    let avgEnemyX = 0;
    let avgEnemyY = 0;
    let count = 0;

    for (const enemyId of analysis.enemyUnits) {
      const enemyPos = world.getComponent<PositionComponent>(enemyId, 'position');
      if (enemyPos) {
        avgEnemyX += enemyPos.x;
        avgEnemyY += enemyPos.y;
        count++;
      }
    }

    if (count === 0) return { x: pos.x, y: pos.y };

    avgEnemyX /= count;
    avgEnemyY /= count;

    // Move away from average enemy position
    const dx = pos.x - avgEnemyX;
    const dy = pos.y - avgEnemyY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.01) {
      return { x: pos.x + 3, y: pos.y };
    }

    return {
      x: pos.x + (dx / dist) * 3,
      y: pos.y + (dy / dist) * 3,
    };
  }

  /**
   * Assign default AI controllers to units without one
   */
  static assignDefaultControllers(
    world: WorldImpl,
    faction: 'player' | 'enemy',
    defaultPersonality: AIPersonality = 'aggressive'
  ): void {
    const units = VictorySystem.getUnitsForFaction(world, faction);

    for (const entityId of units) {
      if (!world.hasComponent(entityId, 'aiController')) {
        world.addComponent<AIControllerComponent>(entityId, {
          type: 'aiController',
          personality: defaultPersonality,
          currentGoal: 'engage',
        });
      }
    }
  }

  /**
   * Set personality for a specific unit
   */
  static setPersonality(world: WorldImpl, entityId: EntityId, personality: AIPersonality): void {
    const existing = world.getComponent<AIControllerComponent>(entityId, 'aiController');
    world.addComponent<AIControllerComponent>(entityId, {
      type: 'aiController',
      personality,
      currentGoal: existing?.currentGoal || 'engage',
      targetId: existing?.targetId,
    });
  }
}
