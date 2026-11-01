from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]

def read(name):
    return (ROOT / name).read_text(encoding='utf-8')

def write(name, text):
    (ROOT / name).write_text(text, encoding='utf-8')

# ---------- index.html ----------
index = read('index.html')
index = index.replace(
    'family=Aref+Ruqaa:wght@700&family=Readex+Pro:wght@400;500&display=swap',
    'family=Aref+Ruqaa:wght@700&family=Readex+Pro:wght@400;500&family=Tajawal:wght@400;500;600;700&display=swap'
)
index = index.replace('styles.css?v=56', 'styles.css?v=57')
index = index.replace('app.js?v=61', 'app.js?v=62')

install_html = '''\n  <section class="install-promo" id="installPromo" hidden aria-labelledby="installPromoTitle">
    <div class="install-promo-icon" aria-hidden="true"><img src="icon.svg?v=38" alt="" width="42" height="42"></div>
    <div class="install-promo-copy">
      <span class="install-promo-kicker">افتح سكينة كأنه تطبيق</span>
      <h2 id="installPromoTitle">أضف سكينة إلى الشاشة الرئيسية</h2>
      <p>وصول أسرع للقرآن والإذاعات والأذكار من غير ما تدور على الموقع كل مرة.</p>
    </div>
    <div class="install-promo-actions">
      <button class="install-primary" id="installPromoBtn" type="button">إضافة للشاشة الرئيسية</button>
      <button class="install-later" id="installPromoDismiss" type="button">لاحقًا</button>
    </div>
  </section>\n'''
marker = '  <div class="warn" id="warn" hidden></div>\n'
if 'id="installPromo"' not in index:
    index = index.replace(marker, marker + install_html)

index = index.replace(
    '<section class="friday-card" aria-labelledby="fridayTitle">',
    '<section class="friday-card" id="fridayCard" aria-labelledby="fridayTitle" hidden>'
)
index = index.replace('<h2 id="fridayTitle">جمعة مباركة</h2><p id="fridayHint">تذكير بسورة الكهف وآداب الجمعة</p>',
                      '<h2 id="fridayTitle">جمعة مباركة 🤍</h2><p id="fridayHint">لا تنسَ قراءة سورة الكهف والصلاة على النبي ﷺ</p>')
write('index.html', index)

# ---------- app.js ----------
app = read('app.js')

# Show an exact countdown and update it every second while the timer is active.
old_sleep_label = '''function sleepLabel() {\n  const b = $("#sleepBtn"), t = $("#sleepTxt");\n  if (P.sleepAtEnd) { b.classList.add("on"); t.textContent = "آخر السورة"; return; }\n  if (!P.sleepEnd) { b.classList.remove("on"); t.textContent = ""; return; }\n  b.classList.add("on"); t.textContent = ard(Math.max(0, Math.ceil((P.sleepEnd - Date.now()) / 60000))) + "د";\n}'''
new_sleep_label = '''function sleepLabel() {\n  const b = $("#sleepBtn"), t = $("#sleepTxt");\n  if (P.sleepAtEnd) { b.classList.add("on"); t.textContent = "آخر السورة"; b.setAttribute("aria-label", "مؤقت النوم: يتوقف عند نهاية السورة"); return; }\n  if (!P.sleepEnd) { b.classList.remove("on"); t.textContent = ""; b.setAttribute("aria-label", "مؤقت النوم"); return; }\n  const left = Math.max(0, Math.ceil((P.sleepEnd - Date.now()) / 1000));\n  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;\n  const clock = h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;\n  b.classList.add("on"); t.textContent = ard(clock); b.setAttribute("aria-label", "متبقي على مؤقت النوم " + ard(clock));\n}'''
if old_sleep_label in app:
    app = app.replace(old_sleep_label, new_sleep_label)
else:
    app = re.sub(r'function sleepLabel\(\) \{.*?\n\}', new_sleep_label, app, count=1, flags=re.S)
