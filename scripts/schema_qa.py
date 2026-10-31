#!/usr/bin/env python3
"""Detect duplicate singleton structured-data entities on indexable HTML pages."""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", ".github", "scripts"}
VERIFY_RE = re.compile(r"^(google[a-z0-9_-]+\.html|BingSiteAuth\.xml)$", re.I)
LD_JSON_RE = re.compile(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
SINGLETON_TYPES = {"BreadcrumbList", "FAQPage", "WebPage"}


def walk_types(value):
    if isinstance(value, dict):
        t = value.get("@type")
        if isinstance(t, str):
            yield t
        elif isinstance(t, list):
            for item in t:
                if isinstance(item, str):
                    yield item
        for child in value.values():
            yield from walk_types(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_types(child)


def main() -> int:
    errors = []
    checked = 0
    for path in sorted(ROOT.rglob("*.html")):
        parts = set(path.relative_to(ROOT).parts)
        if parts & SKIP_DIRS:
            continue
        if path.parent == ROOT and VERIFY_RE.match(path.name):
            continue
        html = path.read_text(encoding="utf-8", errors="replace")
        if re.search(r'<meta\s+[^>]*name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', html, re.I):
            continue
        checked += 1
        counts = Counter()
        for i, payload in enumerate(LD_JSON_RE.findall(html), start=1):
            try:
                data = json.loads(payload.strip())
            except json.JSONDecodeError:
                # Main SEO QA reports malformed JSON-LD.
                continue
            counts.update(walk_types(data))
        rel = "/" + path.relative_to(ROOT).as_posix()
        for schema_type in sorted(SINGLETON_TYPES):
            if counts[schema_type] > 1:
                errors.append(f"{rel}: duplicate {schema_type} schema ({counts[schema_type]} instances)")

    print(f"Checked structured data on {checked} indexable HTML pages")
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"Structured-data QA failed: {len(errors)} duplicate singleton issue(s)")
        return 1
    print("Structured-data QA passed: no duplicate singleton schemas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
