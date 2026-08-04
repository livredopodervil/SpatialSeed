const DEFAULT_EPSILON = 1e-6;
const DEFAULT_LIMIT = 32;

export class MeshGeometryAudit {
  #captureSource;
  #captures = [];
  #nextId = 1;
  #limit;

  constructor({ captureSource, limit = DEFAULT_LIMIT } = {}) {
    if (typeof captureSource !== "function") {
      throw new TypeError("MeshGeometryAudit exige captureSource().");
    }
    const normalizedLimit = Number(limit);
    if (!Number.isInteger(normalizedLimit) || normalizedLimit < 4) {
      throw new RangeError("limit deve ser inteiro maior ou igual a 4.");
    }
    this.#captureSource = captureSource;
    this.#limit = normalizedLimit;
  }

  clear() {
    const removed = this.#captures.length;
    this.#captures = [];
    return Object.freeze({ cleared: true, removed });
  }

  capture({ label = null, objectId = null } = {}) {
    const snapshot = normalizeCapture(
      this.#captureSource({ objectId })
    );
    const entry = Object.freeze({
      id: this.#nextId++,
      label: String(label ?? `capture-${this.#nextId - 1}`),
      capturedAt: new Date().toISOString(),
      snapshot
    });
    this.#captures.push(entry);
    if (this.#captures.length > this.#limit) this.#captures.shift();
    return summarizeEntry(entry);
  }

  list() {
    return Object.freeze(this.#captures.map(summarizeEntry));
  }

  compare({ from = null, to = null, epsilon = DEFAULT_EPSILON } = {}) {
    if (this.#captures.length < 2) {
      throw new Error("São necessárias ao menos duas capturas.");
    }
    const right = this.#resolve(to, this.#captures.at(-1));
    const left = this.#resolve(from, this.#captures.at(-2));
    return compareEntries(left, right, epsilon);
  }

  diagnose({ from = null, to = null, epsilon = DEFAULT_EPSILON } = {}) {
    if (this.#captures.length < 2) {
      throw new Error("São necessárias ao menos duas capturas.");
    }
    const right = this.#resolve(to, this.#captures.at(-1));
    const left = this.#resolve(from, this.#captures.at(-2));
    return diagnoseEntries(left, right, epsilon);
  }

  report({ epsilon = DEFAULT_EPSILON } = {}) {
    const comparisons = [];
    for (let index = 1; index < this.#captures.length; index += 1) {
      comparisons.push(compareEntries(
        this.#captures[index - 1],
        this.#captures[index],
        epsilon
      ));
    }
    return Object.freeze({
      captures: this.list(),
      comparisons: Object.freeze(comparisons)
    });
  }

  #resolve(reference, fallback) {
    if (reference === null || reference === undefined || reference === "") {
      return fallback;
    }
    const numeric = Number(reference);
    if (Number.isInteger(numeric)) {
      const byId = this.#captures.find(entry => entry.id === numeric);
      if (byId) return byId;
    }
    const label = String(reference);
    const byLabel = [...this.#captures].reverse()
      .find(entry => entry.label === label);
    if (byLabel) return byLabel;
    throw new Error(`Captura não encontrada: ${reference}.`);
  }
}

function normalizeCapture(value = {}) {
  const canonical = value.canonical ?? null;
  const edit = value.edit ?? null;
  const renderer = value.renderer ?? null;
  const effectiveDescriptor = edit?.descriptor ?? canonical?.descriptor ?? null;
  const effectiveGeometry = renderer?.edit?.geometry ??
    renderer?.canonical?.geometry ?? null;
  const effectiveMaterial = renderer?.edit?.material ??
    renderer?.canonical?.material ?? null;
  return Object.freeze({
    objectId: value.objectId == null ? null : String(value.objectId),
    sandboxRevision: Number(value.sandboxRevision ?? 0),
    object: clone(value.object),
    canonical: clone(canonical),
    edit: clone(edit),
    renderer: clone(renderer),
    effective: Object.freeze({
      descriptor: clone(effectiveDescriptor),
      geometry: clone(effectiveGeometry),
      material: clone(effectiveMaterial),
      phase: edit?.active ? "mesh-edit" : "canonical"
    })
  });
}

function summarizeEntry(entry) {
  const snapshot = entry.snapshot;
  return Object.freeze({
    id: entry.id,
    label: entry.label,
    capturedAt: entry.capturedAt,
    objectId: snapshot.objectId,
    sandboxRevision: snapshot.sandboxRevision,
    phase: snapshot.effective.phase,
    descriptor: summarizeDescriptor(snapshot.effective.descriptor),
    commitPreview: snapshot.edit?.commitPreview
      ? Object.freeze({
          changed: snapshot.edit.commitPreview.changed ?? null,
          geometryKey: summarizeKey(
            snapshot.edit.commitPreview.geometryKey ?? null
          ),
          error: snapshot.edit.commitPreview.error ?? null,
          descriptor: summarizeDescriptor(
            snapshot.edit.commitPreview.descriptor ?? null
          ),
          change: summarizeChange(
            snapshot.edit.commitPreview.change ?? null
          )
        })
      : null,
    geometry: summarizeGeometry(snapshot.effective.geometry),
    material: summarizeMaterial(snapshot.effective.material),
    representation: representationSummary(snapshot)
  });
}

function compareEntries(leftEntry, rightEntry, epsilon) {
  const left = leftEntry.snapshot;
  const right = rightEntry.snapshot;
  return Object.freeze({
    from: summarizeEntry(leftEntry),
    to: summarizeEntry(rightEntry),
    representation: compareObjects(
      representationSummary(left),
      representationSummary(right)
    ),
    object: compareObjects(
      objectRenderSummary(left.object),
      objectRenderSummary(right.object)
    ),
    effectiveDescriptor: compareDescriptors(
      left.effective.descriptor,
      right.effective.descriptor,
      epsilon
    ),
    effectiveGeometry: compareGeometries(
      left.effective.geometry,
      right.effective.geometry,
      epsilon
    ),
    effectiveMaterial: compareObjects(
      summarizeMaterial(left.effective.material),
      summarizeMaterial(right.effective.material)
    ),
    handoff: Object.freeze({
      editToPrepared: compareDescriptors(
        left.edit?.descriptor ?? null,
        left.edit?.commitPreview?.descriptor ?? null,
        epsilon
      ),
      preparedToCanonical: compareDescriptors(
        left.edit?.commitPreview?.descriptor ?? null,
        right.canonical?.descriptor ?? null,
        epsilon
      ),
      preparedToRenderedCanonical: descriptorGeometryConsistency(
        left.edit?.commitPreview?.descriptor ?? null,
        right.renderer?.canonical?.geometry ?? null,
        epsilon
      )
    }),
    consistency: Object.freeze({
      from: descriptorGeometryConsistency(
        left.effective.descriptor,
        left.effective.geometry,
        epsilon
      ),
      to: descriptorGeometryConsistency(
        right.effective.descriptor,
        right.effective.geometry,
        epsilon
      )
    })
  });
}

function diagnoseEntries(leftEntry, rightEntry, epsilon) {
  const left = leftEntry.snapshot;
  const right = rightEntry.snapshot;
  const compared = compareEntries(leftEntry, rightEntry, epsilon);
  const representationBefore = representationSummary(left);
  const representationAfter = representationSummary(right);
  const materialBefore = summarizeMaterial(left.effective.material);
  const materialAfter = summarizeMaterial(right.effective.material);
  const handoff = Object.freeze({
    editToPrepared: compactDescriptorComparison(
      compared.handoff.editToPrepared
    ),
    preparedToCanonical: compactDescriptorComparison(
      compared.handoff.preparedToCanonical
    ),
    preparedToRenderedCanonical: compactConsistencyComparison(
      compared.handoff.preparedToRenderedCanonical
    )
  });
  const representationChangedFields = changedObjectKeys(
    representationBefore,
    representationAfter
  );
  const materialChangedFields = changedObjectKeys(
    materialBefore,
    materialAfter
  );
  const descriptor = compactDescriptorComparison(
    compared.effectiveDescriptor
  );
  const geometry = compactGeometryComparison(
    compared.effectiveGeometry
  );
  return Object.freeze({
    from: compactEntryFingerprint(leftEntry),
    to: compactEntryFingerprint(rightEntry),
    likelyStage: inferLikelyStage({
      handoff,
      representationChangedFields,
      materialChangedFields,
      descriptor,
      geometry
    }),
    changed: Object.freeze({
      representation: Object.freeze(representationChangedFields),
      material: Object.freeze(materialChangedFields),
      descriptor,
      geometry
    }),
    handoff,
    consistency: Object.freeze({
      from: compactConsistencyComparison(compared.consistency.from),
      to: compactConsistencyComparison(compared.consistency.to)
    })
  });
}

function compactEntryFingerprint(entry) {
  const snapshot = entry.snapshot;
  return Object.freeze({
    id: entry.id,
    label: entry.label,
    phase: snapshot.effective.phase,
    objectId: snapshot.objectId,
    sandboxRevision: snapshot.sandboxRevision,
    descriptor: descriptorFingerprint(snapshot.effective.descriptor),
    geometry: geometryFingerprint(snapshot.effective.geometry),
    material: summarizeMaterial(snapshot.effective.material),
    representation: representationSummary(snapshot),
    commitPreview: snapshot.edit?.commitPreview
      ? Object.freeze({
          changed: snapshot.edit.commitPreview.changed ?? null,
          error: snapshot.edit.commitPreview.error ?? null,
          geometryKey: summarizeKey(
            snapshot.edit.commitPreview.geometryKey ?? null
          ),
          descriptor: descriptorFingerprint(
            snapshot.edit.commitPreview.descriptor ?? null
          )
        })
      : null
  });
}

function descriptorFingerprint(value) {
  if (!value) return null;
  return Object.freeze({
    type: value.type ?? null,
    positions: numericFingerprint(value.positions),
    indices: numericFingerprint(value.indices),
    normals: numericFingerprint(value.normals),
    uvs: numericFingerprint(value.uvs),
    tangents: numericFingerprint(value.tangents),
    colors: numericFingerprint(value.colors),
    edges: numericFingerprint(value.edges)
  });
}

function geometryFingerprint(value) {
  if (!value) return null;
  return Object.freeze({
    type: value.type ?? null,
    index: attributeFingerprint(value.index),
    attributes: Object.freeze(Object.fromEntries(
      Object.entries(value.attributes ?? {}).map(([name, attribute]) => [
        name,
        attributeFingerprint(attribute)
      ])
    )),
    groupsHash: hashText(stableJson(value.groups ?? [])),
    drawRange: clone(value.drawRange ?? null),
    boundsHash: hashText(stableJson(value.bounds ?? null))
  });
}

function attributeFingerprint(value) {
  if (!value) return null;
  return Object.freeze({
    itemSize: value.itemSize ?? null,
    normalized: Boolean(value.normalized),
    arrayType: value.arrayType ?? null,
    values: numericFingerprint(value.values)
  });
}

function numericFingerprint(value) {
  const summary = numericSummary(value);
  return Object.freeze({
    length: summary.length,
    hash: summary.hash
  });
}

function compactDescriptorComparison(value) {
  if (!value) return null;
  if (!value.present) {
    return Object.freeze({ present: false, changed: false });
  }
  if (!value.fields) {
    return Object.freeze({
      present: true,
      changed: Boolean(value.changed),
      leftPresent: value.leftPresent ?? null,
      rightPresent: value.rightPresent ?? null
    });
  }
  const fieldEntries = Object.entries(value.fields);
  return Object.freeze({
    present: true,
    changed: Boolean(value.changed),
    type: clone(value.type ?? null),
    changedFields: Object.freeze(Object.fromEntries(
      fieldEntries
        .filter(([, field]) => field.changed)
        .map(([name, field]) => [name, compactNumericComparison(field)])
    )),
    unchangedFields: Object.freeze(
      fieldEntries.filter(([, field]) => !field.changed).map(([name]) => name)
    )
  });
}

function compactGeometryComparison(value) {
  if (!value) return null;
  if (!value.present) {
    return Object.freeze({ present: false, changed: false });
  }
  if (!value.attributes) {
    return Object.freeze({
      present: true,
      changed: Boolean(value.changed),
      leftPresent: value.leftPresent ?? null,
      rightPresent: value.rightPresent ?? null
    });
  }
  const attributeEntries = Object.entries(value.attributes);
  const changedAttributes = Object.freeze(Object.fromEntries(
    attributeEntries
      .filter(([, attribute]) => attribute.changed)
      .map(([name, attribute]) => [
        name,
        compactAttributeComparison(attribute)
      ])
  ));
  return Object.freeze({
    present: true,
    changed: Boolean(value.changed),
    type: clone(value.type ?? null),
    index: value.index?.changed
      ? compactAttributeComparison(value.index)
      : Object.freeze({ changed: false }),
    changedAttributes,
    unchangedAttributes: Object.freeze(
      attributeEntries
        .filter(([, attribute]) => !attribute.changed)
        .map(([name]) => name)
    ),
    groupsChanged: Boolean(value.groups?.changed),
    drawRangeChanged: Boolean(value.drawRange?.changed),
    boundsChanged: Boolean(value.bounds?.changed)
  });
}

function compactAttributeComparison(value) {
  if (!value) return null;
  if (!value.present) {
    return Object.freeze({ present: false, changed: false });
  }
  if (!value.values) {
    return Object.freeze({
      present: true,
      changed: Boolean(value.changed),
      leftPresent: value.leftPresent ?? null,
      rightPresent: value.rightPresent ?? null
    });
  }
  return Object.freeze({
    present: true,
    changed: Boolean(value.changed),
    itemSize: clone(value.itemSize ?? null),
    arrayType: clone(value.arrayType ?? null),
    normalized: clone(value.normalized ?? null),
    values: compactNumericComparison(value.values)
  });
}

function compactNumericComparison(value) {
  if (!value) return null;
  return Object.freeze({
    changed: Boolean(value.changed),
    leftLength: value.leftLength ?? null,
    rightLength: value.rightLength ?? null,
    tupleSize: value.tupleSize ?? null,
    changedScalars: value.changedScalars ?? 0,
    changedTuples: value.changedTuples ?? 0,
    maxAbsDelta: value.maxAbsDelta ?? 0,
    leftHash: value.leftHash ?? null,
    rightHash: value.rightHash ?? null
  });
}

function compactConsistencyComparison(value) {
  if (!value || value.available === false) {
    return Object.freeze({ available: false });
  }
  const fields = Object.freeze({
    positions: compactNumericComparison(value.positions),
    indices: compactNumericComparison(value.indices),
    normals: compactNumericComparison(value.normals),
    uvs: compactNumericComparison(value.uvs)
  });
  return Object.freeze({
    available: true,
    changedFields: Object.freeze(Object.fromEntries(
      Object.entries(fields).filter(([, field]) => field?.changed)
    )),
    matchingFields: Object.freeze(
      Object.entries(fields)
        .filter(([, field]) => !field?.changed)
        .map(([name]) => name)
    )
  });
}

function changedObjectKeys(left, right) {
  const keys = new Set([
    ...Object.keys(left ?? {}),
    ...Object.keys(right ?? {})
  ]);
  return [...keys]
    .filter(key => stableJson(left?.[key] ?? null) !==
      stableJson(right?.[key] ?? null))
    .sort();
}

function inferLikelyStage({
  handoff,
  representationChangedFields,
  materialChangedFields,
  descriptor,
  geometry
}) {
  if (handoff.editToPrepared?.changed) return "edit-to-prepared";
  if (handoff.preparedToCanonical?.changed) return "prepared-to-canonical";
  if (consistencyChanged(handoff.preparedToRenderedCanonical)) {
    return "prepared-to-rendered-canonical";
  }
  if (materialChangedFields.length) return "material-transition";
  if (representationChangedFields.length) return "representation-transition";
  if (descriptor?.changed || geometry?.changed) return "effective-geometry";
  return "no-structural-difference";
}

function consistencyChanged(value) {
  if (!value?.available) return false;
  return Object.keys(value.changedFields ?? {}).length > 0;
}

function compareDescriptors(left, right, epsilon) {
  if (!left && !right) return Object.freeze({ present: false, changed: false });
  if (!left || !right) {
    return Object.freeze({
      present: true,
      changed: true,
      leftPresent: Boolean(left),
      rightPresent: Boolean(right)
    });
  }
  const fields = {
    positions: compareNumeric(left.positions, right.positions, 3, epsilon),
    indices: compareNumeric(left.indices, right.indices, 1, 0),
    normals: compareNumeric(left.normals, right.normals, 3, epsilon),
    uvs: compareNumeric(left.uvs, right.uvs, 2, epsilon),
    tangents: compareNumeric(left.tangents, right.tangents, 4, epsilon),
    colors: compareNumeric(left.colors, right.colors, null, epsilon),
    edges: compareNumeric(left.edges, right.edges, 2, 0)
  };
  return Object.freeze({
    present: true,
    changed: left.type !== right.type || Object.values(fields)
      .some(item => item.changed),
    type: Object.freeze({ left: left.type ?? null, right: right.type ?? null }),
    fields: Object.freeze(fields),
    metadata: compareObjects(
      descriptorMetadata(left),
      descriptorMetadata(right)
    )
  });
}

function compareGeometries(left, right, epsilon) {
  if (!left && !right) return Object.freeze({ present: false, changed: false });
  if (!left || !right) {
    return Object.freeze({
      present: true,
      changed: true,
      leftPresent: Boolean(left),
      rightPresent: Boolean(right)
    });
  }
  const names = new Set([
    ...Object.keys(left.attributes ?? {}),
    ...Object.keys(right.attributes ?? {})
  ]);
  const attributes = {};
  for (const name of [...names].sort()) {
    const a = left.attributes?.[name] ?? null;
    const b = right.attributes?.[name] ?? null;
    attributes[name] = compareAttribute(a, b, epsilon);
  }
  const index = compareAttribute(left.index, right.index, 0);
  return Object.freeze({
    present: true,
    changed: index.changed || Object.values(attributes)
      .some(item => item.changed) ||
      stableJson(left.groups) !== stableJson(right.groups) ||
      stableJson(left.drawRange) !== stableJson(right.drawRange),
    type: Object.freeze({ left: left.type ?? null, right: right.type ?? null }),
    index,
    attributes: Object.freeze(attributes),
    groups: compareObjects(left.groups ?? [], right.groups ?? []),
    drawRange: compareObjects(left.drawRange ?? null, right.drawRange ?? null),
    bounds: compareObjects(left.bounds ?? null, right.bounds ?? null)
  });
}

function compareAttribute(left, right, epsilon) {
  if (!left && !right) return Object.freeze({ present: false, changed: false });
  if (!left || !right) {
    return Object.freeze({
      present: true,
      changed: true,
      leftPresent: Boolean(left),
      rightPresent: Boolean(right)
    });
  }
  const tupleSize = Number(left.itemSize ?? right.itemSize ?? 1);
  const values = compareNumeric(left.values, right.values, tupleSize, epsilon);
  return Object.freeze({
    present: true,
    changed: values.changed || left.itemSize !== right.itemSize ||
      left.normalized !== right.normalized ||
      left.arrayType !== right.arrayType,
    itemSize: Object.freeze({ left: left.itemSize, right: right.itemSize }),
    normalized: Object.freeze({ left: left.normalized, right: right.normalized }),
    arrayType: Object.freeze({ left: left.arrayType, right: right.arrayType }),
    values
  });
}

function compareNumeric(leftValue, rightValue, tupleSize, epsilon) {
  const left = flattenNumbers(leftValue);
  const right = flattenNumbers(rightValue);
  const maximum = Math.max(left.length, right.length);
  let changedScalars = 0;
  let maxAbsDelta = 0;
  const changedTupleSet = new Set();
  const firstDifferences = [];
  const size = Number.isInteger(tupleSize) && tupleSize > 0 ? tupleSize : 1;
  for (let index = 0; index < maximum; index += 1) {
    const a = left[index];
    const b = right[index];
    const different = index >= left.length || index >= right.length ||
      !numbersNear(a, b, epsilon);
    if (!different) continue;
    changedScalars += 1;
    changedTupleSet.add(Math.floor(index / size));
    const delta = Number.isFinite(a) && Number.isFinite(b)
      ? Math.abs(a - b)
      : null;
    if (delta !== null) maxAbsDelta = Math.max(maxAbsDelta, delta);
    if (firstDifferences.length < 12) {
      firstDifferences.push(Object.freeze({ index, left: a ?? null, right: b ?? null, delta }));
    }
  }
  return Object.freeze({
    changed: changedScalars > 0,
    leftLength: left.length,
    rightLength: right.length,
    tupleSize: size,
    changedScalars,
    changedTuples: changedTupleSet.size,
    maxAbsDelta,
    leftHash: hashNumbers(left),
    rightHash: hashNumbers(right),
    firstDifferences: Object.freeze(firstDifferences)
  });
}

function descriptorGeometryConsistency(descriptor, geometry, epsilon) {
  if (!descriptor || !geometry) {
    return Object.freeze({ available: false });
  }
  const position = geometry.attributes?.position?.values ?? [];
  const normal = geometry.attributes?.normal?.values ?? [];
  const uv = geometry.attributes?.uv?.values ?? [];
  const index = geometry.index?.values ?? [];
  return Object.freeze({
    available: true,
    positions: compareNumeric(descriptor.positions, position, 3, epsilon),
    indices: compareNumeric(descriptor.indices, index, 1, 0),
    normals: compareNumeric(descriptor.normals, normal, 3, epsilon),
    uvs: compareNumeric(descriptor.uvs, uv, 2, epsilon)
  });
}

function representationSummary(snapshot) {
  const renderer = snapshot.renderer ?? {};
  const canonical = renderer.canonical ?? {};
  const edit = renderer.edit ?? {};
  return Object.freeze({
    phase: snapshot.effective.phase,
    descriptorType: snapshot.effective.descriptor?.type ?? null,
    canonicalDescriptorType: snapshot.canonical?.descriptor?.type ?? null,
    canonicalGeometryKey: summarizeKey(
      snapshot.canonical?.geometryKey ?? null
    ),
    canonicalTopology: snapshot.canonical?.renderProfile?.topology ?? null,
    canonicalRenderSide: snapshot.canonical?.renderProfile?.side ?? null,
    sourceType: snapshot.edit?.sourceType ?? null,
    objectKind: snapshot.object?.kind ?? null,
    batchKind: canonical.batchKind ?? null,
    batchKey: summarizeKey(canonical.batchKey ?? null),
    geometryCacheKey: summarizeKey(canonical.geometryCacheKey ?? null),
    materialCacheKey: summarizeKey(canonical.materialCacheKey ?? null),
    renderSide: snapshot.effective.material?.side ?? null,
    shadowSide: snapshot.effective.material?.shadowSide ?? null,
    materialType: snapshot.effective.material?.type ?? null,
    editActive: Boolean(edit.active),
    sourceHidden: renderer.sourceVisibility?.hidden ?? null,
    normalState: snapshot.edit?.normalState ?? null,
    normalPolicy: snapshot.edit?.topologyOptions?.normalPolicy ?? null
  });
}

function objectRenderSummary(object) {
  if (!object) return null;
  return Object.freeze({
    id: object.id ?? null,
    kind: object.kind ?? null,
    geometryType: object.geometry?.type ?? null,
    appearanceId: object.appearanceId ?? null,
    material: clone(object.material ?? null),
    position: clone(object.position ?? null),
    rotation: clone(object.rotation ?? null),
    scale: clone(object.scale ?? null),
    size: clone(object.size ?? null)
  });
}

function descriptorMetadata(value = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => ![
        "positions", "indices", "normals", "uvs", "tangents", "colors", "edges"
      ].includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, clone(item)])
  ));
}

