#!/usr/bin/env python3
"""Add AudioObject entities to existing surah pages that expose static audio players."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SURAH_ROOT = ROOT / "surahs"
LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
CARD_AUDIO_RE = re.compile(
    r'<div class="card">\s*<a href="(?P<href>[^"]+)">\s*<b>(?P<label>.*?)</b>\s*</a>\s*<audio\b[^>]*\bsrc="(?P<src>[^"]+)"[^>]*>\s*</audio>\s*</div>',
    re.I | re.S,
)
RECITER_SLUG_RE = re.compile(r'^/reciters/([^/]+)/')


def top_level_audio_objects(graph):
    return [x for x in graph if isinstance(x, dict) and x.get("@type") == "AudioObject"]


def main() -> int:
    changed = []
    verified_existing = []
    errors = []

    for path in sorted(SURAH_ROOT.glob("*/index.html")):
        html = path.read_text(encoding="utf-8")
        cards = list(CARD_AUDIO_RE.finditer(html))
        if not cards:
            continue

        m = LD_RE.search(html)
        if not m:
            errors.append(f"{path.relative_to(ROOT)}: missing JSON-LD")
            continue
        try:
            data = json.loads(m.group(1).strip())
        except json.JSONDecodeError as exc:
            errors.append(f"{path.relative_to(ROOT)}: invalid JSON-LD: {exc}")
            continue
        graph = data.get("@graph")
        if not isinstance(graph, list):
            errors.append(f"{path.relative_to(ROOT)}: missing @graph")
            continue

        webpage = next((x for x in graph if isinstance(x, dict) and x.get("@type") == "WebPage"), None)
        if not webpage:
            errors.append(f"{path.relative_to(ROOT)}: missing WebPage entity")
            continue
        page_url = webpage.get("url")
        if not isinstance(page_url, str) or not page_url.startswith("https://sakinaquran.net/surahs/"):
            errors.append(f"{path.relative_to(ROOT)}: invalid WebPage URL")
            continue
        if not page_url.endswith("/"):
            page_url += "/"

        visible_sources = {card.group("src").strip() for card in cards}
        existing = top_level_audio_objects(graph)
        existing_sources = {x.get("contentUrl") for x in existing if isinstance(x.get("contentUrl"), str)}
        if existing:
            if existing_sources == visible_sources and len(existing) == len(cards):
                verified_existing.append(path.relative_to(ROOT).as_posix())
                continue
            errors.append(
                f"{path.relative_to(ROOT)}: existing AudioObject sources do not exactly match visible players"
            )
            continue

        about = webpage.get("about") if isinstance(webpage.get("about"), dict) else {}
        surah_name = about.get("name") if isinstance(about.get("name"), str) else webpage.get("name", "السورة")
        surah_name = re.sub(r'\s+كاملة.*$', '', surah_name).strip()
        webpage_id = page_url + "#webpage"
        webpage["@id"] = webpage_id
        refs = []
        new_objects = []

        seen_ids = set()
        for idx, card in enumerate(cards, start=1):
            href = card.group("href").strip()
            label = re.sub(r'<[^>]+>', '', card.group("label")).strip()
            src = card.group("src").strip()
            slug_match = RECITER_SLUG_RE.match(href)
            slug = slug_match.group(1) if slug_match else f"reader-{idx}"
            audio_id = page_url + f"#audio-{slug}"
            if audio_id in seen_ids:
                audio_id = page_url + f"#audio-{slug}-{idx}"
            seen_ids.add(audio_id)

            if "بصوت" in label:
                reciter = label.split("بصوت", 1)[1].strip()
                audio_name = label
            else:
                reciter = label
                audio_name = f"{surah_name} بصوت {reciter}"

            refs.append({"@id": audio_id})
            new_objects.append({
                "@type": "AudioObject",
                "@id": audio_id,
                "name": audio_name,
                "contentUrl": src,
                "encodingFormat": "audio/mpeg",
                "inLanguage": "ar",
                "creator": {"@type": "Person", "name": reciter},
                "isPartOf": {"@id": webpage_id},
            })

        webpage["audio"] = refs
        graph.extend(new_objects)
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        updated = html[:m.start(1)] + payload + html[m.end(1):]
        path.write_text(updated, encoding="utf-8")
        changed.append(path.relative_to(ROOT).as_posix())

    print(f"Added audio schema to {len(changed)} surah page(s)")
    for item in changed:
        print(item)
    print(f"Verified {len(verified_existing)} already-complete surah page(s)")
    for item in verified_existing:
        print(f"verified: {item}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
