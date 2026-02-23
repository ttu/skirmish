import { GameEvent } from "../engine/types";
import { EntityId } from "../engine/types";

export class CombatLogUI {
  private container: HTMLElement;
  private logEl: HTMLElement;
  private maxEntries = 50;
  private entityNames: Map<EntityId, string> = new Map();

  constructor(getEntityName?: (id: EntityId) => string) {
    this.container = document.createElement("div");
    this.container.id = "combat-log";
    this.container.className = "combat-log";
    this.container.innerHTML = `
      <div class="combat-log-title">Combat Log</div>
      <div class="combat-log-entries"></div>
    `;
    // All styling now handled by CSS classes in index.html
    this.logEl = this.container.querySelector(".combat-log-entries")!;

    if (getEntityName) {
      this.getEntityName = getEntityName;
    }
  }

  private getEntityName = (id: EntityId): string => {
    return this.entityNames.get(id) ?? id;
  };

  setEntityName(id: EntityId, name: string): void {
    this.entityNames.set(id, name);
  }

  subscribeToEvents(
    subscribe: (type: GameEvent["type"], fn: (e: GameEvent) => void) => () => void
  ): void {
    const types: GameEvent["type"][] = [
      "AttackDeclared",
      "AttackRolled",
      "AttackOutOfRange",
      "DefenseRolled",
      "DamageDealt",
      "UnitDown",
      "UnitMoved",
      "MoraleChecked",
      "UnitShaken",
      "UnitBroken",
      "UnitRouted",
      "UnitRallied",
    ];

    for (const type of types) {
      subscribe(type, (e) => this.onEvent(e));
    }
  }

  private onEvent(event: GameEvent): void {
    const line = this.formatEvent(event);
    if (!line) return;

    const turn = event.turn + 1; // 1-based turn display
    const entry = document.createElement("div");
    entry.className = "combat-log-entry";
    entry.innerHTML = `<span style="color:var(--text-muted); font-size:10px;">[T${turn}]</span> ${line}`;
    // Base styling handled by CSS class

    // Color coding for different event types
    if (event.type === "UnitDown" || event.type === "UnitRouted") {
      entry.style.color = "var(--status-damage)";
      entry.style.borderLeftColor = "var(--status-damage)";
    } else if (event.type === "DamageDealt") {
      entry.style.color = "var(--status-warning)";
      entry.style.borderLeftColor = "var(--status-warning)";
    } else if (event.type === "UnitRallied") {
      entry.style.color = "var(--status-health)";
      entry.style.borderLeftColor = "var(--status-health)";
    } else if (event.type === "AttackOutOfRange") {
      entry.style.color = "var(--accent-gold)";
      entry.style.borderLeftColor = "var(--accent-gold)";
    }

    this.logEl.insertBefore(entry, this.logEl.firstChild);

    while (this.logEl.children.length > this.maxEntries) {
      this.logEl.removeChild(this.logEl.lastChild!);
    }
    this.logEl.scrollTop = 0;
  }

  private formatEvent(event: GameEvent): string {
    const data = event.data;
    const subject = event.entityId ? this.getEntityName(event.entityId) : "";
    const target = event.targetId ? this.getEntityName(event.targetId) : "";

    const who = subject || "?";
    switch (event.type) {
      case "AttackDeclared":
        return `${who} attacks ${target}`;
      case "AttackRolled": {
        const roll = data.roll as number;
        const skill = data.effectiveSkill as number;
        const hit = data.hit as boolean;
        return `${who}: roll ${roll} vs ${skill} → ${hit ? "HIT" : "MISS"}`;
      }
      case "AttackOutOfRange": {
        const dist = (data.distance as number).toFixed(1);
        return `⚠ ${who} → ${target}: OUT OF RANGE (${dist}m)`;
      }
      case "DefenseRolled": {
        const roll = data.roll as number;
        const skill = data.effectiveSkill as number;
        const success = data.success as boolean;
        return `${who}: defense ${roll} vs ${skill} → ${success ? "BLOCKED" : "failed"}`;
      }
      case "DamageDealt": {
        const dmg = data.damage as number;
        const loc = data.location as string;
        const victim = target || "?";
        return `${who} → ${dmg} damage to ${victim} (${loc}); HP: ${data.newHealth}`;
      }
      case "UnitDown":
        return `☠ ${who} has fallen`;
      case "UnitMoved":
        return `${who} moved`;
      case "MoraleChecked": {
        const passed = data.passed as boolean;
        return `${who} morale: ${passed ? "passed" : "failed"}`;
      }
      case "UnitShaken":
        return `${who} is shaken`;
      case "UnitBroken":
        return `${who} breaks and retreats`;
      case "UnitRouted":
        return `${who} routs!`;
      case "UnitRallied":
        return `${who} rallies`;
      default:
        return "";
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }

  show(): void {
    this.container.style.display = "block";
  }

  hide(): void {
    this.container.style.display = "none";
  }

  clear(): void {
    this.logEl.innerHTML = "";
  }
}
