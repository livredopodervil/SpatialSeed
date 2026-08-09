const MODES = new Set(["rectangle", "brush", "lasso", "eraser"]);

export class ScreenSelectionIndex {
  #cellSize;
  #entries = [];
  #cells = new Map();
  #revision = 0;
  #queries = 0;
  #testedEntries = 0;

  constructor({ cellSize = 64 } = {}) {
    const size = Number(cellSize);
    if (!Number.isFinite(size) || size < 8) {
      throw new RangeError("A célula do índice de seleção deve ter ao menos 8 px.");
    }
    this.#cellSize = size;
  }

  rebuild(entries = []) {
    this.#entries = [];
    this.#cells.clear();
    for (const raw of entries) {
      const x = Number(raw?.x);
      const y = Number(raw?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const bounds = normalizeEntryBounds(raw?.bounds, x, y);
      const index = this.#entries.length;
      this.#entries.push(Object.freeze({ ...raw, x, y, bounds }));
      const minimumX = Math.floor(bounds.left / this.#cellSize);
      const maximumX = Math.floor(bounds.right / this.#cellSize);
      const minimumY = Math.floor(bounds.top / this.#cellSize);
      const maximumY = Math.floor(bounds.bottom / this.#cellSize);
      for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
        for (let cellY = minimumY; cellY <= maximumY; cellY += 1) {
          const key = cellKey(cellX, cellY);
          const bucket = this.#cells.get(key) ?? [];
          bucket.push(index);
          this.#cells.set(key, bucket);
        }
      }
    }
    this.#revision += 1;
    return this;
  }

  query(rawGesture) {
    const gesture = normalizeScreenSelectionGesture(rawGesture);
    const bounds = selectionGestureBounds(gesture);
    const candidates = new Set();
    const minimumX = Math.floor(bounds.left / this.#cellSize);
    const maximumX = Math.floor(bounds.right / this.#cellSize);
    const minimumY = Math.floor(bounds.top / this.#cellSize);
    const maximumY = Math.floor(bounds.bottom / this.#cellSize);
    for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
      for (let cellY = minimumY; cellY <= maximumY; cellY += 1) {
        for (const index of this.#cells.get(cellKey(cellX, cellY)) ?? []) {
          candidates.add(index);
        }
      }
    }
    this.#queries += 1;
    this.#testedEntries += candidates.size;
    return [...candidates]
      .map(index => this.#entries[index])
      .filter(entry => screenSelectionGestureContains(gesture, entry));
  }

  diagnostics() {
    return Object.freeze({
      revision: this.#revision,
      entries: this.#entries.length,
      cells: this.#cells.size,
      queries: this.#queries,
      testedEntries: this.#testedEntries,
      cellSize: this.#cellSize
    });
  }
}

export function normalizeScreenSelectionGesture({
  mode = "rectangle",
  points = [],
  radiusPixels = 24,
  rectangle = null
} = {}) {
  const normalizedMode = String(mode ?? "rectangle").trim().toLowerCase();
  if (!MODES.has(normalizedMode)) {
    throw new RangeError(`Gesto de seleção desconhecido: ${mode}.`);
  }
  const normalizedPoints = [];
  for (const point of points ?? []) {
    const x = Number(point?.x ?? point?.[0]);
    const y = Number(point?.y ?? point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const previous = normalizedPoints.at(-1);
    if (!previous || previous.x !== x || previous.y !== y) {
      normalizedPoints.push(Object.freeze({ x, y }));
    }
  }
  const normalizedRectangle = rectangle
    ? normalizeRectangle(rectangle)
    : normalizedMode === "rectangle" && normalizedPoints.length
      ? rectangleFromPoints(
          normalizedPoints[0],
          normalizedPoints.at(-1)
        )
      : null;
  if (normalizedMode === "rectangle" && !normalizedRectangle) {
    throw new TypeError("A seleção retangular exige dois pontos ou um retângulo.");
  }
  if (normalizedMode !== "rectangle" && !normalizedPoints.length) {
    throw new TypeError("O gesto de seleção exige ao menos um ponto.");
  }
  const radius = Math.min(128, Math.max(2, Number(radiusPixels) || 24));
  return Object.freeze({
    normalized: true,
    mode: normalizedMode,
    points: Object.freeze(normalizedPoints),
    radiusPixels: radius,
    rectangle: normalizedRectangle
  });
}

export function selectionGestureBounds(rawGesture) {
  const gesture = rawGesture?.normalized === true
    ? rawGesture
    : normalizeScreenSelectionGesture(rawGesture);
  if (gesture.mode === "rectangle") return gesture.rectangle;
  const xs = gesture.points.map(point => point.x);
  const ys = gesture.points.map(point => point.y);
  const margin = gesture.mode === "lasso" ? 0 : gesture.radiusPixels;
  const left = Math.min(...xs) - margin;
  const top = Math.min(...ys) - margin;
  const right = Math.max(...xs) + margin;
  const bottom = Math.max(...ys) + margin;
  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  });
}

export function screenSelectionGestureContains(rawGesture, rawPoint) {
  const gesture = rawGesture?.normalized === true
    ? rawGesture
    : normalizeScreenSelectionGesture(rawGesture);
  const point = {
    x: Number(rawPoint?.x ?? rawPoint?.[0]),
    y: Number(rawPoint?.y ?? rawPoint?.[1])
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const entryBounds = rawPoint?.bounds
    ? normalizeEntryBounds(rawPoint.bounds, point.x, point.y)
    : null;
  if (gesture.mode === "rectangle") {
    return entryBounds
      ? rectanglesIntersect(gesture.rectangle, entryBounds)
      : pointInsideRectangle(point, gesture.rectangle);
  }
  if (gesture.mode === "lasso") {
    return entryBounds
      ? polygonIntersectsRectangle(gesture.points, entryBounds)
      : pointInPolygon(point, gesture.points);
  }
  if (entryBounds) {
    return strokeIntersectsRectangle(
      gesture.points,
      entryBounds,
      gesture.radiusPixels
    );
  }
  return distanceToStroke(point, gesture.points) <= gesture.radiusPixels;
}

export function rectangleFromPoints(first, last) {
  return normalizeRectangle({
    left: Math.min(first.x, last.x),
    top: Math.min(first.y, last.y),
    right: Math.max(first.x, last.x),
    bottom: Math.max(first.y, last.y)
  });
}

function normalizeRectangle(value) {
  const left = Number(value.left);
  const top = Number(value.top);
  const right = Number(value.right ?? left + Number(value.width));
  const bottom = Number(value.bottom ?? top + Number(value.height));
  if (![left, top, right, bottom].every(Number.isFinite)) {
    throw new TypeError("Retângulo de seleção inválido.");
  }
  const normalizedLeft = Math.min(left, right);
  const normalizedTop = Math.min(top, bottom);
  const normalizedRight = Math.max(left, right);
  const normalizedBottom = Math.max(top, bottom);
  return Object.freeze({
    left: normalizedLeft,
    top: normalizedTop,
    right: normalizedRight,
    bottom: normalizedBottom,
    width: normalizedRight - normalizedLeft,
    height: normalizedBottom - normalizedTop
  });
}

function pointInPolygon(point, polygon) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) &&
      point.x < (
        (b.x - a.x) * (point.y - a.y) /
        ((b.y - a.y) || Number.EPSILON) + a.x
      );
    if (crosses) inside = !inside;
  }
  return inside;
}

function rectanglesIntersect(left, right) {
  return left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top;
}

function polygonIntersectsRectangle(points, rectangle) {
  if (!Array.isArray(points) || points.length < 3) return false;
  const corners = [
    { x: rectangle.left, y: rectangle.top },
    { x: rectangle.right, y: rectangle.top },
    { x: rectangle.right, y: rectangle.bottom },
    { x: rectangle.left, y: rectangle.bottom }
  ];
  if (corners.some(corner => pointInPolygon(corner, points))) return true;
  if (points.some(point => pointInsideRectangle(point, rectangle))) return true;
  const rectangleEdges = corners.map((corner, index) => [
    corner,
    corners[(index + 1) % corners.length]
  ]);
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index];
    const last = points[(index + 1) % points.length];
    for (const [edgeFirst, edgeLast] of rectangleEdges) {
      if (segmentsIntersect(first, last, edgeFirst, edgeLast)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const orientation = (p, q, r) => {
    const value = (q.y - p.y) * (r.x - q.x) -
      (q.x - p.x) * (r.y - q.y);
    if (Math.abs(value) <= 1e-9) return 0;
    return value > 0 ? 1 : 2;
  };
  const onSegment = (p, q, r) =>
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x + 1e-9 >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y + 1e-9 >= Math.min(p.y, r.y);
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

function distanceToStroke(point, points) {
  if (points.length === 1) return Math.hypot(
    point.x - points[0].x,
    point.y - points[0].y
  );
  let distance = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    distance = Math.min(
      distance,
      distanceToSegment(point, points[index - 1], points[index])
    );
  }
  return distance;
}

function distanceToSegment(point, first, last) {
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - first.x, point.y - first.y);
  }
  const u = Math.max(0, Math.min(1, (
    (point.x - first.x) * dx + (point.y - first.y) * dy
  ) / lengthSquared));
  return Math.hypot(
    point.x - (first.x + u * dx),
    point.y - (first.y + u * dy)
  );
}

function strokeIntersectsRectangle(points, rectangle, radius) {
  const expanded = {
    left: rectangle.left - radius,
    top: rectangle.top - radius,
    right: rectangle.right + radius,
    bottom: rectangle.bottom + radius
  };
  if (points.some(point => pointInsideRectangle(point, expanded))) return true;
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsRectangle(points[index - 1], points[index], expanded)) {
      return true;
    }
  }
  return false;
}

function segmentIntersectsRectangle(first, last, rectangle) {
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  let minimum = 0;
  let maximum = 1;
  for (const [origin, delta, low, high] of [
    [first.x, dx, rectangle.left, rectangle.right],
    [first.y, dy, rectangle.top, rectangle.bottom]
  ]) {
    if (Math.abs(delta) <= Number.EPSILON) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const firstTime = (low - origin) / delta;
    const lastTime = (high - origin) / delta;
    const entry = Math.min(firstTime, lastTime);
    const exit = Math.max(firstTime, lastTime);
    minimum = Math.max(minimum, entry);
    maximum = Math.min(maximum, exit);
    if (minimum > maximum) return false;
  }
  return true;
}

function pointInsideRectangle(point, rectangle) {
  return point.x >= rectangle.left && point.x <= rectangle.right &&
    point.y >= rectangle.top && point.y <= rectangle.bottom;
}

function normalizeEntryBounds(value, x, y) {
  if (!value) {
    return Object.freeze({ left: x, top: y, right: x, bottom: y });
  }
  const left = Number(value.left);
  const top = Number(value.top);
  const right = Number(value.right);
  const bottom = Number(value.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) {
    return Object.freeze({ left: x, top: y, right: x, bottom: y });
  }
  return Object.freeze({
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom)
  });
}

function cellKey(x, y) {
  return `${x}:${y}`;
}
