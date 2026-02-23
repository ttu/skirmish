import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { EntityId } from '../types';
import {
  HealthComponent,
  FactionComponent,
  MoraleStateComponent,
  PositionComponent,
  IdentityComponent,
} from '../components';

export type VictoryConditionType =
  | 'elimination'
  | 'morale_break'
  | 'objective_hold'
  | 'objective_reach'
  | 'objective_kill'
  | 'survival'
  | 'point_threshold';

export interface BaseVictoryCondition {
  type: VictoryConditionType;
  faction: 'player' | 'enemy';
  description: string;
}

export interface EliminationCondition extends BaseVictoryCondition {
  type: 'elimination';
}

export interface MoraleBreakCondition extends BaseVictoryCondition {
  type: 'morale_break';
  casualtyThreshold?: number; // Percentage (e.g., 50 for 50%)
  requireLeaderDead?: boolean;
}

export interface ObjectiveHoldCondition extends BaseVictoryCondition {
  type: 'objective_hold';
  position: { x: number; y: number };
  radius: number;
  turnsRequired: number;
  turnsHeld?: number;
}

export interface ObjectiveReachCondition extends BaseVictoryCondition {
  type: 'objective_reach';
  position: { x: number; y: number };
  radius: number;
  unitType?: string; // Specific unit must reach (e.g., 'healer')
}

export interface ObjectiveKillCondition extends BaseVictoryCondition {
  type: 'objective_kill';
  targetUnitType: string; // e.g., 'troll', 'orc_warlord'
}

export interface SurvivalCondition extends BaseVictoryCondition {
  type: 'survival';
  turnsRequired: number;
  turnsSurvived?: number;
}

export interface PointThresholdCondition extends BaseVictoryCondition {
  type: 'point_threshold';
  threshold: number;
}

export type VictoryCondition =
  | EliminationCondition
  | MoraleBreakCondition
  | ObjectiveHoldCondition
  | ObjectiveReachCondition
  | ObjectiveKillCondition
  | SurvivalCondition
  | PointThresholdCondition;

export interface VictoryCheckResult {
  gameOver: boolean;
  winner: 'player' | 'enemy' | 'draw' | null;
  conditionsMet: VictoryCondition[];
  reason: string;
}

// Point values for units (for point-based victories)
const UNIT_POINT_VALUES: Record<string, number> = {
  militia: 25,
  warrior: 50,
  veteran: 75,
  knight: 100,
  archer: 40,
  crossbowman: 50,
  healer: 30,
  scout: 45,
  goblin: 15,
  orc_warrior: 50,
  orc_archer: 35,
  orc_brute: 75,
  troll: 150,
};

export class VictorySystem {
  /**
   * Check all victory conditions for a scenario
   */
  static checkVictory(
    world: WorldImpl,
    eventBus: EventBusImpl,
    conditions: VictoryCondition[],
    turn: number
  ): VictoryCheckResult {
    const conditionsMet: VictoryCondition[] = [];
    let playerWins = false;
    let enemyWins = false;

    for (const condition of conditions) {
      const met = this.checkCondition(world, condition, turn);
      if (met) {
        conditionsMet.push(condition);
        if (condition.faction === 'player') {
          playerWins = true;
        } else {
          enemyWins = true;
        }
      }
    }

    // Determine winner
    let winner: 'player' | 'enemy' | 'draw' | null = null;
    let reason = '';

    if (playerWins && enemyWins) {
      winner = 'draw';
      reason = 'Both sides achieved victory conditions simultaneously';
    } else if (playerWins) {
      winner = 'player';
      reason = conditionsMet.find((c) => c.faction === 'player')?.description || 'Victory';
    } else if (enemyWins) {
      winner = 'enemy';
      reason = conditionsMet.find((c) => c.faction === 'enemy')?.description || 'Defeat';
    }

    const gameOver = winner !== null;

    if (gameOver) {
      eventBus.emit({
        type: winner === 'player' ? 'VictoryAchieved' : 'DefeatSuffered',
        turn,
        timestamp: Date.now(),
        data: {
          winner,
          reason,
          conditionsMet: conditionsMet.map((c) => c.type),
        },
      });
    }

    return {
      gameOver,
      winner,
      conditionsMet,
      reason,
    };
  }

