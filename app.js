"use strict";
(() => {
const { STATIONS, RUQYAH_RECITERS, RUQYAH_SURAS, RUQYAH_TEXT, ADHKAR, CITIES, PRAYERS } = window.SAKINA;
const API = "https://mp3quran.net/api/v3/";

/* ---------- utils ---------- */
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem("sakina:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("sakina:" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("sakina:" + k); } catch (e) {} }
};
const AR = "٠١٢٣٤٥٦٧٨٩";
const ard = s => String(s).replace(/\d/g, d => AR[d]);
const fmt = s => { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return ard((h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0")); };
const norm = s => (s || "").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
const tight = s => norm(s).replace(/\s+/g, "");
/* search: every word must appear; spaces and leading "ال" are ignored ("عبدالباسط" = "عبد الباسط") */
function matches(q, hay) {
  if (!q) return true;
  const n = norm(hay), t = n.replace(/\s+/g, "");
  if (t.includes(q.replace(/\s+/g, ""))) return true;
  return q.split(" ").every(w => n.includes(w) || t.includes(w) || (w.startsWith("ال") && w.length > 3 && t.includes(w.slice(2))));
}
const sortKey = name => tight(name).replace(/^ال/, "");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const idle = f => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 2500 }) : setTimeout(f, 800));
const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400); }

async function getJSON(url, cacheKey, maxAgeH) {
  if (cacheKey) { const c = store.get(cacheKey, null); if (c && Date.now() - c.t < maxAgeH * 3600e3) return c.d; }
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  const d = await r.json(); if (cacheKey) store.set(cacheKey, { t: Date.now(), d }); return d;
}

const IC = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11.5-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  load: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="30 60"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></circle></svg>',
  arrow: '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10h16v10H4zM7 10l10-6"/><circle cx="9" cy="15" r="2"/></svg>'
};

/* ---------- environment ---------- */
(function () {
  let framed = false; try { framed = window.self !== window.top; } catch (e) { framed = true; }
  if (framed || !/^https?:$/.test(location.protocol)) {
    const w = $("#warn"); w.hidden = false;
    w.innerHTML = "<b>الصوت لن يعمل هنا.</b> هذه معاينة فقط. افتح الموقع من رابطه في Safari أو Chrome.";
  }
})();

/* =========================================================
   PLAYER ENGINE
   item = { kind:"live"|"file", key, title, sub, eyebrow, url }
   ========================================================= */
const audio = $("#audio");
const P = { cur: null, queue: [], qi: 0, loop: false, want: false, retries: 0, stallT: null, state: "idle", onEnd: null, sleepEnd: 0, sleepT: null, sleepAtEnd: false };

function setMeta(it) {
  $("#capTitle").textContent = it.title;
  $("#capSub").textContent = it.sub;
  $("#shEyebrow").textContent = it.eyebrow || "";
  $("#shTitle").textContent = it.title;
  $("#shSub").textContent = it.sub;
  if (it.kind === "live") {
    $("#heroEyebrow").textContent = it.eyebrow || "بث مباشر";
    $("#heroTitle").textContent = it.title;
    $("#heroSub").textContent = it.sub;
  }
  document.title = it.title + " | سكينة";
  if ("mediaSession" in navigator) try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.sub, album: "سكينة",
      artwork: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }] });
  } catch (e) {}
}

function paint(st) {
  P.state = st;
  const icon = st === "playing" ? IC.pause : st === "loading" ? IC.load : IC.play;
  const label = st === "playing" ? "إيقاف" : "تشغيل";
  for (const id of ["#capBtn", "#shPlay"]) { $(id).innerHTML = icon; $(id).setAttribute("aria-label", label); }
  const cur = P.cur, live = cur && cur.kind === "live";
  // hero reflects live radio only
  const heroOn = live;
  $("#heroBtn").innerHTML = heroOn ? icon : IC.play;
  $("#hero").classList.toggle("playing", heroOn && st === "playing");
  const hs = $("#heroStatus");
  if (heroOn) {
    hs.className = "status" + (st === "playing" ? " live" : st === "error" ? " err" : "");
    hs.textContent = { idle: "متوقف", loading: P.retries ? `جارِ إعادة الاتصال (${ard(P.retries)})…` : "جارِ الاتصال…", playing: "على الهواء الآن", error: "تعذّر التشغيل. تحقق من الإنترنت" }[st];
    $("#retryBtn").hidden = st !== "error";
  } else { hs.className = "status"; hs.textContent = "جاهز"; $("#retryBtn").hidden = true; }
  $("#sheet").classList.toggle("playing", st === "playing");
  // highlight rows
  $$("[data-key].on").forEach(e => { e.classList.remove("on"); const i = e.querySelector(".pi"); if (i) i.innerHTML = IC.play; });
  if (cur) $$(`[data-key="${CSS.escape(cur.key)}"]`).forEach(e => { e.classList.add("on"); const i = e.querySelector(".pi"); if (i) i.innerHTML = icon; });
  // sheet controls
  $("#seek").hidden = live || !cur; $("#liveBadge").hidden = !live;
  $("#shPrev").hidden = $("#shNext").hidden = live || !cur;
  $("#rate").closest(".field").hidden = live || !cur;
  $("#sleepSel option[value=\"-1\"]").disabled = live || !cur;
  if (live && $("#sleepSel").value === "-1") $("#sleepSel").value = "0";
  $("#shPrev").disabled = !(P.qi > 0 && P.queue.length > 1);
  $("#shNext").disabled = !(P.qi < P.queue.length - 1 || P.loop);
  $("#shBack").hidden = $("#shFwd").hidden = live || !cur;
  $("#shQueue").textContent = P.queue.length > 1 ? `${ard(P.qi + 1)} من ${ard(P.queue.length)} في القائمة` : "";
  if (st === "error" && !live && cur) toast("تعذّر تشغيل التلاوة. تحقق من الإنترنت");
}

