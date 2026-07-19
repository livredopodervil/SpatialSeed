export const RUNTIME_PROFILE_VERSION = "runtime-profile-v1";

const PROFILE_DEFINITIONS = Object.freeze({
  authoring: profile("authoring", {
    interactive: true,
    render: true,
    edit: true,
    inspect: true,
    history: true,
    interop: true
  }),
  presentation: profile("presentation", {
    interactive: true,
    render: true,
    edit: false,
    inspect: false,
    history: false,
    interop: true
  }),
  interop: profile("interop", {
    interactive: false,
    render: false,
    edit: false,
    inspect: false,
    history: false,
    interop: true
  })
});

export function resolveRuntimeProfile(value = "authoring") {
  const id = typeof value === "string"
    ? value.trim().toLowerCase()
    : value?.id;
  const resolved = PROFILE_DEFINITIONS[id];

  if (!resolved) {
    throw new RangeError(
      `Perfil de runtime desconhecido: ${String(id ?? value)}.`
    );
  }

  return resolved;
}

export function describeRuntimeProfiles() {
  return Object.freeze(Object.values(PROFILE_DEFINITIONS));
}

function profile(id, capabilities) {
  return Object.freeze({
    version: RUNTIME_PROFILE_VERSION,
    id,
    capabilities: Object.freeze({ ...capabilities })
  });
}
