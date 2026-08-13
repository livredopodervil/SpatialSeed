export const CHARACTER_ANIMATION_VERSION = "character-animation-v1.4-run-jump-fallback";

const DEFAULT_TRANSITIONS = Object.freeze({
  idle: 0.20,
  walk: 0.15,
  run: 0.12,
  jump: 0.08,
  fall: 0.10,
  land: 0.08
});

const STATE_CLIP_TOKENS = Object.freeze({
  idle: ["idle", "rest", "stand", "survey"],
  walk: ["walk", "walking"],
  run: ["run", "running", "sprint"],
  jump: ["jump", "jumping", "takeoff"],
  fall: ["fall", "falling", "air"],
  land: ["land", "landing"]
});

export class CharacterAnimationSystem {
  #instances = new Map();
  #time = 0;

  constructor({ backend } = {}) {
    validateBackend(backend);
    this.backend = backend;
  }

  async load(characterId, source, options = {}) {
    const id = requiredId(characterId);
    if (this.#instances.has(id)) await this.unload(id);
    const loaded = await this.backend.load({
      characterId: id,
      source,
      options: structuredClone(options ?? {})
    });
    const clips = normalizeClips(loaded?.clips);
    if (!clips.length) {
      await this.backend.unload(id);
      throw new Error(`O asset do personagem ${id} não possui AnimationClips.`);
    }
    const bindings = resolveBindings(clips, options?.bindings ?? {});
    const instance = {
      characterId: id,
      assetId: String(loaded.assetId ?? id),
      clips,
      bindings,
      active: false,
      activeState: null,
      activeClip: null,
      motion: null,
      previousGrounded: null,
      stateLockUntil: 0,
      rootMotion: String(options?.rootMotion ?? "in-place-horizontal"),
      visual: structuredClone(loaded?.visual ?? options?.visual ?? {}),
      visualBaseline: structuredClone(
        loaded?.visual?.options ?? options?.visual ?? {}
      )
    };
    this.#instances.set(id, instance);
    this.backend.setActive(id, false);
    if (instance.bindings.idle) {
      this.#playState(instance, "idle", { reset: true, fadeSeconds: 0 });
    }
    return this.status(id);
  }

  configure(characterId, { bindings = null, visual = null } = {}) {
    const instance = this.#requiredInstance(characterId);
    if (bindings) instance.bindings = resolveBindings(instance.clips, bindings);
    if (visual) {
      if (typeof this.backend.configureVisual !== "function") {
        throw new Error("Backend de animação não suporta configuração visual.");
      }
      instance.visual = structuredClone(
        this.backend.configureVisual(instance.characterId, structuredClone(visual))
      );
    }
    return this.status(instance.characterId);
  }

  activate(characterId) {
    const instance = this.#instances.get(String(characterId));
    if (!instance) return Object.freeze({ active: false, loaded: false });
    instance.active = true;
    instance.previousGrounded = null;
    instance.stateLockUntil = 0;
    this.backend.setActive(instance.characterId, true);
    if (instance.bindings.idle) this.#playState(instance, "idle", { reset: true });
    return this.status(instance.characterId);
  }

  deactivate(characterId) {
    const instance = this.#instances.get(String(characterId));
    if (!instance) return Object.freeze({ active: false, loaded: false });
    instance.active = false;
    instance.motion = null;
    instance.previousGrounded = null;
    instance.stateLockUntil = 0;
    this.backend.setActive(instance.characterId, false);
    if (instance.bindings.idle) {
      this.#playState(instance, "idle", { reset: true, fadeSeconds: 0 });
    }
    return this.status(instance.characterId);
  }

  observeMotion(characterId, motion = {}) {
    const instance = this.#instances.get(String(characterId));
    if (!instance || !instance.active) return false;
    const next = normalizeMotion(motion);
    const landed = instance.previousGrounded === false && next.grounded === true;
    instance.previousGrounded = next.grounded;
    instance.motion = next;

    if (landed && instance.bindings.land) {
      const duration = this.#clipDuration(instance, instance.bindings.land.clip);
      this.#playState(instance, "land", { reset: true });
      instance.stateLockUntil = this.#time + Math.max(0.08, duration || 0.18);
      return true;
    }
    if (this.#time < instance.stateLockUntil && next.grounded) return false;
    return this.#selectMotionState(instance, next);
  }

  play(characterId, {
    state = null,
    clip = null,
    loop = null,
    fadeSeconds = null,
    speed = 1,
    reset = true
  } = {}) {
    const instance = this.#requiredInstance(characterId);
    if (state) {
      return this.#playState(instance, String(state), {
        loop,
        fadeSeconds,
        speed,
        reset
      });
    }
    const clipName = String(clip ?? "").trim();
    if (!clipName) throw new TypeError("Informe state ou clip para a animação.");
    const matched = findClip(instance.clips, clipName);
    if (!matched) throw new Error(`Clip inexistente: ${clipName}.`);
    const result = this.backend.play(instance.characterId, {
      clip: matched.name,
      loop: loop ?? true,
      fadeSeconds: nonNegative(fadeSeconds ?? 0.12),
      speed: positive(speed),
      reset: Boolean(reset)
    });
    instance.activeState = null;
    instance.activeClip = matched.name;
    return result;
  }

