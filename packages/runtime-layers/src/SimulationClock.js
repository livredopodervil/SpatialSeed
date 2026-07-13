export class SimulationClock {
  constructor({
    stepSeconds = 1 / 60,
    maxCatchUpSteps = 5
  } = {}) {
    this.stepSeconds = positive(stepSeconds);
    this.maxCatchUpSteps = positiveInteger(
      maxCatchUpSteps
    );
    this.accumulator = 0;
    this.simulationTime = 0;
    this.tick = 0;
  }

  advance(elapsedSeconds, step) {
    if (typeof step !== "function") {
      throw new TypeError(
        "step deve ser função."
      );
    }

    this.accumulator += Math.max(
      0,
      Number(elapsedSeconds) || 0
    );

    let executed = 0;

    while (
      this.accumulator >= this.stepSeconds &&
      executed < this.maxCatchUpSteps
    ) {
      this.tick += 1;
      this.simulationTime += this.stepSeconds;
      this.accumulator -= this.stepSeconds;

      step({
        tick: this.tick,
        simulationTime: this.simulationTime,
        deltaSeconds: this.stepSeconds
      });

      executed += 1;
    }

    if (
      executed === this.maxCatchUpSteps &&
      this.accumulator >= this.stepSeconds
    ) {
      this.accumulator =
        this.accumulator % this.stepSeconds;
    }

    return {
      executed,
      tick: this.tick,
      simulationTime: this.simulationTime,
      interpolation:
        this.accumulator / this.stepSeconds
    };
  }

  reset() {
    this.accumulator = 0;
    this.simulationTime = 0;
    this.tick = 0;
  }
}

function positive(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(
      "Valor deve ser positivo."
    );
  }

  return number;
}

function positiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(
      "Valor deve ser inteiro positivo."
    );
  }

  return number;
}
