"use strict";
(() => {
  if (window.__sakinaRemindersReady) return;
  window.__sakinaRemindersReady = true;

  const CITIES = (window.SAKINA && Array.isArray(window.SAKINA.CITIES) && window.SAKINA.CITIES.length)
    ? window.SAKINA.CITIES
    : [
      { id: "dubai", name: "دبي", city: "Dubai", country: "United Arab Emirates", method: 16 },
      { id: "abudhabi", name: "أبوظبي", city: "Abu Dhabi", country: "United Arab Emirates", method: 16 },
      { id: "sharjah", name: "الشارقة", city: "Sharjah", country: "United Arab Emirates", method: 16 },
      { id: "alain", name: "العين", city: "Al Ain", country: "United Arab Emirates", method: 16 },
      { id: "cairo", name: "القاهرة", city: "Cairo", country: "Egypt", method: 5 },
      { id: "alex", name: "الإسكندرية", city: "Alexandria", country: "Egypt", method: 5 },
      { id: "makkah", name: "مكة المكرمة", city: "Makkah", country: "Saudi Arabia", method: 4 },
      { id: "madinah", name: "المدينة المنورة", city: "Medina", country: "Saudi Arabia", method: 4 },
      { id: "riyadh", name: "الرياض", city: "Riyadh", country: "Saudi Arabia", method: 4 },
      { id: "jeddah", name: "جدة", city: "Jeddah", country: "Saudi Arabia", method: 4 }
    ];

  const PRAYERS = [
    { k: "Fajr", n: "الفجر" },
    { k: "Dhuhr", n: "الظهر" },
    { k: "Asr", n: "العصر" },
    { k: "Maghrib", n: "المغرب" },
    { k: "Isha", n: "العشاء" }
  ];
  const KEY = "sakina:reminders";
  const FIRED_PREFIX = "sakina:reminder-fired:";
  const AR = "٠١٢٣٤٥٦٧٨٩";
  const timers = [];
  let modal = null;
  let refreshTimer = null;

  const track = (name, params) => {
    try { if (window.sakinaTrack) window.sakinaTrack(name, params || {}); } catch (e) {}
  };
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ard = value => String(value).replace(/\d/g, d => AR[d]);

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function currentCityId() {
    const saved = readJSON("sakina:city", null);
    if (saved && CITIES.some(c => c.id === saved)) return saved;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === "Africa/Cairo") return "cairo";
    if (tz === "Asia/Riyadh") return "riyadh";
    return "dubai";
  }
  function defaults() {
    return {
      version: 1,
      enabled: false,
      city: currentCityId(),
      leadMinutes: 0,
      prayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
      adhkar: {
        morning: { enabled: true, time: "07:00" },
        evening: { enabled: true, time: "18:00" }
      }
    };
  }
  function getPrefs() {
    const base = defaults();
    const saved = readJSON(KEY, {});
    return {
      ...base,
      ...saved,
      prayers: { ...base.prayers, ...(saved.prayers || {}) },
      adhkar: {
        morning: { ...base.adhkar.morning, ...((saved.adhkar && saved.adhkar.morning) || {}) },
        evening: { ...base.adhkar.evening, ...((saved.adhkar && saved.adhkar.evening) || {}) }
      }
    };
  }
  function savePrefs(prefs) {
    writeJSON(KEY, prefs);
    writeJSON("sakina:city", prefs.city);
  }
  function cityTZ(city) {
    return city.country === "Egypt" ? "Africa/Cairo" : city.country === "Saudi Arabia" ? "Asia/Riyadh" : "Asia/Dubai";
  }
  function partsInZone(date, timeZone) {
    const out = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(date).forEach(p => { if (p.type !== "literal") out[p.type] = Number(p.value); });
    return out;
  }
  function dateKeyInZone(date, timeZone) {
    const p = partsInZone(date, timeZone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }
  function addDay(day, count) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + (count || 1))).toISOString().slice(0, 10);
  }
  function apiDate(day) { return day.split("-").reverse().join("-"); }
  function cleanTime(value) {
    const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : null;
  }
  function zonedTimeToEpoch(day, hhmm, timeZone) {
    const [y, mo, d] = day.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    const targetWall = Date.UTC(y, mo - 1, d, h, mi, 0);
    let guess = targetWall;
    for (let i = 0; i < 4; i++) {
      const p = partsInZone(new Date(guess), timeZone);
      const seenWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
      const delta = targetWall - seenWall;
      guess += delta;
      if (Math.abs(delta) < 1000) break;
    }
    return guess;
  }
  async function getRegistration() {
    if (window.SakinaPWA && typeof window.SakinaPWA.getRegistration === "function") return window.SakinaPWA.getRegistration();
    if (!("serviceWorker" in navigator)) return null;
    try { return await navigator.serviceWorker.ready; } catch (e) { return null; }
  }
  function toast(message) {
    if (window.SakinaPWA && typeof window.SakinaPWA.toast === "function") return window.SakinaPWA.toast(message);
    const old = document.getElementById("sakinaReminderToast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "sakinaReminderToast";
    el.textContent = message;
    el.style.cssText = "position:fixed;z-index:100003;left:50%;bottom:24px;transform:translateX(-50%);background:#10251f;color:#fff;border:1px solid rgba(224,184,92,.35);border-radius:999px;padding:10px 16px;font:13px 'Readex Pro',system-ui,sans-serif;direction:rtl;max-width:92vw;text-align:center";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  function addStyles() {
    if (document.getElementById("sakinaReminderStyles")) return;
    const style = document.createElement("style");
    style.id = "sakinaReminderStyles";
    style.textContent = `
      .sakina-reminder-backdrop{position:fixed;z-index:100002;inset:0;background:rgba(2,11,9,.72);backdrop-filter:blur(5px);display:flex;align-items:flex-end;justify-content:center;padding:18px 12px calc(18px + env(safe-area-inset-bottom));direction:rtl;font-family:"Readex Pro",system-ui,sans-serif}
      .sakina-reminder-card{width:min(620px,100%);max-height:min(86vh,820px);overflow:auto;background:#0c211c;color:#fff;border:1px solid rgba(224,184,92,.34);border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.45);padding:20px}
      .sakina-reminder-head{display:flex;align-items:flex-start;gap:12px}.sakina-reminder-head img{width:48px;height:48px;border-radius:14px;background:#fff;padding:4px}.sakina-reminder-title{flex:1}.sakina-reminder-title h2{margin:0 0 4px;font-size:20px}.sakina-reminder-title p{margin:0;color:#c4d4cf;font-size:13px;line-height:1.7}.sakina-reminder-close{border:0;background:transparent;color:#d7e2de;font-size:26px;cursor:pointer}
      .sakina-reminder-section{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.10)}.sakina-reminder-section h3{font-size:15px;margin:0 0 10px;color:#f2d487}.sakina-reminder-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sakina-reminder-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#c4d4cf}.sakina-reminder-field select,.sakina-reminder-field input[type=time]{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);border-radius:11px;background:#102a23;color:#fff;padding:10px;font:inherit;font-size:13px}
      .sakina-reminder-checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sakina-reminder-check{display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);border-radius:12px;padding:10px;font-size:13px;cursor:pointer}.sakina-reminder-check input{accent-color:#e2b85c}.sakina-reminder-adhkar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:9px}.sakina-reminder-adhkar label{display:flex;align-items:center;gap:8px;font-size:13px}.sakina-reminder-adhkar input[type=checkbox]{accent-color:#e2b85c}.sakina-reminder-adhkar input[type=time]{border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#102a23;color:#fff;padding:8px;font:inherit}
      .sakina-reminder-status{margin-top:14px;border-radius:13px;padding:11px 12px;background:rgba(226,184,92,.10);border:1px solid rgba(226,184,92,.22);font-size:12px;line-height:1.75;color:#e7efec}.sakina-reminder-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}.sakina-reminder-btn{border:0;border-radius:12px;padding:11px 15px;font:inherit;font-size:13px;cursor:pointer}.sakina-reminder-btn.primary{background:#e2b85c;color:#10251f;font-weight:700}.sakina-reminder-btn.secondary{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12)}
      @media(max-width:520px){.sakina-reminder-grid{grid-template-columns:1fr}.sakina-reminder-checks{grid-template-columns:repeat(2,minmax(0,1fr))}.sakina-reminder-card{padding:17px;border-radius:21px}.sakina-reminder-backdrop{padding:10px 8px calc(10px + env(safe-area-inset-bottom))}}
      html[data-theme="light"] .sakina-reminder-card{background:#fffaf0;color:#17332a;border-color:#d9c18a}html[data-theme="light"] .sakina-reminder-title p,html[data-theme="light"] .sakina-reminder-field{color:#576c64}html[data-theme="light"] .sakina-reminder-field select,html[data-theme="light"] .sakina-reminder-field input[type=time],html[data-theme="light"] .sakina-reminder-adhkar input[type=time]{background:#fff;color:#17332a;border-color:#ddd1b8}html[data-theme="light"] .sakina-reminder-check{background:#f5efe2;border-color:#e0d5bd}html[data-theme="light"] .sakina-reminder-btn.secondary{background:#f1eadc;color:#17332a;border-color:#ded3bc}html[data-theme="light"] .sakina-reminder-status{color:#42574f}
    `;
    document.head.appendChild(style);
  }

  function permissionText() {
    if (!("Notification" in window)) return isIOS && !isStandalone() ? "على الآيفون: ثبّت سكينة على الشاشة الرئيسية أولًا لتفعيل الإشعارات." : "المتصفح الحالي لا يتيح إشعارات الويب هنا.";
    if (Notification.permission === "granted") return "الإشعارات مسموحة على هذا الجهاز. التنبيهات أثناء فتح التطبيق تعمل الآن، وسيتم استخدام Web Push عند ربط خادم الإرسال.";
    if (Notification.permission === "denied") return "الإشعارات محظورة من إعدادات المتصفح/النظام. غيّر الإذن يدويًا ثم جرّب مرة أخرى.";
    return "اضغط «حفظ وتفعيل» ليظهر طلب الإذن من النظام.";
  }

  function closeSettings() {
    if (modal) modal.remove();
    modal = null;
  }

  function showSettings() {
    addStyles();
    closeSettings();
    const prefs = getPrefs();
    const el = document.createElement("div");
    el.className = "sakina-reminder-backdrop";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "إعدادات تنبيهات الصلاة والأذكار");
    const cityOptions = CITIES.map(c => `<option value="${c.id}"${c.id === prefs.city ? " selected" : ""}>${c.name}</option>`).join("");
    const prayerChecks = PRAYERS.map(p => `<label class="sakina-reminder-check"><input type="checkbox" data-prayer="${p.k}"${prefs.prayers[p.k] ? " checked" : ""}><span>${p.n}</span></label>`).join("");
    el.innerHTML = `
      <div class="sakina-reminder-card">
        <div class="sakina-reminder-head">
          <img src="/icon-192.png" width="48" height="48" alt="">
          <div class="sakina-reminder-title"><h2>تنبيهات الصلاة والأذكار</h2><p>اختر ما تريد أن يذكّرك به سكينة على هذا الجهاز.</p></div>
          <button type="button" class="sakina-reminder-close" aria-label="إغلاق">×</button>
        </div>
        <div class="sakina-reminder-status" data-status>${permissionText()}</div>
        <section class="sakina-reminder-section">
          <h3>الموقع والتوقيت</h3>
          <div class="sakina-reminder-grid">
            <label class="sakina-reminder-field">المدينة<select data-city>${cityOptions}</select></label>
            <label class="sakina-reminder-field">موعد تنبيه الصلاة<select data-lead>
              <option value="0"${Number(prefs.leadMinutes) === 0 ? " selected" : ""}>عند دخول الوقت</option>
              <option value="5"${Number(prefs.leadMinutes) === 5 ? " selected" : ""}>قبلها بـ ٥ دقائق</option>
              <option value="10"${Number(prefs.leadMinutes) === 10 ? " selected" : ""}>قبلها بـ ١٠ دقائق</option>
              <option value="15"${Number(prefs.leadMinutes) === 15 ? " selected" : ""}>قبلها بـ ١٥ دقيقة</option>
            </select></label>
          </div>
        </section>
        <section class="sakina-reminder-section">
          <h3>الصلوات</h3>
          <div class="sakina-reminder-checks">${prayerChecks}</div>
        </section>
        <section class="sakina-reminder-section">
          <h3>الأذكار</h3>
          <div class="sakina-reminder-adhkar"><label><input type="checkbox" data-adhkar="morning"${prefs.adhkar.morning.enabled ? " checked" : ""}> أذكار الصباح</label><input type="time" data-adhkar-time="morning" value="${prefs.adhkar.morning.time}"></div>
          <div class="sakina-reminder-adhkar"><label><input type="checkbox" data-adhkar="evening"${prefs.adhkar.evening.enabled ? " checked" : ""}> أذكار المساء</label><input type="time" data-adhkar-time="evening" value="${prefs.adhkar.evening.time}"></div>
        </section>
        <div class="sakina-reminder-actions">
          <button type="button" class="sakina-reminder-btn primary" data-save>حفظ وتفعيل</button>
          <button type="button" class="sakina-reminder-btn secondary" data-test>اختبار إشعار</button>
          <button type="button" class="sakina-reminder-btn secondary" data-disable>إيقاف التنبيهات</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    modal = el;
    el.querySelector(".sakina-reminder-close").addEventListener("click", closeSettings);
    el.addEventListener("click", e => { if (e.target === el) closeSettings(); });
    el.querySelector("[data-save]").addEventListener("click", () => saveFromModal(el));
    el.querySelector("[data-test]").addEventListener("click", testNotification);
    el.querySelector("[data-disable]").addEventListener("click", disableReminders);
    track("reminder_settings_open", { permission: ("Notification" in window) ? Notification.permission : "unsupported" });
  }

  function collectFromModal(el) {
    const prefs = getPrefs();
    prefs.enabled = true;
    prefs.city = el.querySelector("[data-city]").value;
    prefs.leadMinutes = Number(el.querySelector("[data-lead]").value || 0);
    PRAYERS.forEach(p => { prefs.prayers[p.k] = el.querySelector(`[data-prayer="${p.k}"]`).checked; });
    ["morning", "evening"].forEach(kind => {
      prefs.adhkar[kind].enabled = el.querySelector(`[data-adhkar="${kind}"]`).checked;
      prefs.adhkar[kind].time = el.querySelector(`[data-adhkar-time="${kind}"]`).value || (kind === "morning" ? "07:00" : "18:00");
    });
    return prefs;
  }

  async function requestPermissionFromGesture() {
    if (!("Notification" in window)) {
      if (isIOS && !isStandalone() && window.SakinaPWA) window.SakinaPWA.showInstallPrompt();
      toast(isIOS && !isStandalone() ? "ثبّت سكينة على الشاشة الرئيسية أولًا، ثم افتحه من الأيقونة لتفعيل الإشعارات." : "الإشعارات غير مدعومة في هذا المتصفح.");
      return false;
    }
    if (isIOS && !isStandalone()) {
      if (window.SakinaPWA) window.SakinaPWA.showInstallPrompt();
      toast("على الآيفون يجب فتح سكينة من الشاشة الرئيسية قبل تفعيل الإشعارات.");
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      toast("الإشعارات محظورة. فعّلها من إعدادات المتصفح أو النظام.");
      return false;
    }
    const permission = await Notification.requestPermission();
    track("notification_permission", { permission, source: "reminders" });
    return permission === "granted";
  }

  async function saveFromModal(el) {
    const allowed = await requestPermissionFromGesture();
    const status = el.querySelector("[data-status]");
    if (!allowed) {
      if (status) status.textContent = permissionText();
      return;
    }
    const prefs = collectFromModal(el);
    savePrefs(prefs);
    await syncToWorker(prefs);
    await syncRemote(prefs);
    await registerPeriodicSync();
    scheduleForeground(prefs);
    if (status) status.textContent = "تم الحفظ والتفعيل على هذا الجهاز.";
    toast("تم تفعيل تنبيهات الصلاة والأذكار 🤍");
    track("reminders_enabled", { city: prefs.city, lead_minutes: prefs.leadMinutes });
    setTimeout(closeSettings, 700);
  }

  async function disableReminders() {
    const prefs = getPrefs();
    prefs.enabled = false;
    savePrefs(prefs);
    clearTimers();
    await syncToWorker(prefs);
    await syncRemote(prefs);
    const reg = await getRegistration();
    if (reg && "periodicSync" in reg) {
      try { await reg.periodicSync.unregister("sakina-reminders"); } catch (e) {}
    }
    toast("تم إيقاف تنبيهات الصلاة والأذكار");
    track("reminders_disabled");
    closeSettings();
  }

  async function testNotification() {
    const allowed = await requestPermissionFromGesture();
    if (!allowed) return;
    const reg = await getRegistration();
    if (!reg) return toast("تعذّر الوصول إلى خدمة الإشعارات الآن.");
    await reg.showNotification("سكينة قرآن · اختبار التنبيهات", {
      body: "الإشعارات تعمل على هذا الجهاز. يمكنك الآن حفظ مواعيد الصلاة والأذكار.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "sakina-reminder-test",
      dir: "rtl",
      lang: "ar",
      data: { url: "/#prayer" }
    });
    track("reminder_test");
  }

  async function syncToWorker(prefs) {
    const reg = await getRegistration();
    const worker = reg && (reg.active || reg.waiting || reg.installing);
    if (worker) worker.postMessage({ type: "REMINDER_PREFS", prefs });
  }
  async function syncRemote(prefs) {
    if (window.SakinaPWA && typeof window.SakinaPWA.syncPushPreferences === "function") {
      try { await window.SakinaPWA.syncPushPreferences(prefs); } catch (e) {}
    }
  }
  async function registerPeriodicSync() {
    const reg = await getRegistration();
    if (!reg || !("periodicSync" in reg)) return false;
    try {
      await reg.periodicSync.register("sakina-reminders", { minInterval: 15 * 60 * 1000 });
      track("periodic_sync", { status: "registered" });
      return true;
    } catch (e) {
      track("periodic_sync", { status: "unavailable" });
      return false;
    }
  }

  async function fetchDay(city, day) {
    const url = `https://api.aladhan.com/v1/timingsByCity/${apiDate(day)}?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&method=${city.method}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    if (!json || !json.data || !json.data.timings) throw new Error("bad-data");
    return json.data.timings;
  }

  async function buildEvents(prefs) {
    const city = CITIES.find(c => c.id === prefs.city) || CITIES[0];
    const tz = cityTZ(city);
    const today = dateKeyInZone(new Date(), tz);
    const days = [today, addDay(today, 1)];
    const timings = await Promise.all(days.map(day => fetchDay(city, day)));
    const events = [];
    days.forEach((day, dayIndex) => {
      PRAYERS.forEach(prayer => {
        if (!prefs.prayers[prayer.k]) return;
        const hhmm = cleanTime(timings[dayIndex][prayer.k]);
        if (!hhmm) return;
        const prayerEpoch = zonedTimeToEpoch(day, hhmm, tz);
        const at = prayerEpoch - Number(prefs.leadMinutes || 0) * 60000;
        const lead = Number(prefs.leadMinutes || 0);
        events.push({
          id: `prayer:${prayer.k}:${day}:${lead}`,
          at,
          title: `سكينة قرآن · صلاة ${prayer.n}`,
          body: lead ? `متبقي ${ard(lead)} دقائق على صلاة ${prayer.n} في ${city.name}.` : `حان الآن وقت صلاة ${prayer.n} في ${city.name}.`,
          url: "/#prayer",
          tag: `sakina-prayer-${prayer.k}-${day}`
        });
      });
      if (prefs.adhkar.morning.enabled) {
        events.push({ id: `adhkar:morning:${day}`, at: zonedTimeToEpoch(day, prefs.adhkar.morning.time, tz), title: "سكينة قرآن · أذكار الصباح", body: "حان وقت أذكار الصباح. ابدأ يومك بذكر الله.", url: "/#adhkar", tag: `sakina-adhkar-morning-${day}` });
      }
      if (prefs.adhkar.evening.enabled) {
        events.push({ id: `adhkar:evening:${day}`, at: zonedTimeToEpoch(day, prefs.adhkar.evening.time, tz), title: "سكينة قرآن · أذكار المساء", body: "حان وقت أذكار المساء. افتح سكينة وأكمل أذكارك.", url: "/#adhkar", tag: `sakina-adhkar-evening-${day}` });
      }
    });
    return events.sort((a, b) => a.at - b.at);
  }

  function clearTimers() {
    while (timers.length) clearTimeout(timers.pop());
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  function alreadyFired(id) {
    try { return localStorage.getItem(FIRED_PREFIX + id) === "1"; } catch (e) { return false; }
  }
  function markFired(id) {
    try { localStorage.setItem(FIRED_PREFIX + id, "1"); } catch (e) {}
  }
  async function fireEvent(event) {
    if (alreadyFired(event.id)) return;
    const prefs = getPrefs();
    if (!prefs.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await getRegistration();
    if (!reg) return;
    markFired(event.id);
    await reg.showNotification(event.title, {
      body: event.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: event.tag,
      renotify: false,
      dir: "rtl",
      lang: "ar",
      timestamp: event.at,
      data: { url: event.url }
    });
    track("reminder_fired", { reminder_id: event.id.split(":").slice(0, 2).join(":"), foreground_scheduler: true });
  }
  async function scheduleForeground(prefsArg) {
    const prefs = prefsArg || getPrefs();
    clearTimers();
    if (!prefs.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const events = await buildEvents(prefs);
      const now = Date.now();
      events.forEach(event => {
        const delay = event.at - now;
        if (delay >= -10 * 60 * 1000 && delay <= 28 * 60 * 60 * 1000 && !alreadyFired(event.id)) {
          const timer = setTimeout(() => fireEvent(event), Math.max(250, delay));
          timers.push(timer);
        }
      });
      refreshTimer = setTimeout(() => scheduleForeground(), 6 * 60 * 60 * 1000);
    } catch (e) {
      refreshTimer = setTimeout(() => scheduleForeground(), 30 * 60 * 1000);
    }
  }

  function attachButton() {
    const btn = document.getElementById("remindersBtn");
    if (btn && !btn.dataset.sakinaBound) {
      btn.dataset.sakinaBound = "1";
      btn.addEventListener("click", showSettings);
    }
  }
  function init() {
    attachButton();
    const prefs = getPrefs();
    if (prefs.enabled) {
      syncToWorker(prefs);
      if ("Notification" in window && Notification.permission === "granted") {
        registerPeriodicSync();
        syncRemote(prefs);
        scheduleForeground(prefs);
      }
    }
    if (new URLSearchParams(location.search).get("reminders") === "1") setTimeout(showSettings, 350);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getPrefs().enabled) scheduleForeground();
  });
  window.addEventListener("focus", () => { if (getPrefs().enabled) scheduleForeground(); });
  window.addEventListener("storage", e => { if (e.key === KEY && getPrefs().enabled) scheduleForeground(); });

  window.SakinaReminders = { showSettings, schedule: scheduleForeground, getPreferences: getPrefs };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();