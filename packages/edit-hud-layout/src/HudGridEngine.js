export const HUD_COLLISION_MODES = Object.freeze(["push", "swap", "reject"]);

export function resolveGridLayout({
  entries = [],
  columns = 12,
  minimumRows = 1,
  collisionMode = "push",
  allowOverflowRows = true
} = {}) {
  const width = boundedInteger(columns, 12, 1, 1024);
  const baseRows = boundedInteger(minimumRows, 1, 1, 1024);
  const mode = HUD_COLLISION_MODES.includes(collisionMode) ? collisionMode : "push";
  const occupancy = new Map();
  const placed = [];
  const unplaced = [];
  const diagnostics = [];
  const normalized = entries
    .filter(entry => entry && entry.present !== false)
    .map((entry, index) => normalizeEntry(entry, index, width))
    .sort(compareEntries);

  for (const entry of normalized) {
    const preferred = entry.x !== null && entry.y !== null
      ? { x: entry.x, y: entry.y }
      : null;
    let position = preferred && fits({ ...entry, ...preferred }, occupancy, width)
      ? preferred
      : null;

    if (!position && preferred && mode === "swap") {
      const collisions = collisionIds({ ...entry, ...preferred }, occupancy, width);
      if (collisions.size === 1) {
        const collidedId = [...collisions][0];
        const collidedIndex = placed.findIndex(item => item.id === collidedId);
        const collided = placed[collidedIndex];
        if (collided && entry.x !== null && entry.y !== null) {
          clearOccupancy(collided, occupancy);
          const alternative = findFirstFree({
            ...collided,
            x: entry.x,
            y: entry.y
          }, occupancy, width, baseRows, allowOverflowRows);
          if (alternative) {
            const moved = Object.freeze({ ...collided, ...alternative, movedByCollision: true });
            placed[collidedIndex] = moved;
            markOccupancy(moved, occupancy);
            position = preferred;
          } else {
            markOccupancy(collided, occupancy);
          }
        }
      }
    }

    if (!position && mode !== "reject") {
      position = findFirstFree(entry, occupancy, width, baseRows, allowOverflowRows);
    }

    if (!position) {
      unplaced.push(Object.freeze({ ...entry, reason: preferred ? "collision" : "no-space" }));
      diagnostics.push(Object.freeze({
        type: "unplaced",
        id: entry.id,
        reason: preferred ? "collision" : "no-space"
      }));
      continue;
    }

    const placement = Object.freeze({
      ...entry,
      x: position.x,
      y: position.y,
      autoPlaced: !preferred || position.x !== preferred.x || position.y !== preferred.y
    });
    markOccupancy(placement, occupancy);
    placed.push(placement);
    if (placement.autoPlaced) {
      diagnostics.push(Object.freeze({
        type: "moved",
        id: entry.id,
        from: preferred,
        to: Object.freeze({ x: placement.x, y: placement.y })
      }));
    }
  }

  const contentRows = Math.max(baseRows, ...placed.map(item => item.y + item.height), 1);
  return Object.freeze({
    columns: width,
    rows: contentRows,
    placements: Object.freeze(placed),
    unplaced: Object.freeze(unplaced),
    diagnostics: Object.freeze(diagnostics),
    occupiedCells: occupancy.size
  });
}

export function findGridPlacement({
  entries = [],
  movingId = null,
  proposed = {},
  columns = 12,
  minimumRows = 1,
  collisionMode = "push"
} = {}) {
  const candidate = {
    id: movingId ?? proposed.id ?? "candidate",
    x: proposed.x,
    y: proposed.y,
    width: proposed.width ?? 1,
    height: proposed.height ?? 1,
    order: Number.MIN_SAFE_INTEGER,
    present: true
  };
  const result = resolveGridLayout({
    entries: [candidate, ...entries.filter(entry => entry.id !== movingId)],
    columns,
    minimumRows,
    collisionMode
  });
  const placement = result.placements.find(item => item.id === candidate.id);
  return placement
    ? Object.freeze({ x: placement.x, y: placement.y, width: placement.width, height: placement.height })
    : null;
}

export function rectanglesOverlap(left, right) {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

export function gridLayoutHasOverlap(placements = []) {
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      if (rectanglesOverlap(placements[left], placements[right])) return true;
    }
  }
  return false;
}

function normalizeEntry(entry, index, columns) {
  const width = boundedInteger(entry.width ?? entry.cellWidth, 1, 1, columns);
  const height = boundedInteger(entry.height ?? entry.cellHeight, 1, 1, 1024);
  const xValue = nullableInteger(entry.x);
  const yValue = nullableInteger(entry.y);
  return Object.freeze({
    ...entry,
    id: String(entry.id ?? `entry-${index}`),
    width,
    height,
    x: xValue === null ? null : Math.min(Math.max(0, columns - width), xValue),
    y: yValue,
    order: finiteInteger(entry.order) ?? index,
    defaultIndex: finiteInteger(entry.defaultIndex) ?? index
  });
}

