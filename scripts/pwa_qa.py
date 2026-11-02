#!/usr/bin/env python3
"""Static PWA/Web Push regression checks for Sakina Quran."""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

def text(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        errors.append(f"missing required PWA file: {path}")
        return ""
    return p.read_text(encoding="utf-8", errors="replace")

def require(haystack: str, needle: str, label: str) -> None:
    if needle not in haystack:
        errors.append(f"{label}: missing {needle}")

manifest_raw = text("manifest.webmanifest")
try:
    manifest = json.loads(manifest_raw) if manifest_raw else {}
except json.JSONDecodeError as exc:
    errors.append(f"manifest.webmanifest: invalid JSON: {exc}")
    manifest = {}

if manifest:
    for key in ("name", "short_name", "start_url", "scope", "display", "icons"):
        if not manifest.get(key): errors.append(f"manifest.webmanifest: missing {key}")
    if manifest.get("start_url") != "/": errors.append("manifest.webmanifest: start_url must be /")
    if manifest.get("scope") != "/": errors.append("manifest.webmanifest: scope must be /")
    if manifest.get("display") not in {"standalone", "fullscreen", "minimal-ui"}:
        errors.append("manifest.webmanifest: display must be installable app mode")
    sizes = {i.get("sizes") for i in manifest.get("icons", []) if isinstance(i, dict)}
    if "192x192" not in sizes: errors.append("manifest.webmanifest: missing 192x192 icon")
    if "512x512" not in sizes: errors.append("manifest.webmanifest: missing 512x512 icon")
    screenshots = manifest.get("screenshots", [])
    if len(screenshots) < 2: errors.append("manifest.webmanifest: expected mobile and wide screenshots")

for asset in (
    "icon-192.png", "icon-512.png", "offline.html", "pwa.js", "reminders.js",
    "smart-audio-cache.js", "push-config.js", "app-loader.js", "app-core.js",
    "seo-core.js", "player-ui.css", "media-session.js", "sw.js", "sw-core.js"
):
    if not (ROOT / asset).exists(): errors.append(f"missing required PWA asset: {asset}")

index = text("index.html")
require(index, 'rel="manifest"', "index.html")
require(index, "apple-mobile-web-app-capable", "index.html")
require(index, "apple-touch-icon", "index.html")

loader = text("app-loader.js")
for needle in (
    "/push-config.js?v=2", "/pwa.js?v=3", "/reminders.js?v=1",
    "/smart-audio-cache.js?v=1", "/player-ui.css?v=1", "/ui-refresh.js?v=2",
    "/media-session.js?v=2", "loadMediaSession", "ensureInstallShortcut", "ثبّت سكينة"
):
    require(loader, needle, "app-loader.js")

pwa = text("pwa.js")
for needle in ("beforeinstallprompt", "appinstalled", "Notification.requestPermission", "pushManager.subscribe", "syncPushPreferences", "showInstallPrompt"):
    require(pwa, needle, "pwa.js")

reminders = text("reminders.js")
for needle in ("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "morning", "evening", "periodicSync.register", "REMINDER_PREFS", "showNotification"):
    require(reminders, needle, "reminders.js")

smart_audio = text("smart-audio-cache.js")
for needle in ("indexedDB", "MAX_ITEMS = 2", "smart_audio_cached", "smart_audio_offline_replay", "saveData"):
    require(smart_audio, needle, "smart-audio-cache.js")

player_ui = text("player-ui.css")
for needle in (".capsule", ".sheet", ".pb.big2", "@media(max-width:560px)"):
    require(player_ui, needle, "player-ui.css")

media_session = text("media-session.js")
for needle in ("playbackState", "setPositionState", 'setActionHandler(name, handler)', "safeSeek", "Do not override play/pause/next/previous", "بث مباشر • سكينة قرآن"):
    require(media_session, needle, "media-session.js")
for forbidden in ('action("play"', 'action("pause"', 'action("nexttrack"', 'action("previoustrack"', 'action("stop"'):
    if forbidden in media_session:
        errors.append(f"media-session.js must not override player-owned transport action: {forbidden}")

sw_boot = text("sw.js")
if not re.search(r'importScripts\("/sw-core\.js\?v=\d+"\)', sw_boot):
    errors.append('sw.js: missing versioned importScripts("/sw-core.js?v=<number>")')

sw = text("sw-core.js")
for needle in (
    'const V = "sakina-v87"', 'addEventListener("push"', 'addEventListener("notificationclick"',
    'addEventListener("periodicsync"', "REMINDER_PREFS", "/pwa.js?v=3", "/reminders.js?v=1",
    '"/app.js?v=61"', '"/app-core.js?v=61"', '"/app-loader.js?v=1"',
    '"/seo.js?v=4"', '"/seo-core.js?v=4"', "/offline.html"
):
    require(sw, needle, "sw-core.js")

push_config = text("push-config.js")
require(push_config, "vapidPublicKey", "push-config.js")
require(push_config, "subscribeEndpoint", "push-config.js")

print("PWA QA checked manifest, screenshots, safe loader bootstrap, cache v87, service worker, Media Session, Web Push, reminders and smart audio replay")
if errors:
    for error in errors: print(f"ERROR: {error}")
    print(f"PWA QA failed: {len(errors)} error(s)")
    sys.exit(1)
print("PWA QA passed")
