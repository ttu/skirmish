import { Component, EntityId } from '../types';

// Position and facing (elevation 0 = ground, positive = higher ground for combat modifiers)
export interface PositionComponent extends Component {
  type: 'position';
  x: number;
  y: number;
  facing: number; // Angle in radians
  elevation?: number; // Optional; default 0
}

// Faction (player or enemy)
export interface FactionComponent extends Component {
  type: 'faction';
  faction: 'player' | 'enemy';
}

// Combat skills (D100 values); toughness used for head-hit knockout roll
export interface SkillsComponent extends Component {
  type: 'skills';
  melee: number;
  ranged: number;
  block: number;
  dodge: number;
  morale: number;
  perception: number; // D100 for distance/condition assessment
  toughness?: number; // D100 for head-hit knockout; default 40 if missing
}

// Health and wound state
export type WoundState = 'healthy' | 'bloodied' | 'wounded' | 'critical' | 'down';

export interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
  woundState: WoundState;
}

// Action points
export interface ActionPointsComponent extends Component {
  type: 'actionPoints';
  current: number;
  max: number;
  baseValue: number;
  armorPenalty: number;
  experienceBonus: number;
}

// Stamina
export interface StaminaComponent extends Component {
  type: 'stamina';
  current: number;
  max: number;
  exhausted: boolean;
}

// Armor per location
export interface ArmorComponent extends Component {
  type: 'armor';
  head: number;
  torso: number;
  arms: number;
  legs: number;
  apPenalty: number;
  staminaPenalty: number;
}

// Weapon
export interface WeaponComponent extends Component {
  type: 'weapon';
  name: string;
  damage: { dice: number; sides: number; bonus: number };
  speed: number; // Lower = faster
  range: number;
  apCost: number;
  twoHanded: boolean;
}

/** Classify weapon as ranged vs melee based on its range. Melee weapons have range <= 3. */
export function isRangedWeapon(weapon: WeaponComponent): boolean {
  return weapon.range > 3;
}

/** Get the attack type string for a weapon. */
export function getAttackType(weapon: WeaponComponent): 'melee' | 'ranged' {
  return isRangedWeapon(weapon) ? 'ranged' : 'melee';
}

// Off-hand (shield or second weapon)
export interface OffHandComponent extends Component {
  type: 'offHand';
  itemType: 'shield' | 'weapon' | 'none';
  blockBonus: number; // For shields
  weapon?: WeaponComponent; // For dual-wield
}

// Ammunition
export interface AmmoSlot {
  ammoType: string;
  quantity: number;
  maxQuantity: number;
  armorPiercing: number;
  damageBonus: number;
}

export interface AmmoComponent extends Component {
  type: 'ammo';
  slots: AmmoSlot[];
  currentSlot: number;
}

// Morale state
export type MoraleStatus = 'steady' | 'shaken' | 'broken' | 'routed';

export interface MoraleStateComponent extends Component {
  type: 'moraleState';
  status: MoraleStatus;
  modifiers: { source: string; value: number }[];
}

// Engagement tracking
export interface EngagementComponent extends Component {
  type: 'engagement';
  engagedWith: EntityId[];
}

// Defensive stance (set when Defend command resolved; cleared end of turn)
export interface DefensiveStanceComponent extends Component {
  type: 'defensiveStance';
  bonusPercent: number; // +10, +20, or +30
  extraReactions: number; // 0, 1, or 2
}

// Overwatch stance (set when Overwatch command resolved; cleared end of turn or after trigger)
export interface OverwatchComponent extends Component {
  type: 'overwatch';
  attackType: 'melee' | 'ranged';
  /** Optional: specific direction to watch (radians). */
  watchDirection?: number;
  /** Optional: arc width in radians (default: full 360°). */
  watchArc?: number;
  /** Has this overwatch already triggered this turn? */
  triggered: boolean;
}

// Unit name/identity
export interface IdentityComponent extends Component {
  type: 'identity';
  name: string;
  unitType: string;
  /** Unique short id for log/UI (e.g. 1, 2) — display as "Warrior #1" */
  shortId: number;
}

