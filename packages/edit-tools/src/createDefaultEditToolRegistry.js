import { EditToolRegistry } from "./EditToolRegistry.js";

const CURVES = Object.freeze([
  { value: "centripetal", label: "Spline Catmull-Rom" },
  { value: "chordal", label: "Catmull-Rom chordal" },
  { value: "catmullrom", label: "Catmull-Rom uniforme" },
  { value: "bezier", label: "Bézier ajustada" },
  { value: "polyline", label: "Polilinha" }
]);

export function createDefaultEditToolRegistry({
  geometryCatalog = []
} = {}) {
  const geometryOptions = geometryCatalogOptions(geometryCatalog);
  return new EditToolRegistry()
    .register({
      id: "path.sketch",
      label: "Desenhar com estilo de caminho",
      family: "path",
      command: "path.sketch.begin",
      lifecycle: "continuous",
      parameters: [
        enumParameter("mode", "Resultado", [
          { value: "tube", label: "Tubo contínuo" },
          { value: "array", label: "Pincel de geometrias" },
          { value: "sweep", label: "Extrusão por caminho desenhado" },
          { value: "extrude", label: "Extrudar perfil desenhado" },
          { value: "revolve", label: "Revolucionar perfil desenhado" }
        ], "tube"),
        enumParameter("planeSource", "Plano do desenho", [
          {
            value: "locked-or-viewer",
            label: "Desenho, edição, visualização ou viewer"
          },
          { value: "drawing", label: "Plano de desenho" },
          { value: "edit", label: "Plano de edição" },
          { value: "viewer", label: "Viewer atual" },
          { value: "world-xy", label: "Mundo XY" },
          { value: "world-xz", label: "Mundo XZ" },
          { value: "world-yz", label: "Mundo YZ" }
        ], "locked-or-viewer"),
        enumParameter("anchorPolicy", "Âncora da família", [
          { value: "first", label: "Início do caminho" },
          { value: "bounds", label: "Centro dos limites" },
          { value: "world", label: "Origem do mundo" }
        ], "first", { when: { mode: "array" } }),
        enumParameter("curveType", "Interpolação", CURVES, "centripetal"),
        numberParameter(
          "inputSamplePixels",
          "Amostragem do gesto (px)",
          6,
          {
            integer: true, minimum: 1, maximum: 64
          }
        ),
        numberParameter("simplify", "Simplificação relativa", 0.004, {
          minimum: 0, maximum: 0.2, step: 0.001
        }),
        numberParameter("smoothIterations", "Suavização", 1, {
          integer: true, minimum: 0, maximum: 4
        }),
        numberParameter("tension", "Tensão", 0.5),
        booleanParameter("closed", "Fechar caminho", false),
        numberParameter("radius", "Raio do tubo", 0.08, {
          minimum: 0.001, step: 0.01, when: { mode: "tube" }
        }),
        numberParameter("tubularSegments", "Segmentos do caminho", 96, {
          integer: true, minimum: 2, when: { mode: "tube" }
        }),
        numberParameter("radialSegments", "Segmentos radiais", 6, {
          integer: true, minimum: 3, when: { mode: "tube" }
        }),
        colorParameter("color", "Cor do tubo", "#70c8ff", {
          when: { mode: "tube" }
        }),
        booleanParameter(
          "autoFuse",
          "Unir automaticamente ao tocar",
          true,
          { when: { mode: "tube" } }
        ),
        numberParameter(
          "fusionTolerance",
          "Margem de contato (0 = automática)",
          0,
          { minimum: 0, maximum: 2, step: 0.01, when: { mode: "tube" } }
        ),
        stringParameter(
          "profileObjectId",
          "ID do perfil (vazio = seleção ativa)",
          "",
          { when: { mode: "sweep" } }
        ),
        enumParameter("profileExtraction", "Extração do perfil", [
          { value: "auto", label: "Automática" },
          { value: "sketch", label: "Esboço semântico" },
          { value: "centerline", label: "Contorno central fechado" },
          { value: "contour", label: "Contorno declarado" },
          { value: "boundary", label: "Maior contorno planar" }
        ], "auto", { when: { mode: "sweep" } }),
        numberParameter("sweepSegments", "Segmentos da varredura", 32, {
          integer: true,
          minimum: 1,
          when: { mode: "sweep" }
        }),
        numberParameter("sweepTwistDegrees", "Torção total (°)", 0, {
          when: { mode: "sweep" }
        }),
        numberParameter("scaleStart", "Escala inicial", 1, {
          when: { mode: "sweep" }
        }),
        numberParameter("scaleEnd", "Escala final", 1, {
          when: { mode: "sweep" }
        }),
        booleanParameter("caps", "Tampar extremidades", true, {
          when: { mode: "sweep" }
        }),
        colorParameter("sweepColor", "Cor da extrusão", "#7f9cff", {
          when: { mode: "sweep" }
        }),
        numberParameter("depth", "Profundidade", 1, {
          minimum: 0.001,
          step: 0.1,
          when: { mode: "extrude" }
        }),
        numberParameter("extrudeSteps", "Passos da extrusão", 1, {
          integer: true,
          minimum: 1,
          when: { mode: "extrude" }
        }),
        numberParameter("curveSegments", "Segmentos de curva", 12, {
          integer: true,
          minimum: 1,
          when: { mode: "extrude" }
        }),
        booleanParameter("bevelEnabled", "Bisel", true, {
          when: { mode: "extrude" }
        }),
        numberParameter("bevelThickness", "Espessura do bisel", 0.2, {
          minimum: 0,
          step: 0.05,
          when: { mode: "extrude", bevelEnabled: true }
        }),
        numberParameter("bevelSize", "Tamanho do bisel", 0.1, {
          minimum: 0,
          step: 0.05,
          when: { mode: "extrude", bevelEnabled: true }
        }),
        numberParameter("bevelOffset", "Deslocamento do bisel", 0, {
          step: 0.05,
          when: { mode: "extrude", bevelEnabled: true }
        }),
        numberParameter("bevelSegments", "Segmentos do bisel", 3, {
          integer: true,
          minimum: 0,
          when: { mode: "extrude", bevelEnabled: true }
        }),
        colorParameter("extrudeColor", "Cor da extrusão", "#66b5a3", {
          when: { mode: "extrude" }
        }),
        numberParameter("revolveSegments", "Segmentos da revolução", 32, {
          integer: true,
          minimum: 3,
          when: { mode: "revolve" }
        }),
        numberParameter("phiStartDeg", "Ângulo inicial (°)", 0, {
          when: { mode: "revolve" }
        }),
        numberParameter("phiLengthDeg", "Extensão angular (°)", 360, {
          minimum: 0.001,
          maximum: 360,
          when: { mode: "revolve" }
        }),
        colorParameter("revolveColor", "Cor da revolução", "#d29b62", {
          when: { mode: "revolve" }
        }),
        enumParameter("sourceMode", "Fonte do pincel", [
          { value: "selection", label: "Seleção atual" },
          { value: "catalog", label: "Geometria do catálogo" }
        ], "selection", {
          when: { mode: "array" }
        }),
        enumParameter(
          "geometryType",
          "Geometria do pincel",
          geometryOptions,
          geometryOptions[0].value,
          {
            when: { mode: "array", sourceMode: "catalog" }
          }
        ),
        jsonParameter(
          "sourceGeometry",
          "Parâmetros completos da geometria",
          {},
          {
            when: { mode: "array", sourceMode: "catalog" },
            hidden: true,
            description:
              "Descritor do provider selecionado. O editor visual mantém este JSON sincronizado."
          }
        ),
        colorParameter("sourceColor", "Cor do pincel", "#6699cc", {
          when: { mode: "array", sourceMode: "catalog" }
        }),
        enumParameter("materialMode", "Material do traço", [
          { value: "inherit", label: "Automático / herdado" },
          { value: "unlit", label: "Não iluminado" },
          { value: "standard", label: "Padrão" },
          { value: "physical", label: "Físico" }
        ], "inherit"),
        numberParameter("opacityMultiplier", "Opacidade do traço", 1, {
          minimum: 0,
          maximum: 1,
          step: 0.01
        }),
        enumParameter("spacingMode", "Distribuição do pincel", [
          { value: "auto", label: "Automática pelo tamanho" },
          { value: "world", label: "Distância no mundo" }
        ], "auto", {
          when: { mode: "array" }
        }),
        numberParameter("spacingWorld", "Distância entre instâncias", 1, {
          minimum: 0.001,
          step: 0.05,
          when: { mode: "array", spacingMode: "world" }
        }),
        numberParameter("spacingScale", "Fator do espaçamento automático", 1, {
          minimum: 0.01,
          step: 0.05,
          when: { mode: "array", spacingMode: "auto" }
        }),
        booleanParameter("align", "Orientar pela tangente", true, {
          when: { mode: "array" }
        }),
        numberParameter("twistDegrees", "Torção total em graus", 0, {
          when: { mode: "array" }
        }),
        enumParameter("orientationMode", "Referencial da orientação", [
          { value: "preserve", label: "Preservar orientação da fonte" },
          { value: "plane", label: "XY no plano; X segue o traço" },
          { value: "path", label: "Z segue o traço" }
        ], "preserve", {
          when: { mode: "array" }
        }),
        stringParameter(
          "affineMoveX",
          "Mover X local · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineMoveY",
          "Mover Y local · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineMoveZ",
          "Mover Z local · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineRotateX",
          "Girar X local (°) · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineRotateY",
          "Girar Y local (°) · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineRotateZ",
          "Girar Z local (°) · expressão",
          "0",
          affineBrushParameterOptions()
        ),
        stringParameter(
          "affineScale",
          "Escala uniforme · expressão",
          "1",
          affineBrushParameterOptions({
            description:
              "O módulo define o tamanho; valor negativo inverte a cor."
          })
        ),
        numberParameter(
          "affineULength",
          "Comprimento correspondente a u=1",
          1,
          {
            minimum: 0.001,
            step: 0.1,
            when: { mode: "array" }
          }
        ),
        stringParameter(
          "affineColor",
          "Cor · expressão",
          "source",
          affineBrushParameterOptions({
            description:
              "Aceita source, hexadecimal, hsl(...), rgb(...), mix(...) e invert(...)."
          })
        )
      ]
    })
    .register({
      id: "planar.sketch",
      label: "Desenhar e editar em 2D",
      family: "planar",
      command: "planar.sketch.begin",
      lifecycle: "continuous",
      parameters: [
        enumParameter("mode", "Ferramenta 2D", [
          { value: "point", label: "Ponto" },
          { value: "line", label: "Segmento" },
          { value: "polyline", label: "Polilinha" },
          { value: "rectangle", label: "Retângulo" },
          { value: "circle", label: "Círculo" },
          { value: "arc", label: "Arco" },
          { value: "polygon", label: "Polígono regular" }
        ], "line"),
        enumParameter("planeSource", "Plano do desenho", [
          {
            value: "drawing-or-edit",
            label: "Desenho, edição ou viewer"
          },
          { value: "drawing", label: "Plano de desenho" },
          { value: "edit", label: "Plano de edição" },
          { value: "viewer", label: "Viewer atual" }
        ], "drawing-or-edit"),
        enumParameter("style", "Aparência", [
          { value: "stroke", label: "Contorno" },
          { value: "fill", label: "Preenchimento" }
        ], "stroke"),
        colorParameter("color", "Cor", "#64d8c8"),
        numberParameter("strokeWidth", "Espessura do traço", 0.08, {
          minimum: 0.001,
          step: 0.01
        }),
        numberParameter("segments", "Segmentos", 48, {
          integer: true,
          minimum: 3,
          maximum: 4096
        }),
        numberParameter("radialSegments", "Seção do traço", 6, {
          integer: true,
          minimum: 3,
          maximum: 32,
          when: { style: "stroke" }
        }),
        numberParameter("sides", "Lados", 6, {
          integer: true,
          minimum: 3,
          maximum: 256,
          when: { mode: "polygon" }
        }),
        numberParameter("arcAngleDegrees", "Ângulo do arco (°)", 90, {
          minimum: -360,
          maximum: 360,
          step: 1,
          when: { mode: "arc" }
        }),
        booleanParameter("closed", "Fechar polilinha", false, {
          when: { mode: "polyline" }
        })
      ]
    })
    .register({
      id: "path.tube",
      label: "Tubo por caminho",
      family: "path",
      command: "path.tube.create",
      parameters: [
        numberParameter("radius", "Raio", 0.25, {
          minimum: 0.001, step: 0.05
        }),
        numberParameter("tubularSegments", "Segmentos do caminho", 64, {
          integer: true, minimum: 2
        }),
        numberParameter("radialSegments", "Segmentos radiais", 8, {
          integer: true, minimum: 3
        }),
        optionalBooleanParameter("closed", "Fechamento", null),
        enumParameter("curveType", "Interpolação", CURVES, "centripetal"),
        numberParameter("tension", "Tensão", 0.5),
        colorParameter("color", "Cor", "#66aadd")
      ]
    })
    .register({
      id: "path.sweep",
      label: "Varredura de perfil",
      family: "path",
      command: "path.sweep.create",
      parameters: [
        numberParameter("segments", "Segmentos", 32, {
          integer: true, minimum: 1
        }),
        optionalBooleanParameter("closedPath", "Fechamento", null),
        enumParameter("curveType", "Interpolação", CURVES, "centripetal"),
        numberParameter("tension", "Tensão", 0.5),
        numberParameter("twistDegrees", "Torção total em graus", 0),
        numberParameter("scaleStart", "Escala inicial", 1),
        numberParameter("scaleEnd", "Escala final", 1),
        booleanParameter("caps", "Tampar extremidades", true),
        colorParameter("color", "Cor", "#7f9cff")
      ]
    })
    .register({
      id: "path.array",
      label: "Distribuir no caminho",
      family: "path",
      command: "path.array.create",
      parameters: [
        numberParameter("count", "Quantidade de cópias", 8, {
          integer: true, minimum: 1, maximum: 10000
        }),
        booleanParameter("align", "Orientar pela tangente", true),
        optionalBooleanParameter("closed", "Fechamento", null),
        enumParameter("curveType", "Interpolação", CURVES, "centripetal"),
        numberParameter("tension", "Tensão", 0.5),
        numberParameter("twistDegrees", "Torção total em graus", 0),
        booleanParameter("includePathObject", "Incluir objeto-caminho", false)
      ]
    })
    .register({
      id: "path.from-selection",
      label: "Caminho da seleção",
      family: "path",
      command: "path.from-mesh-selection.create",
      parameters: [
        enumParameter("curveType", "Interpolação", CURVES, "centripetal"),
        numberParameter("radius", "Raio visual", 0.08, {
          minimum: 0.001, step: 0.01
        }),
        numberParameter("tubularSegments", "Segmentos", 96, {
          integer: true, minimum: 2
        }),
        numberParameter("radialSegments", "Segmentos radiais", 6, {
          integer: true, minimum: 3
        }),
        numberParameter("tension", "Tensão", 0.5),
        colorParameter("color", "Cor", "#70c8ff")
      ]
    })
    .register({
      id: "mesh.extrude",
      label: "Extrudar",
      family: "topology",
      command: "mesh.topology.apply",
      parameters: [
        numberParameter("distance", "Distância", 1, { step: 0.1 })
      ]
    })
    .register({
      id: "mesh.inset",
      label: "Inset",
      family: "topology",
      command: "mesh.topology.apply",
      parameters: [
        numberParameter("amount", "Quantidade", 0.2, {
          minimum: 0.001, maximum: 0.999, step: 0.05
        })
      ]
    })
    .register({
      id: "mesh.split",
      label: "Dividir aresta",
      family: "topology",
      command: "mesh.topology.apply",
      parameters: [
        numberParameter("parameter", "Posição relativa", 0.5, {
          minimum: 0.001, maximum: 0.999, step: 0.05
        })
      ]
    });
}

