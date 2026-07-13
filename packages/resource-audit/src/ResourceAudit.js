export class ResourceAudit {
  constructor({ sandbox, editor, renderer, appearanceRuntime, selectionOperations }) {
    this.sandbox = sandbox;
    this.editor = editor;
    this.renderer = renderer;
    this.appearanceRuntime = appearanceRuntime;
    this.selectionOperations = selectionOperations;
  }

  collect() {
    const state = this.sandbox.getSnapshot
      ? this.sandbox.getSnapshot()
      : this.sandbox.getState();

    const objects = state.objects ?? [];
    const appearances = new Set();

    let embeddedMaterials = 0;
    let embeddedTextureSources = 0;
    let embeddedDataUrls = 0;

    for (const object of objects) {
      if (object.appearanceId) appearances.add(object.appearanceId);

      if (object.material) {
        embeddedMaterials += 1;
        const src = object.material?.texture?.src;

        if (src) {
          embeddedTextureSources += 1;
          if (String(src).startsWith("data:")) embeddedDataUrls += 1;
        }
      }
    }

    const selection = this.editor.selection.snapshot();
    const duplicate = this.selectionOperations?.getState?.() ?? null;

    return Object.freeze({
      timestamp: new Date().toISOString(),

      logical: {
        objects: objects.length,
        appearances: appearances.size,
        embeddedMaterials,
        embeddedTextureSources,
        embeddedDataUrls
      },

      selection: {
        size: selection.members.length,
        activeObjectId: selection.activeMember?.objectId ?? null,
        pivotPolicy: selection.pivotPolicy,
        transformPolicy: selection.transformPolicy
      },

      history: this.sandbox.getHistoryDiagnostics?.() ?? {
        canUndo: this.sandbox.canUndo,
        canRedo: this.sandbox.canRedo
      },

      duplicate: {
        pending: Boolean(duplicate?.pendingDuplicate),
        pendingCount: duplicate?.pendingDuplicate?.duplicateIds?.length ?? 0,
        hasRepeatHistory: Boolean(duplicate?.lastDuplicate?.deltaMatrix),
        repeatCount: duplicate?.lastDuplicate?.duplicateIds?.length ?? 0
      },

      appearanceRuntime: this.appearanceRuntime?.stats?.() ?? null,
      renderer: this.renderer.getResourceDiagnostics?.() ?? null,

      memory: {
        performance:
          typeof performance !== "undefined" && performance.memory
            ? {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
              }
            : null
      }
    });
  }
}
