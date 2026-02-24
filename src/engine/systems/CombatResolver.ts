import { DiceRoller } from '../core/DiceRoller';

export type HitLocation = 'head' | 'torso' | 'arms' | 'legs' | 'weapon';
export type DefenseType = 'parry' | 'block' | 'dodge';
export type ArmorClass = 'unarmored' | 'light' | 'medium' | 'heavy';

export interface Modifier {
  source: string;
  value: number;
}

export interface AttackRollResult {
  roll: number;
  baseSkill: number;
  modifiers: Modifier[];
  effectiveSkill: number;
  hit: boolean;
}

export interface DefenseRollResult {
  defenseType: DefenseType;
  roll: number;
  baseSkill: number;
  modifiers: Modifier[];
  effectiveSkill: number;
  success: boolean;
}

export interface DamageResult {
  rawDamage: number;
  armorAbsorbed: number;
  finalDamage: number;
  location: HitLocation;
}

export class CombatResolver {
  static resolveAttackRoll(
    baseSkill: number,
    modifiers: Modifier[],
    roller: DiceRoller
  ): AttackRollResult {
    const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
    const effectiveSkill = Math.min(95, Math.max(5, baseSkill + totalModifier));
    const roll = roller.rollD100();

    return {
      roll,
      baseSkill,
      modifiers,
      effectiveSkill,
      hit: roll <= effectiveSkill,
    };
  }

  static resolveDefenseRoll(
    defenseType: DefenseType,
    baseSkill: number,
    modifiers: Modifier[],
    roller: DiceRoller
  ): DefenseRollResult {
    const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
    const effectiveSkill = Math.min(95, Math.max(5, baseSkill + totalModifier));
    const roll = roller.rollD100();

    return {
      defenseType,
      roll,
      baseSkill,
      modifiers,
      effectiveSkill,
      success: roll <= effectiveSkill,
    };
  }

  static resolveHitLocation(roller: DiceRoller): HitLocation {
    const roll = roller.rollD100();
    return this.getLocationFromRoll(roll);
  }

  static getLocationFromRoll(roll: number): HitLocation {
    if (roll <= 15) return 'head';
    if (roll <= 35) return 'torso';
    if (roll <= 55) return 'arms';
    if (roll <= 80) return 'legs';
    return 'weapon';
  }

  static calculateDamage(
    weaponDamage: { dice: number; sides: number; bonus: number },
    armor: number,
    roller: DiceRoller
  ): Omit<DamageResult, 'location'> {
    const rawDamage = roller.roll(weaponDamage.dice, weaponDamage.sides, weaponDamage.bonus);
    const armorAbsorbed = armor;
    const finalDamage = Math.max(0, rawDamage - armorAbsorbed);

    return {
      rawDamage,
      armorAbsorbed,
      finalDamage,
    };
  }

  static getLocationDamageMultiplier(location: HitLocation): number {
    if (location === 'head') return 3;
    if (location === 'weapon') return 0;
    return 1;
  }

  static calculateWeaponBreakChance(rawDamage: number): number {
    return Math.min(30, rawDamage * 5);
  }

  static getArmorClass(armor: { head: number; torso: number; arms: number; legs: number }): ArmorClass {
    const total = armor.head + armor.torso + armor.arms + armor.legs;
    if (total <= 4) return 'unarmored';
    if (total <= 8) return 'light';
    if (total <= 14) return 'medium';
    return 'heavy';
  }

  static getDodgePenalty(armorClass: ArmorClass): number | null {
    switch (armorClass) {
      case 'unarmored': return 0;
      case 'light': return -15;
      case 'medium': return -30;
      case 'heavy': return null;
    }
  }

  static getArmorForLocation(
    armor: { head: number; torso: number; arms: number; legs: number },
    location: HitLocation
  ): number {
    switch (location) {
      case 'head':
        return armor.head;
      case 'torso':
        return armor.torso;
      case 'arms':
        return armor.arms;
      case 'legs':
        return armor.legs;
      case 'weapon':
        return 0; // Weapon/shield hits don't use body armor
    }
  }
}
