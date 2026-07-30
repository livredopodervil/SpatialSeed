const MODES = new Set(["rectangle", "brush", "lasso", "eraser"]);

export class SelectionMarquee {
  #canvas;
  #element;
  #complete;
  #gesture = null;
  #mode = "rectangle";
  #radiusPixels = 24;
  #path;
  #cursor;
  #svg;
  #navigation;
  #navigationToken = null;
  enabled = false;

  constructor({ canvas, element, navigation = null, onComplete }) {
    this.#canvas = canvas;
    this.#element = element;
    this.#navigation = navigation;
    this.#complete = onComplete;
    this.#svg = element.querySelector?.("svg") ?? null;
    this.#path = element.querySelector?.("[data-selection-gesture-path]") ?? null;
    this.#cursor = element.querySelector?.("[data-selection-gesture-cursor]") ?? null;
    canvas.addEventListener("pointerdown", this.#down, true);
  }

  setEnabled(value) {
    const enabled = Boolean(value);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.#navigationToken =
        this.#navigation?.acquireToolGestureNavigation?.(
          "selection-gesture"
        ) ?? null;
    } else {
      this.cancel();
      if (this.#navigationToken) {
        this.#navigation?.releaseToolGestureNavigation?.(
          this.#navigationToken
        );
        this.#navigationToken = null;
      }
    }
  }

  setMode(mode, { radiusPixels = this.#radiusPixels } = {}) {
    const normalized = String(mode ?? "").trim().toLowerCase();
    if (!MODES.has(normalized)) {
      throw new RangeError(`Gesto de seleção desconhecido: ${mode}.`);
    }
    this.#mode = normalized;
    this.#radiusPixels = Math.min(
      128,
      Math.max(2, Number(radiusPixels) || 24)
    );
    this.#element.dataset.mode = normalized;
    return Object.freeze({
      mode: this.#mode,
      radiusPixels: this.#radiusPixels
    });
  }

  cancel() {
    const pointerId = this.#gesture?.id;
    if (pointerId !== null && pointerId !== undefined) {
      if (this.#gesture?.pointerType !== "touch") {
        this.#canvas.releasePointerCapture?.(pointerId);
      }
      this.#canvas.removeEventListener("pointermove", this.#move, true);
      this.#canvas.removeEventListener("pointerup", this.#up, true);
      this.#canvas.removeEventListener("pointercancel", this.#cancel, true);
    }
    this.#reset();
  }

  #reset() {
    this.#gesture = null;
    this.#element.hidden = true;
    if (this.#path) this.#path.setAttribute("d", "");
    if (this.#cursor) this.#cursor.hidden = true;
  }

  dispose() {
    this.#canvas.removeEventListener("pointerdown", this.#down, true);
    this.setEnabled(false);
    this.cancel();
  }

  #down = event => {
    if (!this.enabled || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    if (this.#navigation?.isToolNavigationGesture?.(event)) {
      this.cancel();
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    const bounds = this.#canvas.getBoundingClientRect();
    const point = localPoint(event, bounds);
    this.#gesture = {
      id: event.pointerId,
      pointerType: event.pointerType || "mouse",
      bounds,
      points: [point]
    };
    if (this.#gesture.pointerType !== "touch") {
      this.#canvas.setPointerCapture?.(event.pointerId);
    }
    Object.assign(this.#element.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`
    });
    this.#svg?.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    this.#element.dataset.mode = this.#mode;
    this.#element.hidden = false;
    this.#draw(point);
    this.#canvas.addEventListener("pointermove", this.#move, true);
    this.#canvas.addEventListener("pointerup", this.#up, true);
    this.#canvas.addEventListener("pointercancel", this.#cancel, true);
  };

  #move = event => {
    if (!this.#gesture || event.pointerId !== this.#gesture.id) return;
    if (this.#navigation?.isToolNavigationGesture?.(event)) {
      this.cancel();
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    const samples = event.getCoalescedEvents?.() ?? [event];
    for (const sample of samples) {
      this.#append(localPoint(sample, this.#gesture.bounds));
    }
    this.#draw(this.#gesture.points.at(-1));
  };

  #up = event => {
    if (!this.#gesture || event.pointerId !== this.#gesture.id) return;
    if (this.#navigation?.isToolNavigationGesture?.(event)) {
      this.cancel();
      return;
    }
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    this.#append(localPoint(event, this.#gesture.bounds), { force: true });
    const payload = this.#payload();
    this.#clean(event.pointerId);
    if (payload) this.#complete(payload);
  };

  #cancel = event => {
    event.preventDefault();
    if (event.pointerType !== "touch") {
      event.stopImmediatePropagation();
    }
    this.#clean(event.pointerId);
  };

  #append(point, { force = false } = {}) {
    const points = this.#gesture.points;
    if (this.#mode === "rectangle") {
      if (points.length === 1) points.push(point);
      else points[1] = point;
      return;
    }
    const previous = points.at(-1);
    if (
      force ||
      Math.hypot(point.x - previous.x, point.y - previous.y) >= 2
    ) {
      points.push(point);
    }
  }

  #payload() {
    const points = this.#gesture.points.map(point => ({ ...point }));
    if (this.#mode === "rectangle") {
      const rectangle = rectangleFrom(points[0], points.at(-1));
      if (rectangle.width < 4 || rectangle.height < 4) return null;
      return Object.freeze({
        mode: this.#mode,
        points: Object.freeze(points),
        radiusPixels: this.#radiusPixels,
        rectangle
      });
    }
    if (this.#mode === "lasso" && points.length < 3) return null;
    return Object.freeze({
      mode: this.#mode,
      points: Object.freeze(points),
      radiusPixels: this.#radiusPixels,
      rectangle: null
    });
  }

  #clean(pointerId) {
    if (this.#gesture?.pointerType !== "touch") {
      this.#canvas.releasePointerCapture?.(pointerId);
    }
    this.#canvas.removeEventListener("pointermove", this.#move, true);
    this.#canvas.removeEventListener("pointerup", this.#up, true);
    this.#canvas.removeEventListener("pointercancel", this.#cancel, true);
    this.#reset();
  }

  #draw(point) {
    if (!this.#path) return;
    const points = this.#gesture.points;
    this.#path.style.strokeWidth =
      this.#mode === "brush" || this.#mode === "eraser"
        ? String(this.#radiusPixels * 2)
        : "2";
    if (this.#mode === "rectangle") {
      const rectangle = rectangleFrom(points[0], points.at(-1));
      this.#path.setAttribute(
        "d",
        `M${rectangle.left},${rectangle.top}` +
        `H${rectangle.right}V${rectangle.bottom}` +
        `H${rectangle.left}Z`
      );
    } else {
      this.#path.setAttribute(
        "d",
        points.map((sample, index) =>
          `${index ? "L" : "M"}${sample.x},${sample.y}`
        ).join(" ")
      );
    }
    if (this.#cursor) {
      const radial = this.#mode === "brush" || this.#mode === "eraser";
      this.#cursor.hidden = !radial;
      if (radial) {
        this.#cursor.setAttribute("cx", String(point.x));
        this.#cursor.setAttribute("cy", String(point.y));
        this.#cursor.setAttribute("r", String(this.#radiusPixels));
      }
    }
  }
}

function localPoint(event, bounds) {
  return Object.freeze({
    x: Math.min(bounds.width, Math.max(0, event.clientX - bounds.left)),
    y: Math.min(bounds.height, Math.max(0, event.clientY - bounds.top))
  });
}

function rectangleFrom(first, last) {
  const left = Math.min(first.x, last.x);
  const top = Math.min(first.y, last.y);
  const right = Math.max(first.x, last.x);
  const bottom = Math.max(first.y, last.y);
  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  });
}
