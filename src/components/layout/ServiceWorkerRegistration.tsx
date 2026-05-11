"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);

      if ("caches" in window) {
        window.caches.keys()
          .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
          .catch(() => undefined);
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
