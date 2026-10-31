#!/usr/bin/env python3
"""Wrap every content page (all *.html except the app's index.html) in the Sakina site shell.

Keeps each page's own <head> SEO tags, JSON-LD, headings, text and links. Adds the shared
header, breadcrumbs (+ BreadcrumbList schema), styled players, an open-in-app card and the
shared footer copied from index.html. Safe to re-run: pages already wrapped are rebuilt from
their original content.

Usage:  python3 tools/build_pages.py   (run from the repo root)
"""
import json, re, sys
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://sakinaquran.net"
CSS_V = "38"     # styles.css version used by index.html
SEO_V = "3"      # bump when seo.css / seo.js change

SECTION = {
    "quran": "القرآن الكريم", "reciters": "القرّاء", "surahs": "السور", "radio": "الإذاعات",
    "adhkar": "الأذكار", "prayer-times": "مواقيت الصلاة", "ruqyah": "الرقية الشرعية",
    "about": "عن سكينة", "editorial-policy": "سياسة المحتوى", "sitemap": "دليل الموقع",
}
APP_LINK = {  # section -> (hash in the app, call-to-action text)
    "quran": ("#quran", "المصحف كامل بأكثر من ٢٠٠ قارئ، مع تشغيل متواصل ومؤقت نوم"),
    "reciters": ("#quran", "كل سور المصحف بصوت القارئ، مع تشغيل متواصل ومؤقت نوم"),
    "surahs": ("#quran", "اختر أي قارئ واستمع للسورة مع تشغيل متواصل ومؤقت نوم"),
    "radio": ("#radio", "كل الإذاعات في مكان واحد، مع مؤقت نوم وتحكم من شاشة القفل"),
    "ruqyah": ("#ruqyah", "الرقية كاملة مع التكرار وتكرار المعوذات ثلاثًا"),
    "adhkar": ("#adhkar", "عدّاد لكل ذكر يحفظ تقدمك طوال اليوم"),
    "prayer-times": ("#prayer", "عدّ تنازلي للصلاة القادمة في مدينتك"),
}

index_html = (ROOT / "index.html").read_text(encoding="utf-8")
FOOTER = re.search(r"<footer>.*?</footer>", index_html, re.S).group(0)
BOTTOM_NAV = re.search(r'<nav class="tabs-bottom".*?</nav>', index_html, re.S).group(0).replace('href="#', 'href="/#')

HEADER = f'''<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="سكينة قرآن، الصفحة الرئيسية"><span>سكينة</span><img src="/sakina-logo.svg?v={CSS_V}" alt="" width="52" height="52"></a>
  <nav class="tabs-top" aria-label="الأقسام">
    <a href="/#radio">الإذاعات</a><a href="/quran/">المصحف</a><a href="/reciters/">القرّاء</a><a href="/ruqyah/">الرقية</a><a href="/adhkar/">الأذكار</a><a href="/prayer-times/">الصلاة</a>
  </nav>
  <div class="hd">
    <a class="chip primary" href="/#radio" style="text-decoration:none">افتح سكينة</a>
    <button class="icon-btn" id="themeBtn" aria-label="تبديل الوضع الليلي والنهاري"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
  </div>
</div></header>'''

HEAD_ADD = f'''<meta name="theme-color" content="#071512">
<link rel="icon" href="/icon.svg?v={CSS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png?v={CSS_V}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@700&family=Readex+Pro:wght@400;500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap" media="print" onload="this.media='all'">
{{quran_font}}<link rel="stylesheet" href="/styles.css?v={CSS_V}">
<link rel="stylesheet" href="/seo.css?v={SEO_V}">
<script>try{{var t=localStorage.getItem("sakina:theme");if(t)document.documentElement.dataset.theme=JSON.parse(t)}}catch(e){{}}</script>'''
QURAN_FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap">\n'

