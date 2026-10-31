#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "radio" / "cairo" / "index.html"
URL = "https://sakinaquran.net/radio/cairo/"


def main() -> int:
    html = PATH.read_text(encoding="utf-8")
    original = html

    # Remove a non-HTML editorial note accidentally left as raw text in <head>.
    html = html.replace(" Source reference kept non-visible for editorial verification. ", "")

    # Keep only the BreadcrumbList already present in the main @graph.
    html = re.sub(
        r'\n*<script\s+type="application/ld\+json"\s+id="crumbs-ld">.*?</script>\n*',
        "\n",
        html,
        count=1,
        flags=re.S,
    )

    # Strengthen the snippet around the two intents users combine: live stream + FM frequency.
    html = html.replace(
        'content="استمع إلى إذاعة القرآن الكريم مصر من القاهرة بث مباشر 24 ساعة عبر سكينة قرآن، مع معلومات عن البرامج والتلاوات والقراء."',
        'content="استمع إلى إذاعة القرآن الكريم من القاهرة بث مباشر عبر سكينة قرآن، واعرف تردد القاهرة الكبرى 98.2 FM مع معلومات عن البرامج والتلاوات."',
        1,
    )

    # Add one concise, visible frequency answer before the schedule section.
    schedule = '<section class="box"><h2>جدول إذاعة القرآن الكريم من القاهرة اليوم</h2>'
    frequency_section = (
        '<section class="box"><h2>تردد إذاعة القرآن الكريم في القاهرة</h2>'
        '<p>يمكن استقبال إذاعة القرآن الكريم في القاهرة الكبرى على تردد <b dir="ltr">98.2 FM</b>. '
        'أما للاستماع عبر الإنترنت، فاستخدم مشغل البث المباشر أعلى الصفحة دون الحاجة إلى ضبط تردد الراديو.</p></section>'
    )
    if "تردد إذاعة القرآن الكريم في القاهرة</h2>" not in html:
        html = html.replace(schedule, frequency_section + schedule, 1)

    # Add the matching visible FAQ answer.
    faq_anchor = '<h3>هل يوجد جدول يومي ثابت؟</h3>'
    freq_faq = (
        '<h3>ما تردد إذاعة القرآن الكريم في القاهرة؟</h3>'
        '<p>تردد إذاعة القرآن الكريم في القاهرة الكبرى هو <b dir="ltr">98.2 FM</b>. ويمكنك أيضًا الاستماع مباشرة عبر الإنترنت من المشغل أعلى الصفحة.</p>'
    )
    if "ما تردد إذاعة القرآن الكريم في القاهرة؟</h3>" not in html:
        html = html.replace(faq_anchor, freq_faq + faq_anchor, 1)

    # Add the same answer to FAQPage JSON-LD so structured data matches visible content.
    blocks = list(re.finditer(r'<script type="application/ld\+json">(.*?)</script>', html, re.S))
    if blocks:
        first = blocks[0]
        try:
            data = json.loads(first.group(1))
            graph = data.get("@graph", []) if isinstance(data, dict) else []
            for node in graph:
                if isinstance(node, dict) and node.get("@type") == "FAQPage":
                    entities = node.setdefault("mainEntity", [])
                    q = "ما تردد إذاعة القرآن الكريم في القاهرة؟"
                    if not any(isinstance(x, dict) and x.get("name") == q for x in entities):
                        entities.append({
                            "@type": "Question",
                            "name": q,
                            "acceptedAnswer": {
                                "@type": "Answer",
                                "text": "تردد إذاعة القرآن الكريم في القاهرة الكبرى هو 98.2 FM، ويمكن الاستماع أيضًا إلى البث المباشر عبر الإنترنت من المشغل في الصفحة."
                            }
                        })
                    break
            payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            html = html[:first.start(1)] + payload + html[first.end(1):]
        except json.JSONDecodeError:
            raise SystemExit("Primary JSON-LD block is invalid; refusing to edit")

    # Improve contextual links between the main radio station pages.
    old_related = '<a href="/radio/sharjah/">إذاعة الشارقة</a><a href="/quran/">القرآن الكريم</a>'
    new_related = '<a href="/radio/sharjah/">إذاعة الشارقة</a><a href="/radio/riyadh/">إذاعة القرآن السعودية</a><a href="/radio/makkah/">إذاعة مكة</a><a href="/quran/">القرآن الكريم</a>'
    html = html.replace(old_related, new_related, 1)

    if html == original:
        print("No Cairo radio changes needed")
        return 0

    PATH.write_text(html, encoding="utf-8")
    print(f"Optimized {PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
