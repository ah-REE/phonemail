/*
 * PhoneMail service worker - the source of truth for /sw.js.
 *
 * This file is NOT served directly. `src/app/sw.js/route.ts` reads it, stamps
 * __CACHE_NAME__ with the current Next build id, and serves the result with
 * Cache-Control: no-cache. That is what makes a returning user (including the
 * phone PWA) pick up the current build's shell instead of a stale one.
 *
 *  - NAVIGATIONS ARE NETWORK-FIRST: the precache is the OFFLINE FALLBACK, never
 *    the source of truth for a returning user. (Before this, the shell was served
 *    cache-first, so after a rebuild a returning user - and the installed PWA -
 *    kept the OLD shell: the stale-shell bug, twice reported, that made a
 *    re-photograph of a rebuilt screen come back byte-identical.)
 *  - cache matching respects the FULL URL, search params included. No
 *    `ignoreSearch` anywhere, because "?v=123" is a different URL from "/".
 *  - cache-busted static assets stay cache-first (their names are content-hashed)
 *  - network-first for /api/* (data must never be stale)
 *  - never touches /socket.io (realtime must not go through a cache)
 *  - on activate, drops every cache that is not the current build
 *
 * THE GUARANTEE: after a rebuild and a reload, a returning user gets the CURRENT
 * build. The shell cache name rotates with the build (see the stamping route), the
 * new worker skipWaiting()s and claims open pages, and every navigation is
 * answered from the network whenever the network is there.
 */

const CACHE = "__CACHE_NAME__";
const SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];
/** Where a navigation falls back to when the network is gone. */
const SHELL_URL = "/";

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

const sameOrigin = (url) => url.origin === self.location.origin;

/** Store a copy of a good same-origin GET response under its FULL url. */
function remember(request, response, url) {
  if (!response || !response.ok || !sameOrigin(url)) {
    return;
  }
  const copy = response.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
}

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

  // A NAVIGATION is the document itself, and it is NETWORK-FIRST. This is the
  // whole fix: the network is the source of truth whenever it answers, and the
  // precache exists only so a navigation still works with no connection.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          remember(request, response, url);
          return response;
        } catch {
          // OFFLINE: the exact URL first (the full URL, search params and all),
          // then the precached shell. A stale entry under a DIFFERENT url is
          // never substituted for this one.
          const exact = await caches.match(request);
          if (exact) {
            return exact;
          }
          const shell = await caches.match(SHELL_URL);
          if (shell) {
            return shell;
          }
          return new Response("Offline, and no cached shell.", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Any other same-origin GET (a content-hashed asset, say): cache-first, then
  // the network, and remember what the network said.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(request);
        remember(request, response, url);
        return response;
      } catch {
        const shell = await caches.match(SHELL_URL);
        if (shell) {
          return shell;
        }
        throw new Error("offline and no cached shell");
      }
    })(),
  );
});
