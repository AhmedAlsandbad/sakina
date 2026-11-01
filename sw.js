// Sakina Quran service worker: app shell, offline fallback and Web Push notifications.
// Audio streams are never cached.
const V = "sakina-v74";
const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/styles.css?v=56",
  "/data.js?v=39",
  "/app.js?v=61",
  "/analytics.js?v=2",
  "/pwa.js?v=1",
  "/push-config.js?v=1",
  "/manifest.webmanifest",
  "/icon.svg",
  "/sakina-logo.svg?v=38",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(V).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== V).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.headers.has("range")) return;

  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return; // streams and APIs stay network-only

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(V).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok || response.type === "opaque") {
        const copy = response.clone();
        caches.open(V).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

function notificationPayload(event) {
  if (!event.data) return {};
  try { return event.data.json(); }
  catch (e) {
    try { return { body: event.data.text() }; }
    catch (x) { return {}; }
  }
}

self.addEventListener("push", event => {
  const data = notificationPayload(event);
  const title = data.title || "سكينة قرآن";
  const options = {
    body: data.body || "لديك تذكير جديد من سكينة قرآن.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    image: data.image || undefined,
    tag: data.tag || "sakina-quran",
    renotify: !!data.renotify,
    dir: "rtl",
    lang: "ar",
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || "/", ...(data.data || {}) },
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const raw = event.notification && event.notification.data && event.notification.data.url || "/";
  const target = new URL(raw, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client && "focus" in client) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "SHOW_NOTIFICATION") {
    const p = data.payload || {};
    event.waitUntil(self.registration.showNotification(p.title || "سكينة قرآن", {
      body: p.body || "",
      icon: p.icon || "/icon-192.png",
      badge: p.badge || "/icon-192.png",
      tag: p.tag || "sakina-local",
      dir: "rtl",
      lang: "ar",
      data: { url: p.url || "/" }
    }));
  }
});

self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      list.forEach(client => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
    })
  );
});
