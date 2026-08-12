export const GAME_AUDIO_RUNTIME_VERSION = "game-audio-runtime-v1";

export class GameAudioRuntime {
  #music = null;
  #effects = new Map();

  constructor({ createAudio = defaultAudioFactory } = {}) {
    if (typeof createAudio !== "function") throw new TypeError("createAudio must be a function.");
    this.createAudio = createAudio;
  }

  configure({ music = null, effects = {} } = {}) {
    if (music) this.musicConfig = normalizeClip(music, { loop: true });
    this.#effects = new Map(Object.entries(effects ?? {}).map(([name, clip]) => [
      String(name), normalizeClip(clip, { loop: false })
    ]));
    return this.status();
  }

  async playMusic(override = null) {
    const config = override ? normalizeClip(override, { loop: true }) : this.musicConfig;
    if (!config?.src) return false;
    this.stopMusic();
    const audio = this.createAudio(config.src);
    applyClip(audio, config);
    audio.loop = config.loop !== false;
    this.#music = audio;
    await safePlay(audio);
    return true;
  }

  stopMusic() {
    if (!this.#music) return false;
    this.#music.pause?.();
    this.#music.currentTime = 0;
    this.#music = null;
    return true;
  }

  async playEffect(name, override = null) {
    const config = override ? normalizeClip(override, { loop: false }) : this.#effects.get(String(name));
    if (!config?.src) return false;
    const audio = this.createAudio(config.src);
    applyClip(audio, config);
    audio.loop = false;
    await safePlay(audio);
    return true;
  }

  stopAll() {
    this.stopMusic();
    return true;
  }

  status() {
    return Object.freeze({
      version: GAME_AUDIO_RUNTIME_VERSION,
      music: this.musicConfig ?? null,
      musicPlaying: Boolean(this.#music),
      effects: Object.freeze([...this.#effects.keys()])
    });
  }
}

function normalizeClip(value, defaults) {
  const source = typeof value === "string" ? { src: value } : value ?? {};
  return Object.freeze({
    src: String(source.src ?? ""),
    volume: clamp(Number(source.volume ?? 1), 0, 1),
    loop: source.loop === undefined ? defaults.loop : Boolean(source.loop)
  });
}

function applyClip(audio, clip) {
  audio.volume = clip.volume;
  audio.loop = clip.loop;
}

async function safePlay(audio) {
  const result = audio.play?.();
  if (result?.then) await result;
}

function defaultAudioFactory(src) {
  if (typeof globalThis.Audio !== "function") {
    throw new Error("Audio is unavailable in this runtime.");
  }
  return new globalThis.Audio(src);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
