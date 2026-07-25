export function createBrowserProgramSessionWorker({
  WorkerClass = globalThis.Worker,
  workerUrl = new URL(
    "./ProgramSessionWorker.js?build=20260724-0029c",
    import.meta.url
  ),
  name = "spatial-seed-program-session"
} = {}) {
  if (typeof WorkerClass !== "function") {
    throw new Error("Web Workers não estão disponíveis.");
  }

  return new WorkerClass(workerUrl, {
    type: "module",
    name
  });
}
