export class ScrubbableField {
  #input;
  #drag = null;
  #pixelsPerStep;

  constructor(input, { pixelsPerStep = 8 } = {}) {
    this.#input = input;
    this.#pixelsPerStep = Math.max(1, Number(pixelsPerStep) || 8);
    input.dataset.scrubbable = "true";
    input.title ||= [
      "Arraste para alterar:",
      "direita ou cima aumenta;",
      "esquerda ou baixo diminui."
    ].join(" ");
    input.addEventListener(
      "pointerdown",
      event => this.#begin(event)
    );
  }

  #begin(event) {
    const value = Number(this.#input.value);
    if (!Number.isFinite(value)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    this.#drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      value,
      moved: false,
      axis: null
    };

    this.#input.setPointerCapture?.(event.pointerId);
    this.#input.addEventListener("pointermove", this.#move);
    this.#input.addEventListener("pointerup", this.#end);
    this.#input.addEventListener("pointercancel", this.#end);
  }

  #move = event => {
    if (!this.#drag || event.pointerId !== this.#drag.id) return;

    const dx = event.clientX - this.#drag.x;
    const dy = event.clientY - this.#drag.y;

    if (!this.#drag.moved && Math.hypot(dx, dy) < 6) return;

    if (!this.#drag.axis) {
      this.#drag.axis =
        Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
    }

    this.#drag.moved = true;
    event.preventDefault();

    const pixels = this.#drag.axis === "horizontal" ? dx : -dy;
    const step = finiteStep(this.#input.step);
    const modifier = event.shiftKey
      ? 0.1
      : (event.altKey || event.ctrlKey)
        ? 10
        : 1;

    let value = snap(
      this.#drag.value +
      (pixels / this.#pixelsPerStep) * step * modifier,
      step
    );

    const minimum = Number(this.#input.min);
    const maximum = Number(this.#input.max);
    if (Number.isFinite(minimum)) value = Math.max(minimum, value);
    if (Number.isFinite(maximum)) value = Math.min(maximum, value);

    this.#input.value = formatNumber(value);
    this.#input.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  };

  #end = event => {
    if (!this.#drag || event.pointerId !== this.#drag.id) return;

    this.#input.releasePointerCapture?.(event.pointerId);
    this.#input.removeEventListener("pointermove", this.#move);
    this.#input.removeEventListener("pointerup", this.#end);
    this.#input.removeEventListener("pointercancel", this.#end);

    if (this.#drag.moved) {
      this.#input.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    }
    this.#drag = null;
  };
}

export function attachScrubbableFields(root = document) {
  return [...root.querySelectorAll('input[type="number"]')]
    .filter(input => input.dataset.scrubbable !== "true")
    .map(input => new ScrubbableField(input));
}

function finiteStep(value) {
  const step = Number(value);
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function snap(value, step) {
  return Math.round(value / step) * step;
}

function formatNumber(value) {
  if (Math.abs(value) < 1e-12) return "0";
  return Number(value.toPrecision(12)).toString();
}
