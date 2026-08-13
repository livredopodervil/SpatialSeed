import {
  AnimationMixer,
  Box3,
  Euler,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Vector3
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const THREE_CHARACTER_ANIMATION_BACKEND_VERSION =
  "three-character-animation-backend-v2-independent-visual-projection";

export class ThreeCharacterAnimationBackend {
  #entries = new Map();

  constructor({ surface, loaderFactory = () => new GLTFLoader() } = {}) {
    validateSurface(surface);
    if (typeof loaderFactory !== "function") {
      throw new TypeError("loaderFactory deve ser função.");
    }
    this.surface = surface;
    this.loaderFactory = loaderFactory;
  }

  async load({ characterId, source, options = {} } = {}) {
    const id = requiredId(characterId);
    await this.unload(id);
    const loader = this.loaderFactory();
    const gltf = await loadGltf(loader, source);
    const root = gltf?.scene;
    if (!root?.isObject3D) throw new Error("GLB/glTF não possui cena visual.");
    const originalClips = Array.isArray(gltf.animations) ? gltf.animations : [];
    if (!originalClips.length) throw new Error("GLB/glTF não contém animações.");
    root.traverse?.(object => {
      if (object?.isSkinnedMesh) object.frustumCulled = false;
    });
    const clips = normalizeRootMotionClips(
      originalClips,
      root,
      String(options.rootMotion ?? "in-place-horizontal")
    );
    const visualRoot = new Group();
    visualRoot.name = `SpatialSeedCharacterVisual:${id}`;
    visualRoot.add(root);
    const visualOptions = normalizeVisualOptions(options.visual ?? {});
    const handle = this.surface.attachRuntimeVisual(id, visualRoot, {
      layerId: "character-animation",
      replaceBase: true,
      active: false
    });
    let targetFrame;
    let alignment;
    try {
      targetFrame = this.surface.readRuntimeVisualTargetFrame?.(id) ?? null;
      alignment = applyCharacterVisualAlignment({
        visualRoot,
        assetRoot: root,
        visualOptions,
        targetFrame
      });
      this.surface.setRuntimeVisualActive?.(
        handle,
        visualOptions.previewInEditor !== false
      );
    } catch (error) {
      this.surface.detachRuntimeVisual(handle);
      throw error;
    }
    const mixer = new AnimationMixer(root);
    const entry = {
      characterId: id,
      root,
      visualRoot,
      visualOptions,
      targetFrame,
      alignment,
      mixer,
      handle,
      clips,
      actions: new Map(),
      activeAction: null,
      activeClip: null,
      active: false
    };
    this.#entries.set(id, entry);
    return Object.freeze({
      assetId: String(source?.filename ?? source?.src ?? `character:${id}`),
      visual: freezeVisualStatus(entry),
      clips: Object.freeze(clips.map((clip, index) => Object.freeze({
        id: String(clip.uuid ?? clip.name ?? `clip-${index}`),
        name: String(clip.name ?? `clip-${index}`),
        duration: Number(clip.duration) || 0
      })))
    });
  }

  configureVisual(characterId, patch = {}) {
    const entry = this.#requiredEntry(characterId);
    const request = patch && typeof patch === "object" ? { ...patch } : {};
    const rebindTarget = Boolean(request.rebindTarget);
    delete request.rebindTarget;
    entry.visualOptions = normalizeVisualOptions(request, entry.visualOptions);
    if (rebindTarget) {
      entry.targetFrame = this.surface.readRuntimeVisualTargetFrame?.(entry.characterId) ??
        entry.targetFrame ?? null;
    }
    entry.alignment = applyCharacterVisualAlignment({
      visualRoot: entry.visualRoot,
      assetRoot: entry.root,
      visualOptions: entry.visualOptions,
      targetFrame: entry.targetFrame
    });
    this.surface.setRuntimeVisualActive?.(
      entry.handle,
      entry.active || entry.visualOptions.previewInEditor !== false
    );
    this.surface.invalidateRender?.(`character-visual-align:${entry.characterId}`);
    return freezeVisualStatus(entry);
  }

  setActive(characterId, active) {
    const entry = this.#entries.get(String(characterId));
    if (!entry) return false;
    entry.active = Boolean(active);
    this.surface.setRuntimeVisualActive(
      entry.handle,
      entry.active || entry.visualOptions.previewInEditor !== false
    );
    return true;
  }

  play(characterId, {
    clip,
    loop = true,
    fadeSeconds = 0.12,
    speed = 1,
    reset = true
  } = {}) {
    const entry = this.#requiredEntry(characterId);
    const animationClip = findClip(entry.clips, clip);
    if (!animationClip) throw new Error(`AnimationClip inexistente: ${clip}.`);
    let action = entry.actions.get(animationClip.uuid);
    if (!action) {
      action = entry.mixer.clipAction(animationClip);
      entry.actions.set(animationClip.uuid, action);
    }
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    action.setEffectiveTimeScale(Number(speed) || 1);
    action.setEffectiveWeight(1);

    const previous = entry.activeAction;
    if (previous === action) {
      if (reset) action.reset();
      action.play();
    } else {
      if (reset) action.reset();
      action.play();
      if (previous) {
        const fade = Math.max(0, Number(fadeSeconds) || 0);
        if (fade > 0) action.crossFadeFrom(previous, fade, true);
        else previous.stop();
      }
    }
    entry.activeAction = action;
    entry.activeClip = animationClip.name;
    if (!entry.active) entry.mixer.update(0);
    return Object.freeze({
      characterId: entry.characterId,
      clip: animationClip.name,
      loop: Boolean(loop),
      fadeSeconds: Math.max(0, Number(fadeSeconds) || 0),
      speed: Number(speed) || 1
    });
  }

  advance(deltaSeconds) {
    const dt = Math.max(0, Number(deltaSeconds) || 0);
    if (!dt) return false;
    let updated = 0;
    for (const entry of this.#entries.values()) {
      if (!entry.active) continue;
      entry.mixer.update(dt);
      updated += 1;
    }
    return updated > 0;
  }

  async unload(characterId) {
    const id = String(characterId ?? "").trim();
    if (!id) return false;
    const entry = this.#entries.get(id);
    if (!entry) return false;
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.root);
    this.surface.detachRuntimeVisual(entry.handle);
    this.#entries.delete(id);
    return true;
  }

  status(characterId = null) {
    if (characterId == null) {
      return Object.freeze({
        version: THREE_CHARACTER_ANIMATION_BACKEND_VERSION,
        loadedCharacters: Object.freeze([...this.#entries.keys()])
      });
    }
    const entry = this.#entries.get(String(characterId));
    return Object.freeze({
      version: THREE_CHARACTER_ANIMATION_BACKEND_VERSION,
      characterId: String(characterId),
      loaded: Boolean(entry),
      active: Boolean(entry?.active),
      activeClip: entry?.activeClip ?? null,
      actionCount: entry?.actions.size ?? 0,
      visual: entry ? freezeVisualStatus(entry) : null
    });
  }

  #requiredEntry(characterId) {
    const id = requiredId(characterId);
    const entry = this.#entries.get(id);
    if (!entry) throw new Error(`Backend sem personagem carregado: ${id}.`);
    return entry;
  }
}

async function loadGltf(loader, source) {
  if (!loader) throw new TypeError("GLTFLoader indisponível.");
  if (source?.data !== undefined && source?.data !== null) {
    let data = source.data;
    if (ArrayBuffer.isView(data)) {
      data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (!(data instanceof ArrayBuffer) && typeof data !== "string") {
      throw new TypeError("Dados GLB/glTF inválidos.");
    }
    if (typeof loader.parseAsync === "function") {
      return loader.parseAsync(data, String(source.basePath ?? ""));
    }
    return new Promise((resolve, reject) => {
      loader.parse(data, String(source.basePath ?? ""), resolve, reject);
    });
  }
  const src = String(source?.src ?? "").trim();
  if (!src) throw new TypeError("Informe source.src ou source.data para o personagem.");
  if (typeof loader.loadAsync === "function") return loader.loadAsync(src);
  return new Promise((resolve, reject) => loader.load(src, resolve, undefined, reject));
}

function normalizeVisualOptions(source = {}, base = null) {
  const previous = base ?? {
    previewInEditor: false,
    fit: "none",
    fitFactor: 1,
    scale: 1,
    sourceUp: "+Y",
    sourceForward: "+Z",
    anchor: "feet",
    hover: 0,
    offset: [0, 0, 0],
    rotationDegrees: [0, 0, 0]
  };
  const explicitLegacyScale = base == null &&
    Object.prototype.hasOwnProperty.call(source, "scale") &&
    !Object.prototype.hasOwnProperty.call(source, "fit");
  const next = {
    ...previous,
    ...source,
    previewInEditor: source.previewInEditor === undefined
      ? previous.previewInEditor !== false
      : Boolean(source.previewInEditor),
    fit: explicitLegacyScale ? "none" : String(source.fit ?? previous.fit ?? "none"),
    fitFactor: positiveFinite(source.fitFactor ?? previous.fitFactor ?? 1, "visual.fitFactor"),
    scale: normalizeScale(source.scale ?? previous.scale ?? 1),
    sourceUp: normalizeAxis(source.sourceUp ?? source.upAxis ?? previous.sourceUp ?? "+Y"),
    sourceForward: normalizeAxis(
      source.sourceForward ?? source.forwardAxis ?? previous.sourceForward ?? "+Z"
    ),
    anchor: String(source.anchor ?? previous.anchor ?? "feet").toLowerCase(),
    hover: finiteNumber(source.hover ?? previous.hover ?? 0, "visual.hover"),
    offset: vector3(
      source.offset ?? source.position ?? previous.offset ?? [0, 0, 0],
      "visual.offset"
    ),
    rotationDegrees: normalizeRotationDegrees(source, previous)
  };
  if (!["height", "none"].includes(next.fit)) {
    throw new RangeError(`visual.fit inválido: ${next.fit}.`);
  }
  if (!["feet", "center", "origin"].includes(next.anchor)) {
    throw new RangeError(`visual.anchor inválido: ${next.anchor}.`);
  }
  const up = axisVector(next.sourceUp);
  const forward = axisVector(next.sourceForward);
  if (Math.abs(up.dot(forward)) > 1e-6) {
    throw new RangeError("sourceUp e sourceForward devem ser eixos ortogonais.");
  }
  return Object.freeze(next);
}

function applyCharacterVisualAlignment({
  visualRoot,
  assetRoot,
  visualOptions,
  targetFrame
}) {
  visualRoot.position.set(0, 0, 0);
  visualRoot.quaternion.identity();
  visualRoot.scale.set(1, 1, 1);
  visualRoot.updateMatrixWorld(true);

  const axisRotation = axisRemapQuaternion(
    visualOptions.sourceUp,
    visualOptions.sourceForward
  );
  const correction = new Quaternion().setFromEuler(new Euler(
    visualOptions.rotationDegrees[0] * Math.PI / 180,
    visualOptions.rotationDegrees[1] * Math.PI / 180,
    visualOptions.rotationDegrees[2] * Math.PI / 180,
    "XYZ"
  ));
  visualRoot.quaternion.copy(correction).multiply(axisRotation);
  visualRoot.updateMatrixWorld(true);

  const poseRoot = visualRoot.parent?.isObject3D ? visualRoot.parent : null;
  const orientedBounds = boundsInTargetLocalSpace(assetRoot, poseRoot);
  const hasSourceBounds = !orientedBounds.isEmpty();
  if (!hasSourceBounds) {
    orientedBounds.min.set(0, 0, 0);
    orientedBounds.max.set(0, 0, 0);
  }
  const targetBounds = boxFromFrame(targetFrame);
  let fitScale = 1;
  if (hasSourceBounds && visualOptions.fit === "height" && targetBounds) {
    const sourceHeight = orientedBounds.max.y - orientedBounds.min.y;
    const targetHeight = targetBounds.max.y - targetBounds.min.y;
    if (sourceHeight > 1e-9 && targetHeight > 1e-9) {
      fitScale = targetHeight / sourceHeight * visualOptions.fitFactor;
    }
  }
  const multiplier = visualOptions.scale;
  const scale = Array.isArray(multiplier)
    ? multiplier.map(value => value * fitScale)
    : [multiplier * fitScale, multiplier * fitScale, multiplier * fitScale];
  visualRoot.scale.fromArray(scale);
  visualRoot.updateMatrixWorld(true);

  const scaledBounds = boundsInTargetLocalSpace(assetRoot, poseRoot);
  if (scaledBounds.isEmpty()) {
    scaledBounds.min.set(0, 0, 0);
    scaledBounds.max.set(0, 0, 0);
  }
  const translation = hasSourceBounds
    ? anchorTranslation(scaledBounds, targetBounds, visualOptions.anchor)
    : new Vector3(0, 0, 0);
  translation.add(new Vector3(...visualOptions.offset));
  translation.y += visualOptions.hover;
  visualRoot.position.copy(translation);
  visualRoot.updateMatrixWorld(true);

  const finalBounds = boundsInTargetLocalSpace(assetRoot, poseRoot);
  if (finalBounds.isEmpty()) {
    finalBounds.min.set(0, 0, 0);
    finalBounds.max.set(0, 0, 0);
  }
  return Object.freeze({
    fitScale,
    scale: Object.freeze([...scale]),
    position: Object.freeze(visualRoot.position.toArray()),
    quaternion: Object.freeze(visualRoot.quaternion.toArray()),
    sourceBounds: freezeBox(orientedBounds),
    finalBounds: freezeBox(finalBounds),
    targetBounds: targetBounds ? freezeBox(targetBounds) : null
  });
}

function boundsInTargetLocalSpace(root, targetParent = null) {
  const bounds = new Box3().makeEmpty();
  const inverseTarget = new Matrix4();
  if (targetParent?.isObject3D) {
    targetParent.updateWorldMatrix?.(true, false);
    inverseTarget.copy(targetParent.matrixWorld).invert();
  } else {
    inverseTarget.identity();
  }
  root.updateWorldMatrix?.(true, true);
  root.traverse?.(object => {
    const localBox = objectLocalBounds(object);
    if (!localBox || localBox.isEmpty()) return;
    const matrix = new Matrix4().multiplyMatrices(inverseTarget, object.matrixWorld);
    expandBoxByTransformedBox(bounds, localBox, matrix);
  });
  return bounds;
}

function objectLocalBounds(object) {
  if (object?.isSkinnedMesh && typeof object.computeBoundingBox === "function") {
    object.computeBoundingBox();
    if (object.boundingBox) return object.boundingBox;
  }
  const geometry = object?.geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox && typeof geometry.computeBoundingBox === "function") {
    geometry.computeBoundingBox();
  }
  return geometry.boundingBox ?? null;
}

function expandBoxByTransformedBox(target, source, matrix) {
  for (const x of [source.min.x, source.max.x]) {
    for (const y of [source.min.y, source.max.y]) {
      for (const z of [source.min.z, source.max.z]) {
        target.expandByPoint(new Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
  return target;
}

function axisRemapQuaternion(sourceUpName, sourceForwardName) {
  const sourceUp = axisVector(sourceUpName);
  const sourceForward = axisVector(sourceForwardName);
  const sourceRight = sourceForward.clone().cross(sourceUp).normalize();
  const sourceBack = sourceForward.clone().negate();
  const sourceBasis = new Matrix4().makeBasis(sourceRight, sourceUp, sourceBack);

  const targetUp = new Vector3(0, 1, 0);
  const targetForward = new Vector3(1, 0, 0);
  const targetRight = targetForward.clone().cross(targetUp).normalize();
  const targetBack = targetForward.clone().negate();
  const targetBasis = new Matrix4().makeBasis(targetRight, targetUp, targetBack);
  const remap = targetBasis.clone().multiply(sourceBasis.clone().invert());
  return new Quaternion().setFromRotationMatrix(remap).normalize();
}

function anchorTranslation(sourceBounds, targetBounds, anchor) {
  if (anchor === "origin") return new Vector3(0, 0, 0);
  const sourceCenter = sourceBounds.getCenter(new Vector3());
  const targetCenter = targetBounds
    ? targetBounds.getCenter(new Vector3())
    : new Vector3(0, 0, 0);
  if (anchor === "center") return targetCenter.sub(sourceCenter);
  const sourceFeet = new Vector3(sourceCenter.x, sourceBounds.min.y, sourceCenter.z);
  const targetFeet = targetBounds
    ? new Vector3(targetCenter.x, targetBounds.min.y, targetCenter.z)
    : new Vector3(0, 0, 0);
  return targetFeet.sub(sourceFeet);
}

function boxFromFrame(frame) {
  const min = frame?.bounds?.min;
  const max = frame?.bounds?.max;
  if (!Array.isArray(min) || !Array.isArray(max) || min.length !== 3 || max.length !== 3) {
    return null;
  }
  return new Box3(new Vector3(...min.map(Number)), new Vector3(...max.map(Number)));
}

function freezeBox(box) {
  return Object.freeze({
    min: Object.freeze(box.min.toArray()),
    max: Object.freeze(box.max.toArray())
  });
}

function freezeVisualStatus(entry) {
  return Object.freeze({
    options: Object.freeze({
      ...entry.visualOptions,
      scale: Array.isArray(entry.visualOptions.scale)
        ? Object.freeze([...entry.visualOptions.scale])
        : entry.visualOptions.scale,
      offset: Object.freeze([...entry.visualOptions.offset]),
      rotationDegrees: Object.freeze([...entry.visualOptions.rotationDegrees])
    }),
    alignment: entry.alignment
  });
}

function normalizeAxis(value) {
  const axis = String(value ?? "").trim().toUpperCase();
  if (!["+X", "-X", "+Y", "-Y", "+Z", "-Z"].includes(axis)) {
    throw new RangeError(`Eixo visual inválido: ${value}.`);
  }
  return axis;
}

function axisVector(axis) {
  const sign = axis[0] === "-" ? -1 : 1;
  switch (axis[1]) {
    case "X": return new Vector3(sign, 0, 0);
    case "Y": return new Vector3(0, sign, 0);
    case "Z": return new Vector3(0, 0, sign);
    default: throw new RangeError(`Eixo visual inválido: ${axis}.`);
  }
}

function normalizeRotationDegrees(source, previous) {
  if (source.rotationDegrees !== undefined) {
    return vector3(source.rotationDegrees, "visual.rotationDegrees");
  }
  if (source.rotation !== undefined) {
    const radians = vector3(source.rotation, "visual.rotation");
    return Object.freeze(radians.map(value => value * 180 / Math.PI));
  }
  return vector3(previous.rotationDegrees ?? [0, 0, 0], "visual.rotationDegrees");
}

function normalizeScale(value) {
  if (Array.isArray(value)) {
    if (value.length !== 3) throw new TypeError("visual.scale deve ter três componentes.");
    return Object.freeze(value.map((item, index) =>
      positiveFinite(item, `visual.scale[${index}]`)
    ));
  }
  return positiveFinite(value, "visual.scale");
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} deve ter três componentes.`);
  }
  return Object.freeze(value.map((item, index) => finiteNumber(item, `${label}[${index}]`)));
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} deve ser finito.`);
  return number;
}

function positiveFinite(value, label) {
  const number = finiteNumber(value, label);
  if (!(number > 0)) throw new RangeError(`${label} deve ser positivo.`);
  return number;
}

function normalizeRootMotionClips(clips, root, mode) {
  if (mode === "preserve") return clips;
  const roots = new Set();
  if (root.name) roots.add(root.name);
  root.traverse?.(object => {
    if (!object?.isBone) return;
    if (!object.parent?.isBone && object.name) roots.add(object.name);
  });
  if (!roots.size) return clips;
  return clips.map(clip => {
    const cloned = clip.clone();
    for (const track of cloned.tracks ?? []) {
      if (!String(track.name).endsWith(".position")) continue;
      const target = trackTargetName(track.name);
      if (!roots.has(target)) continue;
      const stride = typeof track.getValueSize === "function" ? track.getValueSize() : 3;
      if (stride < 3 || !track.values?.length) continue;
      const x0 = track.values[0];
      const z0 = track.values[2];
      for (let offset = 0; offset < track.values.length; offset += stride) {
        track.values[offset] = x0;
        track.values[offset + 2] = z0;
      }
    }
    return cloned;
  });
}

function trackTargetName(name) {
  const target = String(name).slice(0, -".position".length);
  const slash = Math.max(target.lastIndexOf("/"), target.lastIndexOf(":"));
  return slash >= 0 ? target.slice(slash + 1) : target;
}

function findClip(clips, requested) {
  const name = String(requested ?? "").trim();
  return clips.find(clip => clip.name === name) ??
    clips.find(clip => String(clip.name).toLowerCase() === name.toLowerCase()) ?? null;
}

function validateSurface(surface) {
  for (const method of [
    "attachRuntimeVisual",
    "setRuntimeVisualActive",
    "detachRuntimeVisual"
  ]) {
    if (typeof surface?.[method] !== "function") {
      throw new TypeError(`ThreeCharacterAnimationBackend surface sem ${method}().`);
    }
  }
}

function requiredId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("characterId obrigatório.");
  return id;
}
