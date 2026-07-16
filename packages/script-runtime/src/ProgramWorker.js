import "../../../vendor/ses/ses.umd.min.js";
import {
  executeProgramRequest
} from "./ProgramWorkerKernel.js";
import {
  PROGRAM_WORKER_PROTOCOL_VERSION
} from "./ProgramRunController.js";

globalThis.lockdown({
  errorTaming: "safe",
  consoleTaming: "safe",
  overrideTaming: "severe"
});

self.addEventListener("message", event => {
  const message = event?.data;

  if (
    message?.protocolVersion !== PROGRAM_WORKER_PROTOCOL_VERSION ||
    message?.type !== "program.run"
  ) {
    return;
  }

  const envelope = executeProgramRequest(
    message.request,
    {
      evaluate(source, endowments) {
        const compartment = new globalThis.Compartment(
          globalThis.harden(endowments)
        );
        return compartment.evaluate(source);
      }
    }
  );

  self.postMessage(envelope);
});
