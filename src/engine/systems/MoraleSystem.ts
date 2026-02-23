import { WorldImpl } from '../ecs/World';
import { EventBusImpl } from '../core/EventBus';
import { DiceRoller } from '../core/DiceRoller';
import { EntityId } from '../types';
import {
  MoraleStateComponent,
  MoraleStatus,
  SkillsComponent,
  PositionComponent,
  FactionComponent,
} from '../components';
import { Modifier } from './CombatResolver';

export interface MoraleCheckResult {
  roll: number;
  baseMorale: number;
  modifiers: Modifier[];
  effectiveMorale: number;
  passed: boolean;
  failureMargin: number;
}

export class MoraleSystem {
  static testMorale(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    modifiers: Modifier[],
    roller: DiceRoller,
    turn: number
  ): MoraleCheckResult {
    const skills = world.getComponent<SkillsComponent>(entityId, 'skills');
    if (!skills) {
      return {
        roll: 100,
        baseMorale: 0,
        modifiers: [],
        effectiveMorale: 0,
        passed: false,
        failureMargin: 100,
      };
    }

    const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
    const effectiveMorale = Math.min(95, Math.max(5, skills.morale + totalModifier));
    const roll = roller.rollD100();
    const passed = roll <= effectiveMorale;
    const failureMargin = passed ? 0 : roll - effectiveMorale;

    eventBus.emit({
      type: 'MoraleChecked',
      turn,
      timestamp: Date.now(),
      entityId,
      data: {
        roll,
        effectiveMorale,
        passed,
        failureMargin,
      },
    });

    return {
      roll,
      baseMorale: skills.morale,
      modifiers,
      effectiveMorale,
      passed,
      failureMargin,
    };
  }

  static applyMoraleFailure(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    failureMargin: number,
    turn: number
  ): void {
    const moraleState = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');
    if (!moraleState) return;

    let newStatus: MoraleStatus;
    let eventType: 'UnitShaken' | 'UnitBroken' | 'UnitRouted';

    if (failureMargin <= 20) {
      newStatus = 'shaken';
      eventType = 'UnitShaken';
    } else if (failureMargin <= 40) {
      newStatus = 'broken';
      eventType = 'UnitBroken';
    } else {
      newStatus = 'routed';
      eventType = 'UnitRouted';
    }

    // Only worsen status, never improve
    const statusSeverity = { steady: 0, shaken: 1, broken: 2, routed: 3 };
    if (statusSeverity[newStatus] > statusSeverity[moraleState.status]) {
      world.addComponent<MoraleStateComponent>(entityId, {
        ...moraleState,
        status: newStatus,
      });

      eventBus.emit({
        type: eventType,
        turn,
        timestamp: Date.now(),
        entityId,
        data: {
          previousStatus: moraleState.status,
          newStatus,
          failureMargin,
        },
      });
    }
  }

  static attemptRally(
    world: WorldImpl,
    eventBus: EventBusImpl,
    entityId: EntityId,
    modifiers: Modifier[],
    roller: DiceRoller,
    turn: number
  ): boolean {
    const moraleState = world.getComponent<MoraleStateComponent>(entityId, 'moraleState');
    if (!moraleState) return false;

    // Cannot rally routed units
    if (moraleState.status === 'routed') return false;

    // Steady units don't need rallying
    if (moraleState.status === 'steady') return true;

    const result = this.testMorale(world, eventBus, entityId, modifiers, roller, turn);

    if (result.passed) {
      // Improve by one level
      let newStatus: MoraleStatus;
      if (moraleState.status === 'shaken') {
        newStatus = 'steady';
      } else if (moraleState.status === 'broken') {
        newStatus = 'shaken';
      } else {
        return false;
      }

      world.addComponent<MoraleStateComponent>(entityId, {
        ...moraleState,
        status: newStatus,
      });

      eventBus.emit({
        type: 'UnitRallied',
        turn,
        timestamp: Date.now(),
        entityId,
        data: {
          previousStatus: moraleState.status,
          newStatus,
        },
      });

      return true;
    }

    return false;
  }

  static getMoralePenalty(status: MoraleStatus): number {
    switch (status) {
      case 'steady':
        return 0;
      case 'shaken':
        return 10;
      case 'broken':
        return 20;
      case 'routed':
        return 100; // Cannot act
    }
  }

  static findNearbyAllies(world: WorldImpl, entityId: EntityId, range: number): EntityId[] {
    const position = world.getComponent<PositionComponent>(entityId, 'position');
    const faction = world.getComponent<FactionComponent>(entityId, 'faction');

    if (!position || !faction) return [];

    const allies: EntityId[] = [];
    const allUnits = world.query('position', 'faction');

    for (const otherId of allUnits) {
      if (otherId === entityId) continue;

      const otherPos = world.getComponent<PositionComponent>(otherId, 'position')!;
      const otherFaction = world.getComponent<FactionComponent>(otherId, 'faction')!;

      if (otherFaction.faction !== faction.faction) continue;

      const dx = otherPos.x - position.x;
      const dy = otherPos.y - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= range) {
        allies.push(otherId);
      }
    }

    return allies;
  }

  static checkLeadershipBonus(world: WorldImpl, entityId: EntityId, leaderRange: number): number {
    // Find nearby leaders and sum their leadership bonuses
    const allies = this.findNearbyAllies(world, entityId, leaderRange);
    let bonus = 0;

    for (const allyId of allies) {
      // Check if ally has leadership skill (for now, just check if they're steady)
      const moraleState = world.getComponent<MoraleStateComponent>(allyId, 'moraleState');
      if (moraleState && moraleState.status === 'steady') {
        // Simple leadership bonus - could be expanded later
        bonus += 5;
      }
    }

    return Math.min(bonus, 20); // Cap at +20
  }
}
