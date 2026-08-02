export class PwaInstallController {
  #window;
  #promptEvent = null;
  #mode;
  #listeners = new Set();

  constructor({ windowRef = window } = {}) {
    this.#window = windowRef;
    this.#mode = isStandalone(windowRef) ? "installed" : "manual";
    this.onBeforeInstallPrompt = this.onBeforeInstallPrompt.bind(this);
    this.onAppInstalled = this.onAppInstalled.bind(this);
    windowRef.addEventListener(
      "beforeinstallprompt",
      this.onBeforeInstallPrompt
    );
    windowRef.addEventListener("appinstalled", this.onAppInstalled);
  }

  snapshot() {
    return Object.freeze({
      mode: this.#mode,
      installed: this.#mode === "installed",
      canPrompt: this.#mode === "available" && Boolean(this.#promptEvent)
    });
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener de instalação deve ser uma função.");
    }
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  async requestInstall() {
    if (this.#mode === "installed") {
      return Object.freeze({ outcome: "installed" });
    }
    const event = this.#promptEvent;
    if (!event) return Object.freeze({ outcome: "manual" });

    this.#promptEvent = null;
    this.#mode = "installing";
    this.publish();
    try {
      const promptResult = event.prompt();
      const choice = event.userChoice
        ? await event.userChoice
        : await promptResult;
      const outcome = choice?.outcome ?? "unknown";
      if (outcome !== "accepted") this.#mode = "manual";
      this.publish();
      return Object.freeze({ outcome });
    } catch (error) {
      this.#mode = "manual";
      this.publish();
      throw error;
    }
  }

  onBeforeInstallPrompt(event) {
    event.preventDefault?.();
    if (this.#mode === "installed") return;
    this.#promptEvent = event;
    this.#mode = "available";
    this.publish();
  }

  onAppInstalled() {
    this.#promptEvent = null;
    this.#mode = "installed";
    this.publish();
  }

  publish() {
    const state = this.snapshot();
    for (const listener of this.#listeners) listener(state);
  }

  dispose() {
    this.#window.removeEventListener(
      "beforeinstallprompt",
      this.onBeforeInstallPrompt
    );
    this.#window.removeEventListener("appinstalled", this.onAppInstalled);
    this.#listeners.clear();
    this.#promptEvent = null;
  }
}

export function isStandalone(windowRef = window) {
  return Boolean(
    windowRef.matchMedia?.("(display-mode: standalone)")?.matches ||
    windowRef.navigator?.standalone === true
  );
}
