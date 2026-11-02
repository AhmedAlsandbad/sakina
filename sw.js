/* Sakina service-worker bootstrap.
   The stable worker logic is kept in sw-core.js so this wrapper can force a clean update. */
importScripts("/sw-core.js?v=2");
