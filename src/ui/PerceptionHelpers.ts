import { HealthComponent } from '../engine/components';

export type PerceptionTier = 'poor' | 'low' | 'average' | 'good' | 'excellent';

/**
 * Get the perception tier from a D100 perception value.
 * - 0-20: poor
 * - 21-40: low
 * - 41-60: average
 * - 61-80: good
 * - 81+: excellent
 */
export function getPerceptionTier(perception: number): PerceptionTier {
  if (perception <= 20) return 'poor';
  if (perception <= 40) return 'low';
  if (perception <= 60) return 'average';
  if (perception <= 80) return 'good';
  return 'excellent';
}

/**
 * Format distance based on observer's perception.
 * @param actualDistance - The true distance in meters
 * @param perception - Observer's perception skill (null for god view)
 * @param _seed - Seed for consistent randomization (reserved for future use)
 */
export function formatDistance(
  actualDistance: number,
  perception: number | null,
  _seed: number
): string {
  // God view: exact distance
  if (perception === null) {
    return `${actualDistance.toFixed(1)}m`;
  }

  const tier = getPerceptionTier(perception);

  switch (tier) {
    case 'poor':
      // Just "Close" or "Far" based on 10m threshold
      return actualDistance <= 10 ? 'Close' : 'Far';

    case 'low': {
      // ±50% error range
      const errorPercent = 0.5;
      const low = Math.round(actualDistance * (1 - errorPercent));
      const high = Math.round(actualDistance * (1 + errorPercent));
      return `~${low}-${high}m`;
    }

    case 'average': {
      // ±25% error range
      const errorPercent = 0.25;
      const low = Math.round(actualDistance * (1 - errorPercent));
      const high = Math.round(actualDistance * (1 + errorPercent));
      return `~${low}-${high}m`;
    }

    case 'good': {
      // ±10% error range
      const errorPercent = 0.1;
      const low = Math.round(actualDistance * (1 - errorPercent) * 10) / 10;
      const high = Math.round(actualDistance * (1 + errorPercent) * 10) / 10;
      return `~${low}-${high}m`;
    }

    case 'excellent':
      // Exact distance
      return `${actualDistance.toFixed(1)}m`;
  }
}

/**
 * Capitalize the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format enemy condition based on observer's perception.
 * @param health - Target's health component
 * @param perception - Observer's perception skill (null for god view)
 */
export function formatEnemyCondition(
  health: HealthComponent,
  perception: number | null
): string {
  // God view: exact HP values
  if (perception === null) {
    return `${health.current}/${health.max} HP`;
  }

  const tier = getPerceptionTier(perception);
  const hpPercent = (health.current / health.max) * 100;

  switch (tier) {
    case 'poor':
      // No information visible
      return '';

    case 'low':
      // Simple "Healthy" or "Hurt" based on 50% threshold
      return hpPercent > 50 ? 'Healthy' : 'Hurt';

    case 'average':
      // Wound state name
      return capitalize(health.woundState);

    case 'good': {
      // Wound state + approximate HP% (rounded to nearest 10)
      const approxPercent = Math.round(hpPercent / 10) * 10;
      return `${capitalize(health.woundState)} (~${approxPercent}%)`;
    }

    case 'excellent':
      // Exact HP values
      return `${health.current}/${health.max} HP`;
  }
}