  advance(deltaSeconds) {
    const dt = Math.max(0, Number(deltaSeconds) || 0);
    if (!dt) return false;
    this.#time += dt;
    this.backend.advance(dt);
    for (const instance of this.#instances.values()) {
      if (!instance.active || !instance.motion) continue;
      if (this.#time >= instance.stateLockUntil && instance.activeState === "land") {
        instance.stateLockUntil = 0;
        this.#selectMotionState(instance, instance.motion);
      }
    }
    return true;
  }

  async unload(characterId) {
    const id = requiredId(characterId);
    const existed = this.#instances.delete(id);
    await this.backend.unload(id);
    return Object.freeze({ unloaded: existed, characterId: id });
  }

  clips(characterId) {
    const instance = this.#requiredInstance(characterId);
    return instance.clips;
  }

  status(characterId = null) {
    if (characterId == null) {
      return Object.freeze({
        version: CHARACTER_ANIMATION_VERSION,
        backend: this.backend.status?.() ?? null,
        characters: Object.freeze([...this.#instances.keys()])
      });
    }
    const instance = this.#instances.get(String(characterId));
    if (!instance) {
      return Object.freeze({
        version: CHARACTER_ANIMATION_VERSION,
        characterId: String(characterId),
        loaded: false,
        active: false
      });
    }
    return Object.freeze({
      version: CHARACTER_ANIMATION_VERSION,
      characterId: instance.characterId,
      assetId: instance.assetId,
      loaded: true,
      active: instance.active,
      activeState: instance.activeState,
      activeClip: instance.activeClip,
      rootMotion: instance.rootMotion,
      clips: instance.clips,
      bindings: Object.freeze(structuredClone(instance.bindings)),
      visual: Object.freeze(structuredClone(instance.visual ?? {})),
      visualBaseline: Object.freeze(structuredClone(instance.visualBaseline ?? {})),
      backend: this.backend.status?.(instance.characterId) ?? null
    });
  }

  #selectMotionState(instance, motion) {
    const desired = !motion.grounded
      ? motion.verticalSpeed > 0.05 ? "jump" : "fall"
      : motion.horizontalSpeed <= 0.08
        ? "idle"
        : motion.sprint && instance.bindings.run
          ? "run"
          : "walk";
    if (!instance.bindings[desired]) return false;
    if (instance.activeState === desired) return false;
    return this.#playState(instance, desired);
  }

  #playState(instance, state, overrides = {}) {
    const binding = instance.bindings[state];
    if (!binding) throw new Error(`Estado de animação não vinculado: ${state}.`);
    const result = this.backend.play(instance.characterId, {
      clip: binding.clip,
      loop: overrides.loop ?? binding.loop,
      fadeSeconds: nonNegative(
        overrides.fadeSeconds ?? binding.fadeSeconds ?? DEFAULT_TRANSITIONS[state] ?? 0.12
      ),
      speed: positive(overrides.speed ?? binding.speed ?? 1),
      reset: overrides.reset !== false
    });
    instance.activeState = state;
    instance.activeClip = binding.clip;
    return result;
  }

