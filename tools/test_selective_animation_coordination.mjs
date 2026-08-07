import {
  LocalAnimationCoordinator
} from "../packages/local-viewers/src/LocalAnimationCoordinator.js?build=20260806-0050c";

const sandbox = {
  revision: 0,
  listener: null,
  subscribe(listener) {
    this.listener = listener;
    return () => { this.listener = null; };
  },
  emit(changes) {
    this.revision += 1;
    this.listener?.({}, changes);
  }
};
let localState = "idle";
const adapter = {
  prepare(_operation, args) {
    return {
      kind: "preset",
      id: args.id,
      targetIds: [...args.targetIds],
      targetMode: "objects",
      timeDomainId: "world"
    };
  },
  apply(session) {
    localState = session.state;
    return this.status();
  },
  status() {
    return { state: localState };
  },
  sceneChanged(changes) {
    const ids = new Set(changes.map(change => change.objectId));
    const affected = ids.has("a");
    return {
      changed: affected,
      sharedAffected: affected,
      full: false
    };
  }
};
const coordinator = new LocalAnimationCoordinator({
  sandbox,
  sandboxId: "sandbox-selective-test",
  viewerId: "viewer-selective-test",
  isAuthority: () => true,
  adapter,
  channelFactory() { throw new Error("sem canal no teste"); }
});
coordinator.start();
coordinator.play("preset", { id: "spin", targetIds: ["a"] });
assert(coordinator.status().shared.state === "playing",
  "sessão deve iniciar");
sandbox.emit([{ type: "object-updated", objectId: "b" }]);
assert(coordinator.status().shared.state === "playing",
  "objeto não relacionado não pode encerrar a sessão");
sandbox.emit([{ type: "object-transform", objectId: "a" }]);
assert(coordinator.status().shared.state === "idle",
  "objeto animado alterado deve encerrar somente a sessão afetada");
coordinator.dispose();
console.log("Selective animation coordination: 3/3 testes aprovados.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
