export class TestRunner {
  constructor() {
    this.suites = new Map();
  }

  register(name, tests) {
    if (this.suites.has(name)) {
      throw new Error(`Suíte já registrada: ${name}`);
    }
    this.suites.set(name, tests);
    return this;
  }

  run(name = "all") {
    const selected = name === "all"
      ? [...this.suites.entries()]
      : [[name, this.suites.get(name)]];

    if (selected.some(([, tests]) => !tests)) {
      throw new Error(`Suíte desconhecida: ${name}`);
    }

    const startedAt = performance.now();
    const results = [];

    for (const [suiteName, tests] of selected) {
      for (const [testName, test] of Object.entries(tests)) {
        const start = performance.now();
        try {
          test();
          results.push({
            suite: suiteName,
            test: testName,
            ok: true,
            durationMs: round(performance.now() - start)
          });
        } catch (error) {
          results.push({
            suite: suiteName,
            test: testName,
            ok: false,
            durationMs: round(performance.now() - start),
            error: error?.message ?? String(error)
          });
        }
      }
    }

    const passed = results.filter(result => result.ok).length;
    return {
      suite: name,
      passed,
      failed: results.length - passed,
      total: results.length,
      durationMs: round(performance.now() - startedAt),
      ok: passed === results.length,
      results
    };
  }

  describe() {
    return Object.fromEntries(
      [...this.suites.entries()].map(([name, tests]) => [name, Object.keys(tests)])
    );
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
