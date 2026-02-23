# Environment Variety Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tree variants (oak/pine/willow), house variants (cottage/stone/hall), stone walls, and brooks with movement speed penalty.

**Architecture:** Extend the existing `Obstacle` class with new creation methods, update `ObstacleType` union across types files and `ScenarioLoader`, add `getSpeedMultiplier()` to `Obstacle` for brook speed penalty, and integrate the penalty into `MovementSystem.moveUnit()`. Brook speed penalty also needs an `ObstacleComponent` extension with `speedMultiplier`.

**Tech Stack:** Three.js, TypeScript, Vitest

---

### Task 1: Update ObstacleType in types files

**Files:**
- Modify: `src/types/index.ts` (lines 19-25, 27-32)
- Modify: `src/entities/Obstacle.ts` (lines 4-10, 12-17)

**Step 1: Update `src/types/index.ts` — expand ObstacleType and ScenarioObstacle**

```typescript
// Replace lines 19-32 in src/types/index.ts
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

export interface ScenarioObstacle {
  type: ObstacleType;
  position: { x: number; z: number };
  rotation?: number;
  scale?: number;
  length?: number;
}
```

**Step 2: Update `src/entities/Obstacle.ts` — match ObstacleType and ObstacleData**

```typescript
// Replace the ObstacleType and ObstacleData at top of Obstacle.ts
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
```

**Step 3: Run tests to confirm nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass (types are wider, no breaks)

**Step 4: Commit**

```
feat: expand ObstacleType with tree/house variants, stone_wall, brook
```

---

### Task 2: Add tree variant creation methods to Obstacle

**Files:**
- Modify: `src/entities/Obstacle.ts`

**Step 1: Normalize legacy types in constructor and add switch cases**

In the `Obstacle` constructor, add normalization before the switch:
```typescript
// At start of constructor, after setting this.type:
let normalizedType = data.type;
if (normalizedType === "tree") normalizedType = "tree_pine"; // existing tree looks like pine
if (normalizedType === "house") normalizedType = "house_stone"; // existing house looks like stone

// Then use normalizedType in the switch
```

Add new switch cases:
```typescript
case "tree":
case "tree_pine":
  this.createTreePine(scale);       // existing createTree renamed
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
```

**Step 2: Rename `createTree` to `createTreePine` (keep existing implementation)**

Just rename the method. The existing tree already looks like a pine (layered cones).

**Step 3: Add `createTreeOak` method**

```typescript
private createTreeOak(scale: number): void {
  // Thick trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.25 * scale, 1.0 * scale, 8);
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
```

**Step 4: Add `createTreeWillow` method**

```typescript
private createTreeWillow(scale: number): void {
  // Medium trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.18 * scale, 0.22 * scale, 0.9 * scale, 8);
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

  // Drooping branches (6 thin cylinders hanging from canopy)
  const branchMaterial = createPrintedMaterial({ color: 0x556b2f });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const branchGeometry = new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 0.8 * scale, 4);
    const branch = new THREE.Mesh(branchGeometry, branchMaterial);
    branch.position.set(
      Math.cos(angle) * 0.9 * scale,
      0.7 * scale,
      Math.sin(angle) * 0.9 * scale
    );
    branch.castShadow = true;
    this.mesh.add(branch);
  }
}
```

**Step 5: Run tests and verify build**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```
feat: add tree_oak and tree_willow visual variants with different collision radii
```

---

### Task 3: Add house variant creation methods to Obstacle

**Files:**
- Modify: `src/entities/Obstacle.ts`

**Step 1: Add switch cases for house variants**

```typescript
case "house":
case "house_stone":
  this.createHouseStone(scale);     // existing createHouse renamed
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
```

**Step 2: Rename `createHouse` to `createHouseStone`, update colors to grey stone**

Change base color from `0xDEB887` to `0xA0A0A0`, roof from `0x8B0000` to `0x505050`. Add chimney.

```typescript
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
```

**Step 3: Add `createHouseCottage` method**

```typescript
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
```

**Step 4: Add `createHouseHall` method**

```typescript
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
    const xOffset = -1.0 * scale + (i * 0.67) * scale;
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
```

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```
feat: add house_cottage, house_stone, house_hall visual variants
```

