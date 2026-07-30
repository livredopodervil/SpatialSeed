import {
  packStrokePoints,
  preprocessStrokePoints,
  unpackStrokePoints
} from "./StrokePreprocess.js?build=20260730-0040g";

self.addEventListener("message", event => {
  const request = event.data ?? {};
  try {
    const points = unpackStrokePoints(
      request.points,
      request.pointCount
    );
    const prepared = preprocessStrokePoints({
      points,
      settings: request.settings,
      mode: request.mode
    });
    const packed = packStrokePoints(prepared);
    self.postMessage({
      id: request.id,
      ok: true,
      points: packed.buffer,
      pointCount: prepared.length
    }, [packed.buffer]);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error?.message ?? String(error)
    });
  }
});
