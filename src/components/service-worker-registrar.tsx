"use client";

import { useEffect } from "react";

/**
 * Registers the service worker. Mounted from the mobile layout so only the
 * app shell (not the API) is affected. Failures are non-fatal: the app works
 * without offline support, so we log and move on.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Registering during `next dev` would cache a stale shell and confuse
    // local work; the container (production) is where offline matters.
    if (window.location.hostname === "localhost" && process.env.NODE_ENV === "development") {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
  }, []);

  return null;
}
