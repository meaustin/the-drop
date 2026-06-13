// The Drop — service worker.
// Two jobs: (1) make the app installable (a no-op fetch handler is enough for the install prompt),
// and (2) receive Web Push so a screen-less venue can still buzz an installed regular's pocket
// the instant a drop hits (spec §8).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Network passthrough. We intentionally do NOT cache API/realtime — a live game must be fresh.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {}
  const title = data.title || "A drop just hit 🎯";
  const options = {
    body: data.body || "Be the fastest to answer and win.",
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    vibrate: [80, 40, 80],
    tag: data.tag || "drop",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
