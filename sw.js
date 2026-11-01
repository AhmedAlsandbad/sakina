// Caches the app shell so the site opens instantly and works as an installed app.
// Audio streams are never cached.
const V = "sakina-v56";
const SHELL = ["./", "index.html", "styles.css?v=46", "data.js?v=39", "app.js?v=49", "manifest.webmanifest", "icon.svg", "sakina-logo.svg?v=38", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || r.headers.has("range")) return;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (u.origin !== location.origin && !isFont) return; // let streams go straight to the network
  if (r.mode === "navigate") { // network first for the page, so updates show up
    e.respondWith(fetch(r).then(res => { caches.open(V).then(c => c.put(r, res.clone())); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
    if (res.ok || res.type === "opaque") { const cl = res.clone(); caches.open(V).then(c => c.put(r, cl)); }
    return res;
  })));
});