---

### Task 4: Add stone_wall obstacle type

**Files:**
- Modify: `src/entities/Obstacle.ts`

**Step 1: Add `length` property to `Obstacle` class and stone_wall switch case**

Add `public readonly length: number;` to the class. Set it in constructor:
```typescript
this.length = data.length ?? 4;
```

Switch case:
```typescript
case "stone_wall":
  this.createStoneWall(scale);
  this.collisionRadius = this.length / 2 * scale; // approximate
  this.isPassable = false;
  break;
```

**Step 2: Add `createStoneWall` method**

```typescript
private createStoneWall(scale: number): void {
  const wallLength = this.length * scale;
  const wallHeight = 0.6 * scale;
  const wallDepth = 0.5 * scale;
  const stoneColors = [0x808080, 0x909090, 0x707060];

  // Use position-based seed for consistent randomness
  const seed = Math.abs(this.position.x * 1000 + this.position.z * 31);
  let rng = seed;
  const random = () => {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 0x7fffffff;
  };

  // Generate stones in rows
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
        (random() - 0.5) * 0.05 * scale
      );
      stone.castShadow = true;
      this.mesh.add(stone);

      x += stoneWidth + 0.02 * scale;
    }
  }
}
```

**Step 3: Override `collidesWithPoint` for stone_wall with AABB**

Add stone_wall case to `collidesWithPoint`:
```typescript
if (this.type === "stone_wall") {
  const halfLength = (this.length * (data_scale)) / 2;
  const halfWidth = 0.4;
  const cos = Math.cos(this.mesh.rotation.y);
  const sin = Math.sin(this.mesh.rotation.y);
  const localX = cos * (x - this.position.x) + sin * (z - this.position.z);
  const localZ = -sin * (x - this.position.x) + cos * (z - this.position.z);
  return Math.abs(localX) < halfLength + radius && Math.abs(localZ) < halfWidth + radius;
}
```

Note: We need to store the scale for collision. Add `private readonly scale: number;` and set `this.scale = data.scale ?? 1;` in constructor.

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```
feat: add stone_wall obstacle type with position-seeded random stones
```

---

### Task 5: Add brook obstacle type

**Files:**
- Modify: `src/entities/Obstacle.ts`

**Step 1: Add brook switch case**

```typescript
case "brook":
  this.createBrook(scale);
  this.collisionRadius = 0;
  this.isPassable = true;
  break;
```

**Step 2: Add `createBrook` method**

Similar to river but narrower, lighter blue, faster flow:

```typescript
private createBrook(scale: number): void {
  const s = scale;
  const halfLen = (this.length / 2) * s;
  const halfW = 0.5 * s;
  const curve = 0.6 * s;

  // Curved brook shape (narrow meandering stream)
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
  for (let i = 0; i < 6; i++) {
    const t = (i / 5) * 2 - 1; // -1 to 1
    const pebbleGeometry = new THREE.DodecahedronGeometry(
      (0.08 + Math.random() * 0.04) * s, 0
    );
    const pebble = new THREE.Mesh(pebbleGeometry, pebbleMaterial);
    const side = i % 2 === 0 ? 1 : -1;
    pebble.position.set(
      (halfW + 0.15 * s) * side,
      0.04,
      t * halfLen * 0.8
    );
    this.mesh.add(pebble);
  }
}
```

**Step 3: Update the `update()` method to also animate brook**

```typescript
update(deltaTime: number): void {
  if (this.type === "river" || this.type === "brook") {
    this.riverFlowTime += deltaTime;
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData?.flowMaterial) {
        (child.userData.flowMaterial as THREE.ShaderMaterial).uniforms.uTime.value = this.riverFlowTime;
      }
    });
  }
}
```

**Step 4: Add `getSpeedMultiplier` method**

```typescript
getSpeedMultiplier(x: number, z: number, radius: number): number {
  if (this.type !== "brook") return 1.0;
  // Use same bounds check approach as river collision
  const s = this.scale;
  const halfWidth = 1.2 * s; // brook width + curve amplitude
  const halfLength = (this.length / 2 + 0.5) * s;
  const cos = Math.cos(this.mesh.rotation.y);
  const sin = Math.sin(this.mesh.rotation.y);
  const localX = cos * (x - this.position.x) + sin * (z - this.position.z);
  const localZ = -sin * (x - this.position.x) + cos * (z - this.position.z);
  if (Math.abs(localX) < halfWidth + radius && Math.abs(localZ) < halfLength + radius) {
    return 0.5;
  }
  return 1.0;
}
```

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```
feat: add brook obstacle type with animated water and speed multiplier
```

