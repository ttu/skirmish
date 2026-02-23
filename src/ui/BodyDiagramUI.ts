import {
  WoundSeverity,
  WoundEffect,
  ArmorComponent,
  WoundEffectsComponent,
  HealthComponent,
} from '../engine/components';
import { PerceptionTier, getPerceptionTier } from './PerceptionHelpers';
import { WorldImpl } from '../engine/ecs/World';
import { EntityId } from '../engine/types';

// --- Constants ---

const SEVERITY_ORDER: Record<WoundSeverity, number> = {
  minor: 1,
  moderate: 2,
  severe: 3,
};

const ZONE_COLORS: Record<string, string> = {
  none: '#555',
  minor: '#e8c547',
  moderate: '#e87c2a',
  severe: '#e83a3a',
  down: '#222',
};

export type BodyZone = 'head' | 'torso' | 'arms' | 'legs';

// --- Core mapping helpers ---

export function getZoneColor(severity: WoundSeverity | 'down' | null): string {
  if (severity === null) return ZONE_COLORS.none;
  return ZONE_COLORS[severity] ?? ZONE_COLORS.none;
}

export function getWorstSeverity(severities: WoundSeverity[]): WoundSeverity | null {
  if (severities.length === 0) return null;
  return severities.reduce((worst, s) =>
    SEVERITY_ORDER[s] > SEVERITY_ORDER[worst] ? s : worst
  );
}

// --- Wound label helpers ---

export function getWoundLabels(zone: BodyZone, wounds: WoundEffect[]): string[] {
  const zoneWounds = wounds.filter(w => w.location === zone);
  if (zoneWounds.length === 0) return [];

  const labels: string[] = [];

  const totalSkill = zoneWounds.reduce((sum, w) => sum + w.skillPenalty, 0);
  if (totalSkill > 0) labels.push(`-${totalSkill} skill`);

  if (zoneWounds.some(w => w.halvesMovement)) labels.push('½ move');
  if (zoneWounds.some(w => w.restrictsMoveMode)) labels.push('No run');

  const totalMovePenalty = zoneWounds.reduce((sum, w) => sum + w.movementPenalty, 0);
  if (totalMovePenalty > 0 && !zoneWounds.some(w => w.halvesMovement)) {
    labels.push(`-${totalMovePenalty} move`);
  }

  if (zoneWounds.some(w => w.disablesTwoHanded)) labels.push('No 2H');

  const totalBleeding = zoneWounds.reduce((sum, w) => sum + w.bleedingPerTurn, 0);
  if (totalBleeding > 0) labels.push(`${totalBleeding}/turn`);

  return labels;
}

// --- Perception filtering helpers ---

export function getPerceptionFilteredArmor(value: number, tier: PerceptionTier): string | null {
  switch (tier) {
    case 'excellent':
      return String(value);
    case 'good': {
      const low = Math.max(0, value - 1);
      const high = value + 1;
      return `${low}-${high}`;
    }
    case 'average':
      if (value <= 2) return 'Light';
      if (value <= 4) return 'Medium';
      return 'Heavy';
    case 'low':
    case 'poor':
      return null;
  }
}

export function getPerceptionFilteredZoneColor(
  severity: WoundSeverity | null,
  isDown: boolean,
  tier: PerceptionTier
): string {
  if (isDown) return ZONE_COLORS.down;
  if (severity === null) return ZONE_COLORS.none;

  switch (tier) {
    case 'excellent':
    case 'good':
      return getZoneColor(severity);
    case 'average':
    case 'low':
      return severity === 'severe' ? ZONE_COLORS.severe : ZONE_COLORS.minor;
    case 'poor':
      return ZONE_COLORS.none;
  }
}

// --- SVG zone layout (viewBox 0 0 140 160) ---

