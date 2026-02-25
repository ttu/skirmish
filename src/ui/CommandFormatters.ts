import { EntityId } from '../engine/types';
import {
  MoveCommand,
  AttackCommand,
  DefendCommand,
  OverwatchCommand,
  UnitCommand,
  CommandCondition,
} from '../engine/components';

export interface FormattedCommand {
  index: number;
  title: string;
  detail: string;
  apCost: number;
  priority: number;
  tooltip: string;
  condition?: string;
}

/** Pre-extracted data for formatting commands (no ECS access needed). */
export interface CommandFormatterInput {
  commands: UnitCommand[];
  position: { x: number; y: number };
  weaponName?: string;
  weaponDamage?: { dice: number; sides: number; bonus: number };
  /** Pre-resolved display names for attack target entity IDs. */
  targetNames: Map<EntityId, string>;
}

// --- Local pure utilities (avoid engine import) ---

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

interface ModeCost {
  apCost: number;
  speedMultiplier: number;
  staminaCost: number;
}

function getModeCost(mode: string): ModeCost {
  switch (mode) {
    case 'hold':
      return { apCost: 0, speedMultiplier: 0, staminaCost: 0 };
    case 'walk':
      return { apCost: 1, speedMultiplier: 0.25, staminaCost: 0 };
    case 'advance':
      return { apCost: 2, speedMultiplier: 0.5, staminaCost: 0 };
    case 'run':
      return { apCost: 4, speedMultiplier: 0.75, staminaCost: 1 };
    case 'sprint':
      return { apCost: Infinity, speedMultiplier: 1.0, staminaCost: 3 };
    default:
      return { apCost: 1, speedMultiplier: 0.25, staminaCost: 0 };
  }
}

// --- Formatters ---

function formatCondition(condition?: CommandCondition): string | undefined {
  if (!condition) return undefined;

  switch (condition.type) {
    case 'targetDead':
      return 'if target dead';
    case 'inRange':
      return `if within ${condition.params.range}m`;
    case 'hpBelow':
      return `if HP < ${condition.params.threshold}`;
    case 'enemyApproaches':
      return 'if enemy approaches';
    default:
      return undefined;
  }
}

function formatMoveCommand(cmd: MoveCommand, index: number, fromX: number, fromY: number): FormattedCommand {
  const dist = distance(fromX, fromY, cmd.targetX, cmd.targetY);
  const modeName = cmd.mode.charAt(0).toUpperCase() + cmd.mode.slice(1);
  const modeCost = getModeCost(cmd.mode);

  let tooltip = `${modeName} movement\n`;
  tooltip += `Base cost: ${modeCost.apCost === Infinity ? 'all AP' : modeCost.apCost + ' AP'}\n`;
  tooltip += `Speed: ${Math.round(modeCost.speedMultiplier * 100)}% of base\n`;
  if (modeCost.staminaCost > 0) {
    tooltip += `Stamina cost: ${modeCost.staminaCost}`;
  }
  tooltip += `\nPriority: ${cmd.priority} (lower = faster)`;

  return {
    index,
    title: `Move (${cmd.mode})`,
    detail: `→ ${dist.toFixed(1)}m`,
    apCost: cmd.apCost,
    priority: cmd.priority,
    tooltip,
    condition: formatCondition(cmd.condition),
  };
}

