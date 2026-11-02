"use strict";
(function () {
  if (window.__sakinaMediaSessionEnhancer) return;
  window.__sakinaMediaSessionEnhancer = true;
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;

  var audio = document.getElementById("audio");
  if (!audio) return;
  var ms = navigator.mediaSession;
  var lastMeta = "";
  var lastPositionAt = 0;

  function text(id) {
    var el = document.getElementById(id);
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function isLive() {
    var badge = document.getElementById("liveBadge");
    return !!(badge && !badge.hidden);
  }

  function classify() {
    var title = text("shTitle");
    var artist = text("shSub");
    var eyebrow = text("shEyebrow");
    var joined = title + " " + artist + " " + eyebrow;
    if (isLive()) return { title: title || "إذاعة القرآن الكريم", artist: artist || "بث مباشر", album: "بث مباشر • سكينة قرآن" };
    if (/رقية|الرقيه/.test(joined)) return { title: title || "الرقية الشرعية", artist: artist || "سكينة قرآن", album: "الرقية الشرعية • سكينة قرآن" };
    return { title: title || "القرآن الكريم", artist: artist || "سكينة قرآن", album: "القرآن الكريم • سكينة قرآن" };
  }

  function refreshMetadata() {
    try {
      var info = classify();
      var signature = [info.title, info.artist, info.album, isLive() ? "live" : "file"].join("|");
      if (signature === lastMeta) return;
      lastMeta = signature;
      ms.metadata = new MediaMetadata({
        title: info.title,
        artist: info.artist,
        album: info.album,
        artwork: [
          { src: location.origin + "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: location.origin + "/icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      });
      if (isLive() && ms.setPositionState) {
        try { ms.setPositionState(); } catch (e) {}
      }
    } catch (e) {}
  }

  function syncPlaybackState(state) {
    try {
      if (state) ms.playbackState = state;
      else ms.playbackState = audio.ended ? "none" : (audio.paused ? "paused" : "playing");
    } catch (e) {}
  }

  function syncPosition(force) {
    if (!ms.setPositionState || isLive()) return;
    var duration = audio.duration;
    var position = audio.currentTime;
    if (!isFinite(duration) || duration <= 0 || !isFinite(position)) return;
    var now = Date.now();
    if (!force && now - lastPositionAt < 1800) return;
    lastPositionAt = now;
    try {
      ms.setPositionState({
        duration: duration,
        position: Math.max(0, Math.min(position, duration)),
        playbackRate: audio.playbackRate || 1
      });
    } catch (e) {}
  }

  function safeSeek(delta) {
    if (isLive()) return;
    var duration = audio.duration;
    if (!isFinite(duration) || duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min((audio.currentTime || 0) + delta, duration));
    syncPosition(true);
  }

  function action(name, handler) {
    try { ms.setActionHandler(name, handler); } catch (e) {}
  }

  /*
   * Do not override play/pause/next/previous here. app-core.js owns those
   * actions because it must update P.want, queue state and Sakina's UI too.
   * This enhancer only replaces seek actions with live-safe versions and
   * synchronizes metadata/playback state with the operating system.
   */
  action("seekforward", function (event) {
    safeSeek(event && isFinite(event.seekOffset) ? event.seekOffset : 15);
  });
  action("seekbackward", function (event) {
    safeSeek(-(event && isFinite(event.seekOffset) ? event.seekOffset : 15));
  });
  action("seekto", function (event) {
    if (isLive() || !event || !isFinite(event.seekTime) || !isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(event.seekTime, audio.duration));
    syncPosition(true);
  });

  audio.addEventListener("play", function () { refreshMetadata(); syncPlaybackState("playing"); syncPosition(true); });
  audio.addEventListener("playing", function () { refreshMetadata(); syncPlaybackState("playing"); });
  audio.addEventListener("pause", function () { syncPlaybackState(audio.ended ? "none" : "paused"); syncPosition(true); });
  audio.addEventListener("ended", function () { syncPlaybackState("none"); });
  audio.addEventListener("loadedmetadata", function () { refreshMetadata(); syncPosition(true); });
  audio.addEventListener("durationchange", function () { refreshMetadata(); syncPosition(true); });
  audio.addEventListener("ratechange", function () { syncPosition(true); });
  audio.addEventListener("timeupdate", function () { syncPosition(false); });

  var watched = ["shTitle", "shSub", "shEyebrow", "liveBadge"].map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (watched.length && "MutationObserver" in window) {
    var observer = new MutationObserver(function () {
      lastMeta = "";
      refreshMetadata();
    });
    watched.forEach(function (el) {
      observer.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    });
  }

  refreshMetadata();
  syncPlaybackState();
})();
