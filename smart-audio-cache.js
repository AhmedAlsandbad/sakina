"use strict";
(() => {
  if (window.__sakinaSmartAudioCacheReady) return;
  window.__sakinaSmartAudioCacheReady = true;

  const DB_NAME = "sakina-smart-audio-v1";
  const TRACKS = "tracks";
  const META = "meta";
  const MAX_ITEMS = 2;
  const MAX_BYTES = 120 * 1024 * 1024;
  const NEAR_END = 0.96;
  const audio = document.getElementById("audio");
  if (!audio || !("indexedDB" in window) || !("fetch" in window)) return;

  const track = (name, params) => {
    try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {}
  };
  const readJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
    catch (e) { return fallback; }
  };

  let currentItem = null;
  let nearEndItem = null;
  let busy = false;
  let activeBlobUrl = null;
  let dbPromise = null;
  const pending = new Map();

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS, { keyPath: "url" });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "url" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb_open_failed"));
    });
    return dbPromise;
  }

  async function dbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("idb_get_failed"));
    });
  }

  async function dbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("idb_getall_failed"));
    });
  }

  async function dbPutTrack(record, meta) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([TRACKS, META], "readwrite");
      tx.objectStore(TRACKS).put(record);
      tx.objectStore(META).put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("idb_put_failed"));
      tx.onabort = () => reject(tx.error || new Error("idb_put_aborted"));
    });
  }

  async function dbTouch(meta) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META, "readwrite");
      tx.objectStore(META).put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("idb_touch_failed"));
    });
  }

  async function dbDelete(url) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([TRACKS, META], "readwrite");
      tx.objectStore(TRACKS).delete(url);
      tx.objectStore(META).delete(url);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("idb_delete_failed"));
    });
  }

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

  async function makeRoom(incomingSize, incomingUrl) {
    let list = (await dbGetAll(META))
      .filter(x => x && x.url && x.url !== incomingUrl)
      .sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0));
    let total = list.reduce((sum, x) => sum + Number(x.size || 0), 0);
    while (list.length >= MAX_ITEMS || total + incomingSize > MAX_BYTES) {
      const old = list.pop();
      if (!old) break;
      await dbDelete(old.url).catch(() => {});
      total -= Number(old.size || 0);
    }
  }

  async function cacheItem(item) {
    if (!eligible(item) || busy || !navigator.onLine || !connectionAllowsCache()) return false;
    if (!audio.paused && !audio.ended) return false;

    busy = true;
    try {
      const existing = await dbGet(META, item.url);
      if (existing) {
        await dbTouch({ ...existing, title: item.title || existing.title || "تلاوة", sub: item.sub || existing.sub || "", cachedAt: Date.now() });
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

      await makeRoom(size, item.url);
      const response = await fetch(item.url, { method: "GET", mode: "cors", cache: "force-cache", credentials: "omit" });
      if (!response.ok || response.type === "opaque") throw new Error("audio_cache_fetch_failed");
      const blob = await response.blob();
      const finalSize = Number(blob.size || size);
      if (!finalSize || finalSize > MAX_BYTES) throw new Error("audio_cache_size_invalid");

      const meta = { url: item.url, key: item.key || "", title: item.title || "تلاوة", sub: item.sub || "", size: finalSize, cachedAt: Date.now() };
      await dbPutTrack({ url: item.url, blob }, meta);
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

  async function useCachedOffline(item) {
    if (!eligible(item) || navigator.onLine) return false;
    try {
      const saved = await dbGet(TRACKS, item.url);
      const blob = saved && saved.blob;
      if (!(blob instanceof Blob) || !blob.size) return false;
      if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = URL.createObjectURL(blob);
      audio.src = activeBlobUrl;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      const meta = await dbGet(META, item.url);
      if (meta) dbTouch({ ...meta, cachedAt: Date.now() }).catch(() => {});
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

  // Keep the database inside the agreed two-item / 120 MB budget.
  setTimeout(async () => {
    try {
      const list = (await dbGetAll(META)).sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0));
      let total = list.reduce((sum, x) => sum + Number(x.size || 0), 0);
      for (let i = list.length - 1; i >= 0 && (i >= MAX_ITEMS || total > MAX_BYTES); i--) {
        total -= Number(list[i].size || 0);
        await dbDelete(list[i].url).catch(() => {});
      }
    } catch (e) {}
  }, 3500);
})();