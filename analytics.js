/* Google Analytics 4 for every page of Sakina. */
(function () {
  var GA_ID = "G-5VX3Y4M3FV";
  window.sakinaTrack = function (name, params) { try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {} };
  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID) || GA_ID === "G-XXXXXXXXXX") return;
  if (location.hostname !== "sakinaquran.net" && location.hostname !== "www.sakinaquran.net") return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  var played = typeof WeakSet === "function" ? new WeakSet() : null;
  document.addEventListener("play", function (e) {
    var a = e.target;
    if (!a || a.tagName !== "AUDIO" || a.id === "audio") return;
    if (played && played.has(a)) return;
    if (played) played.add(a);
    var p = location.pathname;
    var type = p.indexOf("/radio/") === 0 ? "radio"
      : p.indexOf("/surahs/") === 0 ? "surah"
      : p.indexOf("/reciters/") === 0 ? "reciter_surah"
      : p.indexOf("/ruqyah/") === 0 ? "ruqyah"
      : "audio";
    var card = a.closest ? a.closest(".card") : null;
    var label = card && card.querySelector("b") ? card.querySelector("b").textContent.trim() : "";
    if (!label) { var h1 = document.querySelector("h1"); label = h1 ? h1.textContent.trim() : document.title; }
    window.sakinaTrack("audio_play", { content_type: type, item_name: label, page_path: p });
  }, true);
})();

/* Load shared PWA, push configuration, reminders and UX enhancements on every page. */
(function () {
  if (window.__sakinaPwaLoader) return;
  window.__sakinaPwaLoader = true;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function ensureInstallShortcut() {
    if (isStandalone()) return;
    var ua = navigator.userAgent || "";
    var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!mobile || document.getElementById("sakinaInstallShortcut")) return;

    var proxy = document.getElementById("installBtn");
    if (!proxy) {
      proxy = document.createElement("button");
      proxy.id = "installBtn";
      proxy.type = "button";
      proxy.hidden = true;
      proxy.style.display = "none";
      proxy.setAttribute("aria-hidden", "true");
      document.body.appendChild(proxy);
    }

    if (!document.getElementById("sakinaInstallShortcutStyle")) {
      var style = document.createElement("style");
      style.id = "sakinaInstallShortcutStyle";
      style.textContent = ".sakina-install-shortcut{position:fixed;z-index:99989;left:16px;bottom:calc(82px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:7px;border:1px solid rgba(226,184,92,.45);background:#102a23;color:#f2d487;box-shadow:0 10px 28px rgba(0,0,0,.28);border-radius:999px;padding:10px 13px;font:600 12px 'Readex Pro',system-ui,sans-serif;cursor:pointer;direction:rtl}.sakina-install-shortcut:hover{transform:translateY(-1px)}.sakina-install-shortcut span:first-child{font-size:17px;line-height:1}@media(max-width:360px){.sakina-install-shortcut{padding:10px;width:44px;height:44px;justify-content:center}.sakina-install-shortcut .sakina-install-label{display:none}}";
      document.head.appendChild(style);
    }

    var btn = document.createElement("button");
    btn.id = "sakinaInstallShortcut";
    btn.className = "sakina-install-shortcut";
    btn.type = "button";
    btn.setAttribute("aria-label", "إضافة سكينة إلى الشاشة الرئيسية");
    btn.title = "إضافة سكينة إلى الشاشة الرئيسية";
    btn.innerHTML = '<span aria-hidden="true">＋</span><span class="sakina-install-label">ثبّت سكينة</span>';
    btn.addEventListener("click", function () {
      try { window.sakinaTrack("pwa_install_shortcut_click", { page_path: location.pathname }); } catch (e) {}
      var target = document.getElementById("installBtn");
      if (target) target.click();
    });
    document.body.appendChild(btn);

    window.addEventListener("appinstalled", function () { if (btn && btn.remove) btn.remove(); });
    try {
      var mq = window.matchMedia("(display-mode: standalone)");
      if (mq.addEventListener) mq.addEventListener("change", function (e) { if (e.matches && btn && btn.remove) btn.remove(); });
    } catch (e) {}
  }

  function loadSmartAudio() {
    if (!document.getElementById("audio")) return;
    if (document.querySelector('script[data-sakina-smart-audio]')) return;
    var a = document.createElement("script");
    a.src = "/smart-audio-cache.js?v=1";
    a.defer = true;
    a.dataset.sakinaSmartAudio = "1";
    document.head.appendChild(a);
  }
  function loadUx() {
    if (document.querySelector('script[data-sakina-ux]')) { loadSmartAudio(); return; }
    var u = document.createElement("script");
    u.src = "/ux-enhancements.js?v=1";
    u.defer = true;
    u.dataset.sakinaUx = "1";
    u.onload = loadSmartAudio;
    u.onerror = loadSmartAudio;
    document.head.appendChild(u);
  }
  function loadReminders() {
    if (document.querySelector('script[data-sakina-reminders]')) { loadUx(); return; }
    var r = document.createElement("script");
    r.src = "/reminders.js?v=1";
    r.defer = true;
    r.dataset.sakinaReminders = "1";
    r.onload = loadUx;
    r.onerror = loadUx;
    document.head.appendChild(r);
  }
  function loadPwa() {
    if (document.querySelector('script[data-sakina-pwa]')) { loadReminders(); return; }
    var p = document.createElement("script");
    p.src = "/pwa.js?v=2";
    p.defer = true;
    p.dataset.sakinaPwa = "1";
    p.onload = loadReminders;
    p.onerror = loadReminders;
    document.head.appendChild(p);
  }

  function initSharedPwa() {
    ensureInstallShortcut();
    var c = document.createElement("script");
    c.src = "/push-config.js?v=2";
    c.defer = true;
    c.onload = loadPwa;
    c.onerror = loadPwa;
    document.head.appendChild(c);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSharedPwa, { once: true });
  else initSharedPwa();
})();