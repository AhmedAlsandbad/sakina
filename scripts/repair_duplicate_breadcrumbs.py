#!/usr/bin/env python3
"""Remove redundant standalone crumbs-ld blocks when a page already declares BreadcrumbList."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".github", "scripts"}
VERIFY_RE = re.compile(r"^(google[a-z0-9_-]+\.html|BingSiteAuth\.xml)$", re.I)
LD_SCRIPT_RE = re.compile(
    r'<script\b(?P<attrs>[^>]*)type=["\']application/ld\+json["\'](?P<attrs2>[^>]*)>(?P<payload>.*?)</script>',
    re.I | re.S,
)
CRUMBS_ID_RE = re.compile(r'\bid=["\']crumbs-ld["\']', re.I)


def top_level_has_breadcrumb(data) -> bool:
    if isinstance(data, dict) and isinstance(data.get("@graph"), list):
        return any(isinstance(x, dict) and x.get("@type") == "BreadcrumbList" for x in data["@graph"])
    if isinstance(data, dict):
        return data.get("@type") == "BreadcrumbList"
    if isinstance(data, list):
        return any(isinstance(x, dict) and x.get("@type") == "BreadcrumbList" for x in data)
    return False


def breadcrumb_count(html: str) -> int:
    count = 0
    for m in LD_SCRIPT_RE.finditer(html):
        try:
            data = json.loads(m.group("payload").strip())
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and isinstance(data.get("@graph"), list):
            count += sum(1 for x in data["@graph"] if isinstance(x, dict) and x.get("@type") == "BreadcrumbList")
        elif isinstance(data, dict) and data.get("@type") == "BreadcrumbList":
            count += 1
        elif isinstance(data, list):
            count += sum(1 for x in data if isinstance(x, dict) and x.get("@type") == "BreadcrumbList")
    return count


def main() -> int:
    changed = []
    unresolved = []

    for path in sorted(ROOT.rglob("*.html")):
        parts = set(path.relative_to(ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.parent == ROOT and VERIFY_RE.match(path.name):
            continue
        html = path.read_text(encoding="utf-8", errors="strict")
        if breadcrumb_count(html) <= 1:
            continue

        removable = []
        has_other = False
        for m in LD_SCRIPT_RE.finditer(html):
            attrs = (m.group("attrs") or "") + (m.group("attrs2") or "")
            try:
                data = json.loads(m.group("payload").strip())
            except json.JSONDecodeError:
                continue
            if not top_level_has_breadcrumb(data):
                continue
            if CRUMBS_ID_RE.search(attrs):
                removable.append(m)
            else:
                has_other = True

        if has_other and removable:
            # Remove redundant standalone crumbs-ld scripts from the end backwards.
            new_html = html
            for m in reversed(removable):
                start, end = m.span()
                while start > 0 and new_html[start - 1] == "\n":
                    start -= 1
                    break
                new_html = new_html[:start] + new_html[end:]
            if breadcrumb_count(new_html) == 1:
                path.write_text(new_html, encoding="utf-8")
                changed.append(path.relative_to(ROOT).as_posix())
                continue

        unresolved.append(path.relative_to(ROOT).as_posix())

    print(f"Repaired {len(changed)} page(s)")
    for item in changed:
        print(item)
    if unresolved:
        print("Unresolved duplicate BreadcrumbList pages:")
        for item in unresolved:
            print(item)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