  /**
   * Check a single victory condition
   */
  static checkCondition(world: WorldImpl, condition: VictoryCondition, turn: number): boolean {
    switch (condition.type) {
      case 'elimination':
        return this.checkElimination(world, condition);
      case 'morale_break':
        return this.checkMoraleBreak(world, condition);
      case 'objective_hold':
        return this.checkObjectiveHold(world, condition, turn);
      case 'objective_reach':
        return this.checkObjectiveReach(world, condition);
      case 'objective_kill':
        return this.checkObjectiveKill(world, condition);
      case 'survival':
        return this.checkSurvival(condition, turn);
      case 'point_threshold':
        return this.checkPointThreshold(world, condition);
      default:
        return false;
    }
  }

  /**
   * Check elimination condition - all enemy units down or routed
   */
  private static checkElimination(world: WorldImpl, condition: EliminationCondition): boolean {
    const targetFaction = condition.faction === 'player' ? 'enemy' : 'player';
    const units = this.getUnitsForFaction(world, targetFaction);

    for (const entityId of units) {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

      // Unit is still active if not down and not routed
      const isDown = health && health.woundState === 'down';
      const isRouted = morale && morale.status === 'routed';

      if (!isDown && !isRouted) {
        return false; // At least one unit is still fighting
      }
    }

    return units.length > 0; // All enemies eliminated (and there were enemies)
  }

  /**
   * Check morale break condition
   */
  private static checkMoraleBreak(world: WorldImpl, condition: MoraleBreakCondition): boolean {
    const targetFaction = condition.faction === 'player' ? 'enemy' : 'player';
    const units = this.getUnitsForFaction(world, targetFaction);

    if (units.length === 0) return false;

    // Check leader death if required
    if (condition.requireLeaderDead) {
      const leaderDead = this.isLeaderDead(world, targetFaction);
      if (!leaderDead) return false;
    }

    // Check casualty threshold
    if (condition.casualtyThreshold !== undefined) {
      const casualtyRate = this.getCasualtyRate(world, targetFaction);
      if (casualtyRate < condition.casualtyThreshold) return false;
    }

    // Check if majority are broken/routed
    let brokenCount = 0;
    for (const entityId of units) {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

      if (health && health.woundState === 'down') {
        brokenCount++;
      } else if (morale && (morale.status === 'broken' || morale.status === 'routed')) {
        brokenCount++;
      }
    }

    return brokenCount > units.length / 2;
  }

  /**
   * Check hold objective condition
   */
  private static checkObjectiveHold(
    world: WorldImpl,
    condition: ObjectiveHoldCondition,
    _turn: number
  ): boolean {
    const units = this.getUnitsForFaction(world, condition.faction);

    // Check if any friendly unit is in the objective area
    let unitInArea = false;
    for (const entityId of units) {
      const pos = world.getComponent<PositionComponent>(entityId, 'position');
      const health = world.getComponent<HealthComponent>(entityId, 'health');

      if (!pos || (health && health.woundState === 'down')) continue;

      const dx = pos.x - condition.position.x;
      const dy = pos.y - condition.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= condition.radius) {
        unitInArea = true;
        break;
      }
    }

    if (unitInArea) {
      condition.turnsHeld = (condition.turnsHeld || 0) + 1;
    } else {
      condition.turnsHeld = 0;
    }

