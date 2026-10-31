#!/usr/bin/env python3
"""Normalize AudioObject/WebPage relations on existing reciter×surah pages."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECITERS = ROOT / "reciters"
LD_RE = re.compile(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
AUDIO_RE = re.compile(r'<audio\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I | re.S)


def entity_types(entity):
    if not isinstance(entity, dict):
        return []
    t = entity.get("@type")
    if isinstance(t, str):
        return [t]
    if isinstance(t, list):
        return [x for x in t if isinstance(x, str)]
    return []


def main() -> int:
    changed = []
    verified = []
    errors = []

    for path in sorted(RECITERS.glob("*/*/index.html")):
        rel = path.relative_to(ROOT).as_posix()
        html = path.read_text(encoding="utf-8")
        visible = AUDIO_RE.findall(html)
        if len(visible) != 1:
            errors.append(f"{rel}: expected exactly one visible audio player, found {len(visible)}")
            continue

        m = LD_RE.search(html)
        if not m:
            errors.append(f"{rel}: missing JSON-LD")
            continue
        try:
            data = json.loads(m.group(1).strip())
        except json.JSONDecodeError as exc:
            errors.append(f"{rel}: invalid JSON-LD: {exc}")
            continue

        graph = data.get("@graph") if isinstance(data, dict) else None
        if not isinstance(graph, list):
            errors.append(f"{rel}: primary JSON-LD must use @graph")
            continue

        webpages = [x for x in graph if isinstance(x, dict) and "WebPage" in entity_types(x)]
        audios = [x for x in graph if isinstance(x, dict) and "AudioObject" in entity_types(x)]
        if len(webpages) != 1 or len(audios) != 1:
            errors.append(f"{rel}: expected one WebPage and one AudioObject, found {len(webpages)}/{len(audios)}")
            continue

        webpage, audio = webpages[0], audios[0]
        page_url = webpage.get("url")
        if not isinstance(page_url, str) or not page_url.startswith("https://sakinaquran.net/reciters/"):
            errors.append(f"{rel}: invalid WebPage URL")
            continue
        if not page_url.endswith("/"):
            page_url += "/"

        if audio.get("contentUrl") != visible[0]:
            errors.append(f"{rel}: AudioObject contentUrl does not match visible audio src")
            continue

        webpage_id = page_url + "#webpage"
        audio_id = page_url + "#audio"
        audio_name = audio.get("name") if isinstance(audio.get("name"), str) else webpage.get("name", "تلاوة القرآن الكريم")
        reciter = ""
        if isinstance(audio_name, str) and "بصوت" in audio_name:
            reciter = audio_name.split("بصوت", 1)[1].strip()
        if not reciter:
            h1 = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.I | re.S)
            h1_text = re.sub(r'<[^>]+>', '', h1.group(1)).strip() if h1 else ""
            if "بصوت" in h1_text:
                reciter = h1_text.split("بصوت", 1)[1].strip()
        if not reciter:
            errors.append(f"{rel}: could not infer visible reciter name")
            continue

        desired = {
            "webpage_id": webpage_id,
            "audio_id": audio_id,
            "encoding": "audio/mpeg",
            "language": "ar",
            "creator": reciter,
        }
        already = (
            webpage.get("@id") == webpage_id
            and webpage.get("audio") == {"@id": audio_id}
            and audio.get("@id") == audio_id
            and audio.get("encodingFormat") == "audio/mpeg"
            and audio.get("inLanguage") == "ar"
            and audio.get("creator") == {"@type": "Person", "name": reciter}
            and audio.get("isPartOf") == {"@id": webpage_id}
        )
        if already:
            verified.append(rel)
            continue

        webpage["@id"] = desired["webpage_id"]
        webpage["audio"] = {"@id": desired["audio_id"]}
        audio["@id"] = desired["audio_id"]
        audio["encodingFormat"] = desired["encoding"]
        audio["inLanguage"] = desired["language"]
        audio["creator"] = {"@type": "Person", "name": desired["creator"]}
        audio["isPartOf"] = {"@id": desired["webpage_id"]}

        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        updated = html[:m.start(1)] + payload + html[m.end(1):]
        path.write_text(updated, encoding="utf-8")
        changed.append(rel)

    print(f"Normalized {len(changed)} reciter-surah page(s)")
    for item in changed:
        print(item)
    print(f"Verified {len(verified)} already-normalized page(s)")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
