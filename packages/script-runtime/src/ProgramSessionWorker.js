import "../../../vendor/ses/ses.umd.min.js";
import {
  ProgramSessionKernel,
  createSesSessionEvaluator
} from "./ProgramSessionKernel.js";
import {
  PROGRAM_WORKER_PROTOCOL_VERSION
} from "./ProgramRunController.js";

globalThis.lockdown({
  errorTaming: "safe",
  consoleTaming: "safe",
  overrideTaming: "severe"
});

const evaluator = createSesSessionEvaluator();
const session = new ProgramSessionKernel({
  evaluate: evaluator.evaluate
});

self.addEventListener("message", event => {
  const message = event?.data;

  if (
    message?.protocolVersion !== PROGRAM_WORKER_PROTOCOL_VERSION ||
    message?.type !== "program.run"
  ) {
    return;
  }

  const envelope = session.execute(message.request);
  self.postMessage(envelope);

  if (envelope.type === "program.failed") {
    self.close();
  }
});