app = app.replace('if (Date.now() - (P.lblT || 0) > 15000) { P.lblT = Date.now(); sleepLabel(); }',
                  'P.lblT = Date.now(); sleepLabel();')
app = app.replace('setInterval(sleepLabel, 20000);', 'setInterval(sleepLabel, 1000);')

# Friday card only exists visually on Friday; no weekday replacement card.
friday_pattern = re.compile(r'''const everydayReminders = \[.*?\n\$\("#fridayRead"\)\.onclick = async \(\) => \{\n  location\.hash = "#quran";\n  await \$\("#qRead"\)\.onclick\(\);\n  if \(\$\("#qReading"\)\.hidden \|\| !readingSelect\.options\.length\) return;\n  readingSelect\.value = "18";\n  await loadReading\(\);\n\};''', re.S)
friday_replacement = '''const fridayReminders = ["لا تنسَ قراءة سورة الكهف", "أكثر من الصلاة والسلام على النبي ﷺ", "أكثر من الدعاء وتحَرَّ ساعة الإجابة", "لمن يذهب للجمعة: الاغتسال والتبكير والإنصات"];\nlet reminderIndex = 0;\nfunction updateFridayReminder() {\n  const card = $("#fridayCard");\n  const friday = new Date().getDay() === 5;\n  card.hidden = !friday;\n  if (!friday) return;\n  $("#fridayLabel").textContent = "اليوم الجمعة";\n  $("#fridayTitle").textContent = "جمعة مباركة 🤍";\n  $("#fridayHint").textContent = "لا تنسَ قراءة سورة الكهف والصلاة على النبي ﷺ";\n  $("#dailyDhikr").textContent = fridayReminders[reminderIndex % fridayReminders.length];\n  $("#fridayActions").hidden = false;\n  $("#fridayDetails").hidden = false;\n}\nfunction moveReminder(step) {\n  if ($("#fridayCard").hidden) return;\n  reminderIndex = (reminderIndex + step + fridayReminders.length) % fridayReminders.length;\n  $("#dailyDhikr").textContent = fridayReminders[reminderIndex];\n}\n$("#dhikrPrev").onclick = () => moveReminder(-1);\n$("#dhikrNext").onclick = () => moveReminder(1);\nupdateFridayReminder();\nsetInterval(updateFridayReminder, 60000);\nsetInterval(() => { if (!document.hidden && !$("#fridayCard").hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) moveReminder(1); }, 15000);\n$("#fridayListen").onclick = () => {\n  const item = {kind:"file", key:"friday:kahf:husary", title:"سورة الكهف", sub:"محمود خليل الحصري", eyebrow:"زاد الجمعة", url:"https://cdn.mp3quran.net/audio/mahmoud-husary/r1/018.mp3"};\n  if (P.cur && P.cur.key === item.key) toggle(); else play(item);\n};\n$("#fridayRead").onclick = async () => {\n  location.hash = "#quran";\n  await $("#qRead").onclick();\n  if ($("#qReading").hidden || !readingSelect.options.length) return;\n  readingSelect.value = "18";\n  await loadReading();\n};'''
app, count = friday_pattern.subn(friday_replacement, app, count=1)
if count == 0:
    raise SystemExit('Friday reminder block was not found; refusing an unsafe partial patch.')

