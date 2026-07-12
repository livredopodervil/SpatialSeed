export function createBenchmarkScene(objectCount, { prefix = "bench" } = {}) {
  const count = positiveInteger(objectCount, "objectCount");
  const width = Math.max(1, Math.ceil(Math.sqrt(count)));

  const objects = Array.from({ length: count }, (_, index) => {
    const x = index % width;
    const z = Math.floor(index / width);

    return Object.freeze({
      id: `${prefix}-${index}`,
      kind: "box",
      name: `Benchmark ${index}`,
      position: [x * 2.25, 1, z * 2.25],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      size: [2, 2, 2],
      material: Object.freeze({ color: colorFor(index) })
    });
  });

  return Object.freeze({
    schemaVersion: 1,
    objects: Object.freeze(objects)
  });
}

export function createTransforms(state, transformCount) {
  const count = Math.min(
    positiveInteger(transformCount, "transformCount"),
    state.objects.length
  );

  return state.objects.slice(0, count).map(object => ({
    id: object.id,
    position: [
      object.position[0] + 0.125,
      object.position[1] + 0.25,
      object.position[2] - 0.125
    ],
    rotation: [...object.rotation],
    scale: [...object.scale]
  }));
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(`${label} deve ser inteiro positivo.`);
  }
  return number;
}

function colorFor(index) {
  const value = (index * 2654435761) >>> 0;
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}`;
}
