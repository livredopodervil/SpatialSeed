import {
  executeProgramRequest
} from "./ProgramWorkerKernel.js";

export class ProgramSessionKernel {
  #evaluate;
  #revision = 0;
  #session = Object.create(null);
  #state = "active";

  constructor({ evaluate } = {}) {
    if (typeof evaluate !== "function") {
      throw new TypeError("evaluate deve ser função.");
    }

    this.#evaluate = evaluate;
  }

  execute(request) {
    if (this.#state !== "active") {
      throw new Error(
        "Sessão de programa foi invalidada e deve ser recriada."
      );
    }

    const envelope = executeProgramRequest(request, {
      evaluate: (source, endowments) =>
        this.#evaluate(source, {
          ...endowments,
          session: this.#session
        })
    });

    if (envelope.type === "program.completed") {
      this.#revision += 1;
    } else {
      this.#state = "invalid";
    }

    return envelope;
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      revision: this.#revision,
      keys: Object.freeze(Object.keys(this.#session).sort())
    });
  }
}

export function createSesSessionEvaluator({
  CompartmentClass = globalThis.Compartment
} = {}) {
  if (typeof CompartmentClass !== "function") {
    throw new Error("SES Compartment não está disponível.");
  }

  let compartment = null;
  let session = null;

  return Object.freeze({
    evaluate(source, endowments) {
      if (!endowments || typeof endowments !== "object") {
        throw new TypeError("Endowments de sessão inválidos.");
      }

      if (!compartment) {
        session = endowments.session;
        compartment = new CompartmentClass(endowments);
        Object.defineProperty(
          compartment.globalThis,
          "session",
          {
            value: session,
            writable: false,
            configurable: false,
            enumerable: true
          }
        );
      } else {
        if (endowments.session !== session) {
          throw new Error("Identidade da sessão foi alterada.");
        }

        for (const [name, value] of Object.entries(endowments)) {
          if (name === "session") continue;

          if (!Reflect.set(compartment.globalThis, name, value)) {
            throw new Error(
              `Não foi possível atualizar a capacidade ${name}.`
            );
          }
        }
      }

      return compartment.evaluate(String(source));
    }
  });
}