function compareEntries(left, right) {
  const leftExplicit = left.x !== null && left.y !== null ? 0 : 1;
  const rightExplicit = right.x !== null && right.y !== null ? 0 : 1;
  return leftExplicit - rightExplicit ||
    left.order - right.order ||
    left.defaultIndex - right.defaultIndex ||
    left.id.localeCompare(right.id);
}

function findFirstFree(entry, occupancy, columns, minimumRows, allowOverflowRows) {
  const startY = Math.max(0, entry.y ?? 0);
  const rowLimit = allowOverflowRows
    ? Math.max(minimumRows, startY + 1) + 4096
    : minimumRows;
  for (let y = startY; y < rowLimit; y += 1) {
    const startX = y === startY ? Math.max(0, entry.x ?? 0) : 0;
    for (let x = startX; x <= columns - entry.width; x += 1) {
      if (fits({ ...entry, x, y }, occupancy, columns)) return { x, y };
    }
  }
  return null;
}

function fits(entry, occupancy, columns) {
  if (entry.x < 0 || entry.y < 0 || entry.x + entry.width > columns) return false;
  return collisionIds(entry, occupancy, columns).size === 0;
}

function collisionIds(entry, occupancy, columns) {
  const ids = new Set();
  for (let y = entry.y; y < entry.y + entry.height; y += 1) {
    for (let x = entry.x; x < entry.x + entry.width; x += 1) {
      const id = occupancy.get(cellKey(x, y, columns));
      if (id) ids.add(id);
    }
  }
  return ids;
}

function markOccupancy(entry, occupancy) {
  for (let y = entry.y; y < entry.y + entry.height; y += 1) {
    for (let x = entry.x; x < entry.x + entry.width; x += 1) {
      occupancy.set(cellKey(x, y), entry.id);
    }
  }
}

function clearOccupancy(entry, occupancy) {
  for (let y = entry.y; y < entry.y + entry.height; y += 1) {
    for (let x = entry.x; x < entry.x + entry.width; x += 1) {
      occupancy.delete(cellKey(x, y));
    }
  }
}

function cellKey(x, y) {
  return `${x}:${y}`;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? Math.trunc(number) : fallback));
}

function nullableInteger(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

/**
 * Resolves one explicit move/resize and returns the complete deterministic
 * placement set. Consumers must persist every returned placement so the
 * profile remains the sole source of truth; auto-pushing only at render time
 * would make the same profile display differently after later edits.
 */
export function resolveGridMutation({
  entries = [],
  movingId,
  proposed = {},
  columns = 12,
  minimumRows = 1,
  collisionMode = "push"
} = {}) {
  const id = String(movingId ?? proposed.id ?? "").trim();
  if (!id) throw new TypeError("resolveGridMutation exige movingId.");
  const current = entries.find(entry => String(entry?.id) === id) ?? {};
  const candidate = {
    ...current,
    ...proposed,
    id,
    present: true,
    order: Number.MIN_SAFE_INTEGER,
    defaultIndex: Number.MIN_SAFE_INTEGER
  };
  const others = entries.filter(entry => String(entry?.id) !== id);
  const mode = HUD_COLLISION_MODES.includes(collisionMode) ? collisionMode : "push";

  if (mode === "reject") {
    const probe = resolveGridLayout({
      entries: [candidate, ...others],
      columns,
      minimumRows,
      collisionMode: "reject",
      allowOverflowRows: true
    });
    const placement = probe.placements.find(entry => entry.id === id);
    if (!placement || placement.autoPlaced) {
      return Object.freeze({ accepted: false, reason: "collision", placements: Object.freeze([]), diagnostics: probe.diagnostics });
    }
    return Object.freeze({ accepted: true, reason: null, placements: probe.placements, diagnostics: probe.diagnostics });
  }

  const result = resolveGridLayout({
    entries: [candidate, ...others],
    columns,
    minimumRows,
    collisionMode: mode,
    allowOverflowRows: true
  });
  const placement = result.placements.find(entry => entry.id === id);
  if (!placement) {
    return Object.freeze({ accepted: false, reason: "no-space", placements: Object.freeze([]), diagnostics: result.diagnostics });
  }
  return Object.freeze({
    accepted: true,
    reason: null,
    placements: result.placements,
    diagnostics: result.diagnostics
  });
}
