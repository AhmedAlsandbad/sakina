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

/* Load shared PWA, push configuration and prayer/adhkar reminders on every page. */
(function () {
  if (window.__sakinaPwaLoader) return;
  window.__sakinaPwaLoader = true;
  function loadReminders() {
    if (document.querySelector('script[data-sakina-reminders]')) return;
    var r = document.createElement("script");
    r.src = "/reminders.js?v=1";
    r.defer = true;
    r.dataset.sakinaReminders = "1";
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
  var c = document.createElement("script");
  c.src = "/push-config.js?v=1";
  c.defer = true;
  c.onload = loadPwa;
  c.onerror = loadPwa;
  document.head.appendChild(c);
})();