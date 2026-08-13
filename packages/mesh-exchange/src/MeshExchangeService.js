import {
  STL_MESH_FORMAT,
  decodeStl,
  stlPreparedPayload
} from "./StlCodec.js";

export class MeshExchangeService {
  static apiVersion = "mesh-exchange-v1";

  constructor({
    selection,
    readObject,
    readWorldMatrix,
    triangulateObject,
    createGeometry
  } = {}) {
    for (const [name, fn] of Object.entries({
      selection,
      readObject,
      readWorldMatrix,
      triangulateObject,
      createGeometry
    })) {
      if (typeof fn !== "function") throw new TypeError(`MeshExchangeService exige ${name}().`);
    }
    this.selection = selection;
    this.readObject = readObject;
    this.readWorldMatrix = readWorldMatrix;
    this.triangulateObject = triangulateObject;
    this.createGeometry = createGeometry;
  }

  formats() {
    return Object.freeze([STL_MESH_FORMAT]);
  }

  importStl({ data, filename = "imported.stl", ...options } = {}) {
    const decoded = decodeStl(data, options);
    const result = this.createGeometry({
      name: basename(filename),
      geometry: decoded.geometry,
      position: [0, 0, 0]
    });
    return Object.freeze({
      imported: Boolean(result?.changed),
      id: result?.id ?? null,
      filename: String(filename),
      encoding: decoded.encoding,
      triangleCount: decoded.triangleCount,
      sourceVertexCount: decoded.sourceVertexCount,
      vertexCount: decoded.mergedVertexCount,
      geometry: decoded.geometry
    });
  }

  exportSelectionStl({ binary = true, filename = null } = {}) {
    const snapshot = this.selection();
    const ids = [...new Set((snapshot?.members ?? [])
      .map(member => String(member?.objectId ?? "").trim())
      .filter(Boolean))];
    if (!ids.length) throw new Error("Selecione ao menos um objeto para exportar STL.");
    const meshes = ids.map(id => {
      const object = this.readObject(id);
      if (!object) throw new Error(`Objeto selecionado não encontrado: ${id}.`);
      const worldMatrix = this.readWorldMatrix(id);
      if (!worldMatrix) throw new Error(`Transformação mundial indisponível: ${id}.`);
      return Object.freeze({
        id,
        name: object.name ?? id,
        triangles: this.triangulateObject(object, worldMatrix)
      });
    });
    const activeId = String(snapshot?.activeMember?.objectId ?? ids.at(-1));
    const active = meshes.find(mesh => mesh.id === activeId) ?? meshes.at(-1);
    const suggested = filename ?? (meshes.length === 1
      ? `${safeFilename(active.name)}.stl`
      : "spatialseed-selection.stl");
    const payload = stlPreparedPayload(meshes, {
      binary,
      filename: suggested,
      name: meshes.length === 1 ? active.name : "SpatialSeed selection"
    });
    return Object.freeze({
      ...payload,
      objectIds: Object.freeze(ids),
      objectCount: ids.length,
      triangleCount: meshes.reduce((sum, mesh) => sum + mesh.triangles.length / 9, 0)
    });
  }
}

function basename(filename) {
  const name = String(filename ?? "imported.stl").split(/[\\/]/).at(-1) || "imported.stl";
  return name.replace(/\.stl$/i, "") || "STL importado";
}

function safeFilename(value) {
  const cleaned = String(value ?? "object")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .trim();
  return cleaned || "object";
}
