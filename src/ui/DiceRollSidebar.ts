import { EntityId, GameEvent } from '../engine/types';
import { Modifier } from '../engine/systems/CombatResolver';

const LOCATION_ZONES: { key: string; label: string; widthPct: number }[] = [
  { key: 'head',   label: 'Head',  widthPct: 15 },
  { key: 'torso',  label: 'Torso', widthPct: 20 },
  { key: 'arms',   label: 'Arms',  widthPct: 20 },
  { key: 'legs',   label: 'Legs',  widthPct: 25 },
  { key: 'weapon', label: 'Wpn',   widthPct: 20 },
];

export class DiceRollSidebar {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private resolveEntityName: (id: EntityId) => string = (id) => String(id);
  private resolveFaction: (id: EntityId) => 'player' | 'enemy' = () => 'enemy';
  /** When set, used for the next AttackDeclared header instead of resolveFaction (avoids closure/world timing issues). */
  private nextExchangeFactions: { attacker: 'player' | 'enemy'; defender: 'player' | 'enemy' } | null = null;
  /** Factions for the current exchange; used for header and for attack/defense bar colors. */
  private currentExchangeFactions: { attacker: 'player' | 'enemy'; defender: 'player' | 'enemy' } | null = null;
  private animationTimeouts: number[] = [];
  private _currentAttackerId: EntityId | null = null;
  private _currentDefenderId: EntityId | null = null;
  /** The current exchange group element that sections are appended to. */
  private currentExchangeEl: HTMLElement | null = null;
  private exchangeCount = 0;

  get currentAttackerId(): EntityId | null { return this._currentAttackerId; }
  get currentDefenderId(): EntityId | null { return this._currentDefenderId; }

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'dice-roll-sidebar';

    const title = document.createElement('div');
    title.className = 'dice-sidebar-title';
    title.textContent = 'Combat Roll';
    this.container.appendChild(title);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'dice-sidebar-content';
    this.container.appendChild(this.contentEl);

    this.showEmpty();

