"use strict";
(() => {
  if (window.__sakinaSmartAudioCacheReady) return;
  window.__sakinaSmartAudioCacheReady = true;

  const CACHE = "sakina-recent-audio-v1";
  const META_KEY = "sakina:smart-audio-cache";
  const MAX_ITEMS = 2;
  const MAX_BYTES = 120 * 1024 * 1024;
  const NEAR_END = 0.96;
  const audio = document.getElementById("audio");
  if (!audio || !("caches" in window) || !("fetch" in window)) return;

  const track = (name, params) => {
    try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {}
  };
  const readJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  };
  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  };

  let currentItem = null;
  let nearEndItem = null;
  let busy = false;
  let activeBlobUrl = null;
  const pending = new Map();

  function lastItem() {
    const item = readJSON("sakina:lastItem", null);
    return item && typeof item === "object" ? item : null;
  }

  function eligible(item) {
    return !!(item && item.kind === "file" && /^https:\/\//i.test(item.url || ""));
  }

  function connectionAllowsCache() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return true;
    if (c.saveData) return false;
    if (String(c.type || "").toLowerCase() === "cellular") return false;
    if (["slow-2g", "2g"].includes(String(c.effectiveType || "").toLowerCase())) return false;
    return true;
  }

  function metas() {
    const list = readJSON(META_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveMetas(list) {
    writeJSON(META_KEY, list.slice(0, MAX_ITEMS));
  }

  async function probeSize(url) {
    try {
      const head = await fetch(url, { method: "HEAD", mode: "cors", cache: "force-cache", credentials: "omit" });
      const n = Number(head.headers.get("content-length") || 0);
      if (head.ok && Number.isFinite(n) && n > 0) return n;
    } catch (e) {}

    try {
      const probe = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        headers: { Range: "bytes=0-0" }
      });
      const range = probe.headers.get("content-range") || "";
      const m = range.match(/\/(\d+)\s*$/);
      if (m) return Number(m[1]);
      const n = Number(probe.headers.get("content-length") || 0);
      if (probe.status === 200 && Number.isFinite(n) && n > 0) return n;
    } catch (e) {}
    return 0;
  }

  async function hasRoom(size) {
    if (!navigator.storage || !navigator.storage.estimate) return true;
    try {
      const est = await navigator.storage.estimate();
      const free = Math.max(0, Number(est.quota || 0) - Number(est.usage || 0));
      return !free || free > size * 1.15;
    } catch (e) { return true; }
  }

  async function makeRoom(cache, incomingSize, incomingUrl) {
    let list = metas().filter(x => x && x.url && x.url !== incomingUrl).sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0));
    let total = list.reduce((sum, x) => sum + Number(x.size || 0), 0);
    while (list.length >= MAX_ITEMS || total + incomingSize > MAX_BYTES) {
      const old = list.pop();
      if (!old) break;
      try { await cache.delete(old.url); } catch (e) {}
      total -= Number(old.size || 0);
    }
    saveMetas(list);
    return list;
  }

  async function cacheItem(item) {
    if (!eligible(item) || busy || !navigator.onLine || !connectionAllowsCache()) return false;
    if (!audio.paused && !audio.ended) return false;

    busy = true;
    try {
      const cache = await caches.open(CACHE);
      const existing = await cache.match(item.url);
      if (existing) {
        const list = metas().filter(x => x.url !== item.url);
        const old = metas().find(x => x.url === item.url) || {};
        saveMetas([{ ...old, url: item.url, title: item.title || old.title || "تلاوة", sub: item.sub || old.sub || "", cachedAt: Date.now() }, ...list]);
        return true;
      }

      const size = await probeSize(item.url);
      if (!size || size > MAX_BYTES) {
        track("smart_audio_cache_skip", { reason: !size ? "unknown_size" : "too_large" });
        return false;
      }
      if (!(await hasRoom(size))) {
        track("smart_audio_cache_skip", { reason: "low_storage" });
        return false;
      }

      const list = await makeRoom(cache, size, item.url);
      const response = await fetch(item.url, { method: "GET", mode: "cors", cache: "force-cache", credentials: "omit" });
      if (!response.ok || response.type === "opaque") throw new Error("audio_cache_fetch_failed");
      const finalSize = Number(response.headers.get("content-length") || size);
      if (!finalSize || finalSize > MAX_BYTES) throw new Error("audio_cache_size_invalid");

      await cache.put(item.url, response.clone());
      saveMetas([{ url: item.url, key: item.key || "", title: item.title || "تلاوة", sub: item.sub || "", size: finalSize, cachedAt: Date.now() }, ...list]);
      track("smart_audio_cached", { item_name: item.title || "", size_mb: Math.round(finalSize / 1024 / 1024) });
      return true;
    } catch (e) {
      track("smart_audio_cache_skip", { reason: String(e && e.message || "failed").slice(0, 60) });
      return false;
    } finally {
      busy = false;
    }
  }

  function queueItem(item) {
    if (!eligible(item)) return;
    pending.set(item.url, { ...item });
    setTimeout(drain, 1600);
  }

  async function drain() {
    if (busy || !pending.size || !navigator.onLine || !connectionAllowsCache()) return;
    if (!audio.paused && !audio.ended) return;
    if (document.visibilityState !== "visible") return;
    const item = Array.from(pending.values()).pop();
    pending.delete(item.url);
    await cacheItem(item);
    if (pending.size) setTimeout(drain, 1200);
  }

  async function cachedResponse(url) {
    if (!url) return null;
    try { return await (await caches.open(CACHE)).match(url); }
    catch (e) { return null; }
  }

  async function useCachedOffline(item) {
    if (!eligible(item) || navigator.onLine) return false;
    const saved = await cachedResponse(item.url);
    if (!saved) return false;
    try {
      const blob = await saved.blob();
      if (!blob || !blob.size) return false;
      if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = URL.createObjectURL(blob);
      audio.src = activeBlobUrl;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      track("smart_audio_offline_replay", { item_name: item.title || "" });
      return true;
    } catch (e) { return false; }
  }

  function rememberCurrent() {
    const item = lastItem();
    if (eligible(item)) currentItem = { ...item };
  }

  audio.addEventListener("play", rememberCurrent);
  audio.addEventListener("timeupdate", () => {
    if (!eligible(currentItem) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (audio.currentTime / audio.duration >= NEAR_END) nearEndItem = { ...currentItem };
  });
  audio.addEventListener("ended", () => {
    if (eligible(currentItem)) queueItem(currentItem);
    nearEndItem = null;
  });
  audio.addEventListener("pause", () => {
    if (eligible(nearEndItem)) queueItem(nearEndItem);
    setTimeout(drain, 1200);
  });

  let fallbackLock = false;
  async function offlineFallback() {
    if (fallbackLock || navigator.onLine || String(audio.currentSrc || audio.src || "").startsWith("blob:")) return;
    const item = lastItem();
    if (!eligible(item)) return;
    fallbackLock = true;
    try { await useCachedOffline(item); }
    finally { setTimeout(() => { fallbackLock = false; }, 800); }
  }
  audio.addEventListener("loadstart", () => { if (!navigator.onLine) setTimeout(offlineFallback, 0); });
  audio.addEventListener("error", offlineFallback);
  window.addEventListener("online", () => setTimeout(drain, 2500));

  // Remove stale metadata if the browser evicted cache storage.
  setTimeout(async () => {
    try {
      const cache = await caches.open(CACHE);
      const valid = [];
      for (const meta of metas()) if (meta && meta.url && await cache.match(meta.url)) valid.push(meta);
      saveMetas(valid);
    } catch (e) {}
  }, 3500);
})();