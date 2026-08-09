const THREE_URL = new URL("../vendor/three.module.js", import.meta.url).href;
const ADDONS_URL = new URL("../vendor/addons/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three") {
    return { url: THREE_URL, shortCircuit: true };
  }
  const prefix = "three/addons/";
  if (specifier.startsWith(prefix)) {
    return {
      url: new URL(specifier.slice(prefix.length), ADDONS_URL).href,
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}
