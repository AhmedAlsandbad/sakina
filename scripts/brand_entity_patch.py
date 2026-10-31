#!/usr/bin/env python3
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

creator = {
    "@type": "Person",
    "@id": "https://sakinaquran.net/#creator",
    "name": "Ahmed Gamal",
    "url": "https://www.linkedin.com/in/ahmeddakhly/",
    "sameAs": [
        "https://www.facebook.com/Ahmed.Alsandbad7",
        "https://www.instagram.com/ahmedalsandbad",
        "https://www.linkedin.com/in/ahmeddakhly/",
        "https://twitter.com/AhmedAlsandbad",
        "https://www.tiktok.com/@ahmed.alsandbad7"
    ]
}

website = {
    "@type": "WebSite",
    "@id": "https://sakinaquran.net/#website",
    "url": "https://sakinaquran.net/",
    "name": "سكينة قرآن",
    "alternateName": ["سكينة", "Sakina Quran", "SakinaQuran"],
    "inLanguage": "ar",
    "description": "موقع عربي مجاني للاستماع إلى القرآن الكريم وإذاعات القرآن والمصحف والرقية الشرعية والأذكار ومواقيت الصلاة.",
    "image": {"@id": "https://sakinaquran.net/#logo"},
    "creator": {"@id": "https://sakinaquran.net/#creator"},
    "publisher": {"@id": "https://sakinaquran.net/#creator"},
    "about": [
        {"@type": "Thing", "name": "القرآن الكريم"},
        {"@type": "Thing", "name": "إذاعة القرآن الكريم"},
        {"@type": "Thing", "name": "الرقية الشرعية"},
        {"@type": "Thing", "name": "الأذكار"},
        {"@type": "Thing", "name": "مواقيت الصلاة"}
    ]
}

logo = {
    "@type": "ImageObject",
    "@id": "https://sakinaquran.net/#logo",
    "url": "https://sakinaquran.net/icon-512.png",
    "contentUrl": "https://sakinaquran.net/icon-512.png"
}


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def patch_home():
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")

    graph = {"@context": "https://schema.org", "@graph": [website, logo, creator]}
    new_schema = f'<script type="application/ld+json">{compact(graph)}</script>'
    text, n = re.subn(
        r'<script type="application/ld\+json">.*?</script>',
        new_schema,
        text,
        count=1,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("Could not replace homepage JSON-LD")

    marker = '    <div class="sh"><h2>إذاعات القرآن الكريم</h2><p>بث مباشر على مدار الساعة</p></div>'
    if 'id="brandIntroTitle"' not in text:
        block = '''    <section class="brand-intro" aria-labelledby="brandIntroTitle">\n      <div class="sh"><h2 id="brandIntroTitle">سكينة قرآن</h2><p>القرآن الكريم والاستماع والإذاعات والأذكار في مكان واحد</p></div>\n      <p class="hint">سكينة قرآن موقع عربي مجاني يسهّل الوصول إلى المصحف والتلاوات بأصوات القرّاء، وإذاعات القرآن المباشرة، والرقية الشرعية، والأذكار ومواقيت الصلاة.</p>\n      <div class="chips" aria-label="روابط سكينة قرآن">\n        <a class="chip" href="/quran/">المصحف</a><a class="chip" href="/reciters/">القرّاء</a><a class="chip" href="/surahs/">السور</a><a class="chip" href="/radio/">الإذاعات</a><a class="chip" href="/adhkar/">الأذكار</a><a class="chip" href="/about/">عن سكينة</a>\n      </div>\n    </section>\n\n'''
        if marker not in text:
            raise SystemExit("Homepage insertion marker not found")
        text = text.replace(marker, block + marker, 1)

    path.write_text(text, encoding="utf-8")


def patch_about():
    path = ROOT / "about/index.html"
    text = path.read_text(encoding="utf-8")

    about_page = {
        "@type": "AboutPage",
        "@id": "https://sakinaquran.net/about/#webpage",
        "name": "عن سكينة قرآن",
        "url": "https://sakinaquran.net/about/",
        "inLanguage": "ar",
        "isPartOf": {"@id": "https://sakinaquran.net/#website"},
        "about": {"@id": "https://sakinaquran.net/#website"},
        "mainEntity": {"@id": "https://sakinaquran.net/#website"}
    }
    crumbs = {
        "@type": "BreadcrumbList",
        "@id": "https://sakinaquran.net/about/#breadcrumb",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "سكينة قرآن", "item": "https://sakinaquran.net/"},
            {"@type": "ListItem", "position": 2, "name": "عن سكينة", "item": "https://sakinaquran.net/about/"}
        ]
    }
    graph = {"@context": "https://schema.org", "@graph": [website, logo, creator, about_page, crumbs]}
    replacement = f'<script type="application/ld+json">{compact(graph)}</script>'

    pattern = (
        r'<script type="application/ld\+json">.*?</script>\s*'
        r'<script type="application/ld\+json" id="crumbs-ld">.*?</script>'
    )
    text, n = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if n != 1:
        # Already patched: replace the first JSON-LD graph only.
        text, n = re.subn(
            r'<script type="application/ld\+json">.*?</script>',
            replacement,
            text,
            count=1,
            flags=re.S,
        )
        if n != 1:
            raise SystemExit("Could not replace about JSON-LD")

    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    patch_home()
    patch_about()
    print("Brand/entity patch applied")
