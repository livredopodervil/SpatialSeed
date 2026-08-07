import {
  pwaUpdateAvailable,
  registerPwa
} from "../packages/platform-web/src/PwaRegistration.js";

class Emitter {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn); this.listeners.set(type, set);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(); }
}

class Worker extends Emitter {
  constructor(build, state) {
    super();
    this.scriptURL = `https://127.0.0.1:8082/apps/web/service-worker.js?build=${build}`;
    this.state = state;
  }
  postMessage(message) {
    if (message?.type !== "SKIP_WAITING") return;
    this.state = "activated";
    this.emit("statechange");
    serviceWorkers.controller = this;
    serviceWorkers.emit("controllerchange");
  }
}

class Registration extends Emitter {
  constructor() {
    super();
    this.scope = "https://127.0.0.1:8082/apps/web/";
    this.active = oldWorker;
    this.waiting = newWorker;
    this.installing = null;
  }
  async update() { return this; }
}

const oldWorker = new Worker("old", "activated");
const newWorker = new Worker("20260807-0052c", "installed");
const registration = new Registration();
const serviceWorkers = new Emitter();
serviceWorkers.controller = oldWorker;
serviceWorkers.registerOptions = null;
serviceWorkers.register = async (_url, options) => {
  serviceWorkers.registerOptions = options;
  return registration;
};
serviceWorkers.getRegistrations = async () => [registration];

let reloads = 0;
const locationRef = {
  hostname: "127.0.0.1",
  href: "https://127.0.0.1:8082/apps/web/",
  reload() { reloads += 1; }
};

if (!pwaUpdateAvailable({ publishedBuild: "new", controllerBuild: "old" })) {
  throw new Error("Mismatch de controller não anuncia update.");
}

const controller = registerPwa(
  { version: "0.1.0", build: "20260807-0052c", channel: "test" },
  {
    applicationUrl: "https://127.0.0.1:8082/apps/web/boot.js?build=20260807-0052c",
    serviceWorkers,
    locationRef
  }
);
await controller.ready;
if (serviceWorkers.registerOptions?.updateViaCache !== "none") {
  throw new Error("updateViaCache não foi desabilitado.");
}
const updated = await controller.updateNow();
if (!updated) throw new Error("updateNow retornou false.");
if (serviceWorkers.controller !== newWorker) throw new Error("Controller não foi promovido.");
if (reloads !== 1) throw new Error(`Reloads inesperados: ${reloads}`);
console.log("PWA update 0052c: 4/4 testes aprovados.");
