#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "surahs" / "al-baqarah" / "index.html"
PAGE = "https://sakinaquran.net/surahs/al-baqarah/"
WEBPAGE_ID = PAGE + "#webpage"

AUDIOS = [
    ("abdulbasit", "سورة البقرة بصوت عبدالباسط عبدالصمد", "عبدالباسط عبدالصمد", "https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r3/002.mp3"),
    ("husary", "سورة البقرة بصوت محمود خليل الحصري", "محمود خليل الحصري", "https://cdn.mp3quran.net/audio/mahmoud-husary/r1/002.mp3"),
    ("minshawi", "سورة البقرة بصوت محمد صديق المنشاوي", "محمد صديق المنشاوي", "https://cdn.mp3quran.net/audio/muhammad-minshawi/r1/002.mp3"),
    ("alafasy", "سورة البقرة بصوت مشاري راشد العفاسي", "مشاري راشد العفاسي", "https://cdn.mp3quran.net/audio/mishary-alafasy/r1/002.mp3"),
    ("muaiqly", "سورة البقرة بصوت ماهر المعيقلي", "ماهر المعيقلي", "https://cdn.mp3quran.net/audio/maher-muaiqly/r1/002.mp3"),
]

LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
AUDIO_SRC_RE = re.compile(r'<audio\b[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>', re.I | re.S)


def main() -> int:
    html = PATH.read_text(encoding="utf-8")
    m = LD_RE.search(html)
    if not m:
        raise SystemExit("No JSON-LD block found")

    data = json.loads(m.group(1).strip())
    graph = data.get("@graph")
    if not isinstance(graph, list):
        raise SystemExit("Expected @graph in primary JSON-LD")

    visible_sources = set(AUDIO_SRC_RE.findall(html))
    expected_sources = {row[3] for row in AUDIOS}
    if visible_sources != expected_sources:
        missing = sorted(expected_sources - visible_sources)
        extra = sorted(visible_sources - expected_sources)
        raise SystemExit(f"Visible audio mismatch; missing={missing}, extra={extra}")

    webpage = next((x for x in graph if isinstance(x, dict) and x.get("@type") == "WebPage"), None)
    if not webpage:
        raise SystemExit("WebPage entity not found")
    webpage["@id"] = WEBPAGE_ID
    webpage["audio"] = [{"@id": f"{PAGE}#audio-{slug}"} for slug, *_ in AUDIOS]

    graph[:] = [x for x in graph if not (isinstance(x, dict) and x.get("@type") == "AudioObject")]
    for slug, name, reciter, content_url in AUDIOS:
        graph.append({
            "@type": "AudioObject",
            "@id": f"{PAGE}#audio-{slug}",
            "name": name,
            "contentUrl": content_url,
            "encodingFormat": "audio/mpeg",
            "inLanguage": "ar",
            "creator": {"@type": "Person", "name": reciter},
            "isPartOf": {"@id": WEBPAGE_ID},
        })

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    updated = html[:m.start(1)] + payload + html[m.end(1):]
    if updated == html:
        print("No changes needed")
        return 0
    PATH.write_text(updated, encoding="utf-8")
    print("Added 5 AudioObject entities to سورة البقرة")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
