"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    const warmCurrentAssets = (worker: ServiceWorker | null) => {
      if (!worker) return;

      const urls = [
        window.location.href,
        ...performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => new URL(url, window.location.href).origin === window.location.origin),
      ];
      worker.postMessage({ type: "WARM_CURRENT_ASSETS", urls });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        warmCurrentAssets(registration.active);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          warmCurrentAssets(navigator.serviceWorker.controller);
        });
      })
      .catch(() => {
        // Offline support is an enhancement; a child should never see this error.
      });
  }, []);

  return null;
}
