"use strict";
(function () {
  if (window.__sakinaAppBootstrap) return;
  window.__sakinaAppBootstrap = true;

  function appendScript(src, marker, done) {
    if (document.querySelector('script[data-sakina-' + marker + ']')) {
      if (done) done();
      return;
    }
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset['sakina' + marker.replace(/(^|-)([a-z])/g, function (_, __, c) { return c.toUpperCase(); })] = "1";
    if (done) {
      s.onload = done;
      s.onerror = done;
    }
    document.head.appendChild(s);
  }

  function loadRuntime() {
    if (window.__sakinaPwaLoader || document.querySelector('script[data-sakina-runtime-loader]')) return;
    var s = document.createElement("script");
    s.src = "/app-loader.js?v=2";
    s.async = false;
    s.dataset.sakinaRuntimeLoader = "1";
    document.head.appendChild(s);
  }

  appendScript("/app-core.js?v=67", "app-core", loadRuntime);
})();
