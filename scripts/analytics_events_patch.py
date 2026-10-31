#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Expected snippet not found: {label}")
    return text.replace(old, new, 1)


text = APP.read_text(encoding="utf-8")

text = replace_once(
    text,
    '$("#rwChips").onclick = e => { const b = e.target.closest("[data-rw]"); if (!b) return; rwSel = b.dataset.rw; store.set("rw", rwSel); recShown = 25; renderRw(); renderRecs(); };',
    '$("#rwChips").onclick = e => { const b = e.target.closest("[data-rw]"); if (!b) return; rwSel = b.dataset.rw; track("riwaya_select", { riwaya: rwSel }); store.set("rw", rwSel); recShown = 25; renderRw(); renderRecs(); };',
    "riwaya selection",
)

text = replace_once(
    text,
    '  const b = e.target.closest("[data-rec]"); if (b) openReciter(+b.dataset.rec); };',
    '  const b = e.target.closest("[data-rec]"); if (b) { const r = RECITERS.find(x => x.id === +b.dataset.rec); if (r) track("reciter_select", { reciter: r.name, riwaya: rwSel }); openReciter(+b.dataset.rec); } };',
    "reciter selection",
)

text = replace_once(
    text,
    '$("#moshafChips").onclick = e => { const b = e.target.closest("[data-ms]"); if (!b) return; curMoshaf = curRec.moshaf.find(m => m.id === +b.dataset.ms);\n  $$("#moshafChips .chip").forEach(c => c.setAttribute("aria-pressed", c === b)); renderSuras(); };',
    '$("#moshafChips").onclick = e => { const b = e.target.closest("[data-ms]"); if (!b) return; curMoshaf = curRec.moshaf.find(m => m.id === +b.dataset.ms);\n  if (curMoshaf) track("moshaf_select", { reciter: curRec.name, riwaya: curMoshaf.rw, moshaf_type: curMoshaf.type || "" });\n  $$("#moshafChips .chip").forEach(c => c.setAttribute("aria-pressed", c === b)); renderSuras(); };',
    "moshaf selection",
)

text = replace_once(
    text,
    '$("#rRec").onchange = e => { rRec = RUQYAH_RECITERS.find(r => r.id === e.target.value); store.set("rRec", rRec.id); renderRTracks(); };',
    '$("#rRec").onchange = e => { rRec = RUQYAH_RECITERS.find(r => r.id === e.target.value); track("ruqyah_reciter_select", { reciter: rRec.name }); store.set("rRec", rRec.id); renderRTracks(); };',
    "ruqyah reciter selection",
)

text = replace_once(
    text,
    '$("#qListen").onclick = () => { $("#qAudio").hidden = false; $("#qReading").hidden = true; $("#qListen").setAttribute("aria-pressed", "true"); $("#qRead").setAttribute("aria-pressed", "false"); };',
    '$("#qListen").onclick = () => { track("quran_mode_select", { mode: "listen" }); $("#qAudio").hidden = false; $("#qReading").hidden = true; $("#qListen").setAttribute("aria-pressed", "true"); $("#qRead").setAttribute("aria-pressed", "false"); };',
    "quran listen mode",
)

text = replace_once(
    text,
    '$("#qRead").onclick = async () => {\n  $("#qAudio").hidden = true;',
    '$("#qRead").onclick = async () => {\n  track("quran_mode_select", { mode: "read" });\n  $("#qAudio").hidden = true;',
    "quran read mode",
)

text = replace_once(
    text,
    'async function showTafsir(surah, ayah, shape) {\n  if (!(surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= 286)) return;\n  const request = ++tafsirRequest, panel = $("#tafsirPanel");',
    'async function showTafsir(surah, ayah, shape) {\n  if (!(surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= 286)) return;\n  track("tafsir_open", { surah: surah, ayah: ayah });\n  const request = ++tafsirRequest, panel = $("#tafsirPanel");',
    "tafsir open",
)

text = replace_once(
    text,
    '$$("#v-adhkar .seg button").forEach(b => b.onclick = () => { $("#adhContent").hidden = false; setPeriod(b.dataset.period); });',
    '$$("#v-adhkar .seg button").forEach(b => b.onclick = () => { track("adhkar_period_select", { period: b.dataset.period }); $("#adhContent").hidden = false; setPeriod(b.dataset.period); });',
    "adhkar period",
)

text = replace_once(
    text,
    '$("#installBtn").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("#installBtn").hidden = true; };',
    '$("#installBtn").onclick = async () => { if (!deferred) return; deferred.prompt(); const choice = await deferred.userChoice; track("pwa_install", { outcome: choice && choice.outcome ? choice.outcome : "unknown" }); deferred = null; $("#installBtn").hidden = true; };',
    "pwa install",
)

APP.write_text(text, encoding="utf-8")

idx = INDEX.read_text(encoding="utf-8")
idx = replace_once(idx, 'app.js?v=46', 'app.js?v=47', "index app cache key")
INDEX.write_text(idx, encoding="utf-8")

sw = SW.read_text(encoding="utf-8")
sw = replace_once(sw, 'const V = "sakina-v52";', 'const V = "sakina-v53";', "service worker version")
sw = replace_once(sw, 'app.js?v=46', 'app.js?v=47', "service worker app cache key")
SW.write_text(sw, encoding="utf-8")

print("Analytics events and cache keys updated")
