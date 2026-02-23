export type ScreenState = "menu" | "game" | "game-over-victory" | "game-over-defeat";

export class ScreenStateManager {
  private currentState: ScreenState = "menu";
  private pauseMenuVisible = false;

  private menuEl: HTMLElement;
  private hudEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private gameOverTitleEl: HTMLElement;
  private pauseMenuEl: HTMLElement;
  private turnBasedPanelEl: HTMLElement | null = null;

  constructor() {
    this.menuEl = document.getElementById("menu")!;
    this.hudEl = document.getElementById("hud")!;
    this.gameOverEl = document.getElementById("game-over")!;
    this.gameOverTitleEl = document.getElementById("game-over-title")!;
    this.pauseMenuEl = document.getElementById("pause-menu")!;
  }

  /** Call after the turn-based panel is dynamically created. */
  setTurnBasedPanel(el: HTMLElement | null): void {
    this.turnBasedPanelEl = el;
  }

  transitionTo(state: ScreenState): void {
    this.currentState = state;
    this.pauseMenuVisible = false;
    this.pauseMenuEl.classList.remove("visible");

    switch (state) {
      case "menu":
        this.menuEl.classList.remove("hidden");
        this.hudEl.classList.remove("visible");
        this.gameOverEl.classList.remove("visible");
        this.turnBasedPanelEl?.classList.remove("visible");
        break;

      case "game":
        this.menuEl.classList.add("hidden");
        this.hudEl.classList.add("visible");
        this.gameOverEl.classList.remove("visible", "victory", "defeat");
        this.turnBasedPanelEl?.classList.add("visible");
        break;

      case "game-over-victory":
        this.gameOverEl.classList.add("visible", "victory");
        this.gameOverTitleEl.textContent = "Victory!";
        break;

      case "game-over-defeat":
        this.gameOverEl.classList.add("visible", "defeat");
        this.gameOverTitleEl.textContent = "Defeat";
        break;
    }
  }

  getState(): ScreenState {
    return this.currentState;
  }

  isInGame(): boolean {
    return this.currentState === "game";
  }

  isGameOver(): boolean {
    return this.currentState === "game-over-victory" || this.currentState === "game-over-defeat";
  }

  showPauseMenu(): void {
    this.pauseMenuVisible = true;
    this.pauseMenuEl.classList.add("visible");
  }

  hidePauseMenu(): void {
    this.pauseMenuVisible = false;
    this.pauseMenuEl.classList.remove("visible");
  }

  isPauseMenuVisible(): boolean {
    return this.pauseMenuVisible;
  }
}
