// Unit template definitions based on the game design document

export interface UnitTemplate {
  name: string;
  unitType: string;
  // Base stats
  health: number;
  baseAP: number;
  stamina: number;
  baseSpeed: number; // meters per turn at full sprint
  // Skills (D100); toughness optional (default 40 for head-hit knockout)
  skills: {
    melee: number;
    ranged: number;
    block: number;
    dodge: number;
    morale: number;
    perception: number;
    toughness?: number;
  };
  // Armor by location
  armor: {
    head: number;
    torso: number;
    arms: number;
    legs: number;
    apPenalty: number;
    staminaPenalty: number;
  };
  // Weapon
  weapon: {
    name: string;
    damage: { dice: number; sides: number; bonus: number };
    speed: number;
    range: number;
    apCost: number;
    twoHanded: boolean;
  };
  // Optional shield
  offHand?: {
    itemType: 'shield' | 'weapon' | 'none';
    blockBonus: number;
  };
  // Optional ammo (for ranged units)
  ammo?: {
    slots: {
      ammoType: string;
      quantity: number;
      maxQuantity: number;
      armorPiercing: number;
      damageBonus: number;
    }[];
  };
  // Experience level
  experienceBonus: number;
  // Special flags
  causesFear?: boolean;
  fearless?: boolean;
  hasLeadership?: boolean;
}

