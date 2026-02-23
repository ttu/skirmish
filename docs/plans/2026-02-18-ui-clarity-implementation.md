# UI Clarity Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add detailed command queue display, combat status badges, and enhanced visual indicators to help players understand unit actions and AP costs.

**Architecture:** Extend TurnBasedGame.ts with new UI rendering methods. Add helper functions for combat status calculation. Enhance 3D preview with range indicators and attack lines.

**Tech Stack:** TypeScript, Three.js, vanilla HTML/CSS for UI panels

---

## Task 1: Add Combat Status Helper Functions

**Files:**
- Create: `src/ui/CombatStatusHelpers.ts`

**Description:** Create helper functions to calculate combat status badges (In Melee, Will Charge, Engaged, Exhausted).

**Code:**

```typescript
// src/ui/CombatStatusHelpers.ts
import { WorldImpl } from '../engine/ecs/World';
import { EntityId } from '../engine/types';
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  StaminaComponent,
  EngagementComponent,
  CommandQueueComponent,
  WeaponComponent,
} from '../engine/components';
import { MovementSystem } from '../engine/systems/MovementSystem';

export interface CombatStatus {
  inMelee: boolean;
  willCharge: boolean;
  engaged: boolean;
  exhausted: boolean;
  engagedEnemyIds: EntityId[];
}

export function getCombatStatus(world: WorldImpl, entityId: EntityId): CombatStatus {
  const status: CombatStatus = {
    inMelee: false,
    willCharge: false,
    engaged: false,
    exhausted: false,
    engagedEnemyIds: [],
  };

  const pos = world.getComponent<PositionComponent>(entityId, 'position');
  const faction = world.getComponent<FactionComponent>(entityId, 'faction');
  const stamina = world.getComponent<StaminaComponent>(entityId, 'stamina');
  const engagement = world.getComponent<EngagementComponent>(entityId, 'engagement');
  const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');

  if (!pos || !faction) return status;

  // Check exhausted
  if (stamina?.exhausted) {
    status.exhausted = true;
  }

  // Check engagement with enemies
  const allUnits = world.query('position', 'faction', 'health');
  for (const otherId of allUnits) {
    if (otherId === entityId) continue;
    const otherFaction = world.getComponent<FactionComponent>(otherId, 'faction');
    const otherHealth = world.getComponent<HealthComponent>(otherId, 'health');
    if (otherFaction?.faction === faction.faction) continue;
    if (otherHealth?.woundState === 'down') continue;

    const otherPos = world.getComponent<PositionComponent>(otherId, 'position');
    if (!otherPos) continue;

    const distance = MovementSystem.calculateDistance(pos.x, pos.y, otherPos.x, otherPos.y);

    // In melee range (can attack)
    if (distance <= MovementSystem.MELEE_ATTACK_RANGE) {
      status.inMelee = true;
      status.engagedEnemyIds.push(otherId);
    }
    // In engagement range (leaving triggers free attack)
    else if (distance <= MovementSystem.ENGAGEMENT_RANGE) {
      status.engaged = true;
      status.engagedEnemyIds.push(otherId);
    }
  }

  // Check if will charge (has move + attack to same target)
  if (queue?.commands.length) {
    const hasMoveCmd = queue.commands.some(c => c.type === 'move');
    const attackCmd = queue.commands.find(c => c.type === 'attack');
    if (hasMoveCmd && attackCmd) {
      status.willCharge = true;
    }
  }

  return status;
}

export function renderCombatStatusBadges(status: CombatStatus): string {
  const badges: string[] = [];

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

  return badges.length > 0 ? badges.join(' ') : '<span style="color:#666">—</span>';
}
```

---

## Task 2: Add Command Formatting Helpers

**Files:**
- Create: `src/ui/CommandFormatters.ts`

**Description:** Create functions to format queued commands with details and tooltips.

**Code:**

```typescript
// src/ui/CommandFormatters.ts
import { WorldImpl } from '../engine/ecs/World';
import { EntityId } from '../engine/types';
import {
  UnitCommand,
  MoveCommand,
  AttackCommand,
  DefendCommand,
  IdentityComponent,
  WeaponComponent,
  PositionComponent,
  CommandQueueComponent,
} from '../engine/components';
import { MovementSystem } from '../engine/systems/MovementSystem';

export interface FormattedCommand {
  index: number;
  title: string;
  detail: string;
  apCost: number;
  tooltip: string;
}

function getEntityDisplayName(world: WorldImpl, entityId: EntityId): string {
  const identity = world.getComponent<IdentityComponent>(entityId, 'identity');
  if (!identity) return 'Unknown';
  const typeName = identity.unitType.charAt(0).toUpperCase() + identity.unitType.slice(1);
  return identity.shortId != null ? `${typeName} #${identity.shortId}` : identity.name;
}

