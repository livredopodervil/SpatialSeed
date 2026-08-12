import {
  MESH_PATH_MODES,
  normalizeMeshPathMode
} from "./MeshPath.js?build=20260812-0054g";

export const MESH_OPERATOR_CONTRACT_VERSION = "mesh-operator-contract-v1";

const CONTRACTS = Object.freeze({
  extrude: contract("extrude", {
    modes: ["vertex", "edge", "face"],
    algebra: ["duplicate-front", "stitch-boundary", "translate-front"],
    interaction: {
      kind: "path",
      defaultMode: "drag-line",
      modes: ["drag-line", "drawn", "normal", "explicit"],
      pathSpace: "mesh-local"
    },
    preserves: ["boundary-orientation"],
    produces: ["vertices", "edges", "faces"]
  }),
  "create-vertex": contract("create-vertex", {
    modes: ["vertex"], algebra: ["make-vertex"], produces: ["vertices"]
  }),
  "create-edge": contract("create-edge", {
    modes: ["vertex"], algebra: ["make-edge"], produces: ["edges"]
  }),
  "create-face": contract("create-face", {
    modes: ["vertex", "edge"], algebra: ["make-face"], produces: ["faces"]
  }),
  split: contract("split", {
    modes: ["edge"], algebra: ["split-edge"], produces: ["vertices", "edges", "faces"]
  }),
  collapse: contract("collapse", {
    modes: ["edge"], algebra: ["collapse-edge"], produces: ["vertices", "edges", "faces"]
  }),
  weld: contract("weld", {
    modes: ["vertex"], algebra: ["merge-vertices"], produces: ["vertices", "edges", "faces"]
  }),
  delete: contract("delete", {
    modes: ["vertex", "edge", "face"], algebra: ["remove-cell"], produces: []
  })
});

export function meshOperatorContract(operation) {
  const id = String(operation ?? "").trim().toLowerCase();
  return CONTRACTS[id] ?? contract(id || "unknown", {
    modes: ["vertex", "edge", "face"],
    algebra: ["legacy-adapter"],
    produces: ["vertices", "edges", "faces"],
    provisional: true
  });
}

export function listMeshOperatorContracts() {
  return Object.freeze(Object.values(CONTRACTS));
}

export function normalizeMeshOperatorInteraction(operation, input = {}) {
  const definition = meshOperatorContract(operation);
  if (definition.interaction?.kind !== "path") return null;
  const requested = input.pathMode ?? definition.interaction.defaultMode;
  const mode = normalizeMeshPathMode(requested);
  if (!definition.interaction.modes.includes(mode)) {
    throw new RangeError(
      `${operation} não aceita o modo de caminho ${requested}.`
    );
  }
  return Object.freeze({
    kind: "path",
    mode,
    pathSpace: definition.interaction.pathSpace,
    availableModes: Object.freeze([...definition.interaction.modes])
  });
}

function contract(id, {
  modes,
  algebra,
  interaction = null,
  preserves = [],
  produces = [],
  provisional = false
}) {
  return Object.freeze({
    version: MESH_OPERATOR_CONTRACT_VERSION,
    id,
    domain: "surface-cell-complex",
    modes: Object.freeze([...modes]),
    algebra: Object.freeze([...algebra]),
    interaction: interaction
      ? Object.freeze({
          ...interaction,
          modes: Object.freeze(interaction.modes.map(mode =>
            MESH_PATH_MODES.includes(mode) ? mode : String(mode)
          ))
        })
      : null,
    preserves: Object.freeze([...preserves]),
    produces: Object.freeze([...produces]),
    provisional: Boolean(provisional)
  });
}