export function createLegacyToolParameterMigration() {
  return storage => {
    const hud = readStorageObject(storage, "spatialseed.edit.hud.v1");
    const geometry = readStorageObject(
      storage,
      "spatialseed.geometry.creation.defaults.v1"
    );
    const tube = geometry.parameters?.tube ?? {};
    const pathRadius = finiteOrNull(hud.defaults?.pathRadius);
    const migratedTube = {
      radius: finiteOrNull(tube["parameter-radius"]) ?? pathRadius ?? undefined,
      tubularSegments: integerOrNull(tube["parameter-tubularSegments"]) ?? undefined,
      radialSegments: integerOrNull(tube["parameter-radialSegments"]) ?? undefined,
      tension: finiteOrNull(tube["parameter-tension"]) ?? undefined,
      closed: booleanOrNull(tube["parameter-closed"]) ?? undefined,
      curveType: stringOrNull(tube["parameter-curveType"]) ?? undefined
    };
    return {
      "path.sketch": compact({
        radius: pathRadius ?? undefined
      }),
      "path.tube": compact(migratedTube),
      "path.from-selection": compact({
        radius: pathRadius ?? undefined
      }),
      "mesh.extrude": compact({
        distance: finiteOrNull(hud.defaults?.extrude) ?? undefined
      }),
      "mesh.inset": compact({
        amount: finiteOrNull(hud.defaults?.inset) ?? undefined
      })
    };
  };
}

