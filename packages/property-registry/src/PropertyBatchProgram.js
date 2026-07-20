import {
  compileAffineExpression,
  evaluateCompiledAffineExpression
} from "../../selection-operations/src/AffineProgram.js?build=20260720-0028d";
import { normalizeHexColor } from "./ColorCodec.js";

export const PROPERTY_BATCH_PROGRAM_VERSION = "property-batch-program-v1";

export function compilePropertyBatchProgram(descriptor, source) {
  if (!descriptor?.id || descriptor.procedural !== true) {
    throw new Error(
      `Propriedade não aceita expressão procedural: ${descriptor?.id ?? "?"}.`
    );
  }
  const text = String(source ?? "").trim();
  if (!text) throw new TypeError("Expressão procedural vazia.");

  const valueType = descriptor.valueType;
  let compiled;
  if (valueType === "color") {
    compiled = compileColor(text);
  } else if (valueType === "number") {
    compiled = Object.freeze([compileAffineExpression(text)]);
  } else {
    const componentCount = vectorComponentCount(valueType);
    if (!componentCount) {
      throw new Error(`Tipo procedural ainda não suportado: ${valueType}.`);
    }
    const components = splitTopLevel(text, ";");
    if (components.length !== componentCount) {
      throw new Error(
        `${descriptor.id} exige ${componentCount} expressões separadas por ponto e vírgula.`
      );
    }
    compiled = Object.freeze(components.map(compileAffineExpression));
  }

  return deepFreeze({
    version: PROPERTY_BATCH_PROGRAM_VERSION,
    propertyId: descriptor.id,
    valueType,
    source: text,
    compiled
  });
}

export function evaluatePropertyBatchProgram(program, {
  object,
  index,
  count,
  t = 0,
  dt = 0
}) {
  validateProgram(program);
  const context = {
    i: index,
    count,
    t,
    dt,
    position: object?.position ?? [0, 0, 0],
    rotation: object?.rotation ?? [0, 0, 0, 1],
    scale: object?.scale ?? [1, 1, 1]
  };

  if (program.valueType === "color") {
    return evaluateColor(program.compiled, context);
  }
  const values = program.compiled.map(component =>
    evaluateCompiledAffineExpression(component, context)
  );
  return program.valueType === "number" ? values[0] : values;
}

export function describePropertyBatchProgram(program) {
  validateProgram(program);
  return Object.freeze({
    version: program.version,
    propertyId: program.propertyId,
    valueType: program.valueType,
    source: program.source
  });
}

function compileColor(source) {
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(source)) {
    return Object.freeze({ type: "constant", value: normalizeHexColor(source) });
  }
  const call = /^([a-z]+)\s*\((.*)\)$/is.exec(source);
  if (!call) {
    throw new Error(
      "Cor procedural deve usar hsl(h,s,l), rgb(r,g,b), mix(#cor,#cor,u) ou hexadecimal."
    );
  }
  const name = call[1].toLowerCase();
  const args = splitTopLevel(call[2], ",");
  if (["hsl", "rgb"].includes(name)) {
    if (args.length !== 3) throw new Error(`${name} exige 3 argumentos.`);
    return Object.freeze({
      type: name,
      components: Object.freeze(args.map(compileAffineExpression))
    });
  }
  if (name === "mix") {
    if (args.length !== 3) throw new Error("mix exige duas cores e um fator.");
    return Object.freeze({
      type: "mix",
      from: normalizeHexColor(args[0]),
      to: normalizeHexColor(args[1]),
      factor: compileAffineExpression(args[2])
    });
  }
  throw new Error(`Função de cor desconhecida: ${name}.`);
}

function evaluateColor(compiled, context) {
  if (compiled.type === "constant") return compiled.value;
  if (compiled.type === "mix") {
    return mixHex(
      compiled.from,
      compiled.to,
      clamp(evaluateCompiledAffineExpression(compiled.factor, context), 0, 1)
    );
  }
  const values = compiled.components.map(component =>
    evaluateCompiledAffineExpression(component, context)
  );
  return compiled.type === "rgb"
    ? rgbToHex(values)
    : hslToHex(values);
}

function rgbToHex(values) {
  return `#${values.map(value =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
  ).join("")}`;
}

function hslToHex([hueDegrees, saturation, lightness]) {
  const hue = ((hueDegrees % 360) + 360) % 360 / 360;
  const sat = clamp(saturation, 0, 1);
  const light = clamp(lightness, 0, 1);
  if (sat === 0) return rgbToHex([light * 255, light * 255, light * 255]);
  const q = light < 0.5
    ? light * (1 + sat)
    : light + sat - light * sat;
  const p = 2 * light - q;
  return rgbToHex([
    hueChannel(p, q, hue + 1 / 3) * 255,
    hueChannel(p, q, hue) * 255,
    hueChannel(p, q, hue - 1 / 3) * 255
  ]);
}

function hueChannel(p, q, input) {
  let value = input;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function mixHex(from, to, factor) {
  const left = hexChannels(from);
  const right = hexChannels(to);
  return rgbToHex(left.map((value, index) =>
    value + (right[index] - value) * factor
  ));
}

function hexChannels(value) {
  const normalized = normalizeHexColor(value);
  return [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16));
}

function splitTopLevel(source, separator) {
  const result = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === separator && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
    if (depth < 0) throw new Error("Parênteses desbalanceados.");
  }
  if (depth !== 0) throw new Error("Parênteses desbalanceados.");
  result.push(source.slice(start).trim());
  if (result.some(value => !value)) throw new Error("Componente vazio.");
  return result;
}

function vectorComponentCount(valueType) {
  const match = /^vector([2-4])$/.exec(valueType);
  return match ? Number(match[1]) : 0;
}

function validateProgram(program) {
  if (program?.version !== PROPERTY_BATCH_PROGRAM_VERSION) {
    throw new TypeError("Programa procedural de propriedades incompatível.");
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