# Prominent install card + iOS instructions + standard install prompt.
install_pattern = re.compile(r'''let deferred = null;\naddEventListener\("beforeinstallprompt".*?\n\$\("#installBtn"\)\.onclick = async \(\) => \{.*?\nif \("serviceWorker" in navigator''', re.S)
install_replacement = '''let deferred = null;\nconst installPromo = $("#installPromo");\nconst installPromoBtn = $("#installPromoBtn");\nconst installPromoDismiss = $("#installPromoDismiss");\nconst isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;\nconst isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);\nfunction showInstallPromo() {\n  if (isStandalone()) { installPromo.hidden = true; $("#installBtn").hidden = true; return; }\n  const dismissed = store.get("installPromoDismissed", 0);\n  installPromo.hidden = dismissed && Date.now() - dismissed < 7 * 864e5;\n}\nfunction showIOSInstallHelp() {\n  let box = document.querySelector(".install-help");\n  if (!box) {\n    box = document.createElement("div"); box.className = "install-help"; box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true");\n    box.innerHTML = `<div class="install-help-card"><button class="install-help-close" aria-label="إغلاق">×</button><img src="icon.svg?v=38" alt="" width="52" height="52"><h2>أضف سكينة إلى الشاشة الرئيسية</h2><p>على iPhone أو iPad: اضغط زر <b>المشاركة</b> في Safari، ثم اختر <b>إضافة إلى الشاشة الرئيسية</b>، وبعدها اضغط <b>إضافة</b>.</p><button class="install-primary install-help-ok">حسنًا</button></div>`;\n    document.body.appendChild(box);\n    box.addEventListener("click", e => { if (e.target === box || e.target.closest(".install-help-close,.install-help-ok")) box.remove(); });\n  }\n}\nasync function requestInstall() {\n  if (deferred) {\n    deferred.prompt(); const choice = await deferred.userChoice;\n    track("pwa_install", { outcome: choice && choice.outcome ? choice.outcome : "unknown" });\n    deferred = null; if (choice && choice.outcome === "accepted") installPromo.hidden = true;\n    return;\n  }\n  if (isIOS) { showIOSInstallHelp(); return; }\n  toast("من قائمة المتصفح اختر: تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية");\n}\naddEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#installBtn").hidden = false; showInstallPromo(); });\naddEventListener("appinstalled", () => { installPromo.hidden = true; $("#installBtn").hidden = true; store.del("installPromoDismissed"); toast("تمت إضافة سكينة إلى جهازك"); });\n$("#installBtn").onclick = requestInstall;\ninstallPromoBtn.onclick = requestInstall;\ninstallPromoDismiss.onclick = () => { store.set("installPromoDismissed", Date.now()); installPromo.hidden = true; };\nshowInstallPromo();\nif (!isStandalone() && isIOS) $("#installBtn").hidden = false;\nif ("serviceWorker" in navigator'''
app, count = install_pattern.subn(install_replacement, app, count=1)
if count == 0:
    raise SystemExit('Install prompt block was not found; refusing an unsafe partial patch.')
write('app.js', app)

# ---------- styles.css ----------
styles = read('styles.css')
styles = styles.replace('--f-body:"Readex Pro",Tahoma,"Segoe UI",sans-serif;', '--f-body:"Tajawal","Readex Pro",Tahoma,"Segoe UI",sans-serif;')
styles = styles.replace('--r-sm:10px; --r-md:14px; --r-lg:20px;', '--r-sm:14px; --r-md:18px; --r-lg:24px;')