---

### Task 6: Update ScenarioLoader and ObstacleComponent for new types

**Files:**
- Modify: `src/engine/data/ScenarioLoader.ts` (lines 18-38)
- Modify: `src/engine/components/index.ts` (ObstacleComponent)

**Step 1: Update `obstacleRadiusAndPassable` in ScenarioLoader.ts**

Add all new type cases:

```typescript
function obstacleRadiusAndPassable(
  def: ScenarioObstacle
): { radius: number; isPassable: boolean; speedMultiplier?: number } {
  const scale = def.scale ?? 1;
  switch (def.type) {
    case 'tree':
    case 'tree_pine':
      return { radius: 0.4 * scale, isPassable: false };
    case 'tree_oak':
      return { radius: 0.7 * scale, isPassable: false };
    case 'tree_willow':
      return { radius: 1.0 * scale, isPassable: false };
    case 'house':
    case 'house_stone':
      return { radius: 1.5 * scale, isPassable: false };
    case 'house_cottage':
      return { radius: 1.0 * scale, isPassable: false };
    case 'house_hall':
      return { radius: 2.2 * scale, isPassable: false };
    case 'rock':
      return { radius: 0.8 * scale, isPassable: false };
    case 'stone_wall':
      return { radius: (def.length ?? 4) / 2 * scale, isPassable: false };
    case 'river':
      return { radius: 1.5 * scale, isPassable: false };
    case 'brook':
      return { radius: 0, isPassable: true, speedMultiplier: 0.5 };
    case 'bridge':
      return { radius: 0, isPassable: true };
    case 'fence':
      return { radius: 0.4 * scale, isPassable: false };
    default:
      return { radius: 1, isPassable: false };
  }
}
```

**Step 2: Add `speedMultiplier` to ObstacleComponent**

In `src/engine/components/index.ts`:

```typescript
export interface ObstacleComponent extends Component {
  type: 'obstacle';
  radius: number;
  isPassable: boolean;
  speedMultiplier?: number; // 1.0 = normal, 0.5 = brook slowing
}
```

**Step 3: Update obstacle entity creation in ScenarioLoader to pass speedMultiplier**

