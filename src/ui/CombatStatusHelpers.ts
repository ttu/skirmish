import { WorldImpl } from '../engine/ecs/World';
import { EntityId } from '../engine/types';
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  StaminaComponent,
  CommandQueueComponent,
  EngagementComponent,
  OverwatchComponent,
  MoveCommand,
  AttackCommand,
  WeaponComponent,
} from '../engine/components';
import { MovementSystem } from '../engine/systems/MovementSystem';

export interface CombatStatus {
  inMelee: boolean;
  willCharge: boolean;
  engaged: boolean;
  exhausted: boolean;
  onOverwatch: boolean;
  overwatchType?: 'melee' | 'ranged';
  engagedEnemyIds: EntityId[];
}

export function getCombatStatus(world: WorldImpl, entityId: EntityId): CombatStatus {
  const status: CombatStatus = {
    inMelee: false,
    willCharge: false,
    engaged: false,
    exhausted: false,
    onOverwatch: false,
    engagedEnemyIds: [],
  };

  const pos = world.getComponent<PositionComponent>(entityId, 'position');
  const faction = world.getComponent<FactionComponent>(entityId, 'faction');
  const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
  const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
  const engagement = world.getComponent<EngagementComponent>(entityId, 'engagement');
  const overwatch = world.getComponent<OverwatchComponent>(entityId, 'overwatch');

  if (!pos || !faction) return status;

  // Check exhausted
  if (stamina?.exhausted) {
    status.exhausted = true;
  }

  // Check overwatch (active overwatch stance or queued overwatch command)
  if (overwatch && !overwatch.triggered) {
    status.onOverwatch = true;
    status.overwatchType = overwatch.attackType;
  } else if (queue?.commands.some(c => c.type === 'overwatch')) {
    status.onOverwatch = true;
    const owCmd = queue.commands.find(c => c.type === 'overwatch');
    if (owCmd && owCmd.type === 'overwatch') {
      status.overwatchType = owCmd.attackType;
    }
  }

  // Use engine's engagement state instead of recalculating
  const weapon = world.getComponent<WeaponComponent>(entityId, 'weapon');
  const weaponRange = weapon?.range ?? 1.2;

  if (engagement?.engagedWith.length) {
    // Filter out dead units from engaged list
    status.engagedEnemyIds = engagement.engagedWith.filter((eid) => {
      const h = world.getComponent<HealthComponent>(eid, 'health');
      return !h || h.woundState !== 'down';
    });

    // Check if any engaged enemy is in weapon range
    for (const enemyId of status.engagedEnemyIds) {

      const enemyPos = world.getComponent<PositionComponent>(enemyId, 'position');
      if (enemyPos) {
        const dist = MovementSystem.calculateDistance(pos.x, pos.y, enemyPos.x, enemyPos.y);
        if (dist <= weaponRange) {
          status.inMelee = true;
        } else if (dist <= MovementSystem.ENGAGEMENT_RANGE) {
          status.engaged = true;
        }
      }
    }
  }

  // Check if will charge (has move TOWARD attack target, ending in range)
  if (queue?.commands.length) {
    const attackCmd = queue.commands.find(c => c.type === 'attack') as AttackCommand | undefined;

    if (attackCmd) {
      const targetPos = world.getComponent<PositionComponent>(attackCmd.targetId, 'position');
      if (targetPos) {
        // Calculate position after all moves
        let finalX = pos.x;
        let finalY = pos.y;
        let hasMove = false;

        for (const cmd of queue.commands) {
          if (cmd.type === 'move') {
            const moveCmd = cmd as MoveCommand;
            finalX = moveCmd.targetX;
            finalY = moveCmd.targetY;
            hasMove = true;
          }
        }

        if (hasMove) {
          // Check if moves bring us closer to target and into range
          const currentDist = MovementSystem.calculateDistance(pos.x, pos.y, targetPos.x, targetPos.y);
          const finalDist = MovementSystem.calculateDistance(finalX, finalY, targetPos.x, targetPos.y);

          // Only "charge" if moving closer AND will be in weapon range
          if (finalDist < currentDist && finalDist <= weaponRange) {
            status.willCharge = true;
          }
        }
      }
    }
  }

  return status;
}

export function renderCombatStatusBadges(status: CombatStatus): string {
  const badges: string[] = [];

  if (status.onOverwatch) {
    const label = status.overwatchType === 'ranged' ? 'Overwatch (Ranged)' : 'Overwatch';
    badges.push(`<span class="status-badge badge-overwatch">${label}</span>`);
  }
  if (status.inMelee) {
    badges.push('<span class="status-badge badge-in-melee">In Melee</span>');
  }
  if (status.willCharge) {
    badges.push('<span class="status-badge badge-will-charge">Will Charge</span>');
  }
  if (status.engaged && !status.inMelee) {
    badges.push('<span class="status-badge badge-engaged">Engaged</span>');
  }
  if (status.exhausted) {
    badges.push('<span class="status-badge badge-exhausted">Exhausted</span>');
  }

  return badges.length > 0 ? badges.join(' ') : '';
}
