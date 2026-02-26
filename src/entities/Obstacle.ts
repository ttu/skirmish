import * as THREE from "three";
import { createPrintedMaterial } from "../utils/PrintedMaterial";

// ── Geometry cache ──────────────────────────────────────────────
const geometryCache = new Map<string, THREE.BufferGeometry>();

function cached(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = geometryCache.get(key);
  if (!geom) { geom = factory(); geometryCache.set(key, geom); }
  return geom;
}

export function disposeObstacleGeometries(): void {
  geometryCache.forEach(g => g.dispose());
  geometryCache.clear();
}

function isGeometryCached(geom: THREE.BufferGeometry): boolean {
  for (const g of geometryCache.values()) {
    if (g === geom) return true;
  }
  return false;
}

export type ObstacleType =
  | "tree"
  | "tree_oak"
  | "tree_pine"
  | "tree_willow"
  | "house"
  | "house_cottage"
  | "house_stone"
  | "house_hall"
  | "rock"
  | "stone_wall"
  | "river"
  | "brook"
  | "bridge"
  | "fence";

export interface ObstacleData {
  type: ObstacleType;
  position: { x: number; z: number };
  rotation?: number;
  scale?: number;
  length?: number;
}

export class Obstacle {
  public readonly type: ObstacleType;
  public readonly position: THREE.Vector3;
  public readonly collisionRadius: number;
  public readonly isPassable: boolean;
  public readonly length: number;
  public mesh: THREE.Group;


  /** Flow animation time for river/brook */
  private flowTime = 0;

  constructor(data: ObstacleData) {
    this.type = data.type;
    this.position = new THREE.Vector3(data.position.x, 0, data.position.z);
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);
    this.length = data.length ?? 4;

    const scale = data.scale ?? 1;
    if (data.rotation) {
      this.mesh.rotation.y = data.rotation;
    }

