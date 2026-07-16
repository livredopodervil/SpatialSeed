import {
  DisposableProgramRun
} from "./DisposableProgramRun.js";
import {
  PROGRAM_WORKER_PROTOCOL_VERSION
} from "./ProgramRunController.js";

const MAX_SOURCE_LENGTH = 100000;

export function executeProgramRequest(
  request,
  { evaluate } = {}
) {
  if (typeof evaluate !== "function") {
    throw new TypeError("evaluate deve ser função.");
  }

  let run = null;

  try {
    const normalized = normalizeRequest(request);
    run = new DisposableProgramRun(normalized);
    const environment = createCalculationEnvironment({
      seed: normalized.seed,
      snapshot: normalized.snapshot,
      maxOutput: normalized.maxOutput
    });
    const value = evaluate(
      buildProgramSource(
        normalized.source,
        normalized.mode
      ),
      environment.endowments
    );

    if (isPromiseLike(value)) {
      throw new TypeError(
        "Programas assíncronos ainda não são suportados."
      );
    }

    const plan = run.complete({
      value,
      output: environment.output()
    });

    return {
      protocolVersion: PROGRAM_WORKER_PROTOCOL_VERSION,
      type: "program.completed",
      runId: normalized.runId,
      plan
    };
  } catch (error) {
    run?.fail(error);

    return {
      protocolVersion: PROGRAM_WORKER_PROTOCOL_VERSION,
      type: "program.failed",
      runId: String(request?.runId ?? ""),
      error: serializeError(error)
    };
  }
}

export function buildProgramSource(source, mode = "expression") {
  const normalizedSource = String(source ?? "");

  if (normalizedSource.length > MAX_SOURCE_LENGTH) {
    throw new RangeError(
      `Programa excede ${MAX_SOURCE_LENGTH} caracteres.`
    );
  }

  if (mode === "expression") {
    return `(${normalizedSource}\n)`;
  }

  if (mode === "program") {
    return [
      "(() => {",
      '"use strict";',
      normalizedSource,
      "})()"
    ].join("\n");
  }

  throw new Error(`Modo de programa desconhecido: ${mode}.`);
}

export function createCalculationEnvironment({
  seed = 0,
  snapshot = null,
  maxOutput = 100
} = {}) {
  const outputLines = [];
  const randomSource = createSeededRandom(seed);
  const outputLimit = positiveInteger(
    maxOutput,
    "maxOutput"
  );
  const print = (...values) => {
    if (outputLines.length >= outputLimit) {
      throw new RangeError(
        `Programa excedeu o limite de ${outputLimit} linhas de saída.`
      );
    }

    const line = values.map(formatValue).join(" ");
    outputLines.push(line);
    return line;
  };
  const math = createMathFacade(randomSource);

  return Object.freeze({
    endowments: {
      ...math,
      math,
      print,
      snapshot: clone(snapshot)
    },
    output() {
      return [...outputLines];
    }
  });
}

export function createSeededRandom(seed = 0) {
  let state = seedToUint32(seed);

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };

  return Object.freeze({
    random(minimum = 0, maximum = 1) {
      let min = Number(minimum);
      let max = Number(maximum);

      if (arguments.length === 1) {
        max = min;
        min = 0;
      }

      finiteRange(min, max);
      return min + next() * (max - min);
    },

    randomInt(minimum = 0, maximum = 2) {
      let min = Number(minimum);
      let max = Number(maximum);

      if (arguments.length === 1) {
        max = min;
        min = 0;
      }

      finiteRange(min, max);
      min = Math.ceil(min);
      max = Math.floor(max);

      if (max <= min) {
        throw new RangeError(
          "randomInt exige ao menos um inteiro no intervalo."
        );
      }

      return Math.floor(min + next() * (max - min));
    },

    randomSeed(nextSeed) {
      state = seedToUint32(nextSeed);
      return state;
    }
  });
}

function normalizeRequest(request) {
  if (!request || typeof request !== "object") {
    throw new TypeError("Pedido de programa inválido.");
  }

  return {
    runId: nonEmptyString(request.runId, "runId"),
    baseVersion: nonNegativeInteger(
      request.baseVersion ?? 0,
      "baseVersion"
    ),
    seed: clone(request.seed ?? 0),
    source: String(request.source ?? ""),
    mode: request.mode ?? "expression",
    snapshot: clone(request.snapshot ?? null),
    allowedCommands: Array.isArray(request.allowedCommands)
      ? [...request.allowedCommands]
      : [],
    maxCommands: positiveInteger(
      request.maxCommands ?? 10000,
      "maxCommands"
    ),
    maxOutput: positiveInteger(
      request.maxOutput ?? 100,
      "maxOutput"
    )
  };
}

function createMathFacade(randomSource) {
  const facade = {
    pi: Math.PI,
    e: Math.E,
    tau: Math.PI * 2,
    phi: (1 + Math.sqrt(5)) / 2,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    exp: Math.exp,
    log: Math.log,
    log10: Math.log10,
    min: Math.min,
    max: Math.max,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    hypot: Math.hypot,
    pow: Math.pow,
    random: randomSource.random,
    randomInt: randomSource.randomInt,
    randomSeed: randomSource.randomSeed
  };

  return Object.freeze(facade);
}

function seedToUint32(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0;
  }

  const source = typeof seed === "string"
    ? seed
    : JSON.stringify(seed);
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function finiteRange(minimum, maximum) {
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    maximum <= minimum
  ) {
    throw new RangeError(
      "Intervalo aleatório deve ser finito e crescente."
    );
  }
}

function formatValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return `${value}n`;

  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value, (_, child) =>
        typeof child === "bigint" ? `${child}n` : child
      );
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  return String(value);
}

function serializeError(error) {
  return Object.freeze({
    name: String(error?.name ?? "Error"),
    message: String(error?.message ?? error ?? "Erro desconhecido.")
  });
}

function clone(value) {
  return structuredClone(value);
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function nonEmptyString(value, label) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(`${label} deve ser texto não vazio.`);
  }

  return normalized;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new RangeError(
      `${label} deve ser inteiro não negativo.`
    );
  }

  return number;
}

function positiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new RangeError(
      `${label} deve ser inteiro positivo.`
    );
  }

  return number;
}
