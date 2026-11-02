"use strict";
(function () {
  if (window.__sakinaSeoBootstrap) return;
  window.__sakinaSeoBootstrap = true;

  function loadRuntime() {
    if (window.__sakinaPwaLoader || document.querySelector('script[data-sakina-runtime-loader]')) return;
    var runtime = document.createElement("script");
    runtime.src = "/app-loader.js?v=1";
    runtime.async = false;
    runtime.dataset.sakinaRuntimeLoader = "1";
    document.head.appendChild(runtime);
  }

  if (document.querySelector('script[data-sakina-seo-core]')) {
    loadRuntime();
    return;
  }
  var core = document.createElement("script");
  core.src = "/seo-core.js?v=4";
  core.async = false;
  core.dataset.sakinaSeoCore = "1";
  core.onload = loadRuntime;
  core.onerror = loadRuntime;
  document.head.appendChild(core);
})();