const ZONES = {
  head:  { cx: 60, cy: 22, r: 16 },
  torso: { x: 38, y: 42, w: 44, h: 52 },
  armL:  { x: 18, y: 44, w: 18, h: 48 },
  armR:  { x: 84, y: 44, w: 18, h: 48 },
  legL:  { x: 38, y: 98, w: 20, h: 56 },
  legR:  { x: 62, y: 98, w: 20, h: 56 },
};

const ARMOR_POS: Record<BodyZone, { x: number; y: number }> = {
  head:  { x: 60, y: 26 },
  torso: { x: 60, y: 70 },
  arms:  { x: 14, y: 70 },
  legs:  { x: 60, y: 128 },
};

const LABEL_POS: Record<BodyZone, { x: number; y: number }> = {
  head:  { x: 95, y: 22 },
  arms:  { x: 108, y: 58 },
  torso: { x: 108, y: 80 },
  legs:  { x: 108, y: 120 },
};

interface ZoneData {
  color: string;
  armorText: string | null;
  labels: string[];
  tooltipLines: string[];
}

function getZoneDataForPlayer(
  zone: BodyZone,
  armor: ArmorComponent | undefined,
  woundEffects: WoundEffectsComponent | undefined,
  isDown: boolean
): ZoneData {
  const armorValue = armor ? armor[zone as keyof Pick<ArmorComponent, 'head' | 'torso' | 'arms' | 'legs'>] : 0;
  const wounds = woundEffects?.effects.filter(w => w.location === zone) ?? [];
  const severities = wounds.map(w => w.severity);
  const worst = isDown ? 'down' as const : getWorstSeverity(severities);
  const color = getZoneColor(worst);
  const armorText = armorValue > 0 ? String(armorValue) : null;
  const labels = zone === 'head' ? [] : getWoundLabels(zone, woundEffects?.effects ?? []);

  const tooltipLines: string[] = [];
  tooltipLines.push(`Armor: ${armorValue}`);
  if (wounds.length > 0) {
    for (const w of wounds) {
      tooltipLines.push(`${w.severity} wound`);
    }
  } else {
    tooltipLines.push('No wounds');
  }

  return { color, armorText, labels, tooltipLines };
}

function getZoneDataForEnemy(
  zone: BodyZone,
  armor: ArmorComponent | undefined,
  woundEffects: WoundEffectsComponent | undefined,
  isDown: boolean,
  tier: PerceptionTier
): ZoneData {
  const armorValue = armor ? armor[zone as keyof Pick<ArmorComponent, 'head' | 'torso' | 'arms' | 'legs'>] : 0;
  const wounds = woundEffects?.effects.filter(w => w.location === zone) ?? [];
  const severities = wounds.map(w => w.severity);
  const worst = getWorstSeverity(severities);

  const color = getPerceptionFilteredZoneColor(worst, isDown, tier);
  const armorText = getPerceptionFilteredArmor(armorValue, tier);

  let labels: string[] = [];
  if (tier === 'excellent' || tier === 'good') {
    labels = zone === 'head' ? [] : getWoundLabels(zone, woundEffects?.effects ?? []);
  } else if (tier === 'average' && wounds.length > 0) {
    labels = ['wounded'];
  }

  const tooltipLines: string[] = [];
  if (tier === 'poor') {
    tooltipLines.push('???');
  } else if (tier === 'low') {
    tooltipLines.push(wounds.length > 0 ? 'Hurt' : 'OK');
  } else {
    tooltipLines.push(`Armor: ${armorText ?? '?'}`);
    if (wounds.length > 0) {
      for (const w of wounds) {
        tooltipLines.push(tier === 'average' ? 'wound' : `${w.severity} wound`);
      }
    }
  }

  return { color, armorText: tier === 'poor' ? null : armorText, labels, tooltipLines };
}

// --- SVG rendering ---