// Command types for the command queue
export type CommandType = 'move' | 'attack' | 'defend' | 'aim' | 'reload' | 'rally' | 'wait' | 'overwatch';

export type ConditionType = 'inRange' | 'targetDead' | 'enemyApproaches' | 'hpBelow';

export interface CommandCondition {
  type: ConditionType;
  params: Record<string, unknown>;
}

export interface BaseCommand {
  type: CommandType;
  apCost: number;
  priority: number;
  condition?: CommandCondition;
}

export interface MoveCommand extends BaseCommand {
  type: 'move';
  targetX: number;
  targetY: number;
  mode: 'walk' | 'advance' | 'run' | 'sprint';
}

export interface AttackCommand extends BaseCommand {
  type: 'attack';
  targetId: EntityId;
  attackType: 'melee' | 'ranged';
  /** Aimed shot: choose hit location (skips location roll). Only applied when set. */
  chosenLocation?: 'head' | 'torso' | 'arms' | 'legs' | 'weapon';
}

export interface DefendCommand extends BaseCommand {
  type: 'defend';
  defenseType: 'block' | 'dodge' | 'parry';
}

export interface AimCommand extends BaseCommand {
  type: 'aim';
  targetId: EntityId;
  aimBonus: number; // Accumulated aim bonus
}

export interface ReloadCommand extends BaseCommand {
  type: 'reload';
  slotIndex: number;
}

export interface RallyCommand extends BaseCommand {
  type: 'rally';
}

export interface WaitCommand extends BaseCommand {
  type: 'wait';
}

export interface OverwatchCommand extends BaseCommand {
  type: 'overwatch';
  attackType: 'melee' | 'ranged';
  /** Optional: specific direction/arc to watch (radians). If not set, watches all directions. */
  watchDirection?: number;
  /** Optional: arc width in radians (default: full 360°). */
  watchArc?: number;
}

export type UnitCommand =
  | MoveCommand
  | AttackCommand
  | DefendCommand
  | AimCommand
  | ReloadCommand
  | RallyCommand
  | WaitCommand
  | OverwatchCommand;

// Command queue component
export interface CommandQueueComponent extends Component {
  type: 'commandQueue';
  commands: UnitCommand[];
  currentCommandIndex: number;
}

// Wound effects from hitting unprotected areas
export type WoundSeverity = 'minor' | 'moderate' | 'severe';
export type WoundLocation = 'arms' | 'legs' | 'torso';

export interface WoundEffect {
  location: WoundLocation;
  severity: WoundSeverity;
  skillPenalty: number;
  movementPenalty: number;
  bleedingPerTurn: number;
  disablesTwoHanded: boolean;
  restrictsMoveMode: boolean;
  halvesMovement: boolean;
}

export interface WoundEffectsComponent extends Component {
  type: 'woundEffects';
  effects: WoundEffect[];
}

// Obstacle (blocking terrain); entity has position + this. Used for movement blocking only.
export interface ObstacleComponent extends Component {
  type: 'obstacle';
  radius: number;
  isPassable: boolean;
  speedMultiplier?: number; // 1.0 = normal, 0.5 = brook slowing
  // For rectangular obstacles (stone_wall, fence):
  halfLength?: number;  // half-extent along local X axis
  halfWidth?: number;   // half-extent along local Z axis
  rotation?: number;    // rotation in radians
}

// Helper to calculate wound state from HP
export function calculateWoundState(current: number, max: number): WoundState {
  const percentage = (current / max) * 100;
  if (current <= 0) return 'down';
  if (percentage <= 25) return 'critical';
  if (percentage <= 50) return 'wounded';
  if (percentage <= 75) return 'bloodied';
  return 'healthy';
}

// Helper to get wound state skill penalty
export function getWoundPenalty(state: WoundState): number {
  switch (state) {
    case 'healthy':
    case 'bloodied':
      return 0;
    case 'wounded':
      return 10;
    case 'critical':
      return 20;
    case 'down':
      return 100; // Cannot act
  }
}
