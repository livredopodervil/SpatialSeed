import {
  canonicalStringify
} from "./CanonicalValue.js";

import {
  contentId,
  contentIdFromCanonical
} from "./ContentId.js";

export class AssetStore {
  #records = new Map();

  intern(
    kind,
    value,
    {
      metadata = {},
      retain = true
    } = {}
  ) {
    const canonical =
      canonicalStringify(value);

    const id =
      contentIdFromCanonical(kind, canonical);

    const existing =
      this.#records.get(id);

    if (existing) {
      if (retain) {
        existing.references += 1;
      }

      return snapshot(existing);
    }

    const record = {
      id,
      kind: String(kind),
      value:
        structuredClone(value),
      metadata:
        structuredClone(metadata),
      references:
        retain ? 1 : 0,
      canonicalBytes:
        new Blob([canonical]).size,
      createdAt:
        new Date().toISOString()
    };

    this.#records.set(
      id,
      record
    );

    return snapshot(record);
  }

  has(id) {
    return this.#records.has(id);
  }

  get(id) {
    const record =
      this.#records.get(id);

    return record
      ? snapshot(record)
      : null;
  }

  retain(id, count = 1) {
    const record =
      this.#require(id);

    record.references +=
      positiveInteger(count);

    return snapshot(record);
  }

  retainReferences(id, count = 1) {
    const record = this.#require(id);
    record.references += positiveInteger(count);
    return Object.freeze({
      id: record.id,
      references: record.references
    });
  }

  release(
    id,
    count = 1,
    {
      collect = true
    } = {}
  ) {
    const record =
      this.#require(id);

    const amount =
      positiveInteger(count);

    record.references =
      Math.max(
        0,
        record.references - amount
      );

    const removed =
      collect &&
      record.references === 0
        ? this.#records.delete(id)
        : false;

    return {
      id,
      references:
        removed
          ? 0
          : record.references,
      removed
    };
  }

  delete(id, {
    force = false
  } = {}) {
    const record =
      this.#records.get(id);

    if (!record) {
      return false;
    }

    if (
      !force &&
      record.references > 0
    ) {
      throw new Error(
        `Recurso ainda possui ` +
        `${record.references} referência(s).`
      );
    }

    return this.#records.delete(id);
  }

  findByKind(kind) {
    const namespace =
      String(kind);

    return [
      ...this.#records.values()
    ]
      .filter(
        record =>
          record.kind === namespace
      )
      .map(snapshot);
  }

  stats() {
    const byKind = {};
    let references = 0;
    let canonicalBytes = 0;

    for (
      const record of
      this.#records.values()
    ) {
      references +=
        record.references;

      canonicalBytes +=
        record.canonicalBytes;

      const current =
        byKind[record.kind] ?? {
          assets: 0,
          references: 0,
          canonicalBytes: 0
        };

      current.assets += 1;
      current.references +=
        record.references;
      current.canonicalBytes +=
        record.canonicalBytes;

      byKind[record.kind] =
        current;
    }

    return {
      assets:
        this.#records.size,
      references,
      canonicalBytes,
      deduplicatedReferences:
        Math.max(
          0,
          references -
          this.#records.size
        ),
      byKind:
        structuredClone(byKind)
    };
  }

  export() {
    return {
      schemaVersion: 1,
      assets: Object.fromEntries(
        [...this.#records]
          .map(([id, record]) => [
            id,
            {
              kind:
                record.kind,
              value:
                structuredClone(
                  record.value
                ),
              metadata:
                structuredClone(
                  record.metadata
                ),
              references:
                record.references
            }
          ])
      )
    };
  }

  import(document, {
    replace = false
  } = {}) {
    if (
      !document ||
      document.schemaVersion !== 1 ||
      typeof document.assets !==
        "object"
    ) {
      throw new Error(
        "Documento de recursos inválido."
      );
    }

    if (replace) {
      this.#records.clear();
    }

    const imported = [];

    for (
      const [expectedId, asset]
      of Object.entries(
        document.assets
      )
    ) {
      const computedId =
        contentId(
          asset.kind,
          asset.value
        );

      if (
        computedId !== expectedId
      ) {
        throw new Error(
          `Identificador incompatível: ` +
          `${expectedId}.`
        );
      }

      const record =
        this.intern(
          asset.kind,
          asset.value,
          {
            metadata:
              asset.metadata ?? {},
            retain: false
          }
        );

      const internal =
        this.#records.get(
          record.id
        );

      internal.references =
        nonNegativeInteger(
          asset.references ?? 0
        );

      imported.push(
        snapshot(internal)
      );
    }

    return {
      imported:
        imported.length,
      assets:
        this.#records.size
    };
  }

  #require(id) {
    const record =
      this.#records.get(id);

    if (!record) {
      throw new Error(
        `Recurso inexistente: ${id}.`
      );
    }

    return record;
  }
}

function snapshot(record) {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    value:
      structuredClone(
        record.value
      ),
    metadata:
      structuredClone(
        record.metadata
      ),
    references:
      record.references,
    canonicalBytes:
      record.canonicalBytes,
    createdAt:
      record.createdAt
  });
}

function positiveInteger(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new RangeError(
      "A quantidade deve ser inteiro positivo."
    );
  }

  return number;
}

function nonNegativeInteger(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 0
  ) {
    throw new RangeError(
      "A quantidade deve ser inteiro não negativo."
    );
  }

  return number;
}