function formatAttackCommand(
  cmd: AttackCommand,
  index: number,
  targetName: string,
  weaponName?: string,
  weaponDamage?: { dice: number; sides: number; bonus: number }
): FormattedCommand {
  let tooltip = `${cmd.attackType.charAt(0).toUpperCase() + cmd.attackType.slice(1)} attack\n`;
  tooltip += `Target: ${targetName}\n`;
  tooltip += `AP cost: ${cmd.apCost}`;
  if (weaponName) {
    tooltip += `\nWeapon: ${weaponName}`;
  }
  if (weaponDamage) {
    tooltip += `\nDamage: ${weaponDamage.dice}d${weaponDamage.sides}+${weaponDamage.bonus}`;
  }
  tooltip += `\nPriority: ${cmd.priority} (lower = faster)`;

  return {
    index,
    title: `Attack ${targetName}`,
    detail: `→ ${cmd.attackType}${weaponName ? ', ' + weaponName : ''}`,
    apCost: cmd.apCost,
    priority: cmd.priority,
    tooltip,
    condition: formatCondition(cmd.condition),
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
    (info.reactions > 0 ? `+${info.reactions} extra reaction(s)` : 'No extra reactions') +
    `\nPriority: ${cmd.priority} (lower = faster)`;

  return {
    index,
    title: `Defend (${cmd.defenseType})`,
    detail: `→ +${info.bonus}% def${info.reactions > 0 ? `, +${info.reactions} react` : ''}`,
    apCost: cmd.apCost,
    priority: cmd.priority,
    tooltip,
    condition: formatCondition(cmd.condition),
  };
}

function formatOverwatchCommand(cmd: OverwatchCommand, index: number): FormattedCommand {
  const typeLabel = cmd.attackType.charAt(0).toUpperCase() + cmd.attackType.slice(1);

  const tooltip = `Overwatch stance (${cmd.attackType})\n` +
    `Attack enemies that move into range\n` +
    `+20% accuracy bonus on triggered attack\n` +
    `Priority: ${cmd.priority} (lower = faster)`;

  return {
    index,
    title: `Overwatch (${typeLabel})`,
    detail: `→ React to enemies entering range`,
    apCost: cmd.apCost,
    priority: cmd.priority,
    tooltip,
    condition: formatCondition(cmd.condition),
  };
}

export function formatQueuedCommands(input: CommandFormatterInput): FormattedCommand[] {
  const { commands, position, weaponName, weaponDamage, targetNames } = input;

  if (!commands.length) return [];

  // Sort by priority to show execution order (lower = faster = executes first)
  const sortedCommands = [...commands].sort((a, b) => a.priority - b.priority);

  // First pass: calculate positions after all moves (in original order for position tracking)
  const movePositions = new Map<UnitCommand, { fromX: number; fromY: number }>();
  let trackX = position.x;
  let trackY = position.y;
  for (const cmd of commands) {
    if (cmd.type === 'move') {
      movePositions.set(cmd, { fromX: trackX, fromY: trackY });
      const moveCmd = cmd as MoveCommand;
      trackX = moveCmd.targetX;
      trackY = moveCmd.targetY;
    }
  }

  const formatted: FormattedCommand[] = [];

  for (let i = 0; i < sortedCommands.length; i++) {
    const cmd = sortedCommands[i];

    switch (cmd.type) {
      case 'move': {
        const moveCmd = cmd as MoveCommand;
        const positions = movePositions.get(cmd) ?? { fromX: position.x, fromY: position.y };
        formatted.push(formatMoveCommand(moveCmd, i + 1, positions.fromX, positions.fromY));
        break;
      }
      case 'attack': {
        const attackCmd = cmd as AttackCommand;
        const name = targetNames.get(attackCmd.targetId) ?? 'Unknown';
        formatted.push(formatAttackCommand(attackCmd, i + 1, name, weaponName, weaponDamage));
        break;
      }
      case 'defend': {
        formatted.push(formatDefendCommand(cmd as DefendCommand, i + 1));
        break;
      }
      case 'overwatch': {
        formatted.push(formatOverwatchCommand(cmd as OverwatchCommand, i + 1));
        break;
      }
      default: {
        formatted.push({
          index: i + 1,
          title: cmd.type.charAt(0).toUpperCase() + cmd.type.slice(1),
          detail: '',
          apCost: cmd.apCost,
          priority: cmd.priority,
          tooltip: `${cmd.type} command\nPriority: ${cmd.priority}`,
          condition: formatCondition(cmd.condition),
        });
      }
    }
  }

  return formatted;
}

export function renderCommandList(
  commands: FormattedCommand[],
  currentAp: number,
  showRemoveButtons: boolean = false
): string {
  if (commands.length === 0) {
    return '<div style="color:#666; font-style:italic">No commands queued</div>';
  }

  const totalAp = commands.reduce((sum, c) => sum + c.apCost, 0);
  const overBudget = totalAp > currentAp;

  let html = `<div class="command-list-header">Queued Commands (${totalAp} AP)</div>`;
  html += `<div class="command-list-subheader">Sorted by execution order (speed)</div>`;

  if (overBudget) {
    html += `<div class="ap-warning">⚠ ${totalAp} AP queued, only ${currentAp} available</div>`;
  }

  html += '<div class="command-list">';

  for (const cmd of commands) {
    const tooltipText = cmd.tooltip.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    const conditionHtml = cmd.condition
      ? `<span class="command-condition">[${cmd.condition}]</span>`
      : '';
    const removeBtn = showRemoveButtons
      ? `<button class="cmd-remove-btn" data-cmd-idx="${cmd.index - 1}">×</button>`
      : '';

    html += `
      <div class="command-item" title="${tooltipText}">
        ${removeBtn}
        <span class="command-index">${cmd.index}.</span>
        <span class="command-title">${cmd.title}</span>
        <span class="command-ap">${cmd.apCost} AP</span>
        ${conditionHtml}
        <div class="command-detail">${cmd.detail}</div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}