  #clipDuration(instance, clipName) {
    return findClip(instance.clips, clipName)?.duration ?? 0;
  }

  #requiredInstance(characterId) {
    const id = requiredId(characterId);
    const instance = this.#instances.get(id);
    if (!instance) throw new Error(`Personagem sem asset de animação: ${id}.`);
    return instance;
  }
}

export function inferCharacterAnimationBindings(clips = []) {
  const normalized = normalizeClips(clips);
  const result = {};
  for (const [state, tokens] of Object.entries(STATE_CLIP_TOKENS)) {
    const match = normalized.find(clip => {
      const name = clip.name.toLowerCase();
      return tokens.some(token => name === token || name.includes(token));
    });
    if (!match) continue;
    result[state] = Object.freeze({
      clip: match.name,
      loop: !["jump", "land"].includes(state),
      speed: 1,
      fadeSeconds: DEFAULT_TRANSITIONS[state] ?? 0.12
    });
  }
  return Object.freeze(result);
}

function resolveBindings(clips, requested) {
  const inferred = { ...inferCharacterAnimationBindings(clips) };
  for (const [state, raw] of Object.entries(requested ?? {})) {
    const source = typeof raw === "string" ? { clip: raw } : raw;
    const clip = findClip(clips, source?.clip ?? state);
    if (!clip) throw new Error(`Clip do estado ${state} não encontrado: ${source?.clip ?? state}.`);
    inferred[state] = Object.freeze({
      clip: clip.name,
      loop: source?.loop ?? !["jump", "land"].includes(state),
      speed: positive(source?.speed ?? 1),
      fadeSeconds: nonNegative(source?.fadeSeconds ?? DEFAULT_TRANSITIONS[state] ?? 0.12)
    });
  }
  if (!inferred.jump && inferred.run) {
    inferred.jump = Object.freeze({
      ...inferred.run,
      loop: true,
      fadeSeconds: DEFAULT_TRANSITIONS.jump
    });
  }
  return Object.freeze(inferred);
}

function normalizeClips(clips) {
  if (!Array.isArray(clips)) return Object.freeze([]);
  return Object.freeze(clips.map((clip, index) => Object.freeze({
    id: String(clip?.id ?? clip?.name ?? `clip-${index}`),
    name: String(clip?.name ?? `clip-${index}`),
    duration: Math.max(0, Number(clip?.duration) || 0)
  })));
}

function findClip(clips, requested) {
  const name = String(requested ?? "").trim();
  if (!name) return null;
  return clips.find(clip => clip.name === name) ??
    clips.find(clip => clip.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function normalizeMotion(value) {
  return Object.freeze({
    grounded: Boolean(value?.grounded),
    horizontalSpeed: Math.max(0, Number(value?.horizontalSpeed) || 0),
    verticalSpeed: Number(value?.verticalSpeed) || 0,
    sprint: Boolean(value?.sprint)
  });
}

function validateBackend(backend) {
  for (const method of ["load", "setActive", "play", "advance", "unload"]) {
    if (typeof backend?.[method] !== "function") {
      throw new TypeError(`CharacterAnimationSystem backend sem ${method}().`);
    }
  }
}

function requiredId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new TypeError("characterId obrigatório.");
  return id;
}

function positive(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError("Valor deve ser positivo.");
  return number;
}

function nonNegative(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError("Valor deve ser não negativo.");
  return number;
}
