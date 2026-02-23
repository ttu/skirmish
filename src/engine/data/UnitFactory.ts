import { WorldImpl } from '../ecs/World';
import { EntityId } from '../types';
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  SkillsComponent,
  ActionPointsComponent,
  StaminaComponent,
  ArmorComponent,
  WeaponComponent,
  OffHandComponent,
  AmmoComponent,
  MoraleStateComponent,
  EngagementComponent,
  IdentityComponent,
} from '../components';
import { UNIT_TEMPLATES, UnitTemplate } from './UnitTemplates';


/** Per (faction, unitType) counter for unique display names */
const displayNameCounters: Map<string, number> = new Map();
/** Global counter for shortIds (Warrior #1, Goblin #2, etc.) */
let shortIdCounter = 0;

function nextDisplayName(faction: 'player' | 'enemy', unitType: string, baseName: string): string {
  const key = `${faction}-${unitType}`;
  const n = (displayNameCounters.get(key) ?? 0) + 1;
  displayNameCounters.set(key, n);
  return faction === 'enemy' ? `Enemy ${baseName} ${n}` : `${baseName} ${n}`;
}

function nextShortId(): number {
  shortIdCounter += 1;
  return shortIdCounter;
}

export class UnitFactory {
  /** Reset display name counters (call when loading a new scenario). */
  static resetDisplayNameCounters(): void {
    displayNameCounters.clear();
    shortIdCounter = 0;
  }

  static createUnit(
    world: WorldImpl,
    templateName: string,
    faction: 'player' | 'enemy',
    x: number,
    y: number,
    facing: number = 0,
    elevation: number = 0
  ): EntityId {
    const template = UNIT_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown unit template: ${templateName}`);
    }

    const entity = world.createEntity();
    const displayName = nextDisplayName(faction, template.unitType, template.name);

    // Identity (unique display name and shortId for log/UI)
    world.addComponent<IdentityComponent>(entity, {
      type: 'identity',
      name: displayName,
      unitType: template.unitType,
      shortId: nextShortId(),
    });

    // Position
    world.addComponent<PositionComponent>(entity, {
      type: 'position',
      x,
      y,
      facing,
      ...(elevation !== 0 && { elevation }),
    });

    // Faction
    world.addComponent<FactionComponent>(entity, {
      type: 'faction',
      faction,
    });

    // Health
    world.addComponent<HealthComponent>(entity, {
      type: 'health',
      current: template.health,
      max: template.health,
      woundState: 'healthy',
    });

    // Skills (toughness optional, for head-hit knockout)
    world.addComponent<SkillsComponent>(entity, {
      type: 'skills',
      melee: template.skills.melee,
      ranged: template.skills.ranged,
      block: template.skills.block,
      dodge: template.skills.dodge,
      morale: template.skills.morale,
      perception: template.skills.perception,
      ...(template.skills.toughness != null && { toughness: template.skills.toughness }),
    });

    // Action Points
    const maxAP = template.baseAP + template.experienceBonus - template.armor.apPenalty;
    world.addComponent<ActionPointsComponent>(entity, {
      type: 'actionPoints',
      current: maxAP,
      max: maxAP,
      baseValue: template.baseAP,
      armorPenalty: template.armor.apPenalty,
      experienceBonus: template.experienceBonus,
    });

    // Stamina
    world.addComponent<StaminaComponent>(entity, {
      type: 'stamina',
      current: template.stamina,
      max: template.stamina,
      exhausted: false,
    });

    // Armor
    world.addComponent<ArmorComponent>(entity, {
      type: 'armor',
      head: template.armor.head,
      torso: template.armor.torso,
      arms: template.armor.arms,
      legs: template.armor.legs,
      apPenalty: template.armor.apPenalty,
      staminaPenalty: template.armor.staminaPenalty,
    });

    // Weapon
    world.addComponent<WeaponComponent>(entity, {
      type: 'weapon',
      name: template.weapon.name,
      damage: { ...template.weapon.damage },
      speed: template.weapon.speed,
      range: template.weapon.range,
      apCost: template.weapon.apCost,
      twoHanded: template.weapon.twoHanded,
    });

    // Off-hand (shield or none)
    if (template.offHand) {
      world.addComponent<OffHandComponent>(entity, {
        type: 'offHand',
        itemType: template.offHand.itemType,
        blockBonus: template.offHand.blockBonus,
      });
    }

    // Ammo (for ranged units)
    if (template.ammo) {
      world.addComponent<AmmoComponent>(entity, {
        type: 'ammo',
        slots: template.ammo.slots.map((slot) => ({ ...slot })),
        currentSlot: 0,
      });
    }

    // Morale state
    world.addComponent<MoraleStateComponent>(entity, {
      type: 'moraleState',
      status: 'steady',
      modifiers: [],
    });

    // Engagement
    world.addComponent<EngagementComponent>(entity, {
      type: 'engagement',
      engagedWith: [],
    });

    return entity;
  }

  static getTemplateNames(): string[] {
    return Object.keys(UNIT_TEMPLATES);
  }

  static getTemplate(name: string): UnitTemplate | undefined {
    return UNIT_TEMPLATES[name];
  }

  static getBaseSpeed(world: WorldImpl, entityId: EntityId): number {
    const identity = world.getComponent<IdentityComponent>(entityId, 'identity');
    if (!identity) return 6; // Default

    const template = UNIT_TEMPLATES[identity.unitType];
    return template?.baseSpeed ?? 6;
  }
}
