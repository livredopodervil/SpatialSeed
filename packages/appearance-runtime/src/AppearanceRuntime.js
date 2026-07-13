import {
  AppearanceGraph
} from "../../appearance-graph/src/index.js";

export class AppearanceRuntime {
  #resolved = new Map();
  #listeners = new Set();
  #revision = 0;

  constructor({
    graph = new AppearanceGraph()
  } = {}) {
    this.graph = graph;
  }

  get revision() {
    return this.#revision;
  }

  importAssets(
    document,
    {
      replace = true
    } = {}
  ) {
    const result =
      this.graph.import(
        document,
        { replace }
      );

    this.#resolved.clear();
    this.#revision += 1;

    this.#notify("assets-imported", {
      imported:
        result.imported,
      assets:
        result.assets
    });

    return {
      ...result,
      revision:
        this.#revision
    };
  }

  exportAssets() {
    return this.graph.export();
  }

  internLegacyMaterial(
    material,
    options = {}
  ) {
    const result =
      this.graph.internLegacyMaterial(
        material,
        options
      );

    this.#resolved.delete(
      result.appearanceId
    );

    this.#revision += 1;

    this.#notify(
      "appearance-interned",
      {
        appearanceId:
          result.appearanceId
      }
    );

    return result;
  }

  resolve(
    appearanceId
  ) {
    const id =
      String(appearanceId);

    if (this.#resolved.has(id)) {
      return this.#resolved.get(id);
    }

    const resolved =
      this.graph.resolveAppearance(id);

    if (!resolved) {
      return null;
    }

    const snapshot =
      Object.freeze({
        appearanceId: id,
        appearance:
          resolved.appearance,
        material:
          resolved.material,
        texture:
          resolved.texture,
        shaderId:
          resolved.shaderId
      });

    this.#resolved.set(
      id,
      snapshot
    );

    return snapshot;
  }

  attachLegacyObject(
    object,
    options = {}
  ) {
    if (object.appearanceId) {
      return Object.freeze(
        structuredClone(object)
      );
    }

    if (!object.material) {
      throw new Error(
        `Objeto sem material: ${object.id}.`
      );
    }

    const result =
      this.internLegacyMaterial(
        object.material,
        options
      );

    return this.graph.attachToObject(
      object,
      result.appearanceId
    );
  }

  normalizeScene(
    scene,
    options = {}
  ) {
    const objects =
      (scene.objects ?? []).map(
        object =>
          this.attachLegacyObject(
            object,
            options
          )
      );

    return Object.freeze({
      ...structuredClone(scene),
      objects:
        Object.freeze(objects)
    });
  }

  clearResolvedCache() {
    const entries =
      this.#resolved.size;

    this.#resolved.clear();

    return {
      cleared: entries
    };
  }

  stats() {
    return Object.freeze({
      revision:
        this.#revision,
      resolvedCache:
        this.#resolved.size,
      assets:
        this.graph.stats()
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);

    listener(
      this.stats(),
      {
        type: "initial",
        payload: null
      }
    );

    return () => {
      this.#listeners.delete(
        listener
      );
    };
  }

  #notify(type, payload) {
    const snapshot =
      this.stats();

    for (
      const listener of
      this.#listeners
    ) {
      try {
        listener(
          snapshot,
          {
            type,
            payload
          }
        );
      } catch (error) {
        console.error(
          "AppearanceRuntime subscriber failed",
          error
        );
      }
    }
  }
}
