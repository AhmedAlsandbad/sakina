/* Google Analytics 4 for every page of Sakina. Set GA_ID once; all pages load this file. */
(function () {
  var GA_ID = "G-XXXXXXXXXX";
  window.sakinaTrack = function (name, params) { try { if (window.gtag) window.gtag("event", name, params || {}); } catch (e) {} };
  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID) || GA_ID === "G-XXXXXXXXXX") return;
  if (location.hostname !== "sakinaquran.net" && location.hostname !== "www.sakinaquran.net") return; // keep previews out of the numbers
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
  var s = document.createElement("script"); s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);
})();
