#!/usr/bin/env python3
"""Static SEO QA for sakinaquran.net.

Uses Python stdlib only. Exits non-zero on SEO regressions that can affect
crawlability, structured data, indexation, or media performance.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "https://sakinaquran.net"
SKIP_DIRS = {".git", ".github", "scripts"}
NOINDEX_OK = {"/404.html"}
VERIFICATION_FILE_RE = re.compile(r"^(google[a-z0-9_-]+\.html|BingSiteAuth\.xml)$", re.I)

TITLE_RE = re.compile(r"<title>(.*?)</title>", re.I | re.S)
DESC_RE = re.compile(r'<meta\s+[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']|<meta\s+[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']description["\']', re.I | re.S)
CANON_RE = re.compile(r'<link\s+[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']|<link\s+[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']', re.I | re.S)
ROBOTS_RE = re.compile(r'<meta\s+[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']*)["\']|<meta\s+[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']robots["\']', re.I | re.S)
OG_URL_RE = re.compile(r'<meta\s+[^>]*property=["\']og:url["\'][^>]*content=["\']([^"\']+)["\']|<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:url["\']', re.I | re.S)
H1_RE = re.compile(r"<h1\b", re.I)
HREF_RE = re.compile(r'<a\s+[^>]*href=["\']([^"\']+)["\']', re.I)
HTML_TAG_RE = re.compile(r"<html\b([^>]*)>", re.I | re.S)
LD_JSON_RE = re.compile(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
AUDIO_TAG_RE = re.compile(r"<audio\b[^>]*>", re.I | re.S)


def first_group(match):
    if not match:
        return None
    return next((g.strip() for g in match.groups() if g is not None), None)


def attr_value(tag: str, name: str) -> str | None:
    m = re.search(rf'\b{re.escape(name)}\s*=\s*["\']([^"\']*)["\']', tag, re.I | re.S)
    return m.group(1).strip() if m else None


def page_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def internal_target_exists(href: str, source: Path) -> bool:
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return True
    parsed = urlparse(href)
    if parsed.scheme in {"http", "https"}:
        if parsed.netloc not in {"sakinaquran.net", "www.sakinaquran.net"}:
            return True
        p = parsed.path
    else:
        p = parsed.path
    if not p:
        return True
    if p.startswith("/"):
        candidate = ROOT / p.lstrip("/")
    else:
        candidate = source.parent / p
    if candidate.is_dir():
        candidate = candidate / "index.html"
    elif not candidate.suffix:
        candidate = candidate / "index.html"
    return candidate.exists()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    titles: dict[str, str] = {}
    canonicals: dict[str, str] = {}
    indexable_urls: set[str] = set()

    pages = []
    for p in ROOT.rglob("*.html"):
        rel_parts = set(p.relative_to(ROOT).parts)
        if rel_parts & SKIP_DIRS:
            continue
        if p.parent == ROOT and VERIFICATION_FILE_RE.match(p.name):
            continue
        pages.append(p)

    for path in sorted(pages):
        rel = "/" + path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8", errors="replace")
        expected = page_url(path)
        title_match = TITLE_RE.search(html)
        title = title_match.group(1).strip() if title_match else ""
        desc = first_group(DESC_RE.search(html))
        canonical = first_group(CANON_RE.search(html))
        og_url = first_group(OG_URL_RE.search(html))
        robots = (first_group(ROBOTS_RE.search(html)) or "").lower()
        h1_count = len(H1_RE.findall(html))
        noindex = "noindex" in robots

        html_tag = HTML_TAG_RE.search(html)
        if not html_tag:
            errors.append(f"{rel}: missing <html> element")
        else:
            attrs = html_tag.group(1)
            lang = attr_value(attrs, "lang")
            direction = attr_value(attrs, "dir")
            if lang != "ar":
                errors.append(f"{rel}: expected html lang=\"ar\", found {lang!r}")
            if direction != "rtl":
                errors.append(f"{rel}: expected html dir=\"rtl\", found {direction!r}")

        if not title:
            errors.append(f"{rel}: missing <title>")
        elif len(title) > 70:
            warnings.append(f"{rel}: title is long ({len(title)} chars)")
        elif title in titles:
            errors.append(f"{rel}: duplicate title with {titles[title]}: {title}")
        else:
            titles[title] = rel

        if rel not in NOINDEX_OK:
            if not desc:
                errors.append(f"{rel}: missing meta description")
            elif len(desc) > 170:
                warnings.append(f"{rel}: description is long ({len(desc)} chars)")

            if not canonical:
                errors.append(f"{rel}: missing canonical")
            else:
                if not canonical.startswith(DOMAIN):
                    errors.append(f"{rel}: canonical is outside primary domain: {canonical}")
                else:
                    cpath = urlparse(canonical).path
                    if cpath != expected:
                        errors.append(f"{rel}: canonical path {cpath} does not match expected {expected}")
                if canonical in canonicals:
                    errors.append(f"{rel}: duplicate canonical with {canonicals[canonical]}: {canonical}")
                else:
                    canonicals[canonical] = rel

            if og_url and canonical and og_url != canonical:
                errors.append(f"{rel}: og:url does not match canonical ({og_url} != {canonical})")
            elif not og_url:
                warnings.append(f"{rel}: missing og:url")

            if noindex:
                errors.append(f"{rel}: unexpectedly noindex")
            if h1_count != 1:
                errors.append(f"{rel}: expected exactly 1 H1, found {h1_count}")
            indexable_urls.add(expected)
        else:
            if not noindex:
                warnings.append(f"{rel}: 404 page should normally be noindex")

        for i, payload in enumerate(LD_JSON_RE.findall(html), start=1):
            payload = payload.strip()
            if not payload:
                errors.append(f"{rel}: empty JSON-LD block #{i}")
                continue
            try:
                json.loads(payload)
            except json.JSONDecodeError as e:
                errors.append(f"{rel}: invalid JSON-LD block #{i}: {e.msg} at line {e.lineno} col {e.colno}")

        for audio in AUDIO_TAG_RE.findall(html):
            preload = attr_value(audio, "preload")
            if preload != "none":
                errors.append(f"{rel}: audio must use preload=\"none\" for performance (found {preload!r})")

        for href in HREF_RE.findall(html):
            if not internal_target_exists(href, path):
                errors.append(f"{rel}: broken internal link -> {href}")

    sitemap_path = ROOT / "sitemap.xml"
    if not sitemap_path.exists():
        errors.append("/sitemap.xml: missing")
        sitemap_urls = set()
    else:
        try:
            tree = ET.parse(sitemap_path)
            ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            sitemap_urls = {
                (node.text or "").strip().replace(DOMAIN, "", 1) or "/"
                for node in tree.findall(".//s:loc", ns)
                if (node.text or "").strip().startswith(DOMAIN)
            }
        except ET.ParseError as e:
            errors.append(f"/sitemap.xml: invalid XML: {e}")
            sitemap_urls = set()

    missing = sorted(indexable_urls - sitemap_urls)
    extra = sorted(sitemap_urls - indexable_urls)
    for u in missing:
        errors.append(f"sitemap.xml missing indexable page: {u}")
    for u in extra:
        warnings.append(f"sitemap.xml contains URL without matching HTML page: {u}")

    robots_path = ROOT / "robots.txt"
    if not robots_path.exists():
        errors.append("/robots.txt: missing")
    else:
        robots_txt = robots_path.read_text(encoding="utf-8", errors="replace")
        if "Sitemap: https://sakinaquran.net/sitemap.xml" not in robots_txt:
            errors.append("/robots.txt: sitemap directive missing or incorrect")
        if re.search(r"(?im)^\s*Disallow:\s*/\s*$", robots_txt):
            errors.append("/robots.txt: entire site is disallowed")

    print(f"Checked {len(pages)} HTML pages")
    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if errors:
        print(f"SEO QA failed: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"SEO QA passed: {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
