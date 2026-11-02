#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
LOADER_TAG = '<script src="/app-loader.js?v=1" defer></script>'

# 1) Keep analytics.js analytics-only.
analytics_path = ROOT / "analytics.js"
analytics = analytics_path.read_text(encoding="utf-8")
marker = "/* Load shared PWA, push configuration, reminders and UX enhancements on every page. */"
if marker in analytics:
    analytics = analytics.split(marker, 1)[0].rstrip() + "\n"
    analytics_path.write_text(analytics, encoding="utf-8")

# 2) Load the critical runtime independently on every page already using analytics.
analytics_tag = re.compile(r'(<script\s+src=["\']/analytics\.js\?v=\d+["\']\s+defer></script>)')
changed_pages = 0
for page in ROOT.rglob("*.html"):
    if ".git" in page.parts or "tools" in page.parts:
        continue
    text = page.read_text(encoding="utf-8", errors="ignore")
    if "/analytics.js" not in text or "/app-loader.js" in text:
        continue
    updated, count = analytics_tag.subn(r'\1\n' + LOADER_TAG, text, count=1)
    if count:
        page.write_text(updated, encoding="utf-8")
        changed_pages += 1

# 3) Make future generated SEO pages include the loader too.
builder_path = ROOT / "tools" / "build_pages.py"
builder = builder_path.read_text(encoding="utf-8")
if 'LOADER_V = "1"' not in builder:
    builder = builder.replace('GA_V = "2"', 'GA_V = "2"\nLOADER_V = "1"', 1)
if '/app-loader.js?v={LOADER_V}' not in builder:
    needle = '<script src="/analytics.js?v={GA_V}" defer></script>\n'
    builder = builder.replace(needle, needle + '<script src="/app-loader.js?v={LOADER_V}" defer></script>\n', 1)
builder_path.write_text(builder, encoding="utf-8")

# 4) Cache the independent loader and roll the service worker cache version.
sw_path = ROOT / "sw.js"
sw = sw_path.read_text(encoding="utf-8")
match = re.search(r'const V = "sakina-v(\d+)";', sw)
if match:
    current = int(match.group(1))
    sw = sw[:match.start()] + f'const V = "sakina-v{current + 1}";' + sw[match.end():]
if '"/app-loader.js?v=1"' not in sw:
    needle = '  "/analytics.js?v=2",\n'
    if needle in sw:
        sw = sw.replace(needle, needle + '  "/app-loader.js?v=1",\n', 1)
    else:
        needle = '  "/app.js?v=61",\n'
        sw = sw.replace(needle, needle + '  "/app-loader.js?v=1",\n', 1)
sw_path.write_text(sw, encoding="utf-8")

# 5) Make JS syntax validation future-proof and include runtime architecture QA.
qa_path = ROOT / ".github" / "workflows" / "seo-qa.yml"
qa_path.write_text('''name: SEO QA\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\npermissions:\n  contents: read\n\njobs:\n  seo-qa:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n      - name: Set up Python\n        uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - name: Run static SEO checks\n        run: python scripts/seo_qa.py\n      - name: Check duplicate structured data\n        run: python scripts/schema_qa.py\n      - name: Check PWA and notification configuration\n        run: python scripts/pwa_qa.py\n      - name: Check runtime loader architecture\n        run: python scripts/runtime_loader_qa.py\n      - name: Validate every JavaScript file\n        shell: bash\n        run: |\n          set -euo pipefail\n          while IFS= read -r -d '' file; do\n            echo "Checking $file"\n            node --check "$file"\n          done < <(find . -type f -name '*.js' -not -path './.git/*' -print0)\n''', encoding="utf-8")

print(f"Runtime loader patch complete. Updated {changed_pages} HTML pages.")
