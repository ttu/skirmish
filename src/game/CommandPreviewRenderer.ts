import * as THREE from "three";
import {
  PositionComponent,
  CommandQueueComponent,
  HealthComponent,
  WeaponComponent,
} from "../engine/components";
import { MovementSystem } from "../engine/systems/MovementSystem";
import { Pathfinder } from "../engine/systems/Pathfinder";
import { EntityId } from "../engine/types";
import { GameContext } from "./GameContext";

export class CommandPreviewRenderer {
  private readonly previewGroup: THREE.Group = new THREE.Group();
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.ctx.scene.add(this.previewGroup);
  }

  update(): void {
    this.clear();
    if (this.ctx.engine.getPhase() !== "planning") return;

    const world = this.ctx.engine.getWorld();
    const loaded = this.ctx.engine.getLoadedScenario();
    if (!loaded) return;

    const selectedEntityId = this.ctx.getSelectedEntityId();
    const lastMoveDestByUnit = this.ctx.getLastMoveDestinationByUnit();

    // Show commands for ALL player units, not just the selected one
    for (const unitId of loaded.playerUnitIds) {
      const pos = world.getComponent<PositionComponent>(unitId, "position");
      const queue = world.getComponent<CommandQueueComponent>(unitId, "commandQueue");
      const health = world.getComponent<HealthComponent>(unitId, "health");
      if (!pos || health?.woundState === "down") continue;
      if (!queue || queue.commands.length === 0) continue;

      // Use brighter colors for selected unit, dimmer for others
      const isSelected = unitId === selectedEntityId;
      const moveOpacity = isSelected ? 0.8 : 0.4;
      const attackOpacity = isSelected ? 0.8 : 0.4;
      const markerOpacity = isSelected ? 0.8 : 0.5;

      let lastX = pos.x;
      let lastZ = pos.y;

      // Track attack targets for counting multiple attacks
      const attacksByTarget = new Map<EntityId, number>();

      for (const cmd of queue.commands) {
        if (cmd.type === "move") {
          // Use the stored full A* path to draw the current-turn portion accurately
          const storedDest = lastMoveDestByUnit.get(unitId);
          const storedPath = storedDest?.fullPath;

          const points: THREE.Vector3[] = [];

          if (storedPath && storedPath.length >= 2) {
            // Walk along the stored A* path and collect points up to the move target
            const turnEndX = cmd.targetX;
            const turnEndY = cmd.targetY;
            const moveDistance = MovementSystem.calculateDistance(lastX, lastZ, turnEndX, turnEndY);

            // Collect path segments up to the move distance along the path
            let distAccum = 0;
            points.push(new THREE.Vector3(storedPath[0].x, 0.12, storedPath[0].y));
            for (let i = 1; i < storedPath.length; i++) {
              const segLen = MovementSystem.calculateDistance(
                storedPath[i - 1].x, storedPath[i - 1].y,
                storedPath[i].x, storedPath[i].y
              );
              if (distAccum + segLen >= moveDistance) {
                // Turn endpoint falls on this segment
                points.push(new THREE.Vector3(turnEndX, 0.12, turnEndY));
                break;
              }
              distAccum += segLen;
              points.push(new THREE.Vector3(storedPath[i].x, 0.12, storedPath[i].y));
            }
            // Ensure we end at the turn target
            if (points.length >= 1) {
              const last = points[points.length - 1];
              if (MovementSystem.calculateDistance(last.x, last.z, turnEndX, turnEndY) > 0.3) {
                points.push(new THREE.Vector3(turnEndX, 0.12, turnEndY));
              }
            }
          } else {
            // No stored path — straight line (single-turn move or no multi-turn dest)
            points.push(
              new THREE.Vector3(lastX, 0.12, lastZ),
              new THREE.Vector3(cmd.targetX, 0.12, cmd.targetY),
            );
          }

          const geom = new THREE.BufferGeometry().setFromPoints(points);
          const lineMat = new THREE.LineDashedMaterial({
            color: 0x4fc3f7,
            dashSize: 0.25,
            gapSize: 0.12,
            transparent: true,
            opacity: moveOpacity,
          });
          const line = new THREE.Line(geom, lineMat);
          line.computeLineDistances();
          this.previewGroup.add(line);

          // Destination marker
          const destMarker = this.createDestinationMarker(cmd.targetX, cmd.targetY, markerOpacity);
          this.previewGroup.add(destMarker);

          // Only show AP labels for selected unit to reduce clutter
          if (isSelected) {
            const midX = (lastX + cmd.targetX) / 2;
            const midZ = (lastZ + cmd.targetY) / 2;
            const apSprite = this.createAPLabelSprite(
              cmd.apCost,
              midX,
              midZ,
              cmd.mode
            );
            this.previewGroup.add(apSprite);
          }

          lastX = cmd.targetX;
          lastZ = cmd.targetY;
        } else if (cmd.type === "attack") {
          const count = (attacksByTarget.get(cmd.targetId) ?? 0) + 1;
          attacksByTarget.set(cmd.targetId, count);
        }
      }

      // Draw attack lines with count indicator
      for (const [targetId, count] of attacksByTarget) {
        const targetPos = world.getComponent<PositionComponent>(targetId, "position");
        if (targetPos) {
          const attackPoints = [
            new THREE.Vector3(lastX, 0.14, lastZ),
            new THREE.Vector3(targetPos.x, 0.14, targetPos.y),
          ];
          const geom = new THREE.BufferGeometry().setFromPoints(attackPoints);
          const attackMat = new THREE.LineDashedMaterial({
            color: 0xef5350,
            dashSize: 0.3,
            gapSize: 0.15,
            transparent: true,
            opacity: attackOpacity,
          });
          const line = new THREE.Line(geom, attackMat);
          line.computeLineDistances();
          this.previewGroup.add(line);

          // Only show attack indicators for selected unit to reduce clutter
          if (isSelected) {
            const midX = (lastX + targetPos.x) / 2;
            const midZ = (lastZ + targetPos.y) / 2;
            const attackSprite = this.createAttackIndicatorSprite(count, midX, midZ);
            this.previewGroup.add(attackSprite);
          }
        }
      }

      // Add post-move range circle only for selected unit (shows weapon range)
      if (isSelected && (lastX !== pos.x || lastZ !== pos.y)) {
        const weapon = world.getComponent<WeaponComponent>(unitId, "weapon");
        const meleeRange = weapon?.range ?? 1.2;
        const postMoveRangeCircle = this.createRangeCircle(
          lastX,
          lastZ,
          meleeRange,
          0xffcc00,
          true // dashed
        );
        this.previewGroup.add(postMoveRangeCircle);
      }

      // Draw faded path to final multi-turn destination (only for selected unit)
      if (isSelected) {
        const finalDest = lastMoveDestByUnit.get(unitId);
        if (finalDest) {
          const distToFinal = MovementSystem.calculateDistance(lastX, lastZ, finalDest.x, finalDest.y);
          if (distToFinal > 0.5) {
            const pathPoints: THREE.Vector3[] = [];

            if (finalDest.fullPath && finalDest.fullPath.length >= 2) {
              // Walk along the stored path, skipping segments until we pass the turn endpoint,
              // then collect the remaining segments to the final destination
              const moveDistFromStart = Pathfinder.pathLength(finalDest.fullPath) - distToFinal;
              let distAccum = 0;
              let started = false;

              for (let i = 1; i < finalDest.fullPath.length; i++) {
                const segLen = MovementSystem.calculateDistance(
                  finalDest.fullPath[i - 1].x, finalDest.fullPath[i - 1].y,
                  finalDest.fullPath[i].x, finalDest.fullPath[i].y
                );

                if (!started) {
                  if (distAccum + segLen >= moveDistFromStart - 0.1) {
                    // Turn endpoint falls on or just past this segment
                    started = true;
                    pathPoints.push(new THREE.Vector3(lastX, 0.12, lastZ));
                    pathPoints.push(new THREE.Vector3(finalDest.fullPath[i].x, 0.12, finalDest.fullPath[i].y));
                  }
                  distAccum += segLen;
                } else {
                  pathPoints.push(new THREE.Vector3(finalDest.fullPath[i].x, 0.12, finalDest.fullPath[i].y));
                }
              }
            }

            // Fallback if stored path extraction didn't produce enough points
            if (pathPoints.length < 2) {
              pathPoints.length = 0;
              // Compute fresh A* from turn endpoint to final destination
              const mapSize = this.ctx.engine.getLoadedScenario()?.mapSize;
              if (mapSize) {
                const freshPath = Pathfinder.findPath(
                  world, unitId, lastX, lastZ, finalDest.x, finalDest.y,
                  mapSize.width, mapSize.height
                );
                if (freshPath && freshPath.length >= 2) {
                  for (const p of freshPath) {
                    pathPoints.push(new THREE.Vector3(p.x, 0.12, p.y));
                  }
                }
              }
              if (pathPoints.length < 2) {
                pathPoints.length = 0;
                pathPoints.push(new THREE.Vector3(lastX, 0.12, lastZ));
                pathPoints.push(new THREE.Vector3(finalDest.x, 0.12, finalDest.y));
              }
            }

            const geom = new THREE.BufferGeometry().setFromPoints(pathPoints);
            const lineMat = new THREE.LineDashedMaterial({
              color: 0xffb74d,
              dashSize: 0.15,
              gapSize: 0.2,
              transparent: true,
              opacity: 0.3,
            });
            const line = new THREE.Line(geom, lineMat);
            line.computeLineDistances();
            this.previewGroup.add(line);

            // Final destination marker
            const marker = this.createFinalDestinationMarker(finalDest.x, finalDest.y);
            this.previewGroup.add(marker);
          }
        }
      }
    }
  }

  clear(): void {
    while (this.previewGroup.children.length > 0) {
      const obj = this.previewGroup.children[0];
      this.previewGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        const mat = obj.material as THREE.Material;
        if (mat) mat.dispose();
      } else if (obj instanceof THREE.Sprite) {
        (obj.material as THREE.SpriteMaterial).map?.dispose();
        (obj.material as THREE.SpriteMaterial).dispose();
      }
    }
  }

  /** Create a 3D sprite showing AP cost and pace for a movement segment */
  private createAPLabelSprite(
    apCost: number,
    x: number,
    z: number,
    pace?: "walk" | "advance" | "run" | "sprint"
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const width = 160;
    const height = 40;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Pace-specific styling
    const paceConfig: Record<string, { color: string; bgColor: string; label: string }> = {
      walk: { color: "#6bcf7b", bgColor: "rgba(107, 207, 123, 0.15)", label: "Walk" },
      advance: { color: "#4fc3f7", bgColor: "rgba(79, 195, 247, 0.15)", label: "Advance" },
      run: { color: "#ffb74d", bgColor: "rgba(255, 183, 77, 0.15)", label: "Run" },
      sprint: { color: "#ff7043", bgColor: "rgba(255, 112, 67, 0.15)", label: "Sprint" },
    };
    const config = pace ? paceConfig[pace] : null;
    const accentColor = config?.color || "#e8c547";

    // Draw rounded rectangle background with glass effect
    const radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, height);
    ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();

    // Dark glass background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "rgba(20, 20, 28, 0.92)");
    bgGradient.addColorStop(1, "rgba(13, 13, 18, 0.95)");
    ctx.fillStyle = bgGradient;
    ctx.fill();

    // Subtle inner glow at top
    ctx.save();
    ctx.clip();
    const innerGlow = ctx.createLinearGradient(0, 0, 0, 12);
    innerGlow.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    innerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = innerGlow;
    ctx.fillRect(0, 0, width, 12);
    ctx.restore();

    // Border with accent color
    ctx.strokeStyle = `${accentColor}40`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const apText = apCost === Infinity || apCost >= 99 ? "ALL" : String(apCost);

    if (pace && config) {
      // Left side: colored indicator bar
      ctx.beginPath();
      ctx.roundRect(8, 10, 3, height - 20, 1.5);
      ctx.fillStyle = config.color;
      ctx.fill();

      // Pace label
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "rgba(240, 240, 245, 0.9)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(config.label, 18, height / 2);

      // Separator dot
      ctx.beginPath();
      ctx.arc(width / 2 + 8, height / 2, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fill();

      // AP cost badge on right
      const apBadgeWidth = 42;
      const apBadgeX = width - apBadgeWidth - 8;
      ctx.beginPath();
      ctx.roundRect(apBadgeX, 8, apBadgeWidth, height - 16, 10);
      ctx.fillStyle = "rgba(232, 197, 71, 0.15)";
      ctx.fill();

      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#e8c547";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${apText} AP`, apBadgeX + apBadgeWidth / 2, height / 2);
    } else {
      // Simple centered AP display
      ctx.font = "700 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#e8c547";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${apText} AP`, width / 2, height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(1.8, 0.45, 1);
    return sprite;
  }

  private createDestinationMarker(x: number, z: number, opacity: number = 0.8): THREE.Mesh {
    // Simple small dot marker
    const dotGeometry = new THREE.CircleGeometry(0.15, 16);
    dotGeometry.rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, 0.03, z);
    return dot;
  }

  private createFinalDestinationMarker(x: number, z: number): THREE.Group {
    const group = new THREE.Group();

    // Outer ring in amber/gold
    const ringGeometry = new THREE.RingGeometry(0.18, 0.25, 24);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(x, 0.04, z);
    group.add(ring);

    // Inner dot
    const dotGeometry = new THREE.CircleGeometry(0.08, 16);
    dotGeometry.rotateX(-Math.PI / 2);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb74d,
      transparent: true,
      opacity: 0.5,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, 0.04, z);
    group.add(dot);

    return group;
  }

  private createAttackIndicatorSprite(attackCount: number, x: number, z: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const width = 100;
    const height = 36;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Draw rounded rectangle background
    const radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(radius, height);
    ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();

    // Dark glass background with red tint
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "rgba(40, 18, 18, 0.92)");
    bgGradient.addColorStop(1, "rgba(25, 12, 12, 0.95)");
    ctx.fillStyle = bgGradient;
    ctx.fill();

    // Subtle inner glow at top
    ctx.save();
    ctx.clip();
    const innerGlow = ctx.createLinearGradient(0, 0, 0, 10);
    innerGlow.addColorStop(0, "rgba(255, 120, 120, 0.1)");
    innerGlow.addColorStop(1, "rgba(255, 120, 120, 0)");
    ctx.fillStyle = innerGlow;
    ctx.fillRect(0, 0, width, 10);
    ctx.restore();

    // Border with red accent
    ctx.strokeStyle = "rgba(232, 90, 90, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Left indicator bar
    ctx.beginPath();
    ctx.roundRect(8, 9, 3, height - 18, 1.5);
    ctx.fillStyle = "#e85a5a";
    ctx.fill();

    // Attack text
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(240, 240, 245, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Attack", 17, height / 2);

    // Count badge if multiple attacks
    if (attackCount > 1) {
      const badgeX = width - 28;
      ctx.beginPath();
      ctx.arc(badgeX, height / 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232, 90, 90, 0.3)";
      ctx.fill();

      ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#ff8080";
      ctx.textAlign = "center";
      ctx.fillText(`×${attackCount}`, badgeX, height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(1.1, 0.4, 1);
    return sprite;
  }

  private createRangeCircle(
    x: number,
    z: number,
    radius: number,
    color: number,
    dashed: boolean = false
  ): THREE.Line {
    const segments = 64;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          x + Math.cos(angle) * radius,
          0.02,
          z + Math.sin(angle) * radius
        )
      );
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color,
          dashSize: 0.15,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.6,
        })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });

    const circle = new THREE.Line(geometry, material);
    if (dashed) {
      circle.computeLineDistances();
    }
    return circle;
  }
}