function renderSvgZone(zone: BodyZone, data: ZoneData): string {
  const tooltip = data.tooltipLines.join('&#10;');
  let shapeSvg = '';

  if (zone === 'head') {
    const z = ZONES.head;
    shapeSvg = `<circle cx="${z.cx}" cy="${z.cy}" r="${z.r}" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></circle>`;
  } else if (zone === 'torso') {
    const z = ZONES.torso;
    shapeSvg = `<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  } else if (zone === 'arms') {
    const l = ZONES.armL, r = ZONES.armR;
    shapeSvg =
      `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>` +
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  } else {
    const l = ZONES.legL, r = ZONES.legR;
    shapeSvg =
      `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>` +
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${data.color}" stroke="#888" stroke-width="1" opacity="0.85"><title>${tooltip}</title></rect>`;
  }

  let armorBadge = '';
  if (data.armorText) {
    const pos = ARMOR_POS[zone];
    armorBadge = `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" font-size="10" fill="#fff" font-weight="bold" style="text-shadow:0 0 3px #000">${data.armorText}</text>`;
  }

  let labelsSvg = '';
  if (data.labels.length > 0) {
    const pos = LABEL_POS[zone];
    labelsSvg = data.labels.map((label, i) =>
      `<text x="${pos.x}" y="${pos.y + i * 12}" font-size="9" fill="${data.color}" font-weight="bold" text-anchor="start">${label}</text>`
    ).join('');
  }

  return shapeSvg + armorBadge + labelsSvg;
}

// --- Public render functions ---

export function renderBodyDiagram(
  entityId: EntityId,
  world: WorldImpl
): string {
  const health = world.getComponent<HealthComponent>(entityId, 'health');
  const armor = world.getComponent<ArmorComponent>(entityId, 'armor');
  const woundEffects = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
  const isDown = health?.woundState === 'down';

  const zones: BodyZone[] = ['head', 'torso', 'arms', 'legs'];
  const zonesSvg = zones.map(zone => {
    const data = getZoneDataForPlayer(zone, armor, woundEffects, isDown);
    return renderSvgZone(zone, data);
  }).join('');

  const hpCurrent = health?.current ?? 0;
  const hpMax = health?.max ?? 1;
  const hpPct = Math.max(0, (hpCurrent / hpMax) * 100);
  const hpColor = hpPct > 50 ? '#6bcf7b' : hpPct > 25 ? '#e8c547' : '#e83a3a';

  return `<div class="body-diagram">
    <svg viewBox="0 0 140 160" width="112" height="128" xmlns="http://www.w3.org/2000/svg">
      ${zonesSvg}
    </svg>
    <div class="body-hp-bar" style="margin-top:2px">
      <div style="background:#333;border-radius:3px;height:5px;width:100%;position:relative">
        <div style="background:${hpColor};border-radius:3px;height:5px;width:${hpPct}%"></div>
      </div>
      <div style="font-size:10px;color:#aaa;text-align:center;margin-top:1px">${hpCurrent} / ${hpMax} HP (${health?.woundState ?? '—'})</div>
    </div>
  </div>`;
}

export function renderEnemyBodyDiagram(
  entityId: EntityId,
  observerPerception: number,
  world: WorldImpl
): string {
  const tier = getPerceptionTier(observerPerception);
  const health = world.getComponent<HealthComponent>(entityId, 'health');
  const armor = world.getComponent<ArmorComponent>(entityId, 'armor');
  const woundEffects = world.getComponent<WoundEffectsComponent>(entityId, 'woundEffects');
  const isDown = health?.woundState === 'down';

  const zones: BodyZone[] = ['head', 'torso', 'arms', 'legs'];
  const zonesSvg = zones.map(zone => {
    const data = getZoneDataForEnemy(zone, armor, woundEffects, isDown, tier);
    return renderSvgZone(zone, data);
  }).join('');

  const overlay = tier === 'poor'
    ? '<text x="60" y="90" text-anchor="middle" font-size="40" fill="#888" opacity="0.7">?</text>'
    : '';

  return `<div class="body-diagram body-diagram-enemy">
    <svg viewBox="0 0 140 160" width="112" height="128" xmlns="http://www.w3.org/2000/svg">
      ${zonesSvg}
      ${overlay}
    </svg>
  </div>`;
}
