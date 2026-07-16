const CACHE_PREFIX = "spatialseed-static-";
const APP_SHELL = "apps/web/index.html";
const REQUESTED_BUILD = new URL(self.location.href).searchParams.get("build");
let activeCacheName = REQUESTED_BUILD
  ? `${CACHE_PREFIX}${REQUESTED_BUILD}`
  : null;

self.addEventListener("install", event => {
  event.waitUntil(installApplication());
});

self.addEventListener("activate", event => {
  event.waitUntil(activateApplication());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || request.cache === "no-store") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function installApplication() {
  const [buildInfo,precache] = await Promise.all([
    fetchJson("apps/web/build-info.json"),
    fetchJson("apps/web/pwa/precache-manifest.json")
  ]);
  if (REQUESTED_BUILD && REQUESTED_BUILD !== buildInfo.build) {
    throw new Error(
      `Build solicitado ${REQUESTED_BUILD} difere de ${buildInfo.build}.`
    );
  }
  activeCacheName = `${CACHE_PREFIX}${buildInfo.build}`;
  const cache = await caches.open(activeCacheName);
  const urls = precache.files.map(resolveFromScope);
  await cache.addAll(urls);
}

async function activateApplication() {
  const current = await getActiveCacheName();
  const names = await caches.keys();
  await Promise.all(names
    .filter(name => name.startsWith(CACHE_PREFIX) && name !== current)
    .map(name => caches.delete(name)));
  await self.clients.claim();
}

async function networkFirst(request) {
  const cache = await getActiveCache();
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match(resolveFromScope(APP_SHELL));
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await getActiveCache();
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function fetchJson(path) {
  const response = await fetch(resolveFromScope(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar ${path}: ${response.status}`);
  return response.json();
}

async function getActiveCache() {
  return caches.open(await getActiveCacheName());
}

async function getActiveCacheName() {
  if (activeCacheName) return activeCacheName;
  const buildInfo = await fetchJson("apps/web/build-info.json");
  activeCacheName = `${CACHE_PREFIX}${buildInfo.build}`;
  return activeCacheName;
}

function resolveFromScope(path) {
  return new URL(path, self.registration.scope).href;
}

function isCacheable(response) {
  return response.ok && response.type === "basic";
}
