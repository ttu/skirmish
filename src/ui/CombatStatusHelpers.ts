import { EntityId } from '../engine/types';

export interface CombatStatus {
  inMelee: boolean;
  willCharge: boolean;
  engaged: boolean;
  exhausted: boolean;
  onOverwatch: boolean;
  overwatchType?: 'melee' | 'ranged';
  engagedEnemyIds: EntityId[];
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