function formatMoveCommand(cmd: MoveCommand, index: number, fromX: number, fromY: number): FormattedCommand {
  const distance = MovementSystem.calculateDistance(fromX, fromY, cmd.targetX, cmd.targetY);
  const modeName = cmd.mode.charAt(0).toUpperCase() + cmd.mode.slice(1);
  const modeCost = MovementSystem.getMovementModeCost(cmd.mode);

  let tooltip = `${modeName} movement\n`;
  tooltip += `Base cost: ${modeCost.apCost === Infinity ? 'all AP' : modeCost.apCost + ' AP'}\n`;
  tooltip += `Speed: ${Math.round(modeCost.speedMultiplier * 100)}% of base\n`;
  if (modeCost.staminaCost > 0) {
    tooltip += `Stamina cost: ${modeCost.staminaCost}`;
  }

  return {
    index,
    title: `Move (${cmd.mode})`,
    detail: `→ ${distance.toFixed(1)}m`,
    apCost: cmd.apCost,
    tooltip,
  };
}

function formatAttackCommand(
  world: WorldImpl,
  cmd: AttackCommand,
  index: number
): FormattedCommand {
  const targetName = getEntityDisplayName(world, cmd.targetId);
  const weapon = world.getComponent<WeaponComponent>(cmd.targetId, 'weapon');

  // Get attacker's weapon for tooltip
  let tooltip = `${cmd.attackType.charAt(0).toUpperCase() + cmd.attackType.slice(1)} attack\n`;
  tooltip += `Target: ${targetName}\n`;
  tooltip += `AP cost: ${cmd.apCost}`;

  return {
    index,
    title: `Attack ${targetName}`,
    detail: `→ ${cmd.attackType}`,
    apCost: cmd.apCost,
    tooltip,
  };
}

function formatDefendCommand(cmd: DefendCommand, index: number): FormattedCommand {
  const bonusMap: Record<number, { bonus: number; reactions: number }> = {
    1: { bonus: 10, reactions: 0 },
    2: { bonus: 20, reactions: 1 },
    3: { bonus: 30, reactions: 2 },
  };
  const info = bonusMap[cmd.apCost] || { bonus: 10, reactions: 0 };

  const tooltip = `Defensive stance (${cmd.defenseType})\n` +
    `+${info.bonus}% to defense rolls\n` +
    (info.reactions > 0 ? `+${info.reactions} extra reaction(s)` : 'No extra reactions');

  return {
    index,
    title: `Defend (${cmd.defenseType})`,
    detail: `→ +${info.bonus}% def${info.reactions > 0 ? `, +${info.reactions} react` : ''}`,
    apCost: cmd.apCost,
    tooltip,
  };
}

export function formatQueuedCommands(
  world: WorldImpl,
  entityId: EntityId
): FormattedCommand[] {
  const queue = world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
  const pos = world.getComponent<PositionComponent>(entityId, 'position');

  if (!queue?.commands.length || !pos) return [];

  const formatted: FormattedCommand[] = [];
  let currentX = pos.x;
  let currentY = pos.y;

  for (let i = 0; i < queue.commands.length; i++) {
    const cmd = queue.commands[i];

    switch (cmd.type) {
      case 'move': {
        const moveCmd = cmd as MoveCommand;
        formatted.push(formatMoveCommand(moveCmd, i + 1, currentX, currentY));
        currentX = moveCmd.targetX;
        currentY = moveCmd.targetY;
        break;
      }
      case 'attack': {
        formatted.push(formatAttackCommand(world, cmd as AttackCommand, i + 1));
        break;
      }
      case 'defend': {
        formatted.push(formatDefendCommand(cmd as DefendCommand, i + 1));
        break;
      }
      default: {
        formatted.push({
          index: i + 1,
          title: cmd.type.charAt(0).toUpperCase() + cmd.type.slice(1),
          detail: '',
          apCost: cmd.apCost,
          tooltip: `${cmd.type} command`,
        });
      }
    }
  }

  return formatted;
}

