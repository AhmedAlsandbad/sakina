#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
errors = []

analytics = (ROOT / "analytics.js").read_text(encoding="utf-8")
loader = (ROOT / "app-loader.js").read_text(encoding="utf-8")
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
builder = (ROOT / "tools" / "build_pages.py").read_text(encoding="utf-8")

for token in ("__sakinaPwaLoader", "/pwa.js", "/reminders.js", "/ui-refresh.js", "/smart-audio-cache.js"):
    if token in analytics:
        errors.append(f"analytics.js still contains critical runtime token: {token}")

for token in ("__sakinaPwaLoader", "/pwa.js", "/reminders.js", "/ui-refresh.js", "/push-config.js"):
    if token not in loader:
        errors.append(f"app-loader.js missing required runtime token: {token}")

if '"/app-loader.js?v=1"' not in sw:
    errors.append("sw.js does not cache app-loader.js")

if '/app-loader.js?v={LOADER_V}' not in builder and '/app-loader.js?v=1' not in builder:
    errors.append("tools/build_pages.py does not emit app-loader.js")

checked = 0
for page in ROOT.rglob("*.html"):
    if ".git" in page.parts or "tools" in page.parts:
        continue
    text = page.read_text(encoding="utf-8", errors="ignore")
    if "/analytics.js" in text:
        checked += 1
        if "/app-loader.js" not in text:
            errors.append(f"{page.relative_to(ROOT)} loads analytics but not app-loader")

if checked == 0:
    errors.append("no HTML page with analytics.js was found")

if errors:
    print("Runtime loader QA failed:")
    for error in errors:
        print(" -", error)
    sys.exit(1)

print(f"Runtime loader QA passed for {checked} HTML pages.")
