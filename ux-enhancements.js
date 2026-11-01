"use strict";
(() => {
  if (window.__sakinaUxEnhancements) return;
  window.__sakinaUxEnhancements = true;

  const $ = s => document.querySelector(s);
  const track = (name, params) => { try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {} };
  const read = (key, fallback) => { try { const v = localStorage.getItem("sakina:" + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem("sakina:" + key, JSON.stringify(value)); } catch (e) {} };
  let wakeLock = null;
  let wakeWanted = false;
  let reloadOnControllerChange = false;

  function addStyles() {
    if ($("#sakinaUxStyles")) return;
    const s = document.createElement("style");
    s.id = "sakinaUxStyles";
    s.textContent = `
      .sakina-ux-toast{position:fixed;z-index:100006;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translate(-50%,18px);opacity:0;pointer-events:none;background:#10251f;color:#fff;border:1px solid rgba(226,184,92,.38);border-radius:999px;padding:10px 16px;font:13px "Readex Pro",system-ui,sans-serif;transition:.2s ease;max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl}.sakina-ux-toast.show{opacity:1;transform:translate(-50%,0)}
      .sakina-ux-update{position:fixed;z-index:100005;left:14px;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));max-width:520px;margin:auto;background:#0c211c;color:#fff;border:1px solid rgba(226,184,92,.38);border-radius:18px;padding:14px 15px;box-shadow:0 18px 48px rgba(0,0,0,.34);font:13px "Readex Pro",system-ui,sans-serif;direction:rtl}.sakina-ux-update b{display:block;font-size:15px;margin-bottom:4px}.sakina-ux-update p{margin:0;color:#cfdbd7;line-height:1.65}.sakina-ux-update-actions{display:flex;gap:8px;margin-top:11px}.sakina-ux-update button,.sakina-ux-action{border:0;border-radius:11px;padding:9px 12px;font:inherit;cursor:pointer}.sakina-ux-update .primary,.sakina-ux-action.primary{background:#e2b85c;color:#12251f;font-weight:700}.sakina-ux-update .secondary,.sakina-ux-action.secondary{background:rgba(255,255,255,.09);color:#fff;border:1px solid rgba(255,255,255,.12)}
      .sakina-continue{margin:10px 0 18px;border:1px solid rgba(226,184,92,.2);background:rgba(226,184,92,.06);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:12px;direction:rtl}.sakina-continue-copy{flex:1;min-width:0}.sakina-continue small{display:block;opacity:.7;margin-bottom:3px}.sakina-continue b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sakina-continue span{display:block;font-size:12px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sakina-continue button{flex:0 0 auto}
      .sakina-player-tools{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:12px 0}.sakina-player-tools button,.sakina-reader-tools button{border:1px solid rgba(226,184,92,.25);background:rgba(255,255,255,.05);color:inherit;border-radius:11px;padding:9px 12px;font:inherit;cursor:pointer}.sakina-reader-tools{display:flex;justify-content:flex-start;gap:8px;flex-wrap:wrap;margin:10px 0 16px}.sakina-reader-tools button.on{background:#e2b85c;color:#12251f;border-color:#e2b85c}
      .sakina-history{margin-top:14px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}.sakina-history summary{cursor:pointer;font-size:13px;opacity:.85}.sakina-history-list{display:grid;gap:7px;margin-top:9px}.sakina-history-item{width:100%;text-align:right;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:inherit;border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer}.sakina-history-item b,.sakina-history-item small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sakina-history-item small{opacity:.65;margin-top:2px}
    `;
    document.head.appendChild(s);
  }

  function toast(message) {
    addStyles();
    let t = $("#sakinaUxToast");
    if (!t) { t = document.createElement("div"); t.id = "sakinaUxToast"; t.className = "sakina-ux-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = message; t.classList.add("show"); clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function currentItem() {
    const stored = read("lastItem", null) || {};
    const title = ($("#shTitle") && $("#shTitle").textContent.trim()) || stored.title || document.title.replace(/\s*\|.*$/, "");
    const sub = ($("#shSub") && $("#shSub").textContent.trim()) || stored.sub || "سكينة قرآن";
    const audio = $("#audio");
    return { ...stored, title, sub, url: stored.url || (audio && audio.currentSrc) || "", at: Date.now() };
  }

  function addHistory() {
    const audio = $("#audio");
    if (!audio || audio.paused) return;
    const item = currentItem();
    if (!item.key && !item.url) return;
    const list = read("history", []);
    const id = item.key || item.url;
    const next = [item, ...list.filter(x => (x.key || x.url) !== id)].slice(0, 8);
    write("history", next);
    renderHistory();
    renderContinue();
  }

  function findPlayable(item) {
    if (!item) return null;
    if (item.key) {
      try { const el = document.querySelector(`[data-key="${CSS.escape(String(item.key))}"]`); if (el) return el; } catch (e) {}
    }
    return null;
  }

  function resumeItem(item) {
    const el = findPlayable(item);
    if (el) { el.click(); track("resume_listening", { item_name: item.title || "", source: "history" }); return true; }
    const last = read("lastItem", null);
    if (last && item && (last.key || last.url) === (item.key || item.url)) {
      const cap = $("#capBtn");
      if (cap) { cap.click(); return true; }
    }
    toast("افتح القسم الخاص بالتلاوة أولًا ثم اختر استكمال الاستماع");
    return false;
  }

  function renderContinue() {
    const main = $("#main");
    if (!main || $("#sakinaContinue")) return;
    const item = read("lastItem", null);
    if (!item || item.kind !== "file" || !item.url) return;
    const pos = Number(read("pos:" + item.url, 0) || 0);
    if (pos < 20) return;
    addStyles();
    const card = document.createElement("div");
    card.id = "sakinaContinue"; card.className = "sakina-continue";
    card.innerHTML = `<div class="sakina-continue-copy"><small>استكمل الاستماع</small><b></b><span></span></div><button class="sakina-ux-action primary" type="button">متابعة</button>`;
    card.querySelector("b").textContent = item.title || "التلاوة الأخيرة";
    card.querySelector("span").textContent = item.sub || "";
    card.querySelector("button").addEventListener("click", () => resumeItem(item));
    const warn = $("#warn"); if (warn && warn.parentNode === main) warn.insertAdjacentElement("afterend", card); else main.prepend(card);
  }

  function renderHistory() {
    const sheet = $("#sheet");
    if (!sheet) return;
    let box = $("#sakinaHistory");
    if (!box) {
      box = document.createElement("details"); box.id = "sakinaHistory"; box.className = "sakina-history";
      box.innerHTML = `<summary>الاستماع الأخير</summary><div class="sakina-history-list"></div>`;
      sheet.appendChild(box);
    }
    const list = read("history", []);
    const body = box.querySelector(".sakina-history-list"); body.textContent = "";
    list.slice(0, 5).forEach(item => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sakina-history-item";
      const title = document.createElement("b"); title.textContent = item.title || "تلاوة";
      const sub = document.createElement("small"); sub.textContent = item.sub || "";
      b.append(title, sub); b.addEventListener("click", () => resumeItem(item)); body.appendChild(b);
    });
    box.hidden = list.length === 0;
  }

  async function shareCurrent() {
    const item = currentItem();
    const data = { title: item.title || "سكينة قرآن", text: `${item.title || "سكينة قرآن"}${item.sub ? " — " + item.sub : ""}`, url: location.href };
    try {
      if (navigator.share) { await navigator.share(data); track("share", { method: "native", item_name: item.title || "" }); return; }
      await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast("تم نسخ الرابط"); track("share", { method: "clipboard", item_name: item.title || "" });
    } catch (e) { if (e && e.name !== "AbortError") toast("تعذرت المشاركة الآن"); }
  }

  function injectPlayerTools() {
    const sheet = $("#sheet"); if (!sheet || $("#sakinaPlayerTools")) return;
    addStyles();
    const tools = document.createElement("div"); tools.id = "sakinaPlayerTools"; tools.className = "sakina-player-tools";
    const share = document.createElement("button"); share.type = "button"; share.textContent = "مشاركة"; share.addEventListener("click", shareCurrent);
    tools.appendChild(share);
    const sub = $("#shSub"); if (sub) sub.insertAdjacentElement("afterend", tools); else sheet.prepend(tools);
    renderHistory();
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) { toast("إبقاء الشاشة مفتوحة غير مدعوم على هذا الجهاز"); return false; }
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
      track("wake_lock", { enabled: true }); return true;
    } catch (e) { toast("تعذر إبقاء الشاشة مفتوحة"); return false; }
  }

  async function setWakeWanted(on) {
    wakeWanted = !!on; write("wakeLock", wakeWanted);
    const btn = $("#sakinaWakeBtn");
    if (wakeWanted) { const ok = await requestWakeLock(); if (!ok) wakeWanted = false; }
    else if (wakeLock) { try { await wakeLock.release(); } catch (e) {} wakeLock = null; track("wake_lock", { enabled: false }); }
    if (btn) { btn.classList.toggle("on", wakeWanted); btn.textContent = wakeWanted ? "الشاشة مفتوحة ✓" : "إبقاء الشاشة مفتوحة"; }
  }

  function injectReaderTools() {
    const view = $("#v-quran"); if (!view || $("#sakinaReaderTools")) return;
    addStyles();
    const box = document.createElement("div"); box.id = "sakinaReaderTools"; box.className = "sakina-reader-tools";
    const wake = document.createElement("button"); wake.id = "sakinaWakeBtn"; wake.type = "button"; wake.textContent = "إبقاء الشاشة مفتوحة"; wake.addEventListener("click", () => setWakeWanted(!wakeWanted));
    const share = document.createElement("button"); share.type = "button"; share.textContent = "مشاركة الصفحة"; share.addEventListener("click", shareCurrent);
    box.append(wake, share);
    const first = view.firstElementChild; if (first) first.insertAdjacentElement("afterend", box); else view.prepend(box);
    wakeWanted = !!read("wakeLock", false); if (wakeWanted) setWakeWanted(true);
  }

  function updateMediaPosition() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const audio = $("#audio"); if (!audio || !isFinite(audio.duration) || audio.duration <= 0 || !isFinite(audio.currentTime)) return;
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, audio.duration) }); } catch (e) {}
  }

  function setupMediaSession() {
    const audio = $("#audio"); if (!audio) return;
    audio.addEventListener("play", () => { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing"; } catch (e) {} addHistory(); updateMediaPosition(); });
    audio.addEventListener("pause", () => { try { if (navigator.mediaSession) navigator.mediaSession.playbackState = "paused"; } catch (e) {} });
    audio.addEventListener("timeupdate", updateMediaPosition);
    audio.addEventListener("durationchange", updateMediaPosition);
    audio.addEventListener("ratechange", updateMediaPosition);
  }

  function showUpdate(reg) {
    if ($("#sakinaUpdatePrompt")) return;
    addStyles();
    const box = document.createElement("div"); box.id = "sakinaUpdatePrompt"; box.className = "sakina-ux-update";
    box.innerHTML = `<b>تحديث جديد لسكينة</b><p>نسخة أحدث جاهزة. حدّث الآن للحصول على آخر التحسينات.</p><div class="sakina-ux-update-actions"><button class="primary" type="button">تحديث الآن</button><button class="secondary" type="button">لاحقًا</button></div>`;
    const [yes, no] = box.querySelectorAll("button");
    yes.addEventListener("click", () => { reloadOnControllerChange = true; if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" }); else location.reload(); });
    no.addEventListener("click", () => box.remove()); document.body.appendChild(box);
  }

  async function setupUpdates() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.waiting) showUpdate(reg);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing; if (!worker) return;
        worker.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(reg); });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadOnControllerChange) { location.reload(); return; }
        toast("تم تحديث سكينة لأحدث نسخة");
      });
      setTimeout(() => reg.update().catch(() => {}), 5000);
    } catch (e) {}
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wakeWanted && !wakeLock) requestWakeLock(); });

  function init() {
    addStyles();
    injectPlayerTools();
    injectReaderTools();
    setupMediaSession();
    renderContinue();
    renderHistory();
    setupUpdates();
    setTimeout(() => { renderContinue(); renderHistory(); }, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();