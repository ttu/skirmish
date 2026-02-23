import * as THREE from "three";
import { UnitType } from "../types";
import { createPrintedMaterial } from "../utils/PrintedMaterial";

/** Create a coin/token marker for a unit with raised rim and unit-specific icon. */
export function buildUnitMesh(
  type: UnitType,
  color: number,
  scale: number
): THREE.Group {
  const bodyGroup = new THREE.Group();
  const mat = (c: number) => createPrintedMaterial({ color: c });

  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bodyGroup.add(mesh);
  };

  const s = scale;
  const coinRadius = 0.4 * s;
  const coinHeight = 0.12 * s;
  const rimHeight = 0.02 * s;

  const rimColor = darkenColor(color, 0.6);
  const iconColor = darkenColor(color, 0.3);

  const coinGeometry = new THREE.CylinderGeometry(
    coinRadius,
    coinRadius,
    coinHeight,
    32
  );
  const coin = new THREE.Mesh(coinGeometry, mat(color));
  coin.position.y = coinHeight / 2;
  add(coin);

  const rimGeometry = new THREE.TorusGeometry(
    coinRadius * 0.85,
    rimHeight,
    8,
    32
  );
  const rim = new THREE.Mesh(rimGeometry, mat(rimColor));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = coinHeight + rimHeight / 2;
  add(rim);

  const iconGroup = createUnitIcon(
    type,
    coinRadius * 0.6,
    rimHeight * 1.5,
    iconColor,
    mat
  );
  iconGroup.position.y = coinHeight;
  bodyGroup.add(iconGroup);
  iconGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return bodyGroup;
}

function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function createUnitIcon(
  type: UnitType,
  size: number,
  height: number,
  color: number,
  mat: (c: number) => THREE.Material
): THREE.Group {
  const group = new THREE.Group();

  switch (type) {
    case "warrior": {
      const bladeLength = size * 0.8;
      const bladeWidth = size * 0.12;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(bladeWidth, height, bladeLength),
        mat(color)
      );
      blade.position.z = bladeLength * 0.1;
      group.add(blade);
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.5, height, bladeWidth),
        mat(color)
      );
      guard.position.z = -bladeLength * 0.3;
      group.add(guard);
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(bladeWidth * 0.8, height, size * 0.25),
        mat(color)
      );
      handle.position.z = -bladeLength * 0.55;
      group.add(handle);
      break;
    }
    case "archer": {
      const bowRadius = size * 0.4;
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(bowRadius, size * 0.05, 6, 12, Math.PI),
        mat(color)
      );
      bow.rotation.z = Math.PI / 2;
      bow.rotation.x = -Math.PI / 2;
      bow.position.x = -size * 0.1;
      group.add(bow);
      const string = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.02, height, bowRadius * 2),
        mat(color)
      );
      string.position.x = -size * 0.1;
      group.add(string);
      const arrowShaft = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.03, height, size * 0.7),
        mat(color)
      );
      arrowShaft.position.x = size * 0.15;
      group.add(arrowShaft);
      const arrowHead = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.08, size * 0.15, 3),
        mat(color)
      );
      arrowHead.rotation.x = -Math.PI / 2;
      arrowHead.position.set(size * 0.15, height / 2, size * 0.4);
      group.add(arrowHead);
      break;
    }
    case "knight": {
      const shieldSize = size * 0.7;
      const shield = new THREE.Mesh(
        new THREE.CylinderGeometry(
          shieldSize * 0.4,
          shieldSize * 0.6,
          height,
          6
        ),
        mat(color)
      );
      group.add(shield);
      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.08, height * 1.5, shieldSize * 0.8),
        mat(darkenColor(color, 0.5))
      );
      crossV.position.y = height * 0.25;
      group.add(crossV);
      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(shieldSize * 0.6, height * 1.5, size * 0.08),
        mat(darkenColor(color, 0.5))
      );
      crossH.position.y = height * 0.25;
      crossH.position.z = -shieldSize * 0.1;
      group.add(crossH);
      break;
    }
    case "healer": {
      const crossSize = size * 0.7;
      const barWidth = crossSize * 0.3;
      const vBar = new THREE.Mesh(
        new THREE.BoxGeometry(barWidth, height, crossSize),
        mat(color)
      );
      group.add(vBar);
      const hBar = new THREE.Mesh(
        new THREE.BoxGeometry(crossSize, height, barWidth),
        mat(color)
      );
      group.add(hBar);
      break;
    }
    case "goblin": {
      const daggerLength = size * 0.8;
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.15, daggerLength * 0.7, 3),
        mat(color)
      );
      blade.rotation.x = -Math.PI / 2;
      blade.position.z = daggerLength * 0.2;
      group.add(blade);
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.12, height, daggerLength * 0.3),
        mat(color)
      );
      handle.position.z = -daggerLength * 0.25;
      group.add(handle);
      break;
    }
    case "orc_warrior": {
      const axeSize = size * 0.7;
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.08, height, axeSize),
        mat(color)
      );
      group.add(handle);
      const axeHead = new THREE.Mesh(
        new THREE.CylinderGeometry(
          axeSize * 0.4,
          axeSize * 0.4,
          height,
          16,
          1,
          false,
          0,
          Math.PI
        ),
        mat(color)
      );
      axeHead.rotation.z = Math.PI / 2;
      axeHead.rotation.y = Math.PI / 2;
      axeHead.position.z = axeSize * 0.35;
      axeHead.position.x = axeSize * 0.2;
      group.add(axeHead);
      break;
    }
    case "orc_archer": {
      const bowRadius = size * 0.35;
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(bowRadius, size * 0.08, 6, 12, Math.PI),
        mat(color)
      );
      bow.rotation.z = Math.PI / 2;
      bow.rotation.x = -Math.PI / 2;
      group.add(bow);
      const string = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.03, height, bowRadius * 2),
        mat(color)
      );
      group.add(string);
      break;
    }
    case "troll": {
      const clubLength = size * 0.9;
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.06, size * 0.1, clubLength * 0.5, 8),
        mat(color)
      );
      handle.rotation.x = -Math.PI / 2;
      handle.position.z = -clubLength * 0.2;
      group.add(handle);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.25, 8, 8),
        mat(color)
      );
      head.position.z = clubLength * 0.25;
      head.position.y = height / 2;
      head.scale.set(1, 0.6, 1.2);
      group.add(head);
      break;
    }
    default: {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.4, size * 0.4, height, 16),
        mat(color)
      );
      group.add(marker);
    }
  }

  return group;
}
