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


def type_names(value):
    if not isinstance(value, dict):
        return []
    t = value.get("@type")
    if isinstance(t, str):
        return [t]
    if isinstance(t, list):
        return [item for item in t if isinstance(item, str)]
    return []


def top_level_types(data):
    """Yield only independently declared entities, not nested references."""
    if isinstance(data, dict) and isinstance(data.get("@graph"), list):
        for entity in data["@graph"]:
            yield from type_names(entity)
    elif isinstance(data, dict):
        yield from type_names(data)
    elif isinstance(data, list):
        for entity in data:
            yield from type_names(entity)


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
        for payload in LD_JSON_RE.findall(html):
            try:
                data = json.loads(payload.strip())
            except json.JSONDecodeError:
                # Main SEO QA reports malformed JSON-LD.
                continue
            counts.update(top_level_types(data))
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
