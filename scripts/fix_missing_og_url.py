#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".github", "scripts"}
VERIFY_RE = re.compile(r"^(google[a-z0-9_-]+\.html|BingSiteAuth\.xml)$", re.I)
CANON_RE = re.compile(r'(<link\s+[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\'][^>]*>|<link\s+[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\'][^>]*>)', re.I | re.S)
OG_URL_RE = re.compile(r'<meta\s+[^>]*property=["\']og:url["\']', re.I)


def main() -> int:
    changed = []
    for path in ROOT.rglob("*.html"):
        rel_parts = set(path.relative_to(ROOT).parts)
        if rel_parts & SKIP_DIRS:
            continue
        if path.parent == ROOT and VERIFY_RE.match(path.name):
            continue
        html = path.read_text(encoding="utf-8", errors="strict")
        if OG_URL_RE.search(html):
            continue
        m = CANON_RE.search(html)
        if not m:
            continue
        canonical = (m.group(2) or m.group(3) or "").strip()
        if not canonical.startswith("https://sakinaquran.net"):
            continue
        tag = m.group(1)
        replacement = f'{tag}<meta property="og:url" content="{canonical}">'
        html2 = html[:m.start()] + replacement + html[m.end():]
        path.write_text(html2, encoding="utf-8")
        changed.append(path.relative_to(ROOT).as_posix())

    print(f"Updated {len(changed)} page(s)")
    for item in changed:
        print(item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
