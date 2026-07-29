import {
  compileAffineExpression,
  evaluateCompiledAffineExpression
} from "../../selection-operations/src/AffineProgram.js?build=20260729-0039g";
import {
  PATH_BRUSH_AFFINE_VARIABLES
} from "./PathBrushAffine.js?build=20260729-0039g";

const COLOR_SYMBOLS = new Set([
  ...PATH_BRUSH_AFFINE_VARIABLES,
  "pi", "e", "tau", "phi",
  "deg", "rad", "turn"
]);

export const PATH_BRUSH_COLOR_DEFAULT = "source";

export function compilePathBrushColorModifier(
  source = PATH_BRUSH_COLOR_DEFAULT
) {
  const text = String(source ?? "").trim();
  if (!text) {
    throw new TypeError("A expressão de cor do pincel não pode ser vazia.");
  }
  const expression = compileColorExpression(text);
  validateColorVariables(expression);
  return deepFreeze({
    type: "path-brush-color-modifier",
    version: 1,
    source: text,
    identity: expression.type === "source",
    expression
  });
}

export function evaluatePathBrushColorModifier(modifier, {
  context = {},
  sourceColor = "#6699cc",
  invert = false
} = {}) {
  if (modifier?.type !== "path-brush-color-modifier" ||
      modifier?.version !== 1) {
    throw new TypeError("Modificador de cor do pincel inválido.");
  }
  const color = evaluateColorExpression(
    modifier.expression,
    context,
    normalizeHexColor(sourceColor)
  );
  return invert ? invertHexColor(color) : color;
}

export function invertHexColor(value) {
  const channels = hexChannels(value).map(channel => 255 - channel);
  return rgbToHex(channels);
}

function compileColorExpression(source) {
  const text = String(source).trim();
  if (text.toLowerCase() === "source") {
    return Object.freeze({ type: "source" });
  }
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) {
    return Object.freeze({
      type: "constant",
      value: normalizeHexColor(text)
    });
  }
  const call = /^([a-z]+)\s*\((.*)\)$/is.exec(text);
  if (!call) {
    throw new Error(
      "Cor paramétrica deve usar source, hexadecimal, hsl(...), " +
      "rgb(...), mix(...) ou invert(...)."
    );
  }
  const name = call[1].toLowerCase();
  const args = splitTopLevel(call[2], ",");
  if (["hsl", "rgb"].includes(name)) {
    if (args.length !== 3) {
      throw new Error(`${name} exige três argumentos.`);
    }
    return Object.freeze({
      type: name,
      components: Object.freeze(args.map(compileAffineExpression))
    });
  }
  if (name === "mix") {
    if (args.length !== 3) {
      throw new Error("mix exige duas cores e um fator.");
    }
    return Object.freeze({
      type: "mix",
      from: compileColorExpression(args[0]),
      to: compileColorExpression(args[1]),
      factor: compileAffineExpression(args[2])
    });
  }
  if (name === "invert") {
    if (args.length !== 1) {
      throw new Error("invert exige uma cor.");
    }
    return Object.freeze({
      type: "invert",
      color: compileColorExpression(args[0])
    });
  }
  throw new Error(`Função de cor desconhecida: ${name}.`);
}

function evaluateColorExpression(expression, context, sourceColor) {
  if (expression.type === "source") return sourceColor;
  if (expression.type === "constant") return expression.value;
  if (expression.type === "invert") {
    return invertHexColor(
      evaluateColorExpression(expression.color, context, sourceColor)
    );
  }
  if (expression.type === "mix") {
    const factor = clamp(
      evaluateCompiledAffineExpression(expression.factor, context),
      0,
      1
    );
    return mixHex(
      evaluateColorExpression(expression.from, context, sourceColor),
      evaluateColorExpression(expression.to, context, sourceColor),
      factor
    );
  }
  const values = expression.components.map(component =>
    evaluateCompiledAffineExpression(component, context)
  );
  return expression.type === "rgb"
    ? rgbToHex(values)
    : hslToHex(values);
}

function validateColorVariables(expression) {
  for (const compiled of compiledExpressions(expression)) {
    for (const name of expressionVariables(compiled?.ast)) {
      if (!COLOR_SYMBOLS.has(name)) {
        throw new ReferenceError(
          `Variável não disponível na cor do pincel: ${name}.`
        );
      }
    }
  }
}

function compiledExpressions(expression, result = []) {
  if (!expression || typeof expression !== "object") return result;
  for (const component of expression.components ?? []) result.push(component);
  if (expression.factor) result.push(expression.factor);
  if (expression.from) compiledExpressions(expression.from, result);
  if (expression.to) compiledExpressions(expression.to, result);
  if (expression.color) compiledExpressions(expression.color, result);
  return result;
}

function expressionVariables(node, result = new Set()) {
  if (!node || typeof node !== "object") return result;
  if (node.type === "variable") result.add(node.name);
  if (node.left) expressionVariables(node.left, result);
  if (node.right) expressionVariables(node.right, result);
  if (node.value) expressionVariables(node.value, result);
  for (const argument of node.args ?? []) {
    expressionVariables(argument, result);
  }
  return result;
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
  if (result.some(value => !value)) {
    throw new Error("Componente de cor vazio.");
  }
  return result;
}

function hslToHex([hueDegrees, saturation, lightness]) {
  const hue = ((finite(hueDegrees) % 360) + 360) % 360 / 360;
  const sat = clamp(saturation, 0, 1);
  const light = clamp(lightness, 0, 1);
  if (sat === 0) {
    return rgbToHex([light * 255, light * 255, light * 255]);
  }
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

function rgbToHex(values) {
  return `#${values.map(value =>
    Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
  ).join("")}`;
}

function hexChannels(value) {
  const color = normalizeHexColor(value);
  return [1, 3, 5].map(index =>
    parseInt(color.slice(index, index + 2), 16)
  );
}

function normalizeHexColor(value) {
  const source = String(value ?? "").trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(source);
  if (short) {
    return `#${[...short[1]].map(character =>
      character + character
    ).join("")}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(source)) {
    throw new TypeError(`Cor inválida: ${value}.`);
  }
  return source;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError("Valor de cor inválido.");
  return number;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