def url_of(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    if rel == "404.html": return "/404.html"
    return "/" + rel[: -len("index.html")]

def page_title(href: str) -> str:
    f = ROOT / href.strip("/") / "index.html"
    if not f.exists(): return ""
    d = BeautifulSoup(f.read_text(encoding="utf-8"), "html.parser")
    h1 = d.find("h1")
    return h1.get_text(" ", strip=True) if h1 else ""

def crumb_name(href: str, links: dict, i: int, segs: list) -> str:
    if href in links: return links[href]
    if i == 0: return SECTION.get(segs[0], segs[0])
    # leaf of /reciters/x/<surah>/ -> the surah's own name
    if segs[0] == "reciters" and i == 2 and f"/surahs/{segs[2]}/" in links: return links[f"/surahs/{segs[2]}/"]
    t = page_title(href)
    return t or segs[i]

def build(path: Path):
    html = path.read_text(encoding="utf-8")
    d = BeautifulSoup(html, "html.parser")
    url = url_of(path)
    segs = [s for s in url.strip("/").split("/") if s and s != "404.html"]

    # ---- recover the original content ----
    if d.body and "seo-page" in (d.body.get("class") or []):
        art = d.select_one("article.seo-content")
        head_box = art.select_one(".seo-head")
        if head_box: head_box.unwrap()
        rel = d.select_one("nav.related")
        orig_nav = BeautifulSoup(f"<nav>{''.join(str(a) for a in rel.find_all('a'))}</nav>", "html.parser").nav if rel else None
        content = list(art.contents)
    else:
        main = d.find("main") or d.body
        orig_nav = main.find("nav", recursive=False)
        if orig_nav: orig_nav.extract()
        content = list(main.contents)

    links = {}
    if orig_nav:
        for a in orig_nav.find_all("a"):
            h = a.get("href", "")
            if h.startswith(SITE): h = h[len(SITE):]
            if h.startswith("/"): links[h] = a.get_text(" ", strip=True)

    # ---- head ----
    head = d.head
    for t in head.find_all(["style"]): t.decompose()
    for t in head.find_all("meta", attrs={"name": ["viewport", "theme-color"]}): t.decompose()
    for t in head.find_all("link"):
        if set(t.get("rel") or []) & {"icon", "stylesheet", "preconnect", "manifest", "apple-touch-icon"}: t.decompose()
    for t in head.find_all("script"):
        if t.get("id") == "crumbs-ld" or (t.get("type") != "application/ld+json"): t.decompose()
    for t in head.find_all("meta", attrs={"charset": True}): t.decompose()

    # ---- breadcrumbs ----
    crumbs = [("سكينة قرآن", "/")]
    for i in range(len(segs)):
        href = "/" + "/".join(segs[: i + 1]) + "/"
        crumbs.append((crumb_name(href, links, i, segs), href))
    if url == "/404.html": crumbs.append(("الصفحة غير موجودة", url))
    crumb_html = '<nav class="crumbs" aria-label="مسار التنقل">' + '<span class="sep" aria-hidden="true">‹</span>'.join(
        (f'<span aria-current="page">{n}</span>' if k == len(crumbs) - 1 else f'<a href="{h}">{n}</a>') for k, (n, h) in enumerate(crumbs)) + "</nav>"
    crumbs_ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": k + 1, "name": n, "item": SITE + h} for k, (n, h) in enumerate(crumbs)]}

    # ---- content: wrap h1 + its intro paragraph in a header card ----
    body_html = "".join(str(c) for c in content).strip()
    cd = BeautifulSoup(f"<div>{body_html}</div>", "html.parser").div
    h1 = cd.find("h1", recursive=False)
    if h1:
        box = cd.new_tag("div", attrs={"class": "seo-head"})
        h1.insert_before(box)
        nxt = h1.find_next_sibling()
        box.append(h1.extract())
        if nxt is not None and nxt.name == "p": box.append(nxt.extract())
        fx = cd.find("div", class_="facts", recursive=False)
        if fx is not None and fx.find_previous_sibling() is box: box.append(fx.extract())
    has_quran = bool(cd.select(".quran"))
    article = "".join(str(c) for c in cd.contents)

    sec = segs[0] if segs else ""
    cta = ""
    if sec in APP_LINK:
        h, txt = APP_LINK[sec]
        cta = f'<div class="cta"><div><b>استمع في مشغل سكينة</b><span>{txt}</span></div><a class="chip primary" href="/{h}">افتح سكينة</a></div>'
    related = ""
    if links:
        related = '<nav class="related" aria-label="صفحات ذات صلة"><h2>صفحات ذات صلة</h2><div class="seo-content"><div class="links">' + \
            "".join(f'<a href="{h}">{n}</a>' for h, n in links.items()) + "</div></div></nav>"

    head_inner = "".join(str(c) for c in head.contents if not (isinstance(c, NavigableString) and not c.strip()))
    out = f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head_inner}
<script type="application/ld+json" id="crumbs-ld">{json.dumps(crumbs_ld, ensure_ascii=False)}</script>
{HEAD_ADD.replace("{quran_font}", QURAN_FONT if has_quran else "")}
</head>
<body class="seo-page">
{HEADER}
<main class="wrap seo" id="main">
{crumb_html}
<article class="seo-content">
{article}
</article>
{cta}
{related}
</main>
{FOOTER}
<div class="dock seo-dock">
{BOTTOM_NAV}
</div>
<script src="/seo.js?v={SEO_V}" defer></script>
</body>
</html>
'''
    path.write_text(out, encoding="utf-8")
    return url

def main():
    pages = sorted(p for p in ROOT.rglob("*.html") if p != ROOT / "index.html" and "tools" not in p.parts and ".git" not in p.parts)
    for p in pages: build(p)
    print(f"wrapped {len(pages)} pages")

if __name__ == "__main__":
    main()
