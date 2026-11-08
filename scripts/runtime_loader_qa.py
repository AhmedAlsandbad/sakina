#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
errors = []

def read(path):
    p = ROOT / path
    if not p.exists():
        errors.append(f"missing required file: {path}")
        return ""
    return p.read_text(encoding="utf-8", errors="replace")

analytics = read("analytics.js")
app_boot = read("app.js")
seo_boot = read("seo.js")
loader = read("app-loader.js")
sw_boot = read("sw.js")
sw_core = read("sw-core.js")

for token in ("__sakinaPwaLoader", "/pwa.js", "/reminders.js", "/ui-refresh.js", "/smart-audio-cache.js"):
    if token in analytics:
        errors.append(f"analytics.js still owns critical runtime token: {token}")

for token in ("/app-core.js?v=65", "/app-loader.js?v=2"):
    if token not in app_boot:
        errors.append(f"app.js bootstrap missing: {token}")

for token in ("/seo-core.js?v=4", "/app-loader.js?v=1"):
    if token not in seo_boot:
        errors.append(f"seo.js bootstrap missing: {token}")

for token in ("__sakinaPwaLoader", "/pwa.js?v=3", "/reminders.js?v=1", "/ui-refresh.js?v=3", "/push-config.js?v=2", "/media-session.js?v=3"):
    if token not in loader:
        errors.append(f"app-loader.js missing: {token}")

if not re.search(r'importScripts\("/sw-core\.js\?v=\d+"\)', sw_boot):
    errors.append("sw.js is not using a versioned sw-core bootstrap")

for token in ('const V = "sakina-v91"', '"/app-core.js?v=65"', '"/app-loader.js?v=1"', '"/app-loader.js?v=2"', '"/seo-core.js?v=4"'):
    if token not in sw_core:
        errors.append(f"sw-core.js missing cache/runtime requirement: {token}")

for path in ("app-core.js", "seo-core.js", "sw-core.js", "media-session.js"):
    if not (ROOT / path).exists():
        errors.append(f"missing preserved core/runtime file: {path}")

index = read("index.html")
if 'app.js?v=65' not in index:
    errors.append("index.html no longer loads app.js bootstrap")

seo_pages = 0
for page in ROOT.rglob("*.html"):
    if ".git" in page.parts or "tools" in page.parts or page == ROOT / "index.html":
        continue
    text = page.read_text(encoding="utf-8", errors="ignore")
    if "/seo.js" in text:
        seo_pages += 1
if seo_pages == 0:
    errors.append("no SEO pages load seo.js bootstrap")

if errors:
    print("Runtime loader QA failed:")
    for error in errors:
        print(" -", error)
    sys.exit(1)
print(f"Runtime loader QA passed; {seo_pages} SEO pages use the safe bootstrap and PWA cache v91.")
