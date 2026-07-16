// Ponte temporária para remover o registro amplo usado até a build 0025e.
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.registration.unregister());
});