```typescript
const { radius, isPassable, speedMultiplier } = obstacleRadiusAndPassable(def);
// ...
world.addComponent<ObstacleComponent>(id, {
  type: 'obstacle',
  radius,
  isPassable,
  ...(speedMultiplier != null && { speedMultiplier }),
});
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```
feat: update ScenarioLoader and ObstacleComponent for new obstacle types
```

---

### Task 7: Write test for brook speed penalty in MovementSystem

**Files:**
- Modify: `tests/engine/systems/MovementSystem.test.ts`

**Step 1: Write the failing test**

```typescript
describe('brook speed penalty', () => {
  it('reduces movement distance when path crosses a brook', () => {
    const entity = createMobileUnit(0, 0);
    // Place a brook obstacle at (3, 0) — passable but slows movement
    const brookId = world.createEntity();
    world.addComponent<PositionComponent>(brookId, {
      type: 'position', x: 3, y: 0, facing: 0,
    });
    world.addComponent<ObstacleComponent>(brookId, {
      type: 'obstacle', radius: 0, isPassable: true, speedMultiplier: 0.5,
    });

    // Move through the brook
    MovementSystem.moveUnit(world, eventBus, entity, 6, 0, 'advance', 12, 1);

    const pos = world.getComponent<PositionComponent>(entity, 'position');
    // With advance mode (0.5 multiplier) and base speed 12: max distance = 6
    // But brook halves effective movement, so distance should be less than 6
    expect(pos!.x).toBeLessThan(6);
    expect(pos!.x).toBeGreaterThan(0);
  });

  it('does not reduce movement when path does not cross a brook', () => {
    const entity = createMobileUnit(0, 0);
    // Place a brook far away
    const brookId = world.createEntity();
    world.addComponent<PositionComponent>(brookId, {
      type: 'position', x: 20, y: 20, facing: 0,
    });
    world.addComponent<ObstacleComponent>(brookId, {
      type: 'obstacle', radius: 0, isPassable: true, speedMultiplier: 0.5,
    });

    MovementSystem.moveUnit(world, eventBus, entity, 6, 0, 'advance', 12, 1);

    const pos = world.getComponent<PositionComponent>(entity, 'position');
    expect(pos!.x).toBe(6);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/systems/MovementSystem.test.ts`
Expected: FAIL — brook speed penalty not yet implemented in MovementSystem

**Step 3: Commit**

```
test: add failing tests for brook speed penalty in MovementSystem
```

---

### Task 8: Implement brook speed penalty in MovementSystem

**Files:**
- Modify: `src/engine/systems/MovementSystem.ts`

**Step 1: Add speed penalty check to `moveUnit`**

After calculating `maxDistance` but before computing `newX`/`newY`, check for brook obstacles along the path:

```typescript
// After line: const maxDistance = baseSpeed * modeCost.speedMultiplier;
// Check for brook speed penalties along the movement path
let speedMultiplier = 1.0;
const obstacles = world.query('position', 'obstacle');
for (const obsId of obstacles) {
  const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
  const obsPos = world.getComponent<PositionComponent>(obsId, 'position');
  if (!obs || !obsPos || obs.speedMultiplier == null || obs.speedMultiplier >= 1.0) continue;

  // Check if the movement path passes near this obstacle
  // Simple check: is the obstacle within range of the line from->target?
  const distToLine = this.pointToSegmentDistance(
    obsPos.x, obsPos.y, fromX, fromY, targetX, targetY
  );
  if (distToLine < 2.0) { // Within brook influence range
    speedMultiplier = Math.min(speedMultiplier, obs.speedMultiplier);
  }
}
const effectiveMaxDistance = maxDistance * speedMultiplier;
```

Then use `effectiveMaxDistance` instead of `maxDistance` for clamping.

**Step 2: Add `pointToSegmentDistance` helper**

```typescript
/** Distance from point (px,py) to closest point on segment (ax,ay)-(bx,by). */
private static pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return this.calculateDistance(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return this.calculateDistance(px, py, ax + t * dx, ay + t * dy);
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/engine/systems/MovementSystem.test.ts`
Expected: All tests pass (including new brook tests)

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```
feat: implement brook speed penalty in MovementSystem
```

---

### Task 9: Update TurnBasedGame.setupTerrain for new types

**Files:**
- Modify: `src/game/TurnBasedGame.ts` (setupTerrain method, ~line 543-559)

**Step 1: Remove the narrow type assertion in setupTerrain**

Change the type assertion from the limited union to `ObstacleType`:

```typescript
// Before:
const obstacle = new Obstacle({
  type: def.type as "tree" | "house" | "rock" | "river" | "bridge" | "fence",
  ...
});

// After:
const obstacle = new Obstacle({
  type: def.type as ObstacleType,
  position: def.position,
  rotation: def.rotation,
  scale: def.scale,
  length: (def as { length?: number }).length,
});
```

Import `ObstacleType` from `../entities/Obstacle`.

**Step 2: Store obstacles for brook animation updates**

Add `private obstacles: Obstacle[] = [];` field. In `setupTerrain`, push each created obstacle. In the animate loop, call `obstacle.update(deltaTime)` for each.

In `clearScenario`, reset `this.obstacles = []`.

**Step 3: Run tests and verify build**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass

**Step 4: Commit**

```
feat: update TurnBasedGame to support all new obstacle types and brook animation
```

---

### Task 10: Update scenarios with environmental variety

**Files:**
- Modify: `src/data/scenarios.ts`

**Step 1: Update Quick Skirmish**

Replace trees with `tree_oak` and `tree_pine`, add a short brook:

```typescript
obstacles: [
  { type: "tree_oak", position: { x: -2, z: 4 } },
  { type: "tree_pine", position: { x: 2, z: -3 } },
  { type: "rock", position: { x: 0, z: 2 }, scale: 0.9 },
  { type: "rock", position: { x: -1, z: -4 } },
  { type: "fence", position: { x: -8, z: -6 }, rotation: 0.5 },
  { type: "fence", position: { x: 8, z: 6 }, rotation: -0.3 },
  { type: "brook", position: { x: 6, z: -6 }, rotation: 0.8, length: 5 },
],
```

**Step 2: Update The Duel**

Add `tree_pine` variants, add a stone wall:

```typescript
obstacles: [
  { type: "rock", position: { x: 0, z: 3 }, scale: 1.1 },
  { type: "rock", position: { x: 1, z: -2 } },
  { type: "tree_pine", position: { x: -6, z: 5 } },
  { type: "tree_pine", position: { x: 6, z: -4 } },
  { type: "fence", position: { x: -3, z: -6 }, rotation: 0 },
  { type: "fence", position: { x: 3, z: 6 }, rotation: Math.PI / 2 },
  { type: "stone_wall", position: { x: 0, z: 0 }, rotation: 0.3, length: 3 },
],
```

**Step 3: Update Tutorial**

Mix tree types, cottage, stone wall:

```typescript
obstacles: [
  { type: "rock", position: { x: 0, z: 6 } },
  { type: "rock", position: { x: 0, z: -6 } },
  { type: "rock", position: { x: 4, z: 2 } },
  { type: "tree_oak", position: { x: -4, z: 8 } },
  { type: "tree_pine", position: { x: 6, z: 4 } },
  { type: "tree_pine", position: { x: 6, z: -6 } },
  { type: "tree_oak", position: { x: -2, z: -10 } },
  { type: "tree_willow", position: { x: 10, z: -8 } },
  { type: "fence", position: { x: -12, z: 0 }, rotation: -0.2 },
  { type: "fence", position: { x: -12, z: 2 }, rotation: -0.2 },
  { type: "house_cottage", position: { x: 12, z: 10 }, rotation: 0.2, scale: 0.9 },
  { type: "stone_wall", position: { x: -10, z: -3 }, rotation: 0, length: 4 },
],
```

**Step 4: Update Forest Ambush**

Heavy tree mix, brook, willows:

```typescript
obstacles: [
  // Pine trees scattered around
  { type: "tree_pine", position: { x: -8, z: 8 } },
  { type: "tree_pine", position: { x: -10, z: 5 } },
  { type: "tree_pine", position: { x: -12, z: 10 } },
  { type: "tree_pine", position: { x: -8, z: -8 } },
  { type: "tree_pine", position: { x: -10, z: -5 } },
  { type: "tree_pine", position: { x: -12, z: -10 } },
  // Oak trees
  { type: "tree_oak", position: { x: 5, z: 12 } },
  { type: "tree_oak", position: { x: 3, z: 10 } },
  { type: "tree_oak", position: { x: 5, z: -12 } },
  { type: "tree_oak", position: { x: 3, z: -10 } },
  // Willows near the brook
  { type: "tree_willow", position: { x: 16, z: 8 } },
  { type: "tree_willow", position: { x: 16, z: -8 } },
  { type: "tree_pine", position: { x: 18, z: 5 } },
  { type: "tree_pine", position: { x: 18, z: -5 } },
  // Rocks
  { type: "rock", position: { x: 0, z: 8 } },
  { type: "rock", position: { x: 0, z: -8 } },
  { type: "rock", position: { x: 8, z: 0 }, scale: 1.2 },
  // Brook running through the forest
  { type: "brook", position: { x: 15, z: 0 }, rotation: 0, length: 10 },
  // Fences
  { type: "fence", position: { x: -14, z: 12 }, rotation: 0.4 },
  { type: "fence", position: { x: -14, z: -12 }, rotation: -0.3 },
],
```

**Step 5: Update Orc Patrol**

Village variety, stone walls, brook, mixed trees:

```typescript
obstacles: [
  // Village buildings - variety
  { type: "house_cottage", position: { x: -5, z: 10 }, rotation: 0.3 },
  { type: "house_stone", position: { x: -2, z: 12 }, rotation: -0.2 },
  { type: "house_stone", position: { x: -5, z: -10 }, rotation: -0.3 },
  { type: "house_hall", position: { x: -2, z: -12 }, rotation: 0.2 },
  // Stone walls around village
  { type: "stone_wall", position: { x: -6, z: 6 }, rotation: 0, length: 5 },
  { type: "stone_wall", position: { x: -6, z: -6 }, rotation: 0, length: 5 },
  // Rocks along the path
  { type: "rock", position: { x: 0, z: 6 }, scale: 1.2 },
  { type: "rock", position: { x: 0, z: -6 }, scale: 1.2 },
  { type: "rock", position: { x: 12, z: 0 }, scale: 0.8 },
  // Trees - mixed types
  { type: "tree_pine", position: { x: 15, z: 10 } },
  { type: "tree_oak", position: { x: 17, z: 8 } },
  { type: "tree_pine", position: { x: 15, z: -10 } },
  { type: "tree_oak", position: { x: 17, z: -8 } },
  // Brook through village
  { type: "brook", position: { x: -8, z: 0 }, rotation: 0.2, length: 8 },
  // Fences
  { type: "fence", position: { x: -3, z: 14 }, rotation: -0.5 },
  { type: "fence", position: { x: -3, z: -14 }, rotation: 0.3 },
],
```

**Step 6: Update Troll Bridge**

Brook feeding into river, willows, stone walls, mixed trees:

```typescript
obstacles: [
  // River
  { type: "river", position: { x: -5, z: 8 }, rotation: 0 },
  { type: "river", position: { x: -5, z: -8 }, rotation: 0 },
  // Bridge
  { type: "bridge", position: { x: -5, z: 0 }, rotation: 0 },
  // Brook feeding into river from east
  { type: "brook", position: { x: 5, z: 8 }, rotation: -0.5, length: 8 },
  // Trees - willows near water, mixed elsewhere
  { type: "tree_willow", position: { x: -12, z: 10 } },
  { type: "tree_willow", position: { x: -10, z: 12 } },
  { type: "tree_oak", position: { x: -12, z: -10 } },
  { type: "tree_pine", position: { x: -10, z: -12 } },
  { type: "tree_oak", position: { x: 12, z: 10 } },
  { type: "tree_willow", position: { x: 10, z: 12 } },
  { type: "tree_pine", position: { x: 12, z: -10 } },
  { type: "tree_oak", position: { x: 10, z: -12 } },
  // Rocks near the bridge
  { type: "rock", position: { x: 3, z: 5 } },
  { type: "rock", position: { x: 3, z: -5 } },
  // Structures
  { type: "house_stone", position: { x: -18, z: 6 }, rotation: 0.4, scale: 0.85 },
  { type: "stone_wall", position: { x: -20, z: 0 }, rotation: 0, length: 6 },
],
```

**Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass (scenario loader tests should adapt since we're changing scenarios)

**Step 8: Commit**

```
feat: update all scenarios with tree/house variety, stone walls, and brooks
```

---

### Task 11: Update ScenarioLoader tests

**Files:**
- Modify: `tests/engine/data/ScenarioLoader.test.ts`

**Step 1: Add test for new obstacle types loading correctly**

```typescript
it('creates obstacle entities for new types (stone_wall, brook, tree variants)', () => {
  const scenario = scenarios.find((s) => s.id === 'orc_patrol');
  expect(scenario).toBeDefined();

  loadScenario(world, scenario!);

  const obstacles = world.query('position', 'obstacle');
  expect(obstacles.length).toBeGreaterThan(0);

  // Check that brook has speedMultiplier
  let foundBrook = false;
  for (const obsId of obstacles) {
    const obs = world.getComponent<ObstacleComponent>(obsId, 'obstacle');
    if (obs?.isPassable && obs?.speedMultiplier === 0.5) {
      foundBrook = true;
    }
  }
  expect(foundBrook).toBe(true);
});
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```
test: add ScenarioLoader test for new obstacle types
```

---

### Task 12: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Run dev server and visually verify**

Run: `npm run dev`
Expected: Open browser, select scenarios, verify:
- Different tree shapes visible (pine cones, oak spheres, willow drooping)
- Different house sizes/styles visible
- Stone walls look like stacked stones
- Brooks animate with flowing water

**Step 4: Commit any final tweaks**

```
chore: final cleanup for environment variety feature
```