export function renderCommandList(commands: FormattedCommand[]): string {
  if (commands.length === 0) {
    return '<div style="color:#666; font-style:italic">No commands queued</div>';
  }

  const totalAp = commands.reduce((sum, c) => sum + c.apCost, 0);

  let html = `<div class="command-list-header">Queued Commands (${totalAp} AP)</div>`;
  html += '<div class="command-list">';

  for (const cmd of commands) {
    html += `
      <div class="command-item" title="${cmd.tooltip.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}">
        <span class="command-index">${cmd.index}.</span>
        <span class="command-title">${cmd.title}</span>
        <span class="command-ap">${cmd.apCost} AP</span>
        <div class="command-detail">${cmd.detail}</div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}
```

---

## Task 3: Add CSS Styles for UI Components

**Files:**
- Modify: `index.html` (add styles in `<style>` tag)

**Description:** Add CSS for combat status badges and command list styling.

**CSS to add:**

```css
/* Combat Status Badges */
.status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.badge-in-melee {
  background: #c62828;
  color: #fff;
}

.badge-will-charge {
  background: #ef6c00;
  color: #fff;
}

.badge-engaged {
  background: #f9a825;
  color: #000;
}

.badge-exhausted {
  background: #616161;
  color: #fff;
}

/* Command List */
.command-list-header {
  color: #ffd700;
  font-weight: bold;
  margin-top: 10px;
  margin-bottom: 6px;
  padding-top: 8px;
  border-top: 1px solid #4a4a6a;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.command-item {
  background: rgba(255,255,255,0.05);
  padding: 6px 8px;
  border-radius: 4px;
  border-left: 3px solid #4a90d9;
  cursor: help;
}

.command-item:hover {
  background: rgba(255,255,255,0.1);
}

.command-index {
  color: #888;
  margin-right: 4px;
}

.command-title {
  color: #e0e0e0;
}

.command-ap {
  float: right;
  color: #ffd700;
  font-weight: bold;
}

.command-detail {
  color: #888;
  font-size: 11px;
  margin-top: 2px;
  margin-left: 16px;
}

/* Clear Commands Button */
.clear-commands-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: #5a3a3a;
  border: 1px solid #8a4a4a;
  color: #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  width: 100%;
}

.clear-commands-btn:hover {
  background: #7a4a4a;
}

.clear-commands-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* AP Warning */
.ap-warning {
  color: #ff6b6b;
  font-size: 11px;
  margin-top: 4px;
}
```

---

## Task 4: Update TurnBasedGame Selection Panel

**Files:**
- Modify: `src/game/TurnBasedGame.ts`

**Description:** Update `updateTurnBasedUI()` to use the new helpers and render combat status badges + command list.

**Changes:**

1. Add imports at top:
```typescript
import { getCombatStatus, renderCombatStatusBadges } from '../ui/CombatStatusHelpers';
import { formatQueuedCommands, renderCommandList } from '../ui/CommandFormatters';
```

2. Update `updateTurnBasedUI()` method for player unit display (around line 872-903).

---

## Task 5: Add Clear Commands Functionality

**Files:**
- Modify: `src/game/TurnBasedGame.ts`
- Modify: `src/engine/core/GameEngine.ts`

**Description:** Add method to clear all queued commands for a unit and wire up the Clear Commands button.

**GameEngine addition:**
```typescript
clearCommands(entityId: EntityId): void {
  const queue = this.world.getComponent<CommandQueueComponent>(entityId, 'commandQueue');
  if (queue) {
    this.world.addComponent<CommandQueueComponent>(entityId, {
      type: 'commandQueue',
      commands: [],
      currentCommandIndex: 0,
    });
  }
}
```

---

## Task 6: Add Enhanced Visual Preview Indicators

**Files:**
- Modify: `src/game/TurnBasedGame.ts`

**Description:** Enhance `updateCommandPreview()` to show:
- Yellow dashed circle for post-move range
- Red lines for attack commands with sword icon
- Attack count indicator for multiple attacks

---

## Task 7: Add Keyboard Shortcuts

**Files:**
- Modify: `src/game/TurnBasedGame.ts`

**Description:** Add Escape to clear commands, Backspace to remove last command.

---

## Task 8: Update Enemy Info Panel

**Files:**
- Modify: `src/game/TurnBasedGame.ts`

**Description:** Add distance and in-range indicator to enemy info panel.

---

## Summary

The implementation creates:
1. `CombatStatusHelpers.ts` - Combat status calculation
2. `CommandFormatters.ts` - Command display formatting
3. CSS styles in index.html
4. Updated selection panel in TurnBasedGame.ts
5. Clear commands button + keyboard shortcuts
6. Enhanced 3D visual previews
7. Updated enemy info panel