function play(it, queue, qi, opts) {
  P.queue = queue || [it]; P.qi = qi || 0; P.loop = !!(opts && opts.loop); P.onEnd = opts && opts.onEnd || null;
  start(it);
}
function start(it) {
  P.cur = it; P.retries = 0; setMeta(it); store.set("lastItem", it); load(true);
  if (it.kind === "file" && P.onTrack) P.onTrack(it);
  if (P.cur.onStart) P.cur.onStart();
}
function load(fresh) {
  clearTimeout(P.stallT); P.want = true;
  const it = P.cur;
  audio.src = it.kind === "live" ? it.url + (it.url.includes("?") ? "&" : "?") + "t=" + Date.now() : it.url;
  audio.playbackRate = it.kind === "live" ? 1 : +($("#rate").value || 1);
  if (fresh && it.kind === "file") { const pos = store.get("pos:" + it.url, 0); P.pendingSeek = pos > 5 ? pos : 0; }
  paint("loading");
  const p = audio.play();
  if (p) p.catch(err => { if (err && err.name === "NotAllowedError") { P.want = false; paint("idle"); } else fail(); });
  P.stallT = setTimeout(() => { if (P.want && (audio.paused || audio.readyState < 3)) fail(); }, 12000);
}
function fail() {
  clearTimeout(P.stallT);
  if (!P.want || !P.cur) return;
  if (P.retries < 3) {
    P.retries++;
    if (P.cur.kind === "file") P.pendingSeek = audio.currentTime || P.pendingSeek || 0;
    paint("loading");
    setTimeout(() => { if (P.want) load(false); }, 900 * P.retries);
  } else { P.want = false; paint("error"); }
}
function stop() { P.want = false; clearTimeout(P.stallT); audio.pause(); paint("idle"); }
function toggle() {
  if (!P.cur) {
    const it = store.get("lastItem", null) || stationItem(STATIONS[0]), lq = store.get("lastQueue", null);
    if (it.moshaf && lq && lq.moshaf === it.moshaf) {
      const q = lq.list.map(n => ({ kind: "file", key: `q:${lq.moshaf}:${n}`, title: "سورة " + (lq.names[n] || n), sub: lq.recName, eyebrow: it.eyebrow,
        url: lq.server + String(n).padStart(3, "0") + ".mp3", rec: lq.rec, moshaf: lq.moshaf, n }));
      const i = Math.max(0, lq.list.indexOf(it.n)); play(q[i], q, i); return;
    }
    play(it); return;
  }
  if (P.want) { stop(); return; }
  P.retries = 0;
  if (P.cur.kind === "live" || !audio.getAttribute("src")) load(true);
  else { P.want = true; paint("loading"); audio.play().catch(fail); }
}
function next() {
  if (P.qi < P.queue.length - 1) { P.qi++; start(P.queue[P.qi]); return true; }
  if (P.loop && P.queue.length) { P.qi = 0; start(P.queue[0]); return true; }
  return false;
}
function prev() {
  if (P.cur && P.cur.kind === "file" && audio.currentTime > 5) { audio.currentTime = 0; return; }
  if (P.qi > 0) { P.qi--; start(P.queue[P.qi]); }
}

audio.addEventListener("loadedmetadata", () => { if (P.pendingSeek && audio.duration > P.pendingSeek + 5) audio.currentTime = P.pendingSeek; P.pendingSeek = 0; });
audio.addEventListener("playing", () => { clearTimeout(P.stallT); P.retries = 0; paint("playing"); });
audio.addEventListener("waiting", () => { if (!P.want) return; paint("loading"); clearTimeout(P.stallT); P.stallT = setTimeout(() => { if (audio.readyState < 3) fail(); }, 15000); });
audio.addEventListener("pause", () => {
  if (!P.want && !audio.ended && P.state !== "error") { paint("idle"); return; }
  // paused by the system (call, headphones unplugged, lock-screen control): reflect it
  setTimeout(() => { if (P.want && audio.paused && !audio.ended && audio.readyState >= 2) { P.want = false; clearTimeout(P.stallT); paint("idle"); } }, 400);
});
audio.addEventListener("error", () => { if (audio.getAttribute("src")) fail(); });
audio.addEventListener("ended", () => {
  if (P.cur && P.cur.kind === "file") store.del("pos:" + P.cur.url);
  if (P.sleepAtEnd) { P.sleepAtEnd = false; setSleep(0); P.want = false; paint("idle"); toast("انتهى مؤقت النوم"); return; }
  if (!next()) { P.want = false; paint("idle"); if (P.onEnd) P.onEnd(); }
});
let lastSave = 0;
audio.addEventListener("timeupdate", () => {
  const it = P.cur; if (!it || it.kind !== "file") { $("#capProg").style.width = "0"; return; }
  const d = audio.duration || 0, t = audio.currentTime;
  if (!seeking) { $("#seekBar").value = d ? t / d * 1000 : 0; $("#tCur").textContent = fmt(t); $("#tDur").textContent = fmt(d); }
  $("#capProg").style.width = d ? (t / d * 100) + "%" : "0";
  if (d > 240 && Date.now() - lastSave > 5000) { lastSave = Date.now(); store.set("pos:" + it.url, t); }
});
let seeking = false;
$("#seekBar").addEventListener("input", e => { seeking = true; $("#tCur").textContent = fmt(e.target.value / 1000 * (audio.duration || 0)); });
$("#seekBar").addEventListener("change", e => { const d = audio.duration || 0; if (d) audio.currentTime = e.target.value / 1000 * d; seeking = false; });
window.addEventListener("online", () => { if (P.state === "error" && P.cur) { P.retries = 0; load(false); } });

