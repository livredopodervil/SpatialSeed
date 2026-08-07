const META = new WeakMap();
const DEFAULT_CHUNK_SIZE = 256;
const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

export function createPersistentObjectArray(values = [], {
  chunkSize = DEFAULT_CHUNK_SIZE
} = {}) {
  if (isPersistentObjectArray(values)) return values;
  if (!Array.isArray(values)) {
    throw new TypeError("A coleção persistente exige um array.");
  }
  const size = normalizeChunkSize(chunkSize);
  const chunks = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(Object.freeze(values.slice(offset, offset + size)));
  }
  return createProxy(Object.freeze(chunks), values.length, size);
}

export function isPersistentObjectArray(value) {
  return Boolean(value && META.has(value));
}

export function persistentObjectAt(values, index) {
  const meta = META.get(values);
  if (!meta) return values?.[index];
  return valueAt(meta, index);
}

export function persistentObjectUpdateAt(values, index, nextValue) {
  const collection = ensurePersistent(values);
  const meta = META.get(collection);
  const normalizedIndex = Number(index);
  if (!Number.isInteger(normalizedIndex) ||
      normalizedIndex < 0 || normalizedIndex >= meta.length) {
    return collection;
  }
  if (Object.is(valueAt(meta, normalizedIndex), nextValue)) return collection;
  const chunkIndex = Math.floor(normalizedIndex / meta.chunkSize);
  const itemIndex = normalizedIndex % meta.chunkSize;
  const chunks = meta.chunks.slice();
  const chunk = [...chunks[chunkIndex]];
  chunk[itemIndex] = nextValue;
  chunks[chunkIndex] = Object.freeze(chunk);
  return createProxy(Object.freeze(chunks), meta.length, meta.chunkSize);
}

export function persistentObjectUpdateMany(values, updates = []) {
  const collection = ensurePersistent(values);
  const meta = META.get(collection);
  if (!Array.isArray(updates) || !updates.length) return collection;
  const byChunk = new Map();
  let changed = false;
  for (const update of updates) {
    const index = Number(update?.index);
    if (!Number.isInteger(index) || index < 0 || index >= meta.length) continue;
    if (Object.is(valueAt(meta, index), update.value)) continue;
    const chunkIndex = Math.floor(index / meta.chunkSize);
    let chunk = byChunk.get(chunkIndex);
    if (!chunk) {
      chunk = [...meta.chunks[chunkIndex]];
      byChunk.set(chunkIndex, chunk);
    }
    chunk[index % meta.chunkSize] = update.value;
    changed = true;
  }
  if (!changed) return collection;
  const chunks = meta.chunks.slice();
  for (const [chunkIndex, chunk] of byChunk) {
    chunks[chunkIndex] = Object.freeze(chunk);
  }
  return createProxy(Object.freeze(chunks), meta.length, meta.chunkSize);
}

export function persistentObjectAppendMany(values, appended = []) {
  const collection = ensurePersistent(values);
  const incoming = Array.isArray(appended) ? appended : [...appended];
  if (!incoming.length) return collection;
  const meta = META.get(collection);
  const chunks = meta.chunks.slice();
  let tail = chunks.length ? [...chunks.at(-1)] : [];
  if (chunks.length) chunks.pop();
  for (const value of incoming) {
    if (tail.length >= meta.chunkSize) {
      chunks.push(Object.freeze(tail));
      tail = [];
    }
    tail.push(value);
  }
  if (tail.length) chunks.push(Object.freeze(tail));
  return createProxy(
    Object.freeze(chunks),
    meta.length + incoming.length,
    meta.chunkSize
  );
}

export function persistentObjectRemoveIds(values, ids = new Set()) {
  const collection = ensurePersistent(values);
  const removed = ids instanceof Set ? ids : new Set(ids);
  if (!removed.size) return collection;
  const kept = [];
  let changed = false;
  for (const object of collection) {
    if (removed.has(String(object?.id))) {
      changed = true;
      continue;
    }
    kept.push(object);
  }
  return changed
    ? createPersistentObjectArray(kept, { chunkSize: META.get(collection).chunkSize })
    : collection;
}

export function materializePersistentObjectArray(values) {
  if (!isPersistentObjectArray(values)) return Array.isArray(values) ? [...values] : [];
  const meta = META.get(values);
  const result = new Array(meta.length);
  let index = 0;
  for (const chunk of meta.chunks) {
    for (const value of chunk) result[index++] = value;
  }
  return result;
}

export function persistentObjectArrayDiagnostics(values) {
  const meta = META.get(values);
  if (!meta) return Object.freeze({ persistent: false, length: values?.length ?? 0 });
  return Object.freeze({
    persistent: true,
    length: meta.length,
    chunkSize: meta.chunkSize,
    chunkCount: meta.chunks.length
  });
}

function ensurePersistent(values) {
  return isPersistentObjectArray(values)
    ? values
    : createPersistentObjectArray(values ?? []);
}

function createProxy(chunks, length, chunkSize) {
  const target = new Array(length);
  const proxy = new Proxy(target, {
    get(targetValue, property, receiver) {
      const meta = META.get(proxy);
      if (property === "__persistentObjectArray") return true;
      if (property === "length") return meta.length;
      if (property === Symbol.iterator) {
        return function* iterator() {
          for (const chunk of meta.chunks) {
            for (const value of chunk) yield value;
          }
        };
      }
      if (typeof property === "string" && ARRAY_INDEX.test(property)) {
        return valueAt(meta, Number(property));
      }
      return Reflect.get(targetValue, property, receiver);
    },
    has(targetValue, property) {
      if (typeof property === "string" && ARRAY_INDEX.test(property)) {
        const index = Number(property);
        const meta = META.get(proxy);
        return index >= 0 && index < meta.length;
      }
      return Reflect.has(targetValue, property);
    },
    getOwnPropertyDescriptor(targetValue, property) {
      if (typeof property === "string" && ARRAY_INDEX.test(property)) {
        const index = Number(property);
        const meta = META.get(proxy);
        if (index >= 0 && index < meta.length) {
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: valueAt(meta, index)
          };
        }
      }
      return Reflect.getOwnPropertyDescriptor(targetValue, property);
    },
    set() {
      throw new TypeError("Coleção persistente é imutável.");
    },
    deleteProperty() {
      throw new TypeError("Coleção persistente é imutável.");
    }
  });
  META.set(proxy, Object.freeze({ chunks, length, chunkSize }));
  return proxy;
}

function valueAt(meta, index) {
  if (!Number.isInteger(index) || index < 0 || index >= meta.length) {
    return undefined;
  }
  const chunk = meta.chunks[Math.floor(index / meta.chunkSize)];
  return chunk?.[index % meta.chunkSize];
}

function normalizeChunkSize(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 32 || number > 4096) {
    return DEFAULT_CHUNK_SIZE;
  }
  return number;
}
