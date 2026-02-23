import * as THREE from "three";
import { eventBus } from "../utils/EventBus";

export class InputManager {
  private keys: Set<string> = new Set();
  private mousePosition: THREE.Vector2 = new THREE.Vector2();
  private isMouseDown: boolean = false;
  private mouseButton: number = -1;
  private dragStart: THREE.Vector2 = new THREE.Vector2();
  private isDragging: boolean = false;
  private readonly dragThreshold: number = 5;

  private isRightMouseDown: boolean = false;
  private lastMouseScreen: THREE.Vector2 = new THREE.Vector2();
  private hasRightDragged: boolean = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Keyboard
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    window.addEventListener("keyup", this.onKeyUp.bind(this));

    // Mouse
    this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.canvas.addEventListener("wheel", this.onWheel.bind(this));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);

    if (event.code === "Space") {
      event.preventDefault();
      eventBus.emit("togglePause");
    }

    if (event.code === "Escape") {
      eventBus.emit("escape");
    }

    if (event.code === "Backspace") {
      event.preventDefault();
      eventBus.emit("backspace");
    }

    // Speed controls: - and + keys (also = for + without shift)
    if (event.code === "Minus" || event.code === "NumpadSubtract") {
      eventBus.emit("changeSpeed", { delta: -1 });
    }
    if (event.code === "Equal" || event.code === "NumpadAdd") {
      eventBus.emit("changeSpeed", { delta: 1 });
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  private onMouseDown(event: MouseEvent): void {
    this.isMouseDown = true;
    this.mouseButton = event.button;
    this.dragStart.set(event.clientX, event.clientY);
    this.lastMouseScreen.set(event.clientX, event.clientY);
    this.isDragging = false;

    if (event.button === 2) {
      this.isRightMouseDown = true;
      this.hasRightDragged = false;
    }

    if (event.button === 0) {
      eventBus.emit("mouseDown", {
        position: this.mousePosition.clone(),
        screenPosition: new THREE.Vector2(event.clientX, event.clientY),
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
      });
    }
  }

  private onMouseUp(event: MouseEvent): void {
    const screenPos = new THREE.Vector2(event.clientX, event.clientY);

    if (event.button === 0) {
      if (this.isDragging) {
        eventBus.emit("boxSelectEnd", {
          start: this.dragStart.clone(),
          end: screenPos,
        });
      } else {
        eventBus.emit("click", {
          position: this.mousePosition.clone(),
          screenPosition: screenPos,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
        });
      }
    } else if (event.button === 2) {
      this.isRightMouseDown = false;
      if (!this.hasRightDragged) {
        eventBus.emit("rightClick", {
          position: this.mousePosition.clone(),
          screenPosition: screenPos,
        });
      }
    }

    this.isMouseDown = false;
    this.mouseButton = -1;
    this.isDragging = false;
  }

  private onMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mousePosition.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    if (this.isRightMouseDown) {
      const deltaX = event.clientX - this.lastMouseScreen.x;
      const deltaY = event.clientY - this.lastMouseScreen.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > this.dragThreshold) {
        this.hasRightDragged = true;
      }

      if (this.hasRightDragged) {
        eventBus.emit("cameraPanDrag", {
          deltaX,
          deltaY,
          canvasWidth: rect.width,
          canvasHeight: rect.height,
        });
      }
      this.lastMouseScreen.set(event.clientX, event.clientY);
    }

    if (this.isMouseDown && this.mouseButton === 0) {
      const distance = Math.sqrt(
        Math.pow(event.clientX - this.dragStart.x, 2) +
          Math.pow(event.clientY - this.dragStart.y, 2),
      );

      if (distance > this.dragThreshold) {
        if (!this.isDragging) {
          this.isDragging = true;
          eventBus.emit("boxSelectStart", {
            start: this.dragStart.clone(),
          });
        }
        eventBus.emit("boxSelectMove", {
          start: this.dragStart.clone(),
          end: new THREE.Vector2(event.clientX, event.clientY),
        });
      }
    }

    eventBus.emit("mouseMove", {
      position: this.mousePosition.clone(),
      screenPosition: new THREE.Vector2(event.clientX, event.clientY),
    });
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    eventBus.emit("zoom", { delta: event.deltaY });
  }

  isKeyPressed(code: string): boolean {
    return this.keys.has(code);
  }

  getMousePosition(): THREE.Vector2 {
    return this.mousePosition.clone();
  }

  getCameraMovement(): THREE.Vector2 {
    const movement = new THREE.Vector2();

    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) {
      movement.y += 1;
    }
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) {
      movement.y -= 1;
    }
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) {
      movement.x -= 1;
    }
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) {
      movement.x += 1;
    }

    return movement.normalize();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown.bind(this));
    window.removeEventListener("keyup", this.onKeyUp.bind(this));
  }
}
