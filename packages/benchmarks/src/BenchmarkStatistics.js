export function summarizeSamples(values) {
  const samples = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!samples.length) {
    return {
      samples: 0,
      min: null,
      median: null,
      mean: null,
      max: null,
      p95: null
    };
  }

  const sum = samples.reduce(
    (total, value) => total + value,
    0
  );

  return {
    samples: samples.length,
    min: round(samples[0]),
    median: round(percentile(samples, 0.5)),
    mean: round(sum / samples.length),
    max: round(samples.at(-1)),
    p95: round(percentile(samples, 0.95))
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