/* controls */
$("#capBtn").onclick = toggle;
$("#shPlay").onclick = toggle;
$("#heroBtn").onclick = () => { if (P.cur && P.cur.kind === "live") toggle(); else play(stationItem(STATIONS.find(s => s.id === store.get("lastStation", "cairo")) || STATIONS[0])); };
$("#retryBtn").onclick = () => { P.retries = 0; load(false); };
$("#shNext").onclick = () => next();
$("#shPrev").onclick = prev;
$("#shFwd").onclick = () => { audio.currentTime = Math.min((audio.duration || 0) - 1, audio.currentTime + 15); };
$("#shBack").onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); };
const rate = $("#rate"); rate.value = String(store.get("rate", 1));
rate.onchange = () => { store.set("rate", +rate.value); if (P.cur && P.cur.kind === "file") audio.playbackRate = +rate.value; };
const vol = $("#vol"); vol.value = store.get("vol", .9); audio.volume = +vol.value;
vol.oninput = () => { audio.volume = +vol.value; store.set("vol", +vol.value); };
document.addEventListener("keydown", e => {
  if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
  if (e.key === "Escape") closeSheet();
});

/* sleep timer */
function setSleep(min) {
  clearTimeout(P.sleepT); P.sleepAtEnd = false; P.sleepEnd = 0;
  if (min === -1) { P.sleepAtEnd = true; }
  else if (min > 0) {
    P.sleepEnd = Date.now() + min * 60000;
    P.sleepT = setTimeout(() => {
      const v0 = audio.volume; let k = 0;
      const f = setInterval(() => { k++; audio.volume = Math.max(0, v0 * (1 - k / 20)); if (k >= 20) { clearInterval(f); stop(); audio.volume = v0; P.sleepEnd = 0; sleepLabel(); toast("انتهى مؤقت النوم"); } }, 1000);
    }, Math.max(0, min * 60000 - 20000));
  }
  $("#sleepSel").value = String(min);
  sleepLabel();
}
function sleepLabel() {
  const b = $("#sleepBtn"), t = $("#sleepTxt");
  if (P.sleepAtEnd) { b.classList.add("on"); t.textContent = "آخر السورة"; return; }
  if (!P.sleepEnd) { b.classList.remove("on"); t.textContent = ""; return; }
  b.classList.add("on"); t.textContent = ard(Math.max(0, Math.ceil((P.sleepEnd - Date.now()) / 60000))) + "د";
}
const SLEEP_CYCLE = [0, 15, 30, 60];
$("#sleepBtn").onclick = () => {
  const curMin = P.sleepEnd ? Math.round((P.sleepEnd - Date.now()) / 60000) : 0;
  const i = SLEEP_CYCLE.findIndex(m => m > curMin + 1);
  const m = P.sleepAtEnd ? 0 : (i === -1 ? 0 : SLEEP_CYCLE[i]);
  setSleep(m); toast(m ? `سيتوقف التشغيل بعد ${ard(m)} دقيقة` : "تم إلغاء مؤقت النوم");
};
$("#sleepSel").onchange = e => setSleep(+e.target.value);
setInterval(sleepLabel, 20000);

/* sheet */
function openSheet() { if (!P.cur) { toggle(); return; } const s = $("#sheet"), c = $("#scrim"); if (!s.hidden) return; s.hidden = c.hidden = false;
  history.pushState({ sheet: 1 }, "", location.hash || "#radio"); void s.offsetHeight; s.classList.add("show"); c.classList.add("show"); paint(P.state); }
function closeSheet(fromPop) { const s = $("#sheet"), c = $("#scrim"); if (s.hidden) return;
  if (fromPop !== true && history.state && history.state.sheet) { history.back(); return; } s.classList.remove("show"); c.classList.remove("show"); setTimeout(() => { s.hidden = c.hidden = true; }, 380); }
$("#capOpen").onclick = openSheet; $("#sheetClose").onclick = () => closeSheet(); $("#scrim").onclick = () => closeSheet();
(() => { let y0 = null; const s = $("#sheet");
  s.addEventListener("touchstart", e => { if (s.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  s.addEventListener("touchmove", e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { s.style.transition = "none"; s.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  s.addEventListener("touchend", e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; s.style.transition = ""; s.style.transform = ""; y0 = null; if (dy > 110) closeSheet(); });
})();

/* lock screen */
if ("mediaSession" in navigator) try {
  navigator.mediaSession.setActionHandler("play", () => { if (!P.want) toggle(); });
  navigator.mediaSession.setActionHandler("pause", stop);
  navigator.mediaSession.setActionHandler("nexttrack", () => next());
  navigator.mediaSession.setActionHandler("previoustrack", prev);
  navigator.mediaSession.setActionHandler("seekforward", () => { audio.currentTime += 15; });
  navigator.mediaSession.setActionHandler("seekbackward", () => { audio.currentTime -= 15; });
} catch (e) {}

/* =========================================================
   ROUTER
   ========================================================= */
const VIEWS = ["radio", "quran", "ruqyah", "adhkar", "prayer"];
const inited = {};
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "radio";
  const swap = () => {
    $$(".view").forEach(s => { s.hidden = s.dataset.view !== v; });
    $$("[data-nav]").forEach(a => a.dataset.nav === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  };
  swap();
  { const h = document.documentElement; h.style.scrollBehavior = "auto"; window.scrollTo(0, 0); h.style.scrollBehavior = ""; }
  if (!inited[v]) { inited[v] = true; INIT[v](); }
  if (v === "prayer") tickPrayer();
  store.set("view", v);
}
window.addEventListener("hashchange", route);
window.addEventListener("popstate", e => {
  const st = e.state || {};
  if (!st.sheet && !$("#sheet").hidden) closeSheet(true);
  if (!st.rec && !$("#qReciter").hidden) closeReciter();
});

/* =========================================================
   RADIO
   ========================================================= */
const stationItem = s => ({ kind: "live", key: "st:" + s.id, title: s.full, sub: s.note, eyebrow: "بث مباشر · " + s.tag, url: s.url });
let RADIOS = [], radShown = 25;
const INIT = {};
INIT.radio = () => {
  $("#stations").innerHTML = STATIONS.map(s => `
    <button class="st" data-key="st:${s.id}" data-st="${s.id}" aria-label="تشغيل ${s.full}">
      <span class="flag">${s.tag}</span><h3>${s.name}</h3><small>${s.note}</small>
      <span class="mini pi">${IC.play}</span>
    </button>`).join("");
  $("#stations").onclick = e => { const b = e.target.closest("[data-st]"); if (!b) return;
    const s = STATIONS.find(x => x.id === b.dataset.st); store.set("lastStation", s.id);
    if (P.cur && P.cur.key === "st:" + s.id) toggle(); else play(stationItem(s));
    window.scrollTo({ top: 0, behavior: "smooth" }); };
  loadRadios();
  paint(P.state);
};
async function loadRadios() {
  try {
    const d = await getJSON(API + "radios?language=ar", "c:radios", 24);
    const featured = new Set(STATIONS.map(s => s.url));
    RADIOS = d.radios.filter(r => !featured.has(r.url) && !norm(r.name).includes(norm("ترجمة معاني القرآن"))).map(r => ({ id: r.id, name: r.name.replace(/\*/g, "").replace(/\s+/g, " ").trim(), url: r.url }))
      .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), "ar"));
    $("#radCount").textContent = ard(RADIOS.length) + " إذاعة";
    renderRadios();
  } catch (e) { $("#radList").innerHTML = `<div class="empty">تعذّر تحميل الإذاعات. <button class="link-btn" id="radRetry">إعادة المحاولة</button></div>`; $("#radRetry").onclick = loadRadios; }
}
function renderRadios() {
  const q = norm($("#radSearch").value);
  const qt = q.replace(/\s+/g, "");
  const list = q ? RADIOS.filter(r => matches(q, r.name)).sort((a, b) => tight(b.name).startsWith(qt) - tight(a.name).startsWith(qt)) : RADIOS;
  const shown = list.slice(0, radShown);
  $("#radList").innerHTML = shown.length ? shown.map(r => `
    <button class="item" data-key="rad:${r.id}" data-rad="${r.id}">
      <span class="medal">${IC.radio.replace('aria-hidden="true"', 'aria-hidden="true" width="18" height="18"')}</span>
      <span class="t"><b>${esc(r.name)}</b><small>إذاعة متواصلة</small></span><span class="ic pi">${IC.play}</span>
    </button>`).join("") : `<div class="empty">لا توجد إذاعة بهذا الاسم</div>`;
  $("#radMore").hidden = list.length <= radShown;
  paint(P.state);
}
$("#radSearch").addEventListener("input", debounce(() => { radShown = 25; renderRadios(); }, 150));
$("#radMore").onclick = () => { radShown += 60; renderRadios(); };
$("#radList").onclick = e => { const b = e.target.closest("[data-rad]"); if (!b) return;
  const r = RADIOS.find(x => String(x.id) === b.dataset.rad);
  if (P.cur && P.cur.key === "rad:" + r.id) { toggle(); return; }
  play({ kind: "live", key: "rad:" + r.id, title: "إذاعة " + r.name, sub: "إذاعة متواصلة", eyebrow: "إذاعات القرّاء", url: r.url }); };

/* =========================================================
   QURAN
   ========================================================= */
/* best-known reciters shown first, in this order (matched on name words) */
const FAMOUS = [["عبدالباسط"], ["الحصري"], ["المنشاوي"], ["مصطفي", "اسماعيل"], ["البنا"], ["الطبلاوي"], ["العفاسي"], ["المعيقلي"], ["السديس"], ["الشريم"],
  ["الغامدي"], ["ياسر", "الدوسري"], ["العجمي"], ["فارس", "عباد"], ["القطامي"], ["الشاطري"], ["الحذيفي"], ["محمد", "ايوب"], ["خالد", "الجليل"], ["محمد", "جبريل"], ["البلوشي"], ["ادريس", "ابكر"]]
  .map(a => a.map(w => w.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي")));
const rwGroup = rw => rw.startsWith("حفص عن عاصم") ? "حفص عن عاصم" : rw.startsWith("ورش عن نافع") ? "ورش عن نافع" : "";
let RECITERS = [], SUWAR = {}, RW = [], rwSel = store.get("rw", "حفص عن عاصم"), recShown = 25, curRec = null, curMoshaf = null;
const rwKey = name => name.split(" - ")[0].replace(/^برواية\s+/, "").replace(/\s+/g, " ").replace(/\s*-[^-]*-\s*$/, "").trim();
const mType = name => (name.split(" - ")[1] || "").trim();
INIT.quran = async () => {
  try {
    const [r, s] = await Promise.all([getJSON(API + "reciters?language=ar", "c:reciters", 24), getJSON(API + "suwar?language=ar", "c:suwar", 240)]);
    s.suwar.forEach(x => SUWAR[x.id] = x.name);
    RECITERS = r.reciters.map(x => ({ id: x.id, name: x.name.trim(), n: norm(x.name),
      moshaf: x.moshaf.map(m => ({ id: m.id, rw: rwKey(m.name), type: mType(m.name), server: m.server, list: m.surah_list.split(",").map(Number) })).filter(m => rwGroup(m.rw)) }))
      .filter(x => x.moshaf.length).sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), "ar"));
    RECITERS.forEach(r => { r.name = r.name.replace(/\s+/g, " "); const t = tight(r.name); r.fam = FAMOUS.findIndex(f => f.every(w => t.includes(w))); r.letter = sortKey(r.name)[0] || ""; });
    const cnt = {}; RECITERS.forEach(x => new Set(x.moshaf.map(m => rwGroup(m.rw))).forEach(k => cnt[k] = (cnt[k] || 0) + 1));
    RW = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    if (!cnt[rwSel]) rwSel = "حفص عن عاصم";
    $("#recCount").textContent = ard(RECITERS.length) + " قارئ";
    $("#recSearch").placeholder = "ابحث عن قارئ (مثال: عبدالباسط، المنشاوي)";
    renderRw(); renderRecs();
    const last = store.get("lastRec", null);
    if (location.hash === "#quran" && last && store.get("quranOpen", false)) openReciter(last.rec, last.moshaf);
  } catch (e) { $("#recList").innerHTML = `<div class="empty">تعذّر تحميل القرّاء. <button class="link-btn" id="recRetry">إعادة المحاولة</button></div>`; $("#recRetry").onclick = () => { inited.quran = false; INIT.quran(); }; }
};
function renderRw() {
  const total = RECITERS.length;
  $("#rwChips").innerHTML = RW.map(([k, c]) => `<button class="chip" data-rw="${esc(k)}" aria-pressed="${rwSel === k}">${esc(k.replace(" عن ", " · "))}<small>${ard(c)}</small></button>`).join("");
  $("#rwHint").textContent = `رواية ${rwSel}`;
}
$("#rwChips").onclick = e => { const b = e.target.closest("[data-rw]"); if (!b) return; rwSel = b.dataset.rw; store.set("rw", rwSel); recShown = 25; renderRw(); renderRecs(); };
function renderRecs() {
  const q = norm($("#recSearch").value);
  let list = RECITERS.filter(r => (rwSel === "all" || r.moshaf.some(m => rwGroup(m.rw) === rwSel)) && matches(q, r.name));
  let fam = [];
  if (q) list.sort((a, b) => (tight(b.name).startsWith(q.replace(/\s+/g, "")) - tight(a.name).startsWith(q.replace(/\s+/g, ""))) || ((a.fam < 0 ? 99 : a.fam) - (b.fam < 0 ? 99 : b.fam)));
  else { fam = list.filter(r => r.fam >= 0).sort((a, b) => a.fam - b.fam); list = list.filter(r => r.fam < 0); }
  const shown = list.slice(0, recShown);
  const row = r => {
    const ms = rwSel === "all" ? r.moshaf : r.moshaf.filter(m => rwGroup(m.rw) === rwSel);
    const types = [...new Set(ms.map(m => m.type).filter(Boolean))].join(" · ");
    const rws = rwSel === "all" ? [...new Set(r.moshaf.map(m => m.rw))].length : 0;
    return `<button class="item" data-rec="${r.id}">
      <span class="medal">${esc(r.name.replace(/^(ال)/, "").trim()[0] || "")}</span>
      <span class="t"><b>${esc(r.name)}</b><small>${esc(types || "تلاوة")}${rws > 1 ? ` · ${ard(rws)} روايات` : ""}</small></span>${IC.arrow}</button>`;
  };
  let html = "";
  if (fam.length) html += `<div class="group-h">الأشهر</div>` + fam.map(row).join("") + `<div class="group-h">كل القرّاء أبجديًا</div>`;
  let lastL = "";
  html += shown.map(r => { let h = ""; if (!q && r.letter !== lastL) { lastL = r.letter; h = `<div class="letter">${esc(r.letter)}</div>`; } return h + row(r); }).join("");
  $("#recList").innerHTML = (fam.length || shown.length) ? html : `<div class="empty">لا يوجد قارئ بهذا الاسم${rwSel !== "all" ? ` في رواية ${esc(rwSel)}. <button class="link-btn" data-rw="all">ابحث في كل الروايات</button>` : ""}</div>`;
  $("#recMore").hidden = list.length <= recShown;
}
$("#recSearch").addEventListener("input", debounce(() => { recShown = 25; renderRecs(); }, 150));
$("#recMore").onclick = () => { recShown += 60; renderRecs(); };
$("#recList").onclick = e => {
  const a = e.target.closest("[data-rw]"); if (a) { rwSel = "all"; store.set("rw", rwSel); renderRw(); renderRecs(); return; }
  const b = e.target.closest("[data-rec]"); if (b) openReciter(+b.dataset.rec); };
function openReciter(id, moshafId) {
  const r = RECITERS.find(x => x.id === id); if (!r) return;
  curRec = r;
  const ms = rwSel === "all" ? r.moshaf : r.moshaf.filter(m => rwGroup(m.rw) === rwSel);
  const pool = (ms.length ? ms : r.moshaf).slice().sort((a, b) => (b.list.length - a.list.length) || ((b.type === "مرتل") - (a.type === "مرتل")));
  curMoshaf = pool.find(m => m.id === moshafId) || pool[0];
  $("#qPick").hidden = true; $("#qReciter").hidden = false; store.set("quranOpen", true);
  if (!(history.state && history.state.rec)) history.pushState({ rec: id }, "", "#quran");
  $("#recAvatar").textContent = r.name.replace(/^(ال)/, "").trim()[0] || "";
  $("#recName").textContent = r.name;
  $("#moshafChips").innerHTML = r.moshaf.map(m => `<button class="chip" data-ms="${m.id}" aria-pressed="${m.id === curMoshaf.id}">${esc(m.rw)}${m.type ? " · " + esc(m.type) : ""}<small>${ard(m.list.length)}</small></button>`).join("");
  $("#moshafChips").hidden = r.moshaf.length < 2;
  renderSuras();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderSuras() {
  const m = curMoshaf, q = norm($("#suraSearch").value);
  $("#recMeta").textContent = `${m.rw}${m.type ? " · " + m.type : ""} · ${ard(m.list.length)} سورة`;
  const list = m.list.filter(n => !q || norm(SUWAR[n]).includes(q) || String(n) === q.replace(/[٠-٩]/g, d => AR.indexOf(d)));
  $("#suraList").innerHTML = list.map(n => `<button class="sura" data-key="q:${m.id}:${n}" data-sura="${n}"><span class="medal">${ard(n)}</span><b>${esc(SUWAR[n] || "سورة " + n)}</b><span class="ic pi" style="width:18px;height:18px">${IC.play}</span></button>`).join("") || `<div class="empty">لا توجد سورة بهذا الاسم</div>`;
  const last = store.get("lastQ:" + m.id, null);
  const rb = $("#resumeBtn");
  if (last && SUWAR[last]) { rb.hidden = false; rb.textContent = "تابع من سورة " + SUWAR[last]; rb.dataset.sura = last; } else rb.hidden = true;
  paint(P.state);
}
$("#suraSearch").addEventListener("input", debounce(renderSuras, 120));
$("#moshafChips").onclick = e => { const b = e.target.closest("[data-ms]"); if (!b) return; curMoshaf = curRec.moshaf.find(m => m.id === +b.dataset.ms);
  $$("#moshafChips .chip").forEach(c => c.setAttribute("aria-pressed", c === b)); renderSuras(); };
function closeReciter() { $("#qReciter").hidden = true; $("#qPick").hidden = false; store.set("quranOpen", false); $("#suraSearch").value = ""; }
$("#qBack").onclick = () => { if (history.state && history.state.rec) history.back(); else closeReciter(); };
function suraItem(m, rec, n) {
  return { kind: "file", key: `q:${m.id}:${n}`, title: "سورة " + (SUWAR[n] || n), sub: rec.name, eyebrow: m.rw + (m.type ? " · " + m.type : ""),
    url: m.server + String(n).padStart(3, "0") + ".mp3", rec: rec.id, moshaf: m.id, n };
}
function playSura(n) {
  const m = curMoshaf, rec = curRec;
  const key = `q:${m.id}:${n}`;
  if (P.cur && P.cur.key === key) { toggle(); return; }
  const queue = m.list.map(x => suraItem(m, rec, x));
  const names = {}; m.list.forEach(x => names[x] = SUWAR[x]);
  store.set("lastQueue", { moshaf: m.id, rec: rec.id, recName: rec.name, server: m.server, list: m.list, names });
  play(queue[m.list.indexOf(n)], queue, m.list.indexOf(n));
}
P.onTrack = it => { if (it.moshaf) { store.set("lastQ:" + it.moshaf, it.n); store.set("lastRec", { rec: it.rec, moshaf: it.moshaf }); } };
$("#suraList").onclick = e => { const b = e.target.closest("[data-sura]"); if (b) playSura(+b.dataset.sura); };
$("#playFrom1").onclick = () => playSura(curMoshaf.list[0]);
$("#resumeBtn").onclick = e => playSura(+e.currentTarget.dataset.sura);

/* =========================================================
   RUQYAH
   ========================================================= */
let rRec = RUQYAH_RECITERS.find(r => r.id === store.get("rRec", "husary")) || RUQYAH_RECITERS[0];
const rItem = (s, ctx) => ({ kind: "file", key: "r:" + s.n, title: s.name, sub: rRec.name, eyebrow: "الرقية الشرعية", url: rRec.base + String(s.n).padStart(3, "0") + ".mp3", ctx });
INIT.ruqyah = () => {
  $("#rRec").innerHTML = RUQYAH_RECITERS.map(r => `<option value="${r.id}"${r.id === rRec.id ? " selected" : ""}>${r.name}</option>`).join("");
  $("#rTimes").value = String(store.get("rTimes", 1));
  $("#rTriple").checked = store.get("rTriple", true);
  $("#rBaqara").checked = store.get("rBaqara", false);
  $("#rReader").innerHTML = RUQYAH_TEXT.map(v => `<div class="part"><h3>${v.h}<span>${v.s}</span></h3><p class="q">${v.q}</p></div>`).join("");
  renderRTracks();
};
function renderRTracks() {
  $("#rTracks").innerHTML = RUQYAH_SURAS.map((s, i) => `
    <button class="item" data-key="r:${s.n}" data-r="${i}">
      <span class="medal">${ard(i + 1)}</span>
      <span class="t"><b>${s.name}</b><small>${rRec.name}${s.long ? " · تلاوة طويلة" : ""}</small></span>
      <span class="ic pi">${IC.play}</span></button>`).join("");
  paint(P.state);
}
function buildRuqyah() {
  const triple = $("#rTriple").checked, baq = $("#rBaqara").checked, times = +$("#rTimes").value;
  const one = [];
  RUQYAH_SURAS.forEach(s => {
    if (s.long && !baq) return;
    const reps = s.triple && triple ? 3 : 1;
    for (let k = 1; k <= reps; k++) one.push({ s, k, reps });
  });
  const rounds = times || 1, q = [];
  for (let r = 1; r <= rounds; r++) one.forEach(x => q.push(rItem(x.s, { round: r, rounds: times, k: x.k, reps: x.reps })));
  return { q, loop: times === 0 };
}
function rProgress() {
  const it = P.cur, el = $("#rProg");
  if (!it || !it.ctx) { el.hidden = true; return; }
  el.hidden = false;
  const c = it.ctx;
  el.textContent = `${c.rounds === 0 ? "تكرار مستمر" : c.rounds > 1 ? `الدورة ${ard(c.round)} من ${ard(c.rounds)}` : "الرقية كاملة"} · ${it.title}${c.reps > 1 ? ` (${ard(c.k)} من ${ard(c.reps)})` : ""}`;
  $("#shQueue").textContent = el.textContent;
}
audio.addEventListener("playing", rProgress);
$("#rPlay").onclick = () => { const { q, loop } = buildRuqyah(); play(q[0], q, 0, { loop, onEnd: () => { $("#rProg").textContent = "انتهت الرقية، تقبّل الله"; } }); };
$("#rTracks").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; const s = RUQYAH_SURAS[+b.dataset.r];
  if (P.cur && P.cur.key === "r:" + s.n && !P.cur.ctx) { toggle(); return; } play(rItem(s)); };
