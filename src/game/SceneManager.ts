import * as THREE from "three";
import {
  PositionComponent,
  FactionComponent,
  HealthComponent,
  IdentityComponent,
} from "../engine/components";
import { buildUnitMesh } from "../entities/UnitMeshBuilder";
import { Obstacle, ObstacleType } from "../entities/Obstacle";
import { UnitType } from "../types";
import { EntityId } from "../engine/types";
import { GameContext } from "./GameContext";

export class SceneManager {
  private readonly ctx: GameContext;
  private entityMeshes: Map<EntityId, THREE.Group> = new Map();
  private terrainGroup: THREE.Group | null = null;
  private terrainObstacles: Obstacle[] = [];
  private selectionRing: THREE.Mesh | null = null;
  private activeHighlightRing: THREE.Mesh | null = null;
  private activeHighlightEntityId: EntityId | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.setupLighting();
    this.initSelectionRing();
    this.initActiveHighlightRing();
  }

  getEntityMeshes(): Map<EntityId, THREE.Group> {
    return this.entityMeshes;
  }

  getTerrainObstacles(): Obstacle[] {
    return this.terrainObstacles;
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.ctx.scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    this.ctx.scene.add(directional);
  }

  private initSelectionRing(): void {
    const ringGeom = new THREE.RingGeometry(0.48, 0.55, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
    });
    this.selectionRing = new THREE.Mesh(ringGeom, ringMat);
    this.selectionRing.visible = false;
    this.ctx.scene.add(this.selectionRing);
  }

  private initActiveHighlightRing(): void {
    const ringGeom = new THREE.RingGeometry(0.5, 0.58, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.activeHighlightRing = new THREE.Mesh(ringGeom, ringMat);
    this.activeHighlightRing.visible = false;
    this.ctx.scene.add(this.activeHighlightRing);
  }

  showActiveHighlight(entityId: EntityId): void {
    this.activeHighlightEntityId = entityId;
    if (!this.activeHighlightRing) return;
    const group = this.entityMeshes.get(entityId);
    if (!group) {
      this.activeHighlightRing.visible = false;
      return;
    }
    this.activeHighlightRing.position.set(group.position.x, 0.03, group.position.z);
    this.activeHighlightRing.visible = true;
  }

  hideActiveHighlight(): void {
    this.activeHighlightEntityId = null;
    if (this.activeHighlightRing) {
      this.activeHighlightRing.visible = false;
    }
  }

  updateActiveHighlightPulse(): void {
    if (!this.activeHighlightRing || !this.activeHighlightRing.visible) return;
    // Pulse opacity between 0.4 and 0.9
    const t = performance.now() / 400;
    const opacity = 0.65 + 0.25 * Math.sin(t);
    (this.activeHighlightRing.material as THREE.MeshBasicMaterial).opacity = opacity;

    // Track the highlighted entity's position (it may be animating)
    if (this.activeHighlightEntityId) {
      const group = this.entityMeshes.get(this.activeHighlightEntityId);
      if (group) {
        this.activeHighlightRing.position.set(group.position.x, 0.03, group.position.z);
      }
    }
  }

  updateSelectionRing(): void {
    if (!this.selectionRing) return;
    const selectedEntityId = this.ctx.getSelectedEntityId();
    if (!selectedEntityId) {
      this.selectionRing.visible = false;
      return;
    }
    const world = this.ctx.engine.getWorld();
    const pos = world.getComponent<PositionComponent>(selectedEntityId, "position");
    if (!pos) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.position.set(pos.x, 0.02, pos.y);
    this.selectionRing.visible = true;
  }

  updateSelectionRingAt(x: number, z: number): void {
    if (this.selectionRing) this.selectionRing.position.set(x, 0.02, z);
  }

  createEntityMeshes(entityIds: EntityId[]): void {
    const world = this.ctx.engine.getWorld();
    const floatingText = this.ctx.getFloatingText();

    for (const id of entityIds) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const faction = world.getComponent<FactionComponent>(id, "faction");
      const identity = world.getComponent<IdentityComponent>(id, "identity");
      if (!pos || !faction) continue;

      const color = faction.faction === "player" ? 0x3366ff : 0xff3333;
      const unitType = (identity?.unitType ?? "warrior") as UnitType;
      const bodyGroup = buildUnitMesh(unitType, color, 1);

      bodyGroup.position.set(pos.x, 0.06, pos.y);
      bodyGroup.userData = { entityId: id };

      this.ctx.scene.add(bodyGroup);
      this.entityMeshes.set(id, bodyGroup);

      // Initialize floating text position
      floatingText.updateEntityPosition(id, pos.x, pos.y);
    }
  }

  setupTerrain(
    width: number,
    height: number,
    obstacles?: Array<{
      type: string;
      position: { x: number; z: number };
      rotation?: number;
      scale?: number;
      length?: number;
    }>
  ): void {
    const group = new THREE.Group();
    const groundGeo = new THREE.PlaneGeometry(width, height, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(width, height),
      Math.max(width, height) / 2,
      0x2a2a4a,
      0x2a2a4a
    );
    grid.position.y = 0.01;
    group.add(grid);

    this.terrainObstacles = [];
    if (obstacles?.length) {
      for (const def of obstacles) {
        const obstacle = new Obstacle({
          type: def.type as ObstacleType,
          position: def.position,
          rotation: def.rotation,
          scale: def.scale,
          length: def.length,
        });
        group.add(obstacle.mesh);
        this.terrainObstacles.push(obstacle);
      }
    }

    this.ctx.scene.add(group);
    this.terrainGroup = group;
  }

  syncMeshPositions(): void {
    const world = this.ctx.engine.getWorld();
    const floatingText = this.ctx.getFloatingText();

    for (const [id, group] of this.entityMeshes) {
      const pos = world.getComponent<PositionComponent>(id, "position");
      const health = world.getComponent<HealthComponent>(id, "health");
      if (!pos) continue;

      group.position.set(pos.x, 0.06, pos.y);

      // Update floating text position
      floatingText.updateEntityPosition(id, pos.x, pos.y);

      if (health && health.woundState === "down") {
        // Make fallen units grey and lay them down
        group.visible = true;
        group.rotation.x = Math.PI / 2; // Lay flat
        group.position.y = 0.02; // Lower to ground
        this.setMeshGroupColor(group, 0x555555); // Grey color
      }
    }
    this.updateSelectionRing();
  }

  private setMeshGroupColor(group: THREE.Group, color: number): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.color) {
          mat.color.setHex(color);
        }
      }
    });
  }

  clearAll(): void {
    for (const mesh of this.entityMeshes.values()) {
      this.ctx.scene.remove(mesh);
    }
    this.entityMeshes.clear();

    if (this.terrainGroup) {
      // Dispose obstacle uncached resources (ShapeGeometries, ShaderMaterials, random-sized stones/pebbles)
      for (const obstacle of this.terrainObstacles) {
        obstacle.dispose();
      }
      // Dispose ground plane + GridHelper (unique per scenario, not cached)
      for (const child of this.terrainGroup.children) {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        } else if (child instanceof THREE.GridHelper) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
      this.ctx.scene.remove(this.terrainGroup);
      this.terrainGroup = null;
    }
    this.terrainObstacles = [];
    this.updateSelectionRing();
  }
}
