"use strict";
(() => {
  if (window.__sakinaOfflineAudioReady) return;
  window.__sakinaOfflineAudioReady = true;

  const CACHE = "sakina-audio-v1";
  const META_KEY = "sakina:offline-audio";
  const $ = s => document.querySelector(s);
  const track = (name, params) => { try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {} };
  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
  let busy = false;

  function toast(message) {
    if (window.SakinaPWA && typeof window.SakinaPWA.toast === "function") return window.SakinaPWA.toast(message);
    const old = $("#sakinaOfflineToast"); if (old) old.remove();
    const t = document.createElement("div"); t.id = "sakinaOfflineToast"; t.textContent = message;
    t.style.cssText = "position:fixed;z-index:100010;left:50%;bottom:24px;transform:translateX(-50%);background:#10251f;color:#fff;border:1px solid rgba(226,184,92,.4);border-radius:999px;padding:10px 16px;font:13px 'Readex Pro',system-ui,sans-serif;direction:rtl;max-width:92vw;text-align:center";
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }

  function formatBytes(n) {
    n = Number(n || 0); if (!n) return "";
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + " ك.ب";
    return (n / 1024 / 1024).toFixed(n > 20 * 1024 * 1024 ? 0 : 1) + " م.ب";
  }

  function currentItem() {
    let item = {};
    try { item = JSON.parse(localStorage.getItem("sakina:lastItem") || "{}") || {}; } catch (e) {}
    const audio = $("#audio");
    return {
      ...item,
      title: item.title || ($("#shTitle") && $("#shTitle").textContent.trim()) || "تلاوة",
      sub: item.sub || ($("#shSub") && $("#shSub").textContent.trim()) || "سكينة قرآن",
      url: item.url || (audio && audio.currentSrc) || ""
    };
  }

  function metas() { const x = read(META_KEY, []); return Array.isArray(x) ? x : []; }
  function saveMetas(items) { write(META_KEY, items.slice(0, 60)); }

  async function cached(url) {
    if (!url || !("caches" in window)) return false;
    try { const c = await caches.open(CACHE); return !!(await c.match(url)); } catch (e) { return false; }
  }

  async function removeTrack(url) {
    try {
      const c = await caches.open(CACHE); await c.delete(url);
      saveMetas(metas().filter(x => x.url !== url));
      track("offline_audio_remove", { url_host: (() => { try { return new URL(url).host; } catch (e) { return ""; } })() });
      toast("تم حذف التلاوة المحفوظة"); renderManager(); refreshSaveButton();
    } catch (e) { toast("تعذر حذف الملف الآن"); }
  }

  async function ensureSpace(contentLength) {
    if (!navigator.storage || !navigator.storage.estimate) return true;
    try {
      const est = await navigator.storage.estimate();
      const free = Math.max(0, Number(est.quota || 0) - Number(est.usage || 0));
      if (contentLength && free && contentLength > free * 0.85) {
        toast("المساحة المتاحة على الجهاز غير كافية لحفظ هذه التلاوة");
        return false;
      }
    } catch (e) {}
    return true;
  }

  async function downloadCurrent() {
    if (busy) return;
    const item = currentItem();
    if (!item.url || item.kind === "live") { toast("الحفظ بدون إنترنت متاح للتلاوات المسجلة فقط"); return; }
    if (!/^https:\/\//i.test(item.url)) { toast("هذا الملف غير قابل للحفظ"); return; }
    if (await cached(item.url)) { toast("هذه التلاوة محفوظة بالفعل"); refreshSaveButton(); return; }

    busy = true;
    const btn = $("#sakinaOfflineSave"); if (btn) { btn.disabled = true; btn.textContent = "جارٍ التحضير…"; }
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      const res = await fetch(item.url, { mode: "cors", cache: "no-store" });
      if (!res.ok || res.type === "opaque") throw new Error("cors_or_network");
      const length = Number(res.headers.get("content-length") || 0);
      if (!(await ensureSpace(length))) return;
      if (length > 120 * 1024 * 1024 && !window.confirm(`حجم التلاوة كبير (${formatBytes(length)} تقريبًا). هل تريد حفظها على الجهاز؟`)) return;

      let blob;
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader(), chunks = []; let received = 0, lastPaint = 0;
        while (true) {
          const part = await reader.read(); if (part.done) break;
          chunks.push(part.value); received += part.value.byteLength;
          const now = Date.now();
          if (btn && now - lastPaint > 350) {
            btn.textContent = length ? `حفظ ${Math.min(99, Math.round(received / length * 100))}٪` : `حفظ ${formatBytes(received)}`;
            lastPaint = now;
          }
        }
        blob = new Blob(chunks, { type: res.headers.get("content-type") || "audio/mpeg" });
      } else blob = await res.blob();
      if (!blob || blob.size < 1024) throw new Error("empty_audio");

      const cache = await caches.open(CACHE);
      await cache.put(item.url, new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": blob.type || "audio/mpeg",
          "Content-Length": String(blob.size),
          "Accept-Ranges": "bytes",
          "X-Sakina-Offline": "1"
        }
      }));

      const meta = { url: item.url, key: item.key || "", title: item.title || "تلاوة", sub: item.sub || "", size: blob.size, savedAt: Date.now() };
      saveMetas([meta, ...metas().filter(x => x.url !== item.url)]);
      track("offline_audio_save", { item_name: meta.title, size_mb: Math.round(blob.size / 1024 / 1024) });
      toast(`تم حفظ ${meta.title} بدون إنترنت`);
      renderManager();
    } catch (e) {
      console.warn("Sakina offline audio download failed", e);
      toast("تعذر حفظ هذه التلاوة. قد لا يسمح مصدر الصوت بالتنزيل المباشر.");
      track("offline_audio_save_failed", { reason: String(e && e.message || e || "unknown").slice(0, 80) });
    } finally {
      busy = false; refreshSaveButton();
    }
  }

  async function playSaved(meta) {
    if (!(await cached(meta.url))) { saveMetas(metas().filter(x => x.url !== meta.url)); renderManager(); toast("الملف المحفوظ لم يعد موجودًا على الجهاز"); return; }
    if (meta.key) {
      try {
        const row = document.querySelector(`[data-key="${CSS.escape(String(meta.key))}"]`);
        if (row) { row.click(); track("offline_audio_play", { item_name: meta.title, method: "app" }); return; }
      } catch (e) {}
    }
    const audio = $("#audio");
    if (!audio) { toast("افتح سكينة من الصفحة الرئيسية لتشغيل الملف المحفوظ"); return; }
    try {
      audio.src = meta.url;
      await audio.play();
      const title = $("#shTitle"), sub = $("#shSub"); if (title) title.textContent = meta.title; if (sub) sub.textContent = meta.sub || "محفوظ بدون إنترنت";
      if ("mediaSession" in navigator) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: meta.title, artist: meta.sub || "سكينة قرآن", album: "سكينة قرآن", artwork: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }); } catch (e) {}
      }
      track("offline_audio_play", { item_name: meta.title, method: "direct" });
    } catch (e) { toast("تعذر تشغيل الملف المحفوظ"); }
  }

  function addStyles() {
    if ($("#sakinaOfflineStyles")) return;
    const s = document.createElement("style"); s.id = "sakinaOfflineStyles";
    s.textContent = `.sakina-offline-manager{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;direction:rtl}.sakina-offline-manager summary{cursor:pointer;font-size:13px;opacity:.88}.sakina-offline-list{display:grid;gap:8px;margin-top:10px}.sakina-offline-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.09);border-radius:11px;padding:9px}.sakina-offline-copy{min-width:0}.sakina-offline-copy b,.sakina-offline-copy small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sakina-offline-copy small{font-size:11px;opacity:.66;margin-top:2px}.sakina-offline-row button{border:1px solid rgba(226,184,92,.22);background:rgba(255,255,255,.05);color:inherit;border-radius:9px;padding:7px 9px;font:inherit;font-size:12px;cursor:pointer}.sakina-offline-empty{font-size:12px;opacity:.68;padding:4px 0}`;
    document.head.appendChild(s);
  }

  function renderManager() {
    const sheet = $("#sheet"); if (!sheet) return;
    addStyles();
    let box = $("#sakinaOfflineManager");
    if (!box) { box = document.createElement("details"); box.id = "sakinaOfflineManager"; box.className = "sakina-offline-manager"; box.innerHTML = `<summary>المحفوظ بدون إنترنت</summary><div class="sakina-offline-list"></div>`; sheet.appendChild(box); }
    const list = box.querySelector(".sakina-offline-list"); list.textContent = "";
    const items = metas();
    if (!items.length) { const e = document.createElement("div"); e.className = "sakina-offline-empty"; e.textContent = "لم تحفظ أي تلاوة على هذا الجهاز بعد."; list.appendChild(e); return; }
    items.forEach(meta => {
      const row = document.createElement("div"); row.className = "sakina-offline-row";
      const copy = document.createElement("div"); copy.className = "sakina-offline-copy";
      const b = document.createElement("b"); b.textContent = meta.title || "تلاوة محفوظة";
      const small = document.createElement("small"); small.textContent = [meta.sub, formatBytes(meta.size)].filter(Boolean).join(" · "); copy.append(b, small);
      const play = document.createElement("button"); play.type = "button"; play.textContent = "تشغيل"; play.addEventListener("click", () => playSaved(meta));
      const del = document.createElement("button"); del.type = "button"; del.textContent = "حذف"; del.addEventListener("click", () => removeTrack(meta.url));
      row.append(copy, play, del); list.appendChild(row);
    });
  }

  async function refreshSaveButton() {
    const btn = $("#sakinaOfflineSave"); if (!btn || busy) return;
    const item = currentItem();
    if (!item.url || item.kind === "live") { btn.hidden = true; return; }
    btn.hidden = false; btn.disabled = false;
    btn.textContent = await cached(item.url) ? "محفوظ بدون إنترنت ✓" : "حفظ بدون إنترنت";
  }

  function inject() {
    const tools = $("#sakinaPlayerTools");
    if (!tools) { setTimeout(inject, 500); return; }
    if (!$("#sakinaOfflineSave")) {
      const b = document.createElement("button"); b.id = "sakinaOfflineSave"; b.type = "button"; b.textContent = "حفظ بدون إنترنت"; b.addEventListener("click", downloadCurrent); tools.appendChild(b);
    }
    renderManager(); refreshSaveButton();
    const audio = $("#audio"); if (audio) { audio.addEventListener("play", () => setTimeout(refreshSaveButton, 120)); audio.addEventListener("loadedmetadata", refreshSaveButton); }
  }

  window.SakinaOfflineAudio = { downloadCurrent, removeTrack, cached, renderManager };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true }); else inject();
})();