$("#rRec").onchange = e => { rRec = RUQYAH_RECITERS.find(r => r.id === e.target.value); store.set("rRec", rRec.id); renderRTracks(); };
$("#rTimes").onchange = e => store.set("rTimes", +e.target.value);
$("#rTriple").onchange = e => store.set("rTriple", e.target.checked);
$("#rBaqara").onchange = e => store.set("rBaqara", e.target.checked);
$$("#v-ruqyah .seg button").forEach(tb => tb.onclick = () => {
  $$("#v-ruqyah .seg button").forEach(x => { x.setAttribute("aria-selected", x === tb); $("#" + x.getAttribute("aria-controls")).hidden = x !== tb; });
  if (tb.id === "rt-t") loadQuranFont();
});

/* quran font + size */
let qFont = false;
function loadQuranFont() { if (qFont) return; qFont = true; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Amiri+Quran&display=swap"; document.head.appendChild(l); }
let qs = store.get("qs", 1.7);
const setQs = v => { qs = Math.min(2.6, Math.max(1.2, v)); document.documentElement.style.setProperty("--qs", qs); store.set("qs", qs); };
setQs(qs);
document.addEventListener("click", e => { if (e.target.closest(".fsUp")) setQs(qs + .15); if (e.target.closest(".fsDown")) setQs(qs - .15); });

/* =========================================================
   ADHKAR
   ========================================================= */
let period = (() => { const h = new Date().getHours(); return h >= 3 && h < 15 ? "m" : "e"; })();
INIT.adhkar = () => { loadQuranFont(); setPeriod(period); };
const adhKey = () => "adh:" + todayKey() + ":" + period;
function adhItems() { return ADHKAR.filter(d => !d.only || d.only === period); }
function setPeriod(p) {
  period = p;
  $$("#v-adhkar .seg button").forEach(b => b.setAttribute("aria-selected", b.dataset.period === p));
  $("#adhTitle").textContent = p === "m" ? "أذكار الصباح" : "أذكار المساء";
  renderAdhkar();
}
function renderAdhkar() {
  const st = store.get(adhKey(), {});
  $("#adhList").innerHTML = adhItems().map(d => {
    const n = Math.min(st[d.id] || 0, d.c), txt = period === "e" && d.e ? d.e : d.m;
    return `<button class="dhikr${n >= d.c ? " done" : ""}" data-dh="${d.id}">
      ${d.title ? `<span class="ttl">${d.title}</span>` : ""}
      <p class="${d.q ? "q" : "q naskh"}">${txt}</p>
      <span class="dt"><span class="src">${d.q ? "قرآن كريم" : d.src}${d.c > 1 ? ` · ${ard(d.c)} ${d.c >= 11 ? "مرة" : "مرات"}` : ""}</span>
      <span class="ring" style="--p:${n / d.c * 100}"><span>${n >= d.c ? "✓" : ard(d.c - n)}</span></span></span></button>`;
  }).join("");
  adhProgress(st);
}
function adhProgress(st) {
  const items = adhItems(); let done = 0, total = 0, full = 0;
  items.forEach(d => { const n = Math.min(st[d.id] || 0, d.c); done += n; total += d.c; if (n >= d.c) full++; });
  $("#adhBar").style.width = (done / total * 100) + "%";
  $("#adhProg").textContent = `${ard(full)} من ${ard(items.length)}`;
}
$("#adhList").onclick = e => {
  const b = e.target.closest("[data-dh]"); if (!b) return;
  const d = ADHKAR.find(x => x.id === b.dataset.dh), st = store.get(adhKey(), {});
  const n = (st[d.id] || 0);
  if (n >= d.c) return;
  st[d.id] = n + 1; store.set(adhKey(), st);
  if (navigator.vibrate) try { navigator.vibrate(n + 1 >= d.c ? [12, 40, 12] : 8); } catch (x) {}
  const left = d.c - n - 1, ring = b.querySelector(".ring");
  ring.style.setProperty("--p", (n + 1) / d.c * 100); ring.querySelector("span").textContent = left ? ard(left) : "✓";
  b.classList.add("bump"); setTimeout(() => b.classList.remove("bump"), 120);
  if (!left) {
    b.classList.add("done");
    const nextEl = [...$$("#adhList .dhikr")].find(x => !x.classList.contains("done"));
    if (nextEl) setTimeout(() => nextEl.scrollIntoView({ behavior: "smooth", block: "center" }), 280);
    else toast("أتممت " + (period === "m" ? "أذكار الصباح" : "أذكار المساء") + "، تقبّل الله");
  }
  adhProgress(st);
};
$$("#v-adhkar .seg button").forEach(b => b.onclick = () => setPeriod(b.dataset.period));
$("#adhReset").onclick = () => { store.del(adhKey()); renderAdhkar(); toast("تم تصفير العدّاد"); };

/* =========================================================
   PRAYER TIMES
   ========================================================= */
const tzCity = { "Asia/Dubai": "dubai", "Africa/Cairo": "cairo", "Asia/Riyadh": "riyadh" };
let city = CITIES.find(c => c.id === store.get("city", tzCity[Intl.DateTimeFormat().resolvedOptions().timeZone] || "dubai")) || CITIES[0];
let PT = null, ptTimer = null;
const to12 = hm => { let [h, m] = hm.split(":").map(Number); const s = h < 12 ? "ص" : "م"; h = h % 12 || 12; return ard(h + ":" + String(m).padStart(2, "0")) + " " + s; };
const mins = hm => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
function nowIn(tz) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = t => +p.find(x => x.type === t).value; return g("hour") * 3600 + g("minute") * 60 + g("second");
}
INIT.prayer = () => {
  $("#pCity").innerHTML = CITIES.map(c => `<option value="${c.id}"${c.id === city.id ? " selected" : ""}>${c.name}</option>`).join("");
  renderPrayer();
};
$("#pCity").onchange = e => { city = CITIES.find(c => c.id === e.target.value); store.set("city", city.id); loadPrayer(true); };
async function loadPrayer(render) {
  try {
    const d = await getJSON(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&method=${city.method}`,
      "pt:" + city.id + ":" + todayKey(), 20);
    PT = { t: d.data.timings, tz: d.data.meta.timezone, hijri: d.data.date.hijri, greg: d.data.date.readable };
    if (render) renderPrayer(); tickPrayer();
  } catch (e) {
    if (render) { $("#pTimes").innerHTML = `<div class="empty">تعذّر تحميل المواقيت. <button class="link-btn" id="ptRetry">إعادة المحاولة</button></div>`; $("#ptRetry").onclick = () => loadPrayer(true); }
  }
}
function renderPrayer() {
  if (!PT) { loadPrayer(true); return; }
  const h = PT.hijri;
  $("#pDate").textContent = `${ard(h.day)} ${h.month.ar} ${ard(h.year)} هـ · ${city.name}`;
  $("#pTimes").innerHTML = PRAYERS.map(p => `<div class="time${p.minor ? " minor" : ""}" data-p="${p.k}"><b>${p.n}</b><span>${to12(PT.t[p.k])}</span></div>`).join("");
  $("#pNote").textContent = `طريقة الحساب: ${{ 16: "دبي", 5: "الهيئة المصرية العامة للمساحة", 4: "أم القرى" }[city.method]}. قد تختلف المواعيد دقيقة أو دقيقتين عن التقويم الرسمي.`;
  tickPrayer();
}
function tickPrayer() {
  if (!PT) return;
  const now = nowIn(PT.tz);
  const order = PRAYERS.filter(p => !p.minor);
  let nx = order.find(p => mins(PT.t[p.k]) * 60 > now), tomorrow = false;
  if (!nx) { nx = order[0]; tomorrow = true; }
  let diff = mins(PT.t[nx.k]) * 60 - now; if (tomorrow) diff += 86400;
  const hh = Math.floor(diff / 3600), mm = Math.floor(diff % 3600 / 60), ss = diff % 60;
  const cd = ard(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`);
  if (!$("#v-prayer").hidden) {
    $("#pNext").textContent = "صلاة " + nx.n;
    $("#pCount").textContent = cd;
    $("#pAt").textContent = (tomorrow ? "غدًا " : "") + "الساعة " + to12(PT.t[nx.k]);
    $$("#pTimes .time").forEach(el => { const k = el.dataset.p; el.classList.toggle("next", k === nx.k && !tomorrow || (tomorrow && k === "Fajr"));
      el.classList.toggle("past", !tomorrow && mins(PT.t[k]) * 60 <= now); });
  }
  const chip = $("#nextChip"); chip.hidden = false;
  chip.innerHTML = `<b>${nx.n}</b> ${to12(PT.t[nx.k])}`;
}
$("#nextChip").onclick = () => { location.hash = "#prayer"; };
setInterval(() => { if (!$("#v-prayer").hidden) tickPrayer(); }, 1000);
setInterval(tickPrayer, 30000);

/* sadaqa: play Al-Fatiha */
$("#fatihaBtn").onclick = () => {
  const it = { kind: "file", key: "fatiha:sadaqa", title: "سورة الفاتحة", sub: "على أرواح فؤاد ومحاسن ونادية وأحمد", eyebrow: "صدقة جارية",
    url: "https://cdn.mp3quran.net/audio/mahmoud-husary/r1/001.mp3" };
  if (P.cur && P.cur.key === it.key) { toggle(); return; }
  play(it); toast("رحمهم الله وجعلها في ميزان حسناتهم");
};

/* =========================================================
   APP CHROME
   ========================================================= */
$("#themeBtn").onclick = () => { const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
  r.dataset.theme = dark ? "light" : "dark"; store.set("theme", r.dataset.theme);
  document.querySelector('meta[name="theme-color"]').content = dark ? "#f5efe0" : "#071512"; };

let deferred = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#installBtn").hidden = false; });
$("#installBtn").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $("#installBtn").hidden = true; };
if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

/* boot */
if (!location.hash) { const v = store.get("view", "radio"); history.replaceState(null, "", "#" + v); }
route();
const last = store.get("lastItem", null);
if (last) { P.cur = null; setMeta(last); $("#capSub").textContent = "اضغط للمتابعة · " + last.sub; }
if (!last || last.kind !== "live") { const s = STATIONS.find(x => x.id === store.get("lastStation", "cairo")) || STATIONS[0];
  $("#heroEyebrow").textContent = "بث مباشر · " + s.tag; $("#heroTitle").textContent = s.full; $("#heroSub").textContent = s.note; }
paint("idle");
idle(() => { if (!inited.quran) { getJSON(API + "reciters?language=ar", "c:reciters", 24).catch(() => {}); getJSON(API + "suwar?language=ar", "c:suwar", 240).catch(() => {}); }
  loadPrayer(false); });
})();
