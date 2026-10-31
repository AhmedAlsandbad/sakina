#!/usr/bin/env python3
"""Validate singleton and media structured data on indexable HTML pages."""
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
AUDIO_SRC_RE = re.compile(r'<audio\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I | re.S)
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


def top_level_entities(data):
    """Yield independently declared entities, excluding nested references."""
    if isinstance(data, dict) and isinstance(data.get("@graph"), list):
        yield from (x for x in data["@graph"] if isinstance(x, dict))
    elif isinstance(data, dict):
        yield data
    elif isinstance(data, list):
        yield from (x for x in data if isinstance(x, dict))


def entity_has_type(entity, wanted: str) -> bool:
    return wanted in type_names(entity)


def ref_ids(value) -> set[str]:
    if not isinstance(value, list):
        value = [value]
    out = set()
    for item in value:
        if isinstance(item, dict) and isinstance(item.get("@id"), str):
            out.add(item["@id"])
    return out


def is_surah_detail(path: Path) -> bool:
    parts = path.relative_to(ROOT).parts
    return len(parts) == 3 and parts[0] == "surahs" and parts[2] == "index.html"


def is_reciter_surah_detail(path: Path) -> bool:
    parts = path.relative_to(ROOT).parts
    return len(parts) == 4 and parts[0] == "reciters" and parts[3] == "index.html"


def validate_audio_page(rel: str, html: str, entities: list[dict], errors: list[str], *, require_creator: bool) -> None:
    visible_audio = AUDIO_SRC_RE.findall(html)
    if not visible_audio:
        errors.append(f"{rel}: expected at least one visible audio player")
        return

    visible_sources = set(visible_audio)
    audio_entities = [e for e in entities if entity_has_type(e, "AudioObject")]
    schema_sources = {
        e.get("contentUrl") for e in audio_entities if isinstance(e.get("contentUrl"), str)
    }

    if len(visible_audio) != len(visible_sources):
        errors.append(f"{rel}: duplicate visible audio source URL")
    if schema_sources != visible_sources or len(audio_entities) != len(visible_audio):
        errors.append(f"{rel}: AudioObject contentUrl set/count does not exactly match visible audio players")

    audio_ids = [e.get("@id") for e in audio_entities if isinstance(e.get("@id"), str)]
    if len(audio_ids) != len(audio_entities) or len(set(audio_ids)) != len(audio_entities):
        errors.append(f"{rel}: every AudioObject must have a unique @id")

    webpage_entities = [e for e in entities if entity_has_type(e, "WebPage")]
    if len(webpage_entities) != 1:
        errors.append(f"{rel}: expected exactly one WebPage entity for static audio page")
        return

    webpage = webpage_entities[0]
    webpage_id = webpage.get("@id")
    if not isinstance(webpage_id, str) or not webpage_id:
        errors.append(f"{rel}: WebPage with static audio must have @id")
        webpage_id = None

    if ref_ids(webpage.get("audio")) != set(audio_ids):
        errors.append(f"{rel}: WebPage audio references do not match AudioObject @ids")

    for entity in audio_entities:
        if entity.get("encodingFormat") != "audio/mpeg":
            errors.append(f"{rel}: AudioObject must declare encodingFormat audio/mpeg")
        if entity.get("inLanguage") != "ar":
            errors.append(f"{rel}: AudioObject must declare inLanguage ar")
        expected_parent = {webpage_id} if isinstance(webpage_id, str) else set()
        if ref_ids(entity.get("isPartOf")) != expected_parent:
            errors.append(f"{rel}: AudioObject isPartOf must reference its WebPage")
        if require_creator:
            creator = entity.get("creator")
            if not (
                isinstance(creator, dict)
                and entity_has_type(creator, "Person")
                and isinstance(creator.get("name"), str)
                and creator.get("name").strip()
            ):
                errors.append(f"{rel}: AudioObject must declare a non-empty Person creator")


def main() -> int:
    errors = []
    checked = 0
    surah_media_checked = 0
    reciter_surah_checked = 0

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
        entities = []
        for payload in LD_JSON_RE.findall(html):
            try:
                data = json.loads(payload.strip())
            except json.JSONDecodeError:
                # Main SEO QA reports malformed JSON-LD.
                continue
            entities.extend(top_level_entities(data))

        counts = Counter()
        for entity in entities:
            counts.update(type_names(entity))

        rel = "/" + path.relative_to(ROOT).as_posix()
        for schema_type in sorted(SINGLETON_TYPES):
            if counts[schema_type] > 1:
                errors.append(f"{rel}: duplicate {schema_type} schema ({counts[schema_type]} instances)")

        if is_surah_detail(path) and AUDIO_SRC_RE.search(html):
            surah_media_checked += 1
            validate_audio_page(rel, html, entities, errors, require_creator=False)
        elif is_reciter_surah_detail(path):
            reciter_surah_checked += 1
            validate_audio_page(rel, html, entities, errors, require_creator=True)

    print(f"Checked structured data on {checked} indexable HTML pages")
    print(
        f"Checked audio/schema parity on {surah_media_checked} surah detail page(s) "
        f"and {reciter_surah_checked} reciter-surah page(s)"
    )
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        print(f"Structured-data QA failed: {len(errors)} issue(s)")
        return 1
    print("Structured-data QA passed: singleton and audio schemas are consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
