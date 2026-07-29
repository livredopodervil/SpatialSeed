const BASE_GROUP_ORDER = Object.freeze([
  "subject",
  "tool",
  "quick",
  "selection",
  "frame",
  "axes",
  "snap",
  "navigation",
  "lifecycle",
  "creation",
  "actions",
  "session"
]);

const OBJECT_ACTIONS = Object.freeze([
  "edit-hud-duplicate",
  "edit-hud-delete",
  "edit-hud-group",
  "edit-hud-ungroup",
  "edit-hud-enter-mesh",
  "edit-hud-material",
  "edit-hud-draw-path",
  "edit-hud-create-light"
]);

const MESH_SELECTION_ACTIONS = Object.freeze([
  "edit-hud-select-all",
  "edit-hud-select-none",
  "edit-hud-select-invert",
  "edit-hud-select-grow",
  "edit-hud-select-shrink",
  "edit-hud-select-linked",
  "edit-hud-select-boundary"
]);

const MESH_TOPOLOGY_ACTIONS = Object.freeze({
  vertex: [
    "edit-hud-create-vertex",
    "edit-hud-create-edge",
    "edit-hud-create-face",
    "edit-hud-fill",
    "edit-hud-weld",
    "edit-hud-extrude",
    "edit-hud-duplicate",
    "edit-hud-delete",
    "edit-hud-path-from-selection",
    "edit-hud-recalculate-normals",
    "edit-hud-cleanup"
  ],
  edge: [
    "edit-hud-create-face",
    "edit-hud-fill",
    "edit-hud-extrude",
    "edit-hud-split",
    "edit-hud-collapse",
    "edit-hud-flip-edge",
    "edit-hud-bridge",
    "edit-hud-duplicate",
    "edit-hud-delete",
    "edit-hud-path-from-selection",
    "edit-hud-recalculate-normals",
    "edit-hud-cleanup"
  ],
  face: [
    "edit-hud-extrude",
    "edit-hud-inset",
    "edit-hud-subdivide",
    "edit-hud-flip-normal",
    "edit-hud-duplicate",
    "edit-hud-delete",
    "edit-hud-path-from-selection",
    "edit-hud-recalculate-normals",
    "edit-hud-cleanup"
  ]
});

