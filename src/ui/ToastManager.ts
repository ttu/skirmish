export class ToastManager {
  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  show(message: string, durationMs = 2500): void {
    const existing = document.getElementById("temp-message");
    if (existing) existing.remove();

    const msgEl = document.createElement("div");
    msgEl.id = "temp-message";
    msgEl.textContent = message;
    this.host.appendChild(msgEl);

    setTimeout(() => msgEl.remove(), durationMs);
  }
}