function summarizeChange(value) {
  if (!value) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "changedVertexIndices") {
      const indices = flattenNumbers(item);
      result[key] = Object.freeze({
        length: indices.length,
        hash: hashNumbers(indices),
        first: Object.freeze(indices.slice(0, 16))
      });
    } else if (Array.isArray(item) || ArrayBuffer.isView(item)) {
      result[key] = numericFingerprint(item);
    } else {
      result[key] = clone(item);
    }
  }
  return Object.freeze(result);
}

function summarizeDescriptor(value) {
  if (!value) return null;
  return Object.freeze({
    type: value.type ?? null,
    positions: numericSummary(value.positions),
    indices: numericSummary(value.indices),
    normals: numericSummary(value.normals),
    uvs: numericSummary(value.uvs),
    tangents: numericSummary(value.tangents),
    colors: numericSummary(value.colors),
    edges: numericSummary(value.edges)
  });
}

function summarizeGeometry(value) {
  if (!value) return null;
  return Object.freeze({
    type: value.type ?? null,
    index: summarizeAttribute(value.index),
    attributes: Object.freeze(Object.fromEntries(
      Object.entries(value.attributes ?? {}).map(([name, attribute]) => [
        name,
        summarizeAttribute(attribute)
      ])
    )),
    groups: clone(value.groups ?? []),
    drawRange: clone(value.drawRange ?? null),
    bounds: clone(value.bounds ?? null)
  });
}

