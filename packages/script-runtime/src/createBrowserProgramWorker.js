export function createBrowserProgramWorker({
  WorkerClass = globalThis.Worker,
  workerUrl = new URL(
    "./ProgramWorker.js?build=20260716-0026c",
    import.meta.url
  ),
  name = "spatial-seed-program"
} = {}) {
  if (typeof WorkerClass !== "function") {
    throw new Error("Web Workers não estão disponíveis.");
  }

  return new WorkerClass(workerUrl, {
    type: "module",
    name
  });
}