function enumParameter(
  id,
  label,
  options,
  defaultValue,
  configuration = {}
) {
  return {
    id,
    label,
    type: "enum",
    options,
    default: defaultValue,
    when: configuration.when
  };
}

function numberParameter(id, label, defaultValue, options = {}) {
  return {
    id,
    label,
    type: options.integer ? "integer" : "number",
    default: defaultValue,
    minimum: options.minimum,
    maximum: options.maximum,
    step: options.step,
    when: options.when
  };
}

function booleanParameter(id, label, defaultValue, options = {}) {
  return {
    id,
    label,
    type: "boolean",
    default: defaultValue,
    when: options.when
  };
}

function optionalBooleanParameter(id, label, defaultValue = null) {
  return {
    id,
    label,
    type: "optional-boolean",
    default: defaultValue
  };
}

function colorParameter(id, label, defaultValue, options = {}) {
  return {
    id,
    label,
    type: "color",
    default: defaultValue,
    when: options.when
  };
}

function stringParameter(id, label, defaultValue, options = {}) {
  return {
    id,
    label,
    type: "string",
    default: defaultValue,
    when: options.when,
    description: options.description
  };
}

function jsonParameter(id, label, defaultValue, options = {}) {
  return {
    id,
    label,
    type: "json",
    default: defaultValue,
    when: options.when,
    hidden: Boolean(options.hidden),
    description: options.description
  };
}

function affineBrushParameterOptions(options = {}) {
  return {
    when: { mode: "array" },
    description:
      options.description ??
      "Aceita i, u, count, d, length, spacing, k, x, y, z, tangente, normal e binormal."
  };
}

function readStorageObject(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem?.(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function booleanOrNull(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

function geometryCatalogOptions(catalog) {
  const normalized = Array.isArray(catalog)
    ? catalog.map(entry =>
        typeof entry === "string"
          ? { value: entry, label: entry }
          : {
              value: String(entry?.type ?? ""),
              label: String(entry?.label ?? entry?.type ?? "")
            }
      ).filter(entry => entry.value)
    : [];
  if (!normalized.length) {
    return Object.freeze([
      Object.freeze({ value: "box", label: "Caixa" }),
      Object.freeze({ value: "sphere", label: "Esfera" }),
      Object.freeze({ value: "cylinder", label: "Cilindro" })
    ]);
  }
  return Object.freeze(normalized.map(entry => Object.freeze(entry)));
}
