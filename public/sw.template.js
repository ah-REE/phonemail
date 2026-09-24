/*
 * PhoneMail service worker — the source of truth for /sw.js.
 *
 * This file is NOT served directly. `src/app/sw.js/route.ts` reads it, stamps
 * __CACHE_NAME__ with the current Next build id, and serves the result with
 * Cache-Control: no-cache. That is what makes a returning user (including the
 * phone PWA) pick up the current build's shell instead of a stale one.
 *
 *  - precaches the app shell so navigation works offline
 *  - network-first for /api/* (data must never be stale)
 *  - never touches /socket.io (realtime must not go through a cache)
 *  - on activate, drops every cache that is not the current build
 */

const CACHE = "__CACHE_NAME__";
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every stale build's shell, then take over open pages immediately.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Realtime traffic is never cached or intercepted.
  if (url.pathname.startsWith("/socket.io")) {
    return;
  }

  // API: network-first, with an honest offline answer instead of stale data.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return new Response(JSON.stringify({ error: "You are offline." }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
      })(),
    );
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  // App shell: cache-first, then network, then cached shell for navigation.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(request);
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        const shell = await caches.match("/");
        if (shell) {
          return shell;
        }
        throw new Error("offline and no cached shell");
      }
    })(),
  );
});
