export class SimulationBridge {
  #listeners = new Set();
  #commands = [];
  #snapshot = null;
  #version = 0;

  constructor({
    simulatorId = "global-simulator",
    applyCommand,
    stepSimulation
  }) {
    if (typeof applyCommand !== "function") {
      throw new TypeError(
        "applyCommand deve ser função."
      );
    }

    if (typeof stepSimulation !== "function") {
      throw new TypeError(
        "stepSimulation deve ser função."
      );
    }

    this.simulatorId = String(simulatorId);
    this.applyCommand = applyCommand;
    this.stepSimulation = stepSimulation;
  }

  attachSnapshot(snapshot, version = snapshot?.version ?? 0) {
    this.#snapshot = snapshot;
    this.#version = integer(version);

    this.#notify("snapshot-attached", {
      version: this.#version
    });

    return {
      attached: true,
      version: this.#version
    };
  }

  enqueue(command) {
    this.#commands.push(
      structuredClone(command)
    );

    return {
      queued: true,
      queueLength: this.#commands.length
    };
  }

  step(context = {}) {
    if (!this.#snapshot) {
      throw new Error(
        "Nenhum snapshot foi anexado ao simulador."
      );
    }

    const accepted = [];
    const rejected = [];

    while (this.#commands.length) {
      const command = this.#commands.shift();

      if (
        Number(command.baseVersion) !==
        this.#version
      ) {
        rejected.push({
          command,
          reason: "version-conflict",
          currentVersion: this.#version
        });
        continue;
      }

      const result = this.applyCommand({
        snapshot: this.#snapshot,
        version: this.#version,
        command
      });

      if (!result?.accepted) {
        rejected.push({
          command,
          reason:
            result?.reason ??
            "command-rejected"
        });
        continue;
      }

      this.#snapshot = result.snapshot;
      this.#version = integer(
        result.version
      );

      accepted.push({
        commandId: command.commandId,
        version: this.#version
      });
    }

    const simulationResult =
      this.stepSimulation({
        snapshot: this.#snapshot,
        version: this.#version,
        context: structuredClone(context)
      });

    if (simulationResult?.changed) {
      this.#snapshot =
        simulationResult.snapshot;
      this.#version = integer(
        simulationResult.version
      );
    }

    const packet = Object.freeze({
      simulatorId: this.simulatorId,
      version: this.#version,
      accepted: Object.freeze(accepted),
      rejected: Object.freeze(rejected),
      snapshot: this.#snapshot,
      delta:
        simulationResult?.delta ??
        null,
      context:
        structuredClone(context)
    });

    this.#notify("step", packet);

    return packet;
  }

  snapshot() {
    return Object.freeze({
      simulatorId: this.simulatorId,
      version: this.#version,
      queueLength: this.#commands.length,
      attached: this.#snapshot !== null
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    listener(this.snapshot(), {
      type: "initial"
    });

    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(type, payload = null) {
    const state = this.snapshot();

    for (const listener of this.#listeners) {
      try {
        listener(state, {
          type,
          payload
        });
      } catch (error) {
        console.error(
          "SimulationBridge subscriber failed",
          error
        );
      }
    }
  }
}

function integer(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(
      "Versão deve ser inteiro não negativo."
    );
  }

  return number;
}
