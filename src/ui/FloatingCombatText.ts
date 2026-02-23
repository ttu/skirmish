import * as THREE from 'three';
import { GameEvent, EntityId } from '../engine/types';

export interface FloatingTextConfig {
  text: string;
  color: string;
  fontSize?: number;
  duration?: number;
  offsetY?: number;
}

interface ActiveFloatingText {
  sprite: THREE.Sprite;
  startTime: number;
  duration: number;
  startY: number;
  floatHeight: number;
}

export class FloatingCombatText {
  private scene: THREE.Scene;
  private activeTexts: ActiveFloatingText[] = [];
  private entityPositions: Map<EntityId, { x: number; z: number }> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Update entity positions so we know where to spawn text
   */
  updateEntityPosition(entityId: EntityId, x: number, z: number): void {
    this.entityPositions.set(entityId, { x, z });
  }

  /**
   * Show floating text at an entity's position
   */
  showAtEntity(entityId: EntityId, config: FloatingTextConfig): void {
    const pos = this.entityPositions.get(entityId);
    if (!pos) return;
    this.showAtPosition(pos.x, pos.z, config);
  }

  /**
   * Show floating text at a world position
   */
  showAtPosition(x: number, z: number, config: FloatingTextConfig): void {
    const {
      text,
      color,
      fontSize = 24,
      duration = 1500,
      offsetY = 0,
    } = config;

    const sprite = this.createTextSprite(text, color, fontSize);
    const startY = 1.2 + offsetY;
    sprite.position.set(x, startY, z);
    this.scene.add(sprite);

    this.activeTexts.push({
      sprite,
      startTime: performance.now(),
      duration,
      startY,
      floatHeight: 1.5,
    });
  }

  /**
   * Create a text sprite
   */
  private createTextSprite(text: string, color: string, fontSize: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext('2d')!;

    // Draw text with outline for visibility
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Black outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, size / 2, canvas.height / 2);

    // Colored fill
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 1, 1);
    return sprite;
  }

  /**
   * Update animations - call this every frame
   */
  update(): void {
    const now = performance.now();
    const remaining: ActiveFloatingText[] = [];

    for (const ft of this.activeTexts) {
      const elapsed = now - ft.startTime;
      const progress = Math.min(elapsed / ft.duration, 1);

      // Float upward with easing
      const eased = 1 - Math.pow(1 - progress, 3);
      ft.sprite.position.y = ft.startY + ft.floatHeight * eased;

      // Fade out in the last 40% of the animation
      const fadeStart = 0.6;
      if (progress > fadeStart) {
        const fadeProgress = (progress - fadeStart) / (1 - fadeStart);
        (ft.sprite.material as THREE.SpriteMaterial).opacity = 1 - fadeProgress;
      }

      if (progress < 1) {
        remaining.push(ft);
      } else {
        // Clean up
        this.scene.remove(ft.sprite);
        (ft.sprite.material as THREE.SpriteMaterial).map?.dispose();
        (ft.sprite.material as THREE.SpriteMaterial).dispose();
      }
    }

    this.activeTexts = remaining;
  }

  /**
   * Handle a game event and show appropriate text
   */
  handleEvent(event: GameEvent): void {
    const entityId = event.entityId;
    const targetId = event.targetId;

    switch (event.type) {
      case 'AttackRolled': {
        const hit = event.data.hit as boolean;
        const roll = event.data.roll as number;
        if (!hit && entityId) {
          this.showAtEntity(entityId, {
            text: `MISS (${roll})`,
            color: '#888888',
            fontSize: 20,
          });
        }
        break;
      }

      case 'DefenseRolled': {
        const success = event.data.success as boolean;
        const defenseType = event.data.defenseType as string;
        if (success && entityId) {
          const label = defenseType === 'block' ? 'BLOCKED' :
                       defenseType === 'parry' ? 'PARRIED' : 'DODGED';
          this.showAtEntity(entityId, {
            text: label,
            color: '#4fc3f7',
            fontSize: 22,
          });
        }
        break;
      }

      case 'DamageDealt': {
        const damage = event.data.damage as number;
        const location = event.data.location as string;
        if (targetId && damage > 0) {
          // Show damage number at target
          this.showAtEntity(targetId, {
            text: `-${damage}`,
            color: damage >= 20 ? '#ff3333' : damage >= 10 ? '#ff6b6b' : '#ffaa66',
            fontSize: damage >= 20 ? 32 : damage >= 10 ? 28 : 24,
            offsetY: 0.2,
          });

          // Show hit location
          this.showAtEntity(targetId, {
            text: location.toUpperCase(),
            color: '#ffd700',
            fontSize: 16,
            offsetY: -0.3,
            duration: 1200,
          });
        }
        break;
      }

      case 'AttackOutOfRange': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'OUT OF RANGE',
            color: '#ffc107',
            fontSize: 18,
          });
        }
        break;
      }

      case 'UnitDown': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'DEFEATED',
            color: '#f44336',
            fontSize: 26,
            duration: 2000,
          });
        }
        break;
      }

      case 'UnitShaken': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'SHAKEN',
            color: '#ff9800',
            fontSize: 20,
          });
        }
        break;
      }

      case 'UnitBroken': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'BROKEN',
            color: '#f44336',
            fontSize: 22,
          });
        }
        break;
      }

      case 'UnitRouted': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'ROUTED!',
            color: '#d32f2f',
            fontSize: 26,
            duration: 2000,
          });
        }
        break;
      }

      case 'UnitRallied': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'RALLIED',
            color: '#4caf50',
            fontSize: 22,
          });
        }
        break;
      }

      case 'StaminaDrained': {
        const amount = event.data.amount as number;
        if (entityId && amount > 0) {
          this.showAtEntity(entityId, {
            text: `-${amount} STA`,
            color: '#9e9e9e',
            fontSize: 16,
            offsetY: 0.5,
            duration: 1000,
          });
        }
        break;
      }

      case 'Exhausted': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'EXHAUSTED',
            color: '#757575',
            fontSize: 20,
          });
        }
        break;
      }

      case 'OverwatchSet': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'OVERWATCH',
            color: '#9c27b0',
            fontSize: 20,
            duration: 1200,
          });
        }
        break;
      }

      case 'OverwatchTriggered': {
        if (entityId) {
          this.showAtEntity(entityId, {
            text: 'OVERWATCH!',
            color: '#e91e63',
            fontSize: 24,
            duration: 1000,
          });
        }
        break;
      }
    }
  }

  /**
   * Clear all active floating texts
   */
  clear(): void {
    for (const ft of this.activeTexts) {
      this.scene.remove(ft.sprite);
      (ft.sprite.material as THREE.SpriteMaterial).map?.dispose();
      (ft.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.activeTexts = [];
    this.entityPositions.clear();
  }
}
