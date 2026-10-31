#!/usr/bin/env python3
"""Normalize AudioObject/WebPage relations on existing reciter×surah pages.

Supports legacy JSON-LD shapes by preserving all independently declared entities,
merging them into one @graph, and adding only the missing WebPage/AudioObject links.
No file is written unless every target page passes source-parity validation first.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECITERS = ROOT / "reciters"
LD_SCRIPT_RE = re.compile(
    r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>.*?</script>',
    re.I | re.S,
)
LD_PAYLOAD_RE = re.compile(
    r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.I | re.S,
)
AUDIO_RE = re.compile(r'<audio\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I | re.S)
CANON_RE = re.compile(
    r'<link\s+[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']|'
    r'<link\s+[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']',
    re.I | re.S,
)
H1_RE = re.compile(r'<h1\b[^>]*>(.*?)</h1>', re.I | re.S)


def first_group(match):
    if not match:
        return None
    return next((g.strip() for g in match.groups() if g is not None), None)


def entity_types(entity):
    if not isinstance(entity, dict):
        return []
    t = entity.get("@type")
    if isinstance(t, str):
        return [t]
    if isinstance(t, list):
        return [x for x in t if isinstance(x, str)]
    return []


def flatten_entities(data):
    """Preserve top-level entities while removing redundant nested @context values."""
    if isinstance(data, dict) and isinstance(data.get("@graph"), list):
        raw = data["@graph"]
    elif isinstance(data, dict):
        raw = [data]
    elif isinstance(data, list):
        raw = data
    else:
        return []

    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        entity = dict(item)
        entity.pop("@context", None)
        out.append(entity)
    return out


def text_only(fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", fragment)).strip()


def infer_reciter(html: str, rel_parts, audio_name: str) -> str:
    for candidate in [audio_name, text_only(H1_RE.search(html).group(1)) if H1_RE.search(html) else ""]:
        if "بصوت" in candidate:
            value = candidate.split("بصوت", 1)[1].strip()
            value = re.sub(r"\s+كاملة.*$", "", value).strip()
            if value:
                return value

    reciter_slug = rel_parts[1]
    m = re.search(
        rf'<a\b[^>]*href=["\']/reciters/{re.escape(reciter_slug)}/["\'][^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    )
    return text_only(m.group(1)) if m else ""


def main() -> int:
    errors: list[str] = []
    plans: list[tuple[Path, str]] = []
    targets = sorted(RECITERS.glob("*/*/index.html"))

    for path in targets:
        rel = path.relative_to(ROOT).as_posix()
        rel_parts = path.relative_to(ROOT).parts
        html = path.read_text(encoding="utf-8")
        visible = AUDIO_RE.findall(html)
        if len(visible) != 1:
            errors.append(f"{rel}: expected exactly one visible audio player, found {len(visible)}")
            continue

        canonical = first_group(CANON_RE.search(html))
        if not canonical or not canonical.startswith("https://sakinaquran.net/reciters/"):
            errors.append(f"{rel}: missing/invalid canonical")
            continue
        page_url = canonical if canonical.endswith("/") else canonical + "/"

        scripts = list(LD_SCRIPT_RE.finditer(html))
        if not scripts:
            errors.append(f"{rel}: missing JSON-LD")
            continue

        entities = []
        bad_json = False
        for script in scripts:
            pm = LD_PAYLOAD_RE.fullmatch(script.group(0))
            if not pm:
                errors.append(f"{rel}: could not parse JSON-LD script wrapper")
                bad_json = True
                break
            try:
                entities.extend(flatten_entities(json.loads(pm.group(1).strip())))
            except json.JSONDecodeError as exc:
                errors.append(f"{rel}: invalid JSON-LD: {exc}")
                bad_json = True
                break
        if bad_json:
            continue

        webpages = [x for x in entities if "WebPage" in entity_types(x)]
        audios = [x for x in entities if "AudioObject" in entity_types(x)]
        if len(webpages) > 1:
            errors.append(f"{rel}: multiple WebPage entities ({len(webpages)})")
            continue
        if len(audios) > 1:
            errors.append(f"{rel}: multiple AudioObject entities ({len(audios)})")
            continue

        h1_match = H1_RE.search(html)
        h1 = text_only(h1_match.group(1)) if h1_match else "تلاوة القرآن الكريم"

        if audios:
            audio = audios[0]
            if audio.get("contentUrl") != visible[0]:
                errors.append(f"{rel}: AudioObject contentUrl does not match visible audio src")
                continue
        else:
            audio = {
                "@type": "AudioObject",
                "name": h1,
                "contentUrl": visible[0],
            }
            entities.append(audio)

        if webpages:
            webpage = webpages[0]
            current_url = webpage.get("url")
            if current_url and current_url.rstrip("/") != page_url.rstrip("/"):
                errors.append(f"{rel}: WebPage URL does not match canonical")
                continue
        else:
            webpage = {
                "@type": "WebPage",
                "name": h1,
                "url": page_url,
                "inLanguage": "ar",
                "isPartOf": {"@type": "WebSite", "name": "سكينة قرآن", "url": "https://sakinaquran.net/"},
            }
            entities.insert(0, webpage)

        audio_name = audio.get("name") if isinstance(audio.get("name"), str) else h1
        reciter = infer_reciter(html, rel_parts, audio_name)
        if not reciter:
            errors.append(f"{rel}: could not infer visible reciter name")
            continue

        webpage_id = page_url + "#webpage"
        audio_id = page_url + "#audio"
        webpage["@id"] = webpage_id
        webpage["url"] = page_url
        webpage.setdefault("inLanguage", "ar")
        webpage.setdefault("isPartOf", {"@type": "WebSite", "name": "سكينة قرآن", "url": "https://sakinaquran.net/"})
        webpage["audio"] = {"@id": audio_id}

        audio["@id"] = audio_id
        audio["contentUrl"] = visible[0]
        audio["encodingFormat"] = "audio/mpeg"
        audio["inLanguage"] = "ar"
        audio["creator"] = {"@type": "Person", "name": reciter}
        audio["isPartOf"] = {"@id": webpage_id}

        normalized = {"@context": "https://schema.org", "@graph": entities}
        new_script = '<script type="application/ld+json">' + json.dumps(
            normalized, ensure_ascii=False, separators=(",", ":")
        ) + "</script>"

        updated = html
        for i, script in reversed(list(enumerate(scripts))):
            replacement = new_script if i == 0 else ""
            updated = updated[:script.start()] + replacement + updated[script.end():]
        plans.append((path, updated))

    print(f"Validated {len(targets)} reciter-surah page(s)")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print("No files written because validation failed")
        return 1

    changed = 0
    for path, updated in plans:
        original = path.read_text(encoding="utf-8")
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(path.relative_to(ROOT).as_posix())
    print(f"Normalized {changed}/{len(targets)} reciter-surah page(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
