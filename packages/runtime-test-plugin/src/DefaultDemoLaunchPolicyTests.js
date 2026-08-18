import {
  shouldStartDefaultDemoAfterRecovery
} from "../../platform-web/src/index.js?build=20260818-0054mt";

export function createDefaultDemoLaunchPolicyTests() {
  const launch = Object.freeze({ mode: "game", characterId: "fox" });
  return {
    "demo inicia quando não existe recuperação persistente"() {
      assertEqual(
        shouldStartDefaultDemoAfterRecovery(launch, { mode: "empty" }),
        true
      );
    },
    "rascunho continuado reabre em autoria sem restaurar modo jogo"() {
      assertEqual(
        shouldStartDefaultDemoAfterRecovery(launch, { mode: "continued" }),
        false
      );
    },
    "checkpoint limpo restaurado também permanece em autoria"() {
      assertEqual(
        shouldStartDefaultDemoAfterRecovery(launch, { mode: "restored-clean" }),
        false
      );
    },
    "descartar rascunho permite iniciar o fallback demo"() {
      assertEqual(
        shouldStartDefaultDemoAfterRecovery(launch, { mode: "discarded" }),
        true
      );
    },
    "viewer réplica nunca inicia demo local por conta própria"() {
      assertEqual(
        shouldStartDefaultDemoAfterRecovery(launch, { mode: "viewer-replica" }),
        false
      );
    }
  };
}

function assertEqual(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
    );
  }
}