    this.container.addEventListener('click', () => this.skipAnimation());
  }

  getElement(): HTMLElement {
    return this.container;
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }

  setEntityNameResolver(resolver: (id: EntityId) => string): void {
    this.resolveEntityName = resolver;
  }

  setFactionResolver(resolver: (id: EntityId) => 'player' | 'enemy'): void {
    this.resolveFaction = resolver;
  }

  /** Use these factions for the next AttackDeclared header (player = blue, enemy = red). Call before handleEvent(AttackDeclared). */
  setFactionsForNextExchange(attacker: 'player' | 'enemy', defender: 'player' | 'enemy'): void {
    this.nextExchangeFactions = { attacker, defender };
  }

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'AttackDeclared':
        this.onAttackDeclared(event);
        break;
      case 'AttackRolled':
        this.onAttackRolled(event);
        break;
      case 'DefenseRolled':
        this.onDefenseRolled(event);
        break;
      case 'DamageDealt':
        this.onDamageDealt(event);
        break;
    }
  }

  private onAttackDeclared(event: GameEvent): void {
    this.cancelAnimations();
    this._currentAttackerId = event.entityId ?? null;
    this._currentDefenderId = event.targetId ?? null;

    const attackerName = event.entityId ? this.resolveEntityName(event.entityId) : '?';
    const defenderName = event.targetId ? this.resolveEntityName(event.targetId) : '?';
    let attackerFaction: 'player' | 'enemy';
    let defenderFaction: 'player' | 'enemy';
    if (this.nextExchangeFactions) {
      attackerFaction = this.nextExchangeFactions.attacker;
      defenderFaction = this.nextExchangeFactions.defender;
      this.nextExchangeFactions = null;
    } else {
      attackerFaction = event.entityId ? this.resolveFaction(event.entityId) : 'enemy';
      defenderFaction = event.targetId ? this.resolveFaction(event.targetId) : 'enemy';
    }
    this.currentExchangeFactions = { attacker: attackerFaction, defender: defenderFaction };

    // Clear empty state on first exchange
    if (this.exchangeCount === 0) {
      this.contentEl.innerHTML = '';
    }

    // Add separator at the beginning of the list (before existing content)
    if (this.exchangeCount > 0) {
      const sep = document.createElement('div');
      sep.className = 'dice-exchange-separator';
      this.contentEl.insertBefore(sep, this.contentEl.firstChild);
    }

    // Create a new exchange group (player = blue, enemy = red regardless of attacker/defender)
    const exchange = document.createElement('div');
    exchange.className = 'dice-exchange-group';

    const header = document.createElement('div');
    header.className = 'dice-sidebar-header';
    const attackerClass = attackerFaction === 'player' ? 'player-unit' : 'enemy-unit';
    const defenderClass = defenderFaction === 'player' ? 'player-unit' : 'enemy-unit';
    const attackerColor = attackerFaction === 'player' ? '#4fc3f7' : '#e85a5a';
    const defenderColor = defenderFaction === 'player' ? '#4fc3f7' : '#e85a5a';
    header.innerHTML = `<span class="${attackerClass}" style="color:${attackerColor} !important">${attackerName}</span> <span class="arrow">\u2192</span> <span class="${defenderClass}" style="color:${defenderColor} !important">${defenderName}</span>`;
    exchange.appendChild(header);

    this.contentEl.insertBefore(exchange, this.contentEl.firstChild);
    this.currentExchangeEl = exchange;
    this.exchangeCount++;

    this.contentEl.scrollTop = 0;
  }

  private onAttackRolled(event: GameEvent): void {
    const { roll, baseSkill, modifiers, effectiveSkill, hit, attackType } = event.data as {
      roll: number;
      baseSkill: number;
      modifiers: Modifier[];
      effectiveSkill: number;
      hit: boolean;
      attackType?: string;
    };

    const typeLabel = attackType === 'ranged' ? 'Ranged' : 'Melee';
    const attackBarType = this.currentExchangeFactions?.attacker ?? 'enemy';
    const section = this.createRollSection(
      'attack',
      `Attack — ${typeLabel} (${effectiveSkill}%)`,
      roll,
      effectiveSkill,
      modifiers ?? [],
      baseSkill ?? effectiveSkill,
      hit,
      hit ? 'HIT' : 'MISS',
      attackBarType,
    );
    this.appendToCurrentExchange(section);
    this.animateSection(section);
  }

  private onDefenseRolled(event: GameEvent): void {
    const { defenseType, roll, baseSkill, modifiers, effectiveSkill, success } = event.data as {
      defenseType: string;
      roll: number;
      baseSkill: number;
      modifiers: Modifier[];
      effectiveSkill: number;
      success: boolean;
    };

    const typeLabel = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);
    const resultLabel = success
      ? (defenseType === 'block' ? 'BLOCKED' : defenseType === 'parry' ? 'PARRIED' : 'DODGED')
      : 'FAIL';

    const defenseBarType = this.currentExchangeFactions?.defender ?? 'enemy';
    const section = this.createRollSection(
      'defense',
      `Defense — ${typeLabel} (${effectiveSkill}%)`,
      roll,
      effectiveSkill,
      modifiers ?? [],
      baseSkill ?? effectiveSkill,
      success,
      resultLabel,
      defenseBarType,
    );
    this.appendToCurrentExchange(section);
    this.animateSection(section);
  }

  private onDamageDealt(event: GameEvent): void {
    const { damage, location, rawDamage, armorAbsorbed } = event.data as {
      damage: number;
      location: string;
      rawDamage: number;
      armorAbsorbed: number;
    };

    // Location section
    const locSection = document.createElement('div');
    locSection.className = 'dice-sidebar-section';
    locSection.setAttribute('data-section', 'location');

    const locLabel = document.createElement('div');
    locLabel.className = 'dice-section-label';
    locLabel.textContent = 'Hit Location';
    locSection.appendChild(locLabel);

    const strip = document.createElement('div');
    strip.className = 'dice-location-strip';
    for (const zone of LOCATION_ZONES) {
      const el = document.createElement('div');
      el.className = 'dice-location-zone';
      if (zone.key === location) el.classList.add('hit');
      el.style.width = `${zone.widthPct}%`;
      el.textContent = zone.label;
      strip.appendChild(el);
    }
    locSection.appendChild(strip);
    this.appendToCurrentExchange(locSection);
    this.animateSection(locSection);

    // Damage section
    const dmgSection = document.createElement('div');
    dmgSection.className = 'dice-sidebar-section';
    dmgSection.setAttribute('data-section', 'damage');

    const dmgLabel = document.createElement('div');
    dmgLabel.className = 'dice-section-label';
    dmgLabel.textContent = 'Damage';
    dmgSection.appendChild(dmgLabel);

    const dmgRow = document.createElement('div');
    dmgRow.className = 'dice-damage-row';
    dmgRow.innerHTML = `
      <span class="dice-damage-raw">Raw: ${rawDamage ?? damage}</span>
      <span class="dice-damage-armor">Armor: ${armorAbsorbed ?? 0}</span>
      <span class="dice-damage-final">${damage} HP</span>
    `;
    dmgSection.appendChild(dmgRow);
    this.appendToCurrentExchange(dmgSection);
    this.animateSection(dmgSection);
  }

  private createRollSection(
    sectionId: string,
    label: string,
    roll: number,
    effectiveSkill: number,
    modifiers: Modifier[],
    baseSkill: number,
    success: boolean,
    resultLabel: string,
    barType: 'player' | 'enemy',
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dice-sidebar-section';
    section.setAttribute('data-section', sectionId);

    const labelEl = document.createElement('div');
    labelEl.className = 'dice-section-label';
    labelEl.textContent = label;
    section.appendChild(labelEl);

    const bar = document.createElement('div');
    bar.className = 'dice-prob-bar';

    const fill = document.createElement('div');
    fill.className = `dice-prob-fill ${barType}`;
    fill.style.width = `${effectiveSkill}%`;
    bar.appendChild(fill);

    const threshold = document.createElement('div');
    threshold.className = 'dice-prob-threshold';
    threshold.style.left = `${effectiveSkill}%`;
    const threshLabel = document.createElement('span');
    threshLabel.className = 'dice-prob-threshold-label';
    threshLabel.textContent = `${effectiveSkill}%`;
    threshold.appendChild(threshLabel);
    bar.appendChild(threshold);

    const marker = document.createElement('div');
    marker.className = `dice-prob-marker ${success ? 'success' : 'fail'}`;
    marker.style.left = `${roll}%`;
    marker.innerHTML = `\u25BC <span class="dice-roll-number">${roll}</span><span class="dice-result-label">${resultLabel}</span>`;
    bar.appendChild(marker);

    section.appendChild(bar);

    if (modifiers.length > 0 || baseSkill !== effectiveSkill) {
      const modsEl = document.createElement('div');
      modsEl.className = 'dice-modifiers';
      const parts = [`base ${baseSkill}`];
      for (const mod of modifiers) {
        const sign = mod.value >= 0 ? '+' : '';
        parts.push(`${sign}${mod.value} ${mod.source}`);
      }
      modsEl.textContent = parts.join(' ');
      section.appendChild(modsEl);
    }

    return section;
  }

  private appendToCurrentExchange(el: HTMLElement): void {
    const target = this.currentExchangeEl ?? this.contentEl;
    target.appendChild(el);
    this.contentEl.scrollTop = 0;
  }

  private animateSection(section: HTMLElement): void {
    // Make visible immediately — pacing comes from the fight-sequence delay in TurnBasedGame
    section.classList.add('visible');
  }

  skipAnimation(): void {
    this.cancelAnimations();
    const sections = this.contentEl.querySelectorAll('.dice-sidebar-section');
    sections.forEach((s) => s.classList.add('visible'));
  }

  private cancelAnimations(): void {
    for (const id of this.animationTimeouts) {
      clearTimeout(id);
    }
    this.animationTimeouts = [];
  }

  private showEmpty(): void {
    this.contentEl.innerHTML = `
      <div class="dice-sidebar-empty">
        <div class="dice-sidebar-empty-icon">\u2694</div>
        <div>No combat this turn</div>
      </div>
    `;
  }

  clear(): void {
    this.cancelAnimations();
    this._currentAttackerId = null;
    this._currentDefenderId = null;
    this.currentExchangeEl = null;
    this.currentExchangeFactions = null;
    this.nextExchangeFactions = null;
    this.exchangeCount = 0;
    this.showEmpty();
  }
}
