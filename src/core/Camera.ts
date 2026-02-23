import * as THREE from "three";
import { eventBus } from "../utils/EventBus";

export class CameraController {
  public camera: THREE.OrthographicCamera;
  private zoom: number = 20;
  private minZoom: number = 4;
  private maxZoom: number = 50;
  private position: THREE.Vector2 = new THREE.Vector2(0, 0);
  private panSpeed: number = 20;
  private zoomSpeed: number = 0.002;
  private bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  } | null = null;

  constructor(private aspect: number) {
    this.camera = new THREE.OrthographicCamera(
      -this.zoom * aspect,
      this.zoom * aspect,
      this.zoom,
      -this.zoom,
      0.1,
      1000,
    );

    this.camera.position.set(0, 50, 30);
    this.camera.lookAt(0, 0, 0);
    this.camera.rotation.x = -Math.PI / 3;

    this.setupEvents();
  }

  private setupEvents(): void {
    eventBus.on("zoom", (data: unknown) => {
      const { delta } = data as { delta: number };
      this.setZoom(this.zoom + delta * this.zoomSpeed * this.zoom);
    });
  }

  setBounds(width: number, height: number): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    this.bounds = {
      minX: -halfWidth,
      maxX: halfWidth,
      minZ: -halfHeight,
      maxZ: halfHeight,
    };
  }

  /** Zoom camera to fit the given board dimensions with optional padding */
  zoomToFit(boardWidth: number, boardHeight: number, padding: number = 1.1): void {
    // For orthographic camera:
    // visible width = 2 * zoom * aspect
    // visible height = 2 * zoom
    // We need to fit boardWidth and boardHeight with padding
    const zoomForWidth = (boardWidth * padding) / (2 * this.aspect);
    const zoomForHeight = (boardHeight * padding) / 2;
    // Take the larger value to ensure both dimensions fit
    const targetZoom = Math.max(zoomForWidth, zoomForHeight);
    this.setZoom(targetZoom);
  }

  clearBounds(): void {
    this.bounds = null;
  }

  /** Pan by screen pixel delta (e.g. from right-click drag) */
  panByScreenDelta(
    deltaX: number,
    deltaY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const worldPerPixelX = (2 * this.zoom * this.aspect) / canvasWidth;
    const worldPerPixelY = (2 * this.zoom) / canvasHeight;
    const movement = new THREE.Vector2(
      deltaX * worldPerPixelX,
      -deltaY * worldPerPixelY,
    );
    this.position.x += movement.x;
    this.position.y += movement.y;

    if (this.bounds) {
      this.position.x = Math.max(
        this.bounds.minX,
        Math.min(this.bounds.maxX, this.position.x),
      );
      this.position.y = Math.max(
        this.bounds.minZ,
        Math.min(this.bounds.maxZ, this.position.y),
      );
    }

    this.updateCameraPosition();
  }

  pan(delta: THREE.Vector2, deltaTime: number): void {
    const movement = delta.multiplyScalar(this.panSpeed * deltaTime);

    this.position.x += movement.x;
    this.position.y += movement.y;

    if (this.bounds) {
      this.position.x = Math.max(
        this.bounds.minX,
        Math.min(this.bounds.maxX, this.position.x),
      );
      this.position.y = Math.max(
        this.bounds.minZ,
        Math.min(this.bounds.maxZ, this.position.y),
      );
    }

    this.updateCameraPosition();
  }

  setZoom(level: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, level));
    this.updateProjection();
  }

  private updateProjection(): void {
    this.camera.left = -this.zoom * this.aspect;
    this.camera.right = this.zoom * this.aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private updateCameraPosition(): void {
    this.camera.position.x = this.position.x;
    this.camera.position.z = this.position.y + 30;
    this.camera.lookAt(this.position.x, 0, this.position.y);
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.updateProjection();
  }

  worldToScreen(
    worldPos: THREE.Vector3,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } {
    const vector = worldPos.clone().project(this.camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((vector.x + 1) / 2) * rect.width + rect.left,
      y: ((-vector.y + 1) / 2) * rect.height + rect.top,
    };
  }

  screenToWorld(
    screenPos: THREE.Vector2,
    canvas: HTMLCanvasElement,
  ): THREE.Vector3 {
    const rect = canvas.getBoundingClientRect();
    const x = ((screenPos.x - rect.left) / rect.width) * 2 - 1;
    const y = -((screenPos.y - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);

    return target;
  }

  getPosition(): THREE.Vector2 {
    return this.position.clone();
  }

  getZoom(): number {
    return this.zoom;
  }

  setPosition(x: number, z: number): void {
    this.position.set(x, z);
    this.updateCameraPosition();
  }
}