// Player Units
export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {
  // === PLAYER UNITS ===
  militia: {
    name: 'Militia',
    unitType: 'militia',
    health: 80,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 6,
    skills: { melee: 55, ranged: 30, block: 30, dodge: 35, morale: 40, perception: 35, toughness: 35 },
    armor: { head: 1, torso: 2, arms: 1, legs: 1, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Spear',
      damage: { dice: 1, sides: 6, bonus: 2 },
      speed: 4,
      range: 2,
      apCost: 2,
      twoHanded: false,
    },
    offHand: { itemType: 'shield', blockBonus: 10 },
    experienceBonus: -1, // Recruit
  },

  warrior: {
    name: 'Warrior',
    unitType: 'warrior',
    health: 100,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 6,
    skills: { melee: 70, ranged: 45, block: 50, dodge: 30, morale: 50, perception: 45 },
    armor: { head: 3, torso: 5, arms: 3, legs: 3, apPenalty: 1, staminaPenalty: 1 },
    weapon: {
      name: 'Sword',
      damage: { dice: 1, sides: 8, bonus: 2 },
      speed: 5,
      range: 1.5,
      apCost: 2,
      twoHanded: false,
    },
    offHand: { itemType: 'shield', blockBonus: 15 },
    experienceBonus: 0, // Regular
  },

  veteran: {
    name: 'Veteran',
    unitType: 'veteran',
    health: 100,
    baseAP: 5,
    stamina: 12,
    baseSpeed: 6,
    skills: { melee: 80, ranged: 55, block: 60, dodge: 40, morale: 60, perception: 55 },
    armor: { head: 3, torso: 5, arms: 3, legs: 3, apPenalty: 1, staminaPenalty: 1 },
    weapon: {
      name: 'Longsword',
      damage: { dice: 1, sides: 10, bonus: 2 },
      speed: 5,
      range: 1.5,
      apCost: 2,
      twoHanded: false,
    },
    offHand: { itemType: 'shield', blockBonus: 15 },
    experienceBonus: 1, // Veteran
  },

  knight: {
    name: 'Knight',
    unitType: 'knight',
    health: 120,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 5,
    skills: { melee: 85, ranged: 45, block: 70, dodge: 25, morale: 70, perception: 50, toughness: 55 },
    armor: { head: 6, torso: 8, arms: 5, legs: 5, apPenalty: 2, staminaPenalty: 2 },
    weapon: {
      name: 'Longsword',
      damage: { dice: 1, sides: 10, bonus: 4 },
      speed: 6,
      range: 1.5,
      apCost: 2,
      twoHanded: false,
    },
    offHand: { itemType: 'shield', blockBonus: 20 },
    experienceBonus: 1, // Veteran
    hasLeadership: true,
  },

  archer: {
    name: 'Archer',
    unitType: 'archer',
    health: 70,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 6,
    skills: { melee: 40, ranged: 70, block: 25, dodge: 45, morale: 45, perception: 55 },
    armor: { head: 1, torso: 2, arms: 1, legs: 1, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Bow',
      damage: { dice: 1, sides: 6, bonus: 2 },
      speed: 4,
      range: 20,
      apCost: 2,
      twoHanded: true,
    },
    ammo: {
      slots: [
        { ammoType: 'standard', quantity: 12, maxQuantity: 12, armorPiercing: 0, damageBonus: 0 },
        { ammoType: 'bodkin', quantity: 4, maxQuantity: 4, armorPiercing: 2, damageBonus: 0 },
      ],
    },
    experienceBonus: 0,
  },

  crossbowman: {
    name: 'Crossbowman',
    unitType: 'crossbowman',
    health: 80,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 5,
    skills: { melee: 55, ranged: 65, block: 35, dodge: 30, morale: 50, perception: 50 },
    armor: { head: 2, torso: 4, arms: 2, legs: 2, apPenalty: 1, staminaPenalty: 1 },
    weapon: {
      name: 'Crossbow',
      damage: { dice: 1, sides: 10, bonus: 2 },
      speed: 8, // Slower
      range: 25,
      apCost: 3, // More expensive
      twoHanded: true,
    },
    ammo: {
      slots: [
        { ammoType: 'bolt', quantity: 8, maxQuantity: 8, armorPiercing: 2, damageBonus: 0 },
      ],
    },
    experienceBonus: 0,
  },

  healer: {
    name: 'Healer',
    unitType: 'healer',
    health: 60,
    baseAP: 5,
    stamina: 8,
    baseSpeed: 5,
    skills: { melee: 35, ranged: 30, block: 20, dodge: 40, morale: 55, perception: 50 },
    armor: { head: 0, torso: 1, arms: 0, legs: 0, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Staff',
      damage: { dice: 1, sides: 4, bonus: 0 },
      speed: 4,
      range: 1.5,
      apCost: 2,
      twoHanded: true,
    },
    experienceBonus: 0,
  },

  scout: {
    name: 'Scout',
    unitType: 'scout',
    health: 65,
    baseAP: 5,
    stamina: 12,
    baseSpeed: 8, // Fast
    skills: { melee: 60, ranged: 65, block: 30, dodge: 55, morale: 50, perception: 70 },
    armor: { head: 1, torso: 2, arms: 1, legs: 1, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Short Bow',
      damage: { dice: 1, sides: 6, bonus: 1 },
      speed: 3,
      range: 15,
      apCost: 2,
      twoHanded: true,
    },
    ammo: {
      slots: [
        { ammoType: 'standard', quantity: 10, maxQuantity: 10, armorPiercing: 0, damageBonus: 0 },
      ],
    },
    experienceBonus: 1, // Veteran
  },

  // === ENEMY UNITS ===
  goblin: {
    name: 'Goblin',
    unitType: 'goblin',
    health: 40,
    baseAP: 6, // Fast
    stamina: 8,
    baseSpeed: 7,
    skills: { melee: 50, ranged: 40, block: 20, dodge: 45, morale: 30, perception: 40 }, // Cowardly
    armor: { head: 0, torso: 1, arms: 0, legs: 0, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Rusty Knife',
      damage: { dice: 1, sides: 4, bonus: 0 },
      speed: 2, // Very fast
      range: 1,
      apCost: 1,
      twoHanded: false,
    },
    experienceBonus: 0,
  },

  orc_warrior: {
    name: 'Orc Warrior',
    unitType: 'orc_warrior',
    health: 120,
    baseAP: 5,
    stamina: 12,
    baseSpeed: 5,
    skills: { melee: 70, ranged: 35, block: 40, dodge: 25, morale: 55, perception: 35 },
    armor: { head: 2, torso: 4, arms: 2, legs: 2, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Cleaver',
      damage: { dice: 1, sides: 10, bonus: 3 },
      speed: 6,
      range: 1.5,
      apCost: 2,
      twoHanded: false,
    },
    offHand: { itemType: 'shield', blockBonus: 10 },
    experienceBonus: 0,
  },

  orc_archer: {
    name: 'Orc Archer',
    unitType: 'orc_archer',
    health: 90,
    baseAP: 5,
    stamina: 10,
    baseSpeed: 5,
    skills: { melee: 50, ranged: 55, block: 25, dodge: 30, morale: 50, perception: 40 },
    armor: { head: 1, torso: 2, arms: 1, legs: 1, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Crude Bow',
      damage: { dice: 1, sides: 6, bonus: 1 },
      speed: 5,
      range: 18,
      apCost: 2,
      twoHanded: true,
    },
    ammo: {
      slots: [
        { ammoType: 'crude_arrow', quantity: 8, maxQuantity: 8, armorPiercing: 0, damageBonus: 0 },
      ],
    },
    experienceBonus: 0,
  },

  orc_brute: {
    name: 'Orc Brute',
    unitType: 'orc_brute',
    health: 150,
    baseAP: 4, // Slow
    stamina: 15,
    baseSpeed: 4,
    skills: { melee: 75, ranged: 20, block: 30, dodge: 15, morale: 65, perception: 25 },
    armor: { head: 2, torso: 3, arms: 2, legs: 2, apPenalty: 0, staminaPenalty: 0 },
    weapon: {
      name: 'Great Axe',
      damage: { dice: 2, sides: 8, bonus: 4 },
      speed: 8, // Slow
      range: 2,
      apCost: 3,
      twoHanded: true,
    },
    experienceBonus: 0,
    fearless: true,
  },

  troll: {
    name: 'Troll',
    unitType: 'troll',
    health: 250,
    baseAP: 3, // Very slow
    stamina: 20,
    baseSpeed: 4,
    skills: { melee: 65, ranged: 15, block: 20, dodge: 10, morale: 80, perception: 20 },
    armor: { head: 4, torso: 6, arms: 4, legs: 4, apPenalty: 0, staminaPenalty: 0 }, // Thick hide
    weapon: {
      name: 'Fists',
      damage: { dice: 2, sides: 10, bonus: 5 },
      speed: 7,
      range: 2,
      apCost: 2,
      twoHanded: false,
    },
    experienceBonus: 0,
    causesFear: true,
    fearless: true,
  },
};
