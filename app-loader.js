/* Sakina shared runtime loader.
   Critical PWA/UI functionality lives here so it is independent from analytics blockers. */
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
    if (!mobile) return;

    var btn = document.getElementById("installBtn");
    if (btn) {
      btn.hidden = false;
      btn.setAttribute("aria-label", "إضافة سكينة إلى الشاشة الرئيسية");
      btn.title = "ثبّت سكينة";
      return;
    }

    if (document.getElementById("sakinaInstallShortcut")) return;
    if (!document.getElementById("sakinaInstallShortcutStyle")) {
      var style = document.createElement("style");
      style.id = "sakinaInstallShortcutStyle";
      style.textContent = ".sakina-install-shortcut{position:fixed;z-index:99989;left:16px;top:calc(72px + env(safe-area-inset-top));display:grid;place-items:center;width:46px;height:46px;border:1px solid rgba(226,184,92,.45);background:#102a23;color:#f2d487;box-shadow:0 10px 28px rgba(0,0,0,.28);border-radius:50%;font:600 18px 'Readex Pro',system-ui,sans-serif;cursor:pointer}.sakina-install-shortcut:hover{transform:translateY(-1px)}";
      document.head.appendChild(style);
    }

    var fallback = document.createElement("button");
    fallback.id = "sakinaInstallShortcut";
    fallback.className = "sakina-install-shortcut";
    fallback.type = "button";
    fallback.setAttribute("aria-label", "إضافة سكينة إلى الشاشة الرئيسية");
    fallback.title = "ثبّت سكينة";
    fallback.textContent = "＋";
    fallback.addEventListener("click", function () {
      try { if (window.sakinaTrack) window.sakinaTrack("pwa_install_shortcut_click", { page_path: location.pathname }); } catch (e) {}
      if (window.SakinaPWA && window.SakinaPWA.showInstallPrompt) window.SakinaPWA.showInstallPrompt();
    });
    document.body.appendChild(fallback);
    window.addEventListener("appinstalled", function () { if (fallback && fallback.remove) fallback.remove(); });
  }

  function loadPlayerUi() {
    if (!document.getElementById("dock") || document.querySelector('link[data-sakina-player-ui]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/player-ui.css?v=1";
    l.dataset.sakinaPlayerUi = "1";
    document.head.appendChild(l);
  }

  function loadUiRefreshCss() {
    if (document.querySelector('link[data-sakina-ui-refresh]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/ui-refresh.css?v=1";
    l.dataset.sakinaUiRefresh = "1";
    document.head.appendChild(l);
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

  function loadUiRefresh() {
    if (document.querySelector('script[data-sakina-ui-refresh]')) { loadSmartAudio(); return; }
    var r = document.createElement("script");
    r.src = "/ui-refresh.js?v=2";
    r.defer = true;
    r.dataset.sakinaUiRefresh = "1";
    r.onload = loadSmartAudio;
    r.onerror = loadSmartAudio;
    document.head.appendChild(r);
  }

  function loadUx() {
    if (document.querySelector('script[data-sakina-ux]')) { loadUiRefresh(); return; }
    var u = document.createElement("script");
    u.src = "/ux-enhancements.js?v=1";
    u.defer = true;
    u.dataset.sakinaUx = "1";
    u.onload = loadUiRefresh;
    u.onerror = loadUiRefresh;
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
    p.src = "/pwa.js?v=3";
    p.defer = true;
    p.dataset.sakinaPwa = "1";
    p.onload = loadReminders;
    p.onerror = loadReminders;
    document.head.appendChild(p);
  }

  function initSharedPwa() {
    loadPlayerUi();
    loadUiRefreshCss();
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