friendly_css = r'''

/* =========================================================
   Friendly UI refresh — unified mobile-app design language
   ========================================================= */
:root{
  --soft-border:color-mix(in srgb,var(--rule) 68%,transparent);
  --soft-panel:color-mix(in srgb,var(--panel) 90%,var(--night));
  --soft-panel-2:color-mix(in srgb,var(--panel-2) 86%,var(--panel));
  --soft-shadow:0 10px 30px -18px rgba(0,0,0,.55);
  --touch:46px;
}
body{line-height:1.72}
header.top{background:color-mix(in srgb,var(--night) 91%,transparent);border-bottom:1px solid var(--soft-border);box-shadow:0 6px 24px -22px rgba(0,0,0,.8)}
header .wrap{min-height:64px;padding-block:9px;gap:10px}
.logo{gap:7px;font-size:1.48rem;letter-spacing:-.02em}
.logo img{width:34px;height:34px}
.icon-btn{width:42px;height:42px;border-radius:14px;border:1px solid var(--soft-border);background:var(--soft-panel);color:var(--ink);transition:.2s var(--ease)}
.icon-btn svg{width:19px;height:19px;stroke-linecap:round;stroke-linejoin:round}
@media(hover:hover){.icon-btn:hover{background:var(--panel-2);border-color:color-mix(in srgb,var(--gold) 35%,var(--rule));transform:translateY(-1px)}}
.tabs-top{padding:4px;border-radius:16px;background:color-mix(in srgb,var(--panel) 75%,transparent);border:1px solid var(--soft-border)}
.tabs-top a{padding:7px 13px;border-radius:12px;font-size:.9rem}
.tabs-top a[aria-current="page"]{background:var(--panel-2);color:var(--ink);box-shadow:0 5px 16px -12px rgba(0,0,0,.8)}
.next-prayer{min-height:40px;border-color:var(--soft-border);background:var(--soft-panel);padding:7px 12px}

/* First-visit install card */
.install-promo{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:14px;margin:4px 0 18px;padding:16px;border:1px solid color-mix(in srgb,var(--gold) 26%,var(--rule));border-radius:22px;background:linear-gradient(135deg,color-mix(in srgb,var(--panel-2) 90%,var(--gold) 10%),var(--panel));box-shadow:var(--soft-shadow);overflow:hidden;position:relative}
.install-promo::after{content:"";position:absolute;width:160px;height:160px;border-radius:50%;inset:auto -70px -95px auto;background:color-mix(in srgb,var(--gold) 11%,transparent);pointer-events:none}
.install-promo-icon{width:58px;height:58px;border-radius:17px;display:grid;place-items:center;background:color-mix(in srgb,var(--gold) 14%,var(--panel));border:1px solid color-mix(in srgb,var(--gold) 24%,var(--rule))}
.install-promo-icon img{width:42px;height:42px}
.install-promo-copy{min-width:0}
.install-promo-kicker{display:block;color:var(--gold);font-size:.75rem;font-weight:600;margin-bottom:1px}
.install-promo h2{font-family:var(--f-body);font-size:1.06rem;color:var(--ink);line-height:1.45;margin:0 0 3px}
.install-promo p{margin:0;color:var(--dim);font-size:.84rem;line-height:1.6;max-width:520px}
.install-promo-actions{display:flex;align-items:center;gap:8px;z-index:1}
.install-primary{min-height:44px;padding:9px 15px;border-radius:14px;background:var(--gold);color:var(--gold-ink);font-weight:700;white-space:nowrap;box-shadow:0 8px 18px -13px var(--gold)}
.install-later{min-height:40px;padding:8px 10px;color:var(--dim);font-size:.82rem;border-radius:12px}
.install-later:hover{background:color-mix(in srgb,var(--panel-2) 75%,transparent);color:var(--ink)}
body:not([data-active-view="radio"]) .install-promo{display:none!important}
@media(max-width:720px){.install-promo{grid-template-columns:auto 1fr;padding:14px;gap:11px;margin-top:2px}.install-promo-icon{width:50px;height:50px;border-radius:15px}.install-promo-icon img{width:36px;height:36px}.install-promo-actions{grid-column:1/-1;width:100%}.install-primary{flex:1}.install-later{padding-inline:12px}.install-promo p{font-size:.8rem}}
.install-help{position:fixed;inset:0;z-index:1000;display:grid;place-items:end center;padding:18px;background:rgba(0,0,0,.58);backdrop-filter:blur(8px)}
.install-help-card{width:min(460px,100%);position:relative;text-align:center;background:var(--panel);border:1px solid var(--rule);border-radius:26px;padding:26px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:0 26px 80px rgba(0,0,0,.45)}
.install-help-card h2{font-family:var(--f-body);font-size:1.18rem;color:var(--ink);margin:10px 0 6px}.install-help-card p{margin:0 0 16px;color:var(--dim);font-size:.94rem}.install-help-close{position:absolute;top:10px;inset-inline-end:10px;width:38px;height:38px;border-radius:12px;background:var(--panel-2);font-size:1.4rem;color:var(--dim)}

/* Softer content cards and list rows */
.item,.discover-card,.dhikr,.time,.part,.sleep-listen{border-radius:20px!important;border-color:var(--soft-border)!important;background:var(--soft-panel)!important;box-shadow:0 5px 16px -18px rgba(0,0,0,.8)}
.item{gap:14px;padding:13px 14px;min-height:68px}
.item b{font-weight:600;letter-spacing:-.012em}.item small{line-height:1.5;margin-top:2px}
.medal{width:42px;height:42px;border-radius:14px!important;clip-path:none!important;background:var(--soft-panel-2)!important;border:1px solid var(--soft-border);font-weight:700;color:var(--gold);font-size:.92rem}
.item.on .medal{background:color-mix(in srgb,var(--gold) 18%,var(--panel-2))!important;color:var(--gold)!important;border-color:color-mix(in srgb,var(--gold) 52%,var(--rule))}
.item .ic,.fav-btn{border-radius:13px!important}
.fav-row{gap:8px}
.discover-grid{gap:11px!important}
.discover-card{padding:16px!important;min-height:112px!important;transition:transform .18s var(--ease),border-color .18s,background .18s}
.discover-card>span:first-child{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:var(--panel-2);color:var(--gold);font-size:1.05rem;margin-bottom:9px}
.discover-card b{font-size:.98rem;font-weight:700}.discover-card small{font-size:.78rem;line-height:1.55}
@media(hover:hover){.item:hover,.discover-card:hover{transform:translateY(-1px);background:var(--panel-2)!important}}
.search input{min-height:48px;border-radius:16px;background:var(--soft-panel);border-color:var(--soft-border)}
.chip{min-height:40px;border-color:var(--soft-border);background:var(--soft-panel);font-weight:500}
.st{border-radius:24px!important;padding:20px 12px 16px;border-color:var(--soft-border);box-shadow:var(--soft-shadow)}
.st .mini{width:42px;height:42px;border-radius:14px;border-color:color-mix(in srgb,var(--gold) 48%,var(--rule));background:color-mix(in srgb,var(--gold) 8%,transparent)}

/* Friday: quiet, special, and visible only on Friday by JS */
.friday-card{border-radius:24px!important;background:linear-gradient(145deg,color-mix(in srgb,var(--panel-2) 88%,var(--gold) 12%),var(--panel))!important;border:1px solid color-mix(in srgb,var(--gold) 30%,var(--rule))!important;box-shadow:var(--soft-shadow);padding:18px!important}
.friday-mark{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--gold) 13%,transparent);border:1px solid color-mix(in srgb,var(--gold) 25%,var(--rule))}

/* Modern player dock: app-like, calm and tactile */
.dock{padding-inline:max(10px,env(safe-area-inset-left),env(safe-area-inset-right));background:transparent!important;pointer-events:none}
.dock>*{pointer-events:auto}
.capsule{border:1px solid color-mix(in srgb,var(--gold) 14%,var(--rule))!important;border-radius:20px!important;background:color-mix(in srgb,var(--panel) 94%,transparent)!important;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 16px 44px -17px rgba(0,0,0,.72)!important;padding:9px 10px!important;min-height:66px}
.cap-prog{inset:0 12px auto!important;height:2px!important;border-radius:99px!important;overflow:hidden;background:color-mix(in srgb,var(--rule) 55%,transparent)!important}.cap-prog i{border-radius:99px;background:var(--gold)!important}
.capsule .pb{width:46px!important;height:46px!important;border-radius:15px!important;background:var(--gold)!important;color:var(--gold-ink)!important;box-shadow:0 10px 22px -14px var(--gold)}
.capsule .pb svg{width:21px!important;height:21px!important}
.capsule .info{padding-inline:10px!important;min-width:0;text-align:start}.capsule .info b{font-family:var(--f-body)!important;font-size:.94rem!important;font-weight:700!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.capsule .info small{font-size:.77rem!important;color:var(--dim)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sleep{min-width:48px!important;min-height:46px!important;border-radius:14px!important;background:var(--panel-2)!important;border:1px solid var(--soft-border)!important;color:var(--dim)!important;display:flex!important;flex-direction:column;justify-content:center;gap:1px;padding:5px 7px!important;font-variant-numeric:tabular-nums}
.sleep.on{color:var(--gold)!important;border-color:color-mix(in srgb,var(--gold) 40%,var(--rule))!important;background:color-mix(in srgb,var(--gold) 9%,var(--panel-2))!important}
.sleep svg{width:16px!important;height:16px!important}.sleep span{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.68rem!important;line-height:1.1;font-weight:700;direction:ltr}
.dock-toggle{border-radius:12px!important;background:var(--panel)!important;border:1px solid var(--soft-border)!important;box-shadow:0 7px 18px -15px rgba(0,0,0,.8)}
.tabs-bottom{margin-top:7px!important;border-radius:19px 19px 0 0!important;background:color-mix(in srgb,var(--panel) 95%,transparent)!important;border:1px solid var(--soft-border)!important;border-bottom:0!important;overflow:hidden;backdrop-filter:blur(22px)}
.tabs-bottom a{min-height:58px!important;font-size:.69rem!important;gap:3px!important;color:var(--dim)!important}.tabs-bottom a svg{width:20px!important;height:20px!important;stroke-linecap:round;stroke-linejoin:round}.tabs-bottom a[aria-current="page"]{color:var(--gold)!important;background:color-mix(in srgb,var(--gold) 6%,transparent)}

/* Full player sheet */
.scrim{backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);background:rgba(0,0,0,.52)!important}
.sheet{border-radius:30px 30px 0 0!important;background:linear-gradient(180deg,color-mix(in srgb,var(--panel-2) 92%,var(--gold) 8%),var(--panel) 34%)!important;border:1px solid color-mix(in srgb,var(--gold) 12%,var(--rule))!important;box-shadow:0 -30px 90px rgba(0,0,0,.48)!important;padding-inline:max(20px,env(safe-area-inset-left),env(safe-area-inset-right))!important}
.grab span{width:42px!important;height:4px!important;border-radius:99px!important;background:color-mix(in srgb,var(--dim) 55%,transparent)!important}
.sheet-art{width:clamp(150px,45vw,220px)!important;height:clamp(150px,45vw,220px)!important;border-radius:28px!important;margin:10px auto 22px!important;background:radial-gradient(circle at 30% 22%,color-mix(in srgb,var(--gold) 20%,var(--panel-2)),var(--panel))!important;border:1px solid color-mix(in srgb,var(--gold) 16%,var(--rule))!important;box-shadow:0 28px 55px -28px rgba(0,0,0,.75)!important}.sheet-art img{width:58%!important;height:58%!important}
.sheet-title{font-family:var(--f-body)!important;font-size:clamp(1.35rem,5vw,1.75rem)!important;color:var(--ink)!important;letter-spacing:-.02em}
.ctrl{gap:14px!important;margin:20px auto!important}.ctrl .c-sm{width:46px!important;height:46px!important;border-radius:15px!important;background:var(--panel-2)!important;border:1px solid var(--soft-border)!important}.ctrl .big2{width:66px!important;height:66px!important;border-radius:21px!important;background:var(--gold)!important;color:var(--gold-ink)!important;box-shadow:0 14px 30px -18px var(--gold)!important}
.seek input[type="range"]{accent-color:var(--gold)}
.sheet-row{gap:9px!important}.sheet-row .field{border-radius:16px!important;background:var(--soft-panel-2)!important;border:1px solid var(--soft-border)!important;padding:10px 12px!important}

/* Footer: quieter and more structured */
footer{margin-top:44px!important;padding:20px 0 calc(var(--dock-h) + 22px)!important;border-top:1px solid var(--soft-border)!important;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--panel) 58%,var(--night)))!important}
footer>.wrap{display:grid;gap:14px}
.foot-sadaqa{border:1px solid var(--soft-border)!important;border-radius:18px!important;background:var(--soft-panel)!important;overflow:hidden}.foot-sadaqa summary{min-height:48px;padding:12px 15px!important;display:flex;align-items:center;justify-content:space-between;font-weight:600;cursor:pointer;list-style:none}.foot-sadaqa summary::-webkit-details-marker{display:none}.foot-sadaqa summary::after{content:"⌄";color:var(--dim);font-size:1.1rem}.foot-sadaqa[open] summary::after{transform:rotate(180deg)}
.footer-links-list{padding:2px 14px 14px!important;display:flex!important;gap:7px 14px!important;flex-wrap:wrap}.footer-links-list a{font-size:.82rem!important;color:var(--dim)!important;text-decoration:none!important}.footer-links-list a:hover{color:var(--gold)!important}
.credit{padding:12px 4px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex-wrap:wrap!important}.credit .by{font-size:.78rem!important;color:var(--dim)!important}.credit .by b{color:var(--ink)!important;font-weight:600!important}.social{display:flex!important;gap:7px!important}.social a{width:38px!important;height:38px!important;border-radius:12px!important;display:grid!important;place-items:center!important;background:var(--soft-panel)!important;border:1px solid var(--soft-border)!important;color:var(--dim)!important}.social a svg{width:17px!important;height:17px!important;fill:currentColor!important}.social a:hover{color:var(--gold)!important;border-color:color-mix(in srgb,var(--gold) 35%,var(--rule))!important}

@media(max-width:560px){header .wrap{min-height:58px}.logo{font-size:1.34rem}.logo img{width:31px;height:31px}.hd{gap:6px}.next-prayer{max-width:120px;overflow:hidden;text-overflow:ellipsis}.icon-btn{width:40px;height:40px}.sheet{max-height:94dvh!important}.ctrl{gap:10px!important}.ctrl .c-sm{width:43px!important;height:43px!important}.credit{justify-content:center!important;text-align:center!important}.social{width:100%;justify-content:center}.footer-links-list{justify-content:center}}
@media(prefers-reduced-motion:reduce){.item,.discover-card,.icon-btn{transition:none!important}}
'''
if 'Friendly UI refresh — unified mobile-app design language' not in styles:
    styles += friendly_css
write('styles.css', styles)

# ---------- manifest ----------
manifest = json.loads(read('manifest.webmanifest'))
manifest['screenshots'] = [
    {'src':'/pwa-screenshot-mobile.png','sizes':'390x844','type':'image/png','form_factor':'narrow','label':'واجهة سكينة قرآن على الهاتف'},
    {'src':'/pwa-screenshot-wide.png','sizes':'1280x720','type':'image/png','form_factor':'wide','label':'واجهة سكينة قرآن على سطح المكتب'}
]
write('manifest.webmanifest', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

# ---------- service worker cache version ----------
sw = read('sw.js')
sw = sw.replace('const V = "sakina-v82";', 'const V = "sakina-v83";')
sw = sw.replace('/styles.css?v=56', '/styles.css?v=57').replace('/app.js?v=61', '/app.js?v=62')
if '"/pwa-screenshot-mobile.png"' not in sw:
    sw = sw.replace('  "/icon-512.png"\n];', '  "/icon-512.png",\n  "/pwa-screenshot-mobile.png",\n  "/pwa-screenshot-wide.png"\n];')
write('sw.js', sw)

print('Friendly UI patch applied.')
