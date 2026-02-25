import * as THREE from "three";
import { createPrintedMaterial } from "../utils/PrintedMaterial";

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
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      0.15 * scale, 0.2 * scale, 1.2 * scale, 8,
    );
    const trunkMaterial = createPrintedMaterial({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.6 * scale;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Foliage (cone shape)
    const foliageGeometry = new THREE.ConeGeometry(0.8 * scale, 2 * scale, 8);
    const foliageMaterial = createPrintedMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = 2 * scale;
    foliage.castShadow = true;
    this.mesh.add(foliage);

    // Second layer of foliage
    const foliage2Geometry = new THREE.ConeGeometry(0.6 * scale, 1.5 * scale, 8);
    const foliage2 = new THREE.Mesh(foliage2Geometry, foliageMaterial);
    foliage2.position.y = 2.8 * scale;
    foliage2.castShadow = true;
    this.mesh.add(foliage2);
  }

  private createTreeOak(scale: number): void {
    // Thick trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      0.2 * scale, 0.25 * scale, 1.0 * scale, 8,
    );
    const trunkMaterial = createPrintedMaterial({ color: 0x6b4226 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.5 * scale;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Round canopy
    const canopyGeometry = new THREE.SphereGeometry(1.0 * scale, 8, 6);
    const canopyMaterial = createPrintedMaterial({ color: 0x2d5a1e });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 1.6 * scale;
    canopy.scale.set(1, 0.7, 1);
    canopy.castShadow = true;
    this.mesh.add(canopy);

    // Smaller secondary canopy for asymmetry
    const canopy2Geometry = new THREE.SphereGeometry(0.6 * scale, 8, 6);
    const canopy2 = new THREE.Mesh(canopy2Geometry, canopyMaterial);
    canopy2.position.set(0.4 * scale, 1.9 * scale, 0.3 * scale);
    canopy2.scale.set(1, 0.7, 1);
    canopy2.castShadow = true;
    this.mesh.add(canopy2);
  }

  private createTreeWillow(scale: number): void {
    // Medium trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      0.18 * scale, 0.22 * scale, 0.9 * scale, 8,
    );
    const trunkMaterial = createPrintedMaterial({ color: 0x7b6b3a });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 0.45 * scale;
    trunk.castShadow = true;
    this.mesh.add(trunk);

    // Wide flat canopy
    const canopyGeometry = new THREE.SphereGeometry(1.2 * scale, 8, 6);
    const canopyMaterial = createPrintedMaterial({ color: 0x6b8e23 });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.y = 1.2 * scale;
    canopy.scale.set(1, 0.5, 1);
    canopy.castShadow = true;
    this.mesh.add(canopy);

    // Drooping branches
    const branchMaterial = createPrintedMaterial({ color: 0x556b2f });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const branchGeometry = new THREE.CylinderGeometry(
        0.02 * scale, 0.02 * scale, 0.8 * scale, 4,
      );
      const branch = new THREE.Mesh(branchGeometry, branchMaterial);
      branch.position.set(
        Math.cos(angle) * 0.9 * scale,
        0.7 * scale,
        Math.sin(angle) * 0.9 * scale,
      );
      branch.castShadow = true;
      this.mesh.add(branch);
    }
  }

  // ── House variants ─────────────────────────────────────────────

  private createHouseStone(scale: number): void {
    // Grey stone base
    const baseGeometry = new THREE.BoxGeometry(2 * scale, 1.5 * scale, 2 * scale);
    const baseMaterial = createPrintedMaterial({ color: 0xa0a0a0 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.75 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Slate roof
    const roofGeometry = new THREE.ConeGeometry(1.6 * scale, 1 * scale, 4);
    const roofMaterial = createPrintedMaterial({ color: 0x505050 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 2 * scale;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Door
    const doorGeometry = new THREE.BoxGeometry(0.4 * scale, 0.8 * scale, 0.1 * scale);
    const doorMaterial = createPrintedMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 0.4 * scale, 1.01 * scale);
    this.mesh.add(door);

    // Chimney
    const chimneyGeometry = new THREE.BoxGeometry(0.3 * scale, 0.8 * scale, 0.3 * scale);
    const chimneyMaterial = createPrintedMaterial({ color: 0x696969 });
    const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
    chimney.position.set(0.6 * scale, 2.4 * scale, -0.5 * scale);
    chimney.castShadow = true;
    this.mesh.add(chimney);
  }

  private createHouseCottage(scale: number): void {
    // Small tan base
    const baseGeometry = new THREE.BoxGeometry(1.4 * scale, 1.0 * scale, 1.4 * scale);
    const baseMaterial = createPrintedMaterial({ color: 0xd2b48c });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.5 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Thatched roof
    const roofGeometry = new THREE.ConeGeometry(1.2 * scale, 0.8 * scale, 4);
    const roofMaterial = createPrintedMaterial({ color: 0xbdb76b });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 1.4 * scale;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Small door
    const doorGeometry = new THREE.BoxGeometry(0.3 * scale, 0.6 * scale, 0.1 * scale);
    const doorMaterial = createPrintedMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 0.3 * scale, 0.71 * scale);
    this.mesh.add(door);
  }

  private createHouseHall(scale: number): void {
    // Large cream base
    const baseGeometry = new THREE.BoxGeometry(3.0 * scale, 2.0 * scale, 2.5 * scale);
    const baseMaterial = createPrintedMaterial({ color: 0xfff8dc });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 1.0 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Timber beams on front face
    const beamMaterial = createPrintedMaterial({ color: 0x654321 });
    for (let i = 0; i < 4; i++) {
      const beamGeometry = new THREE.BoxGeometry(0.08 * scale, 1.8 * scale, 0.08 * scale);
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      const xOffset = -1.0 * scale + i * 0.67 * scale;
      beam.position.set(xOffset, 1.0 * scale, 1.26 * scale);
      this.mesh.add(beam);
    }

    // Steep red roof
    const roofGeometry = new THREE.ConeGeometry(2.2 * scale, 1.5 * scale, 4);
    const roofMaterial = createPrintedMaterial({ color: 0x8b0000 });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 2.75 * scale;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.mesh.add(roof);

    // Double door
    const doorGeometry = new THREE.BoxGeometry(0.6 * scale, 1.0 * scale, 0.1 * scale);
    const doorMaterial = createPrintedMaterial({ color: 0x654321 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, 0.5 * scale, 1.26 * scale);
    this.mesh.add(door);
  }

  // ── Other obstacles ────────────────────────────────────────────

  private createRock(scale: number): void {
    // Main rock
    const rockGeometry = new THREE.DodecahedronGeometry(0.7 * scale, 0);
    const rockMaterial = createPrintedMaterial({ color: 0x808080 });
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.y = 0.4 * scale;
    rock.scale.set(1, 0.7, 1);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    this.mesh.add(rock);

    // Smaller rock
    const rock2Geometry = new THREE.DodecahedronGeometry(0.4 * scale, 0);
    const rock2 = new THREE.Mesh(rock2Geometry, rockMaterial);
    rock2.position.set(0.5 * scale, 0.2 * scale, 0.3 * scale);
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

    const plankCount = Math.ceil(width / plankWidth);
    for (let i = 0; i < plankCount; i++) {
      const offset = -width / 2 + plankWidth / 2 + i * plankWidth;
      const plankGeometry = new THREE.BoxGeometry(
        plankWidth * 0.9, plankThickness, length,
      );
      const plank = new THREE.Mesh(plankGeometry, woodMaterial);
      plank.position.set(offset, 0.1 + plankThickness / 2, 0);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.mesh.add(plank);
    }

    const beamMaterial = createPrintedMaterial({ color: 0x6b4a0a });
    const sideBeamGeometry = new THREE.BoxGeometry(
      0.15 * s, 0.12 * s, length + 0.2 * s,
    );
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

    const postGeometry = new THREE.BoxGeometry(postWidth, postHeight, postWidth);
    for (let i = 0; i < postCount; i++) {
      const x = -fenceLength / 2 + i * actualSpacing;
      const heightVariation = 1 + (random() - 0.5) * 0.15;
      const post = new THREE.Mesh(postGeometry, i % 3 === 0 ? darkWoodMaterial : woodMaterial);
      post.position.set(x, (postHeight * heightVariation) / 2, 0);
      post.scale.y = heightVariation;
      post.castShadow = true;
      this.mesh.add(post);
    }

    // Rails connecting posts
    for (let i = 0; i < postCount - 1; i++) {
      const x0 = -fenceLength / 2 + i * actualSpacing;
      const midX = x0 + actualSpacing / 2;
      const railGeometry = new THREE.BoxGeometry(actualSpacing, railHeight, postWidth * 0.8);

      const topRail = new THREE.Mesh(railGeometry, woodMaterial);
      topRail.position.set(midX, postHeight - railHeight, 0);
      topRail.castShadow = true;
      this.mesh.add(topRail);

      const midRail = new THREE.Mesh(railGeometry, woodMaterial);
      midRail.position.set(midX, postHeight * 0.5, 0);
      midRail.castShadow = true;
      this.mesh.add(midRail);
    }
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