function summarizeAttribute(value) {
  if (!value) return null;
  return Object.freeze({
    itemSize: value.itemSize ?? null,
    normalized: Boolean(value.normalized),
    arrayType: value.arrayType ?? null,
    values: numericSummary(value.values)
  });
}

function summarizeMaterial(value) {
  if (!value) return null;
  return Object.freeze({
    type: value.type ?? null,
    side: value.side ?? null,
    shadowSide: value.shadowSide ?? null,
    flatShading: Boolean(value.flatShading),
    vertexColors: Boolean(value.vertexColors),
    transparent: Boolean(value.transparent),
    opacity: value.opacity ?? null,
    roughness: value.roughness ?? null,
    metalness: value.metalness ?? null,
    depthTest: value.depthTest ?? null,
    depthWrite: value.depthWrite ?? null,
    map: clone(value.map ?? null),
    normalMap: clone(value.normalMap ?? null),
    roughnessMap: clone(value.roughnessMap ?? null),
    metalnessMap: clone(value.metalnessMap ?? null)
  });
}

function numericSummary(value) {
  const numbers = flattenNumbers(value);
  let finite = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const number of numbers) {
    if (!Number.isFinite(number)) continue;
    finite += 1;
    minimum = Math.min(minimum, number);
    maximum = Math.max(maximum, number);
  }
  return Object.freeze({
    length: numbers.length,
    hash: hashNumbers(numbers),
    finite,
    minimum: finite ? minimum : null,
    maximum: finite ? maximum : null
  });
}

function compareObjects(left, right) {
  const leftJson = stableJson(left);
  const rightJson = stableJson(right);
  return Object.freeze({
    changed: leftJson !== rightJson,
    left: clone(left),
    right: clone(right)
  });
}

function flattenNumbers(value) {
  const result = [];
  const visit = item => {
    if (ArrayBuffer.isView(item)) {
      for (const entry of item) result.push(Number(entry));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item !== undefined && item !== null) result.push(Number(item));
  };
  visit(value ?? []);
  return result;
}

function numbersNear(left, right, epsilon) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return Object.is(left, right);
  }
  return Math.abs(left - right) <= epsilon;
}

function hashNumbers(numbers) {
  let hash = 0x811c9dc5;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  for (const number of numbers) {
    view.setFloat64(0, Number(number), true);
    for (let offset = 0; offset < 8; offset += 1) {
      hash ^= view.getUint8(offset);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

function summarizeKey(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return Object.freeze({
    length: text.length,
    hash: hashText(text),
    prefix: text.slice(0, 96)
  });
}

function hashText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (code >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortValue(item)])
  );
}

function clone(value) {
  if (value === undefined) return null;
  return value === null ? null : structuredClone(value);
}
