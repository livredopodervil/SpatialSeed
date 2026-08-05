const MAX_PICKING_ID = 0xFFFFFF;

export class PickingIdAllocator {
  static apiVersion = "picking-id-allocator-v1";

  #nextId = 1;
  #idByObject = new Map();
  #objectById = new Map();

  get size() {
    return this.#idByObject.size;
  }

  clear() {
    this.#nextId = 1;
    this.#idByObject.clear();
    this.#objectById.clear();
  }

  idFor(objectId) {
    const key = String(objectId ?? "").trim();
    if (!key) throw new TypeError("Picking exige objectId não vazio.");
    const existing = this.#idByObject.get(key);
    if (existing !== undefined) return existing;
    if (this.#nextId > MAX_PICKING_ID) {
      throw new RangeError("Limite de IDs de picking excedido.");
    }
    const id = this.#nextId;
    this.#nextId += 1;
    this.#idByObject.set(key, id);
    this.#objectById.set(id, key);
    return id;
  }

  objectFor(id) {
    const value = Number(id);
    if (!Number.isInteger(value) || value < 1 || value > MAX_PICKING_ID) {
      return null;
    }
    return this.#objectById.get(value) ?? null;
  }

  colorFor(objectId) {
    return encodePickingId(this.idFor(objectId));
  }

  objectForPixel(pixel) {
    return this.objectFor(decodePickingPixel(pixel));
  }
}

export function encodePickingId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PICKING_ID) {
    throw new RangeError(`ID de picking inválido: ${id}.`);
  }
  return Object.freeze([
    (value & 0xFF) / 255,
    ((value >>> 8) & 0xFF) / 255,
    ((value >>> 16) & 0xFF) / 255
  ]);
}

export function decodePickingPixel(pixel) {
  if (!pixel || pixel.length < 3) return 0;
  const red = clampByte(pixel[0]);
  const green = clampByte(pixel[1]);
  const blue = clampByte(pixel[2]);
  return red | (green << 8) | (blue << 16);
}

function clampByte(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(255, Math.round(number)));
}