    return condition.turnsHeld >= condition.turnsRequired;
  }

  /**
   * Check reach objective condition
   */
  private static checkObjectiveReach(world: WorldImpl, condition: ObjectiveReachCondition): boolean {
    const units = this.getUnitsForFaction(world, condition.faction);

    for (const entityId of units) {
      const pos = world.getComponent<PositionComponent>(entityId, 'position');
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      const identity = world.getComponent<IdentityComponent>(entityId, 'identity');

      if (!pos || (health && health.woundState === 'down')) continue;

      // Check unit type if specified
      if (condition.unitType && (!identity || identity.unitType !== condition.unitType)) {
        continue;
      }

      const dx = pos.x - condition.position.x;
      const dy = pos.y - condition.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= condition.radius) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check kill objective condition
   */
  private static checkObjectiveKill(world: WorldImpl, condition: ObjectiveKillCondition): boolean {
    const targetFaction = condition.faction === 'player' ? 'enemy' : 'player';
    const units = this.getUnitsForFaction(world, targetFaction);

    for (const entityId of units) {
      const identity = world.getComponent<IdentityComponent>(entityId, 'identity');
      const health = world.getComponent<HealthComponent>(entityId, 'health');

      if (identity && identity.unitType === condition.targetUnitType) {
        // Target found - check if down
        if (health && health.woundState === 'down') {
          return true;
        }
        return false; // Target exists and is alive
      }
    }

    // Target unit type not found (already dead or never existed)
    return true;
  }

  /**
   * Check survival condition
   */
  private static checkSurvival(condition: SurvivalCondition, turn: number): boolean {
    condition.turnsSurvived = turn;
    return turn >= condition.turnsRequired;
  }

  /**
   * Check point threshold condition
   */
  private static checkPointThreshold(world: WorldImpl, condition: PointThresholdCondition): boolean {
    const points = this.calculateFactionPoints(world, condition.faction);
    return points >= condition.threshold;
  }

  /**
   * Get all units for a faction
   */
  static getUnitsForFaction(world: WorldImpl, faction: 'player' | 'enemy'): EntityId[] {
    const units = world.query('faction', 'health');
    return units.filter((entityId) => {
      const factionComp = world.getComponent<FactionComponent>(entityId, 'faction');
      return factionComp && factionComp.faction === faction;
    });
  }

  /**
   * Check if the leader for a faction is dead
   */
  private static isLeaderDead(world: WorldImpl, faction: 'player' | 'enemy'): boolean {
    const units = this.getUnitsForFaction(world, faction);

    for (const entityId of units) {
      const identity = world.getComponent<IdentityComponent>(entityId, 'identity');
      const health = world.getComponent<HealthComponent>(entityId, 'health');

      // Knights are leaders
      if (identity && identity.unitType === 'knight') {
        return health !== undefined && health.woundState === 'down';
      }
    }

    return false; // No leader found
  }

  /**
   * Calculate casualty rate for a faction
   */
  static getCasualtyRate(world: WorldImpl, faction: 'player' | 'enemy'): number {
    const units = this.getUnitsForFaction(world, faction);
    if (units.length === 0) return 100;

    let casualties = 0;
    for (const entityId of units) {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      if (health && health.woundState === 'down') {
        casualties++;
      }
    }

    return (casualties / units.length) * 100;
  }

  /**
   * Calculate total point value for a faction's remaining units
   */
  static calculateFactionPoints(world: WorldImpl, faction: 'player' | 'enemy'): number {
    const units = this.getUnitsForFaction(world, faction);
    let total = 0;

    for (const entityId of units) {
      const identity = world.getComponent<IdentityComponent>(entityId, 'identity');
      const health = world.getComponent<HealthComponent>(entityId, 'health');

      // Only count units that are not down
      if (health && health.woundState === 'down') continue;

      if (identity) {
        total += UNIT_POINT_VALUES[identity.unitType] || 50;
      }
    }

    return total;
  }

  /**
   * Get remaining unit count for a faction
   */
  static getRemainingUnitCount(world: WorldImpl, faction: 'player' | 'enemy'): number {
    const units = this.getUnitsForFaction(world, faction);
    let count = 0;

    for (const entityId of units) {
      const health = world.getComponent<HealthComponent>(entityId, 'health');
      const morale = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');

      const isDown = health && health.woundState === 'down';
      const isRouted = morale && morale.status === 'routed';

      if (!isDown && !isRouted) {
        count++;
      }
    }

    return count;
  }

  /**
   * Create standard elimination victory conditions
   */
  static createEliminationConditions(): VictoryCondition[] {
    return [
      {
        type: 'elimination',
        faction: 'player',
        description: 'Eliminate all enemy forces',
      },
      {
        type: 'elimination',
        faction: 'enemy',
        description: 'All friendly forces eliminated',
      },
    ];
  }

  /**
   * Create survival scenario conditions
   */
  static createSurvivalConditions(turns: number): VictoryCondition[] {
    return [
      {
        type: 'survival',
        faction: 'player',
        turnsRequired: turns,
        description: `Survive for ${turns} turns`,
      },
      {
        type: 'elimination',
        faction: 'enemy',
        description: 'All friendly forces eliminated',
      },
    ];
  }

  /**
   * Create assassination scenario conditions
   */
  static createAssassinationConditions(targetType: string): VictoryCondition[] {
    return [
      {
        type: 'objective_kill',
        faction: 'player',
        targetUnitType: targetType,
        description: `Kill the ${targetType}`,
      },
      {
        type: 'elimination',
        faction: 'enemy',
        description: 'All friendly forces eliminated',
      },
    ];
  }
}