    switch (data.type) {
      // Trees — "tree" normalizes to pine (existing visual)
      case "tree":
      case "tree_pine":
        this.createTreePine(scale);
        this.collisionRadius = 0.4 * scale;
        this.isPassable = false;
        break;
      case "tree_oak":
        this.createTreeOak(scale);
        this.collisionRadius = 0.7 * scale;
        this.isPassable = false;
        break;
      case "tree_willow":
        this.createTreeWillow(scale);
        this.collisionRadius = 1.0 * scale;
        this.isPassable = false;
        break;

      // Houses — "house" normalizes to stone (existing visual)
      case "house":
      case "house_stone":
        this.createHouseStone(scale);
        this.collisionRadius = 1.5 * scale;
        this.isPassable = false;
        break;
      case "house_cottage":
        this.createHouseCottage(scale);
        this.collisionRadius = 1.0 * scale;
        this.isPassable = false;
        break;
      case "house_hall":
        this.createHouseHall(scale);
        this.collisionRadius = 2.2 * scale;
        this.isPassable = false;
        break;

      case "rock":
        this.createRock(scale);
        this.collisionRadius = 0.8 * scale;
        this.isPassable = false;
        break;
      case "stone_wall":
        this.createStoneWall(scale);
        this.collisionRadius = (this.length / 2) * scale;
        this.isPassable = false;
        break;
      case "river":
        this.createRiver(scale);
        this.collisionRadius = (this.length / 2) * scale;
        this.isPassable = false;
        break;
      case "brook":
        this.createBrook(scale);
        this.collisionRadius = 0;
        this.isPassable = true;
        break;
      case "bridge":
        this.createBridge(scale);
        this.collisionRadius = 0;
        this.isPassable = true;
        break;
      case "fence":
        this.createFence(scale);
        this.collisionRadius = (this.length / 2) * scale;
        this.isPassable = false;
        break;
      default:
        this.collisionRadius = 1;
        this.isPassable = false;
    }
  }

  // ── Tree variants ──────────────────────────────────────────────

  private createTreePine(scale: number): void {
    const s = scale;
    // Trunk
    const trunkGeometry = cached(`pine_trunk_${s}`, () =>
      new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.2 * s, 8));
    const trunk = new THREE.Mesh(trunkGeometry, createPrintedMaterial({ color: 0x8b4513 }));
    trunk.position.y = 0.6 * s;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Foliage (cone shape)
    const foliageGeometry = cached(`pine_foliage1_${s}`, () =>
      new THREE.ConeGeometry(0.8 * s, 2 * s, 8));
    const foliageMaterial = createPrintedMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = 2 * s;
    foliage.castShadow = true;
    this.mesh.add(foliage);

    // Second layer of foliage
    const foliage2Geometry = cached(`pine_foliage2_${s}`, () =>
      new THREE.ConeGeometry(0.6 * s, 1.5 * s, 8));
    const foliage2 = new THREE.Mesh(foliage2Geometry, foliageMaterial);
    foliage2.position.y = 2.8 * s;
    foliage2.castShadow = true;
    this.mesh.add(foliage2);
  }

  private createTreeOak(scale: number): void {
    const s = scale;
    // Thick trunk
    const trunkGeometry = cached(`oak_trunk_${s}`, () =>
      new THREE.CylinderGeometry(0.2 * s, 0.25 * s, 1.0 * s, 8));
    const trunk = new THREE.Mesh(trunkGeometry, createPrintedMaterial({ color: 0x6b4226 }));
    trunk.position.y = 0.5 * s;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Round canopy
    const canopyGeometry = cached(`oak_canopy1_${s}`, () =>
      new THREE.SphereGeometry(1.0 * s, 8, 6));
    const canopyMaterial = createPrintedMaterial({ color: 0x2d5a1e });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 1.6 * s;
    canopy.scale.set(1, 0.7, 1);
    canopy.castShadow = true;
    this.mesh.add(canopy);

    // Smaller secondary canopy for asymmetry
    const canopy2Geometry = cached(`oak_canopy2_${s}`, () =>
      new THREE.SphereGeometry(0.6 * s, 8, 6));
    const canopy2 = new THREE.Mesh(canopy2Geometry, canopyMaterial);
    canopy2.position.set(0.4 * s, 1.9 * s, 0.3 * s);
    canopy2.scale.set(1, 0.7, 1);
    canopy2.castShadow = true;
    this.mesh.add(canopy2);
  }

  private createTreeWillow(scale: number): void {
    const s = scale;
    // Medium trunk
    const trunkGeometry = cached(`willow_trunk_${s}`, () =>
      new THREE.CylinderGeometry(0.18 * s, 0.22 * s, 0.9 * s, 8));
    const trunk = new THREE.Mesh(trunkGeometry, createPrintedMaterial({ color: 0x7b6b3a }));
    trunk.position.y = 0.45 * s;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Wide flat canopy
    const canopyGeometry = cached(`willow_canopy_${s}`, () =>
      new THREE.SphereGeometry(1.2 * s, 8, 6));
    const canopy = new THREE.Mesh(canopyGeometry, createPrintedMaterial({ color: 0x6b8e23 }));
    canopy.position.y = 1.2 * s;
    canopy.scale.set(1, 0.5, 1);
    canopy.castShadow = true;
    this.mesh.add(canopy);

    // Drooping branches (InstancedMesh — 6 identical cylinders)
    const branchGeometry = cached(`willow_branch_${s}`, () =>
      new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.8 * s, 4));
    const branches = new THREE.InstancedMesh(branchGeometry, createPrintedMaterial({ color: 0x556b2f }), 6);
    branches.castShadow = true;
    const branchMatrix = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      branchMatrix.makeTranslation(
        Math.cos(angle) * 0.9 * scale,
        0.7 * scale,
        Math.sin(angle) * 0.9 * scale,
      );
      branches.setMatrixAt(i, branchMatrix);
    }
    this.mesh.add(branches);
  }

  // ── House variants ─────────────────────────────────────────────

  private createHouseStone(scale: number): void {
    const s = scale;
    // Grey stone base
    const baseGeometry = cached(`hstone_base_${s}`, () =>
      new THREE.BoxGeometry(2 * s, 1.5 * s, 2 * s));
    const base = new THREE.Mesh(baseGeometry, createPrintedMaterial({ color: 0xa0a0a0 }));
    base.position.y = 0.75 * s;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Slate roof
    const roofGeometry = cached(`hstone_roof_${s}`, () =>
      new THREE.ConeGeometry(1.6 * s, 1 * s, 4));
    const roof = new THREE.Mesh(roofGeometry, createPrintedMaterial({ color: 0x505050 }));
    roof.position.y = 2 * s;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Door
    const doorGeometry = cached(`hstone_door_${s}`, () =>
      new THREE.BoxGeometry(0.4 * s, 0.8 * s, 0.1 * s));
    const door = new THREE.Mesh(doorGeometry, createPrintedMaterial({ color: 0x654321 }));
    door.position.set(0, 0.4 * s, 1.01 * s);
    this.mesh.add(door);

    // Chimney
    const chimneyGeometry = cached(`hstone_chimney_${s}`, () =>
      new THREE.BoxGeometry(0.3 * s, 0.8 * s, 0.3 * s));
    const chimney = new THREE.Mesh(chimneyGeometry, createPrintedMaterial({ color: 0x696969 }));
    chimney.position.set(0.6 * s, 2.4 * s, -0.5 * s);
    chimney.castShadow = true;
    this.mesh.add(chimney);
  }

  private createHouseCottage(scale: number): void {
    const s = scale;
    // Small tan base
    const baseGeometry = cached(`hcottage_base_${s}`, () =>
      new THREE.BoxGeometry(1.4 * s, 1.0 * s, 1.4 * s));
    const base = new THREE.Mesh(baseGeometry, createPrintedMaterial({ color: 0xd2b48c }));
    base.position.y = 0.5 * s;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Thatched roof
    const roofGeometry = cached(`hcottage_roof_${s}`, () =>
      new THREE.ConeGeometry(1.2 * s, 0.8 * s, 4));
    const roof = new THREE.Mesh(roofGeometry, createPrintedMaterial({ color: 0xbdb76b }));
    roof.position.y = 1.4 * s;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Small door
    const doorGeometry = cached(`hcottage_door_${s}`, () =>
      new THREE.BoxGeometry(0.3 * s, 0.6 * s, 0.1 * s));
    const door = new THREE.Mesh(doorGeometry, createPrintedMaterial({ color: 0x654321 }));
    door.position.set(0, 0.3 * s, 0.71 * s);
    this.mesh.add(door);
  }

  private createHouseHall(scale: number): void {
    const s = scale;
    // Large cream base
    const baseGeometry = cached(`hhall_base_${s}`, () =>
      new THREE.BoxGeometry(3.0 * s, 2.0 * s, 2.5 * s));
    const base = new THREE.Mesh(baseGeometry, createPrintedMaterial({ color: 0xfff8dc }));
    base.position.y = 1.0 * s;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Timber beams on front face
    const beamMaterial = createPrintedMaterial({ color: 0x654321 });
    const beamGeometry = cached(`hhall_beam_${s}`, () =>
      new THREE.BoxGeometry(0.08 * s, 1.8 * s, 0.08 * s));
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      const xOffset = -1.0 * s + i * 0.67 * s;
      beam.position.set(xOffset, 1.0 * s, 1.26 * s);
      this.mesh.add(beam);
    }

    // Steep red roof
    const roofGeometry = cached(`hhall_roof_${s}`, () =>
      new THREE.ConeGeometry(2.2 * s, 1.5 * s, 4));
    const roof = new THREE.Mesh(roofGeometry, createPrintedMaterial({ color: 0x8b0000 }));
    roof.position.y = 2.75 * s;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Double door
    const doorGeometry = cached(`hhall_door_${s}`, () =>
      new THREE.BoxGeometry(0.6 * s, 1.0 * s, 0.1 * s));
    const door = new THREE.Mesh(doorGeometry, beamMaterial);
    door.position.set(0, 0.5 * s, 1.26 * s);
    this.mesh.add(door);
  }

  // ── Other obstacles ────────────────────────────────────────────

  private createRock(scale: number): void {
    const s = scale;
    // Main rock
    const rockGeometry = cached(`rock_main_${s}`, () =>
      new THREE.DodecahedronGeometry(0.7 * s, 0));
    const rockMaterial = createPrintedMaterial({ color: 0x808080 });
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.y = 0.4 * s;
    rock.scale.set(1, 0.7, 1);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    this.mesh.add(rock);

    // Smaller rock
    const rock2Geometry = cached(`rock_small_${s}`, () =>
      new THREE.DodecahedronGeometry(0.4 * s, 0));
    const rock2 = new THREE.Mesh(rock2Geometry, rockMaterial);
    rock2.position.set(0.5 * s, 0.2 * s, 0.3 * s);
    rock2.scale.set(1, 0.6, 1);
    rock2.castShadow = true;
    this.mesh.add(rock2);
  }

  private createStoneWall(scale: number): void {
    const wallLength = this.length * scale;
    const stoneColors = [0x808080, 0x909090, 0x707060];

    // Position-based seed for consistent randomness
    const seed = Math.abs(Math.round(this.position.x * 1000 + this.position.z * 31));
    let rng = seed || 1;
    const random = () => {
      rng = (rng * 16807 + 0) % 2147483647;
      return (rng & 0x7fffffff) / 0x7fffffff;
    };

    // Generate stones in 2 rows
    for (let row = 0; row < 2; row++) {
      let x = -wallLength / 2;
      while (x < wallLength / 2 - 0.1) {
        const stoneWidth = (0.3 + random() * 0.3) * scale;
        const stoneHeight = (0.15 + random() * 0.15) * scale;
        const stoneDepth = (0.3 + random() * 0.2) * scale;

        const colorIdx = Math.floor(random() * stoneColors.length);
        const material = createPrintedMaterial({ color: stoneColors[colorIdx] });
        const geometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, stoneDepth);
        const stone = new THREE.Mesh(geometry, material);

        stone.position.set(
          x + stoneWidth / 2 + (random() - 0.5) * 0.05 * scale,
          row * 0.25 * scale + stoneHeight / 2,
          (random() - 0.5) * 0.05 * scale,
        );
        stone.castShadow = true;
        this.mesh.add(stone);

        x += stoneWidth + 0.02 * scale;
      }
    }
  }

  private createRiver(scale: number): void {
    const s = scale;
    const halfLen = (this.length / 2) * s;
    const halfW = 1.5 * s;
    const curve = 1.2 * s;

    const shape = new THREE.Shape();
    shape.moveTo(-halfW, halfLen);
    shape.bezierCurveTo(
      -halfW - curve, 0.5 * halfLen,
      -halfW - curve * 0.8, -0.5 * halfLen,
      -halfW - curve * 0.5, -halfLen,
    );
    shape.bezierCurveTo(
      -halfW - curve * 0.2, -halfLen - 0.2 * s,
      halfW + curve * 0.2, -halfLen - 0.2 * s,
      halfW + curve * 0.5, -halfLen,
    );
    shape.bezierCurveTo(
      halfW + curve * 0.8, -0.5 * halfLen,
      halfW + curve, 0.5 * halfLen,
      halfW, halfLen,
    );
    shape.lineTo(-halfW, halfLen);

    const riverGeometry = new THREE.ShapeGeometry(shape);
    const riverMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          float flow = sin(vPosition.y * 2.5 + uTime * 1.5) * 0.5 + 0.5;
          vec3 waterColor = mix(vec3(0.18, 0.35, 0.8), vec3(0.28, 0.45, 0.95), flow * 0.35);
          gl_FragColor = vec4(waterColor, 0.78);
        }
      `,
      transparent: true,
    });
    const river = new THREE.Mesh(riverGeometry, riverMaterial);
    river.rotation.x = -Math.PI / 2;
    river.position.y = 0.05;
    river.receiveShadow = true;
    river.userData.flowMaterial = riverMaterial;
    this.mesh.add(river);

    // Curved river banks
    const bankMaterial = createPrintedMaterial({ color: 0x8b7355 });
    const bankWidth = 0.3 * s;

    const bankShape = new THREE.Shape();
    bankShape.moveTo(-halfW - bankWidth, halfLen);
    bankShape.lineTo(-halfW, halfLen);
    bankShape.bezierCurveTo(
      -halfW - curve, 0.6 * halfLen,
      -halfW - curve * 0.8, -0.6 * halfLen,
      -halfW - curve * 0.5, -halfLen,
    );
    bankShape.lineTo(-halfW - curve * 0.5 - bankWidth, -halfLen);
    bankShape.lineTo(-halfW - curve * 0.5 - bankWidth, halfLen + bankWidth);
    bankShape.lineTo(-halfW - bankWidth, halfLen);
    const leftBankGeom = new THREE.ShapeGeometry(bankShape);
    const leftBank = new THREE.Mesh(leftBankGeom, bankMaterial);
    leftBank.rotation.x = -Math.PI / 2;
    leftBank.position.y = 0.075;
    this.mesh.add(leftBank);

    const rightBankShape = new THREE.Shape();
    rightBankShape.moveTo(halfW, halfLen);
    rightBankShape.bezierCurveTo(
      halfW + curve * 0.8, 0.6 * halfLen,
      halfW + curve, -0.6 * halfLen,
      halfW + curve * 0.5, -halfLen,
    );
    rightBankShape.lineTo(halfW + curve * 0.5 + bankWidth, -halfLen);
    rightBankShape.lineTo(halfW + curve * 0.5 + bankWidth, halfLen + bankWidth);
    rightBankShape.lineTo(halfW + bankWidth, halfLen);
    rightBankShape.lineTo(halfW, halfLen);
    const rightBankGeom = new THREE.ShapeGeometry(rightBankShape);
    const rightBank = new THREE.Mesh(rightBankGeom, bankMaterial);
    rightBank.rotation.x = -Math.PI / 2;
    rightBank.position.y = 0.075;
    this.mesh.add(rightBank);
  }

  private createBrook(scale: number): void {
    const s = scale;
    const halfLen = (this.length / 2) * s;
    const halfW = 0.5 * s;
    const curve = 0.6 * s;

    // Narrow meandering stream shape
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, halfLen);
    shape.bezierCurveTo(
      -halfW - curve, 0.5 * halfLen,
      -halfW - curve * 0.8, -0.5 * halfLen,
      -halfW - curve * 0.5, -halfLen,
    );
    shape.bezierCurveTo(
      -halfW - curve * 0.2, -halfLen - 0.1 * s,
      halfW + curve * 0.2, -halfLen - 0.1 * s,
      halfW + curve * 0.5, -halfLen,
    );
    shape.bezierCurveTo(
      halfW + curve * 0.8, -0.5 * halfLen,
      halfW + curve, 0.5 * halfLen,
      halfW, halfLen,
    );
    shape.lineTo(-halfW, halfLen);

    const brookGeometry = new THREE.ShapeGeometry(shape);
    const brookMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          float flow = sin(vPosition.y * 3.5 + uTime * 2.5) * 0.5 + 0.5;
          vec3 waterColor = mix(vec3(0.25, 0.50, 0.90), vec3(0.35, 0.60, 0.98), flow * 0.35);
          gl_FragColor = vec4(waterColor, 0.7);
        }
      `,
      transparent: true,
    });
    const brook = new THREE.Mesh(brookGeometry, brookMaterial);
    brook.rotation.x = -Math.PI / 2;
    brook.position.y = 0.04;
    brook.receiveShadow = true;
    brook.userData.flowMaterial = brookMaterial;
    this.mesh.add(brook);

    // Small pebbles along banks
    const pebbleMaterial = createPrintedMaterial({ color: 0x8b7355 });
    // Use position-based seed for consistent pebble placement
    const seed = Math.abs(Math.round(this.position.x * 1000 + this.position.z * 31)) || 1;
    let rng = seed;
    const random = () => {
      rng = (rng * 16807 + 0) % 2147483647;
      return (rng & 0x7fffffff) / 0x7fffffff;
    };
    for (let i = 0; i < 6; i++) {
      const t = (i / 5) * 2 - 1;
      const pebbleGeometry = new THREE.DodecahedronGeometry(
        (0.08 + random() * 0.04) * s, 0,
      );
      const pebble = new THREE.Mesh(pebbleGeometry, pebbleMaterial);
      const side = i % 2 === 0 ? 1 : -1;
      pebble.position.set(
        (halfW + 0.15 * s) * side,
        0.04,
        t * halfLen * 0.8,
      );
      this.mesh.add(pebble);
    }
  }

  private createBridge(scale: number): void {
    const s = scale;
    const width = 4 * s;
    const length = 3.5 * s;
    const plankWidth = 0.2 * s;
    const plankThickness = 0.08 * s;

    const woodMaterial = createPrintedMaterial({ color: 0x8b6914 });

    // Planks (InstancedMesh — ~20 identical boxes)
    const plankCount = Math.ceil(width / plankWidth);
    const plankGeometry = cached(`bridge_plank_${s}`, () =>
      new THREE.BoxGeometry(plankWidth * 0.9, plankThickness, length));
    const planks = new THREE.InstancedMesh(plankGeometry, woodMaterial, plankCount);
    planks.castShadow = true;
    planks.receiveShadow = true;
    const plankMatrix = new THREE.Matrix4();
    for (let i = 0; i < plankCount; i++) {
      const offset = -width / 2 + plankWidth / 2 + i * plankWidth;
      plankMatrix.makeTranslation(offset, 0.1 + plankThickness / 2, 0);
      planks.setMatrixAt(i, plankMatrix);
    }
    this.mesh.add(planks);

    const beamMaterial = createPrintedMaterial({ color: 0x6b4a0a });
    const sideBeamGeometry = cached(`bridge_beam_${s}`, () =>
      new THREE.BoxGeometry(0.15 * s, 0.12 * s, length + 0.2 * s));
    const leftBeam = new THREE.Mesh(sideBeamGeometry, beamMaterial);
    leftBeam.position.set(-width / 2 - 0.2 * s, 0.14, 0);
    this.mesh.add(leftBeam);
    const rightBeam = new THREE.Mesh(sideBeamGeometry, beamMaterial);
    rightBeam.position.set(width / 2 + 0.2 * s, 0.14, 0);
    this.mesh.add(rightBeam);
  }

  private createFence(scale: number): void {
    const s = scale;
    const fenceLength = this.length * s;
    const woodMaterial = createPrintedMaterial({ color: 0x8b6914 });
    const darkWoodMaterial = createPrintedMaterial({ color: 0x6b4a0a });
    const postHeight = 0.8 * s;
    const postWidth = 0.12 * s;
    const railHeight = 0.08 * s;
    const sectionLength = 1.2 * s;

    // Generate fence posts and rails along the full length
    const postCount = Math.max(2, Math.ceil(fenceLength / sectionLength) + 1);
    const actualSpacing = fenceLength / (postCount - 1);

    // Position-based seed for consistent randomness
    const seed = Math.abs(Math.round(this.position.x * 1000 + this.position.z * 31)) || 1;
    let rng = seed;
    const random = () => {
      rng = (rng * 16807 + 0) % 2147483647;
      return (rng & 0x7fffffff) / 0x7fffffff;
    };

    // Posts (2 InstancedMeshes — split by material, per-instance scale.y)
    const postGeometry = cached(`fence_post_${s}`, () =>
      new THREE.BoxGeometry(postWidth, postHeight, postWidth));
    const lightPosts: { x: number; y: number; sy: number }[] = [];
    const darkPosts: { x: number; y: number; sy: number }[] = [];
    for (let i = 0; i < postCount; i++) {
      const x = -fenceLength / 2 + i * actualSpacing;
      const hv = 1 + (random() - 0.5) * 0.15;
      const entry = { x, y: (postHeight * hv) / 2, sy: hv };
      (i % 3 === 0 ? darkPosts : lightPosts).push(entry);
    }

    const addPostInstances = (material: THREE.Material, posts: typeof lightPosts) => {
      if (posts.length === 0) return;
      const inst = new THREE.InstancedMesh(postGeometry, material, posts.length);
      inst.castShadow = true;
      const mat = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      for (let j = 0; j < posts.length; j++) {
        p.set(posts[j].x, posts[j].y, 0);
        scl.set(1, posts[j].sy, 1);
        mat.compose(p, q, scl);
        inst.setMatrixAt(j, mat);
      }
      this.mesh.add(inst);
    };
    addPostInstances(woodMaterial, lightPosts);
    addPostInstances(darkWoodMaterial, darkPosts);

    // Rails connecting posts (InstancedMesh — 2 per section)
    const railCount = (postCount - 1) * 2;
    const railGeometry = cached(`fence_rail_${s}_${this.length}`, () =>
      new THREE.BoxGeometry(actualSpacing, railHeight, postWidth * 0.8));
    const rails = new THREE.InstancedMesh(railGeometry, woodMaterial, railCount);
    rails.castShadow = true;
    const railMatrix = new THREE.Matrix4();
    for (let i = 0; i < postCount - 1; i++) {
      const midX = -fenceLength / 2 + i * actualSpacing + actualSpacing / 2;
      railMatrix.makeTranslation(midX, postHeight - railHeight, 0);
      rails.setMatrixAt(i * 2, railMatrix);
      railMatrix.makeTranslation(midX, postHeight * 0.5, 0);
      rails.setMatrixAt(i * 2 + 1, railMatrix);
    }
    this.mesh.add(rails);
  }

  // ── Disposal ───────────────────────────────────────────────────

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        if (child.geometry && !isGeometryCached(child.geometry)) {
          child.geometry.dispose();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          if (mat instanceof THREE.ShaderMaterial) {
            mat.dispose();
          }
        }
      }
    });
  }

  // ── Update ─────────────────────────────────────────────────────

  update(deltaTime: number): void {
    if (this.type === "river" || this.type === "brook") {
      this.flowTime += deltaTime;
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData?.flowMaterial) {
          (child.userData.flowMaterial as THREE.ShaderMaterial)
            .uniforms.uTime.value = this.flowTime;
        }
      });
    }
  }

}