export function deriveHudContext({
  state = {},
  mesh = {},
  selection = {},
  selectionActions = {},
  references = [],
  placement = {},
  sketch = {}
} = {}) {
  const meshActive = Boolean(state.meshActive ?? mesh.active);
  const mode = meshActive
    ? normalizeMode(mesh.componentMode ?? state.subjectLevel)
    : "object";
  const selectedObjects = selection.members?.length ?? 0;
  const selectedComponents = meshActive ? Number(mesh.selectedCount ?? 0) : 0;
  const activeObjectId = selection.activeMember?.objectId ?? null;
  const selectedIds = new Set(
    selection.members?.map(member => String(member.objectId)) ?? []
  );
  const selectedReferences = references.filter(reference =>
    selectedIds.has(String(reference.id)) || reference.selected
  );
  const pathReference = preferredReference(
    selectedReferences.filter(reference => reference.pathExtractions?.length),
    activeObjectId
  );
  const profileReference = preferredReference(
    selectedReferences.filter(reference =>
      reference.id !== pathReference?.id && reference.profileExtractions?.length
    ),
    activeObjectId === pathReference?.id ? null : activeObjectId
  );
  const actionActive = Boolean(placement.active || sketch.active || state.activeAction);
  const hasSelection = meshActive ? selectedComponents > 0 : selectedObjects > 0;

  let groupOrder;
  if (actionActive) {
    groupOrder = [
      "quick", "lifecycle", "creation", "tool", "selection", "subject",
      "actions", "axes", "snap", "frame", "navigation", "session"
    ];
  } else if (meshActive) {
    groupOrder = [
      "subject", "selection", "quick", "tool", "actions", "axes", "snap",
      "frame", "navigation", "lifecycle", "creation", "session"
    ];
  } else if (hasSelection) {
    groupOrder = [
      "selection", "quick", "actions", "tool", "subject", "creation",
      "frame", "axes", "snap", "navigation", "lifecycle", "session"
    ];
  } else {
    groupOrder = [
      "creation", "tool", "selection", "quick", "subject", "frame", "axes",
      "snap", "navigation", "lifecycle", "actions", "session"
    ];
  }

  const actionOrder = meshActive
    ? [
      ...MESH_SELECTION_ACTIONS,
      ...(MESH_TOPOLOGY_ACTIONS[mode] ?? []),
      ...OBJECT_ACTIONS
    ]
    : [
      ...(hasSelection ? OBJECT_ACTIONS : [
        "edit-hud-draw-path",
        "edit-hud-create-light",
        "edit-hud-material",
        "edit-hud-enter-mesh",
        "edit-hud-duplicate",
        "edit-hud-delete",
        "edit-hud-group",
        "edit-hud-ungroup"
      ]),
      ...MESH_SELECTION_ACTIONS,
      ...Object.values(MESH_TOPOLOGY_ACTIONS).flat()
    ];

  return Object.freeze({
    meshActive,
    mode,
    selectedObjects,
    selectedComponents,
    hasSelection,
    activeObjectId,
    pathReference: pathReference ? Object.freeze({ ...pathReference }) : null,
    profileReference: profileReference ? Object.freeze({ ...profileReference }) : null,
    canTubeFromObject: !meshActive && Boolean(pathReference),
    canSweepFromObjects: !meshActive && Boolean(pathReference && profileReference),
    canArrayAlongPath: !meshActive && Boolean(pathReference && selectedObjects >= 2),
    canDuplicate: hasSelection,
    canDelete: hasSelection,
    canGroup: !meshActive && Boolean(selectionActions.canGroup ?? selectedObjects > 0),
    canUngroup: !meshActive && Boolean(selectionActions.canUngroup),
    canEnterMesh: !meshActive && Boolean(mesh.canEnter ?? state.canEnterMesh),
    groupOrder: Object.freeze(uniqueOrder(groupOrder)),
    actionOrder: Object.freeze(uniqueOrder(actionOrder)),
    reason: actionActive
      ? "interactive-action"
      : meshActive
        ? `mesh-${mode}`
        : hasSelection
          ? "object-selection"
          : "object-create"
  });
}

export function geometryToolIcon(type) {
  return ({
    box: "□",
    sphere: "●",
    cylinder: "▯",
    plane: "▱",
    polygon: "⬡",
    capsule: "◒",
    circle: "○",
    cone: "△",
    dodecahedron: "⬢",
    icosahedron: "◈",
    octahedron: "◇",
    ring: "◎",
    tetrahedron: "◭",
    torus: "◉",
    "torus-knot": "⌘",
    lathe: "↻",
    tube: "⌇",
    shape: "▰",
    extrude: "⇧",
    polyhedron: "◆",
    buffer: "▦"
  })[type] ?? "＋";
}

export function geometryToolPriority(type) {
  const index = [
    "box", "sphere", "cylinder", "plane", "polygon",
    "extrude", "tube", "lathe", "shape",
    "cone", "torus", "capsule", "circle", "ring",
    "torus-knot", "tetrahedron", "octahedron", "icosahedron",
    "dodecahedron", "polyhedron", "buffer"
  ].indexOf(type);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function preferredReference(references, activeObjectId) {
  return references.find(reference => reference.id === activeObjectId) ?? references[0] ?? null;
}

function normalizeMode(value) {
  return ["vertex", "edge", "face"].includes(value) ? value : "vertex";
}

function uniqueOrder(values) {
  return [...new Set([...values, ...BASE_GROUP_ORDER])];
}
