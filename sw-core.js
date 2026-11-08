// Sakina Quran service worker: app shell, Web Push and reminder checks.
const V = "sakina-v92";
const PREF_CACHE = "sakina-reminders-v1";
const PREF_URL = "/__sakina/reminder-settings";
const STATE_URL = "/__sakina/reminder-state";
const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/styles.css?v=59",
  "/polish.css?v=1",
  "/player-ui.css?v=1",
  "/ui-refresh.css?v=2",
  "/data.js?v=40",
  "/app.js?v=66",
  "/app-core.js?v=66",
  "/app-loader.js?v=1",
  "/app-loader.js?v=2",
  "/seo.js?v=4",
  "/seo-core.js?v=4",
  "/analytics.js?v=2",
  "/pwa.js?v=3",
  "/reminders.js?v=1",
  "/ux-enhancements.js?v=1",
  "/ui-refresh.js?v=3",
  "/smart-audio-cache.js?v=1",
  "/push-config.js?v=2",
  "/manifest.webmanifest",
  "/icon.svg",
  "/sakina-logo.svg?v=38",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(V).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== V && key !== PREF_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;

  // Never intercept media range requests or cache external audio streams.
  if (request.headers.has("range")) return;

  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(V).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok || response.type === "opaque") {
        const copy = response.clone();
        caches.open(V).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});

function notificationPayload(event) {
  if (!event.data) return {};
  try { return event.data.json(); }
  catch (e) {
    try { return { body: event.data.text() }; }
    catch (x) { return {}; }
  }
}

self.addEventListener("push", event => {
  const data = notificationPayload(event);
  const title = data.title || "سكينة قرآن";
  const options = {
    body: data.body || "لديك تذكير جديد من سكينة قرآن.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    image: data.image || undefined,
    tag: data.tag || "sakina-quran",
    renotify: !!data.renotify,
    dir: "rtl",
    lang: "ar",
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || "/", ...(data.data || {}) },
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const raw = event.notification && event.notification.data && event.notification.data.url || "/";
  const target = new URL(raw, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client && "focus" in client) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});

async function putJson(path, value) {
  const cache = await caches.open(PREF_CACHE);
  await cache.put(path, new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }));
}
async function getJson(path, fallback) {
  try {
    const cache = await caches.open(PREF_CACHE);
    const response = await cache.match(path);
    return response ? await response.json() : fallback;
  } catch (e) { return fallback; }
}

const REMINDER_CITIES = [
  { id: "dubai", city: "Dubai", name: "دبي", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "abudhabi", city: "Abu Dhabi", name: "أبوظبي", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "sharjah", city: "Sharjah", name: "الشارقة", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "alain", city: "Al Ain", name: "العين", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "cairo", city: "Cairo", name: "القاهرة", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  { id: "alex", city: "Alexandria", name: "الإسكندرية", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  { id: "makkah", city: "Makkah", name: "مكة المكرمة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "madinah", city: "Medina", name: "المدينة المنورة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "riyadh", city: "Riyadh", name: "الرياض", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "jeddah", city: "Jeddah", name: "جدة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" }
];
const REMINDER_PRAYERS = [
  { k: "Fajr", n: "الفجر" }, { k: "Dhuhr", n: "الظهر" }, { k: "Asr", n: "العصر" }, { k: "Maghrib", n: "المغرب" }, { k: "Isha", n: "العشاء" }
];
const AR = "٠١٢٣٤٥٦٧٨٩";
const ard = value => String(value).replace(/\d/g, d => AR[d]);

function zoneParts(date, timeZone) {
  const out = {};
  new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).forEach(p => { if (p.type !== "literal") out[p.type] = Number(p.value); });
  return out;
}
function dateKey(date, timeZone) {
  const p = zoneParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function apiDate(day) { return day.split("-").reverse().join("-"); }
function cleanTime(value) {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : null;
}
function zonedEpoch(day, hhmm, timeZone) {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const p = zoneParts(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
    const delta = wall - seen;
    guess += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return guess;
}
async function fetchTimings(city, day) {
  const url = `https://api.aladhan.com/v1/timingsByCity/${apiDate(day)}?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&method=${city.method}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  const json = await response.json();
  return json && json.data && json.data.timings ? json.data.timings : null;
}
async function reminderState() { return getJson(STATE_URL, { fired: {} }); }
async function markReminderFired(id, state) {
  state.fired[id] = Date.now();
  const cutoff = Date.now() - 3 * 86400000;
  Object.keys(state.fired).forEach(key => { if (state.fired[key] < cutoff) delete state.fired[key]; });
  await putJson(STATE_URL, state);
}
async function showReminder(event, state) {
  if (state.fired[event.id]) return;
  await self.registration.showNotification(event.title, {
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
  await markReminderFired(event.id, state);
}
async function checkRemindersNow() {
  const prefs = await getJson(PREF_URL, null);
  if (!prefs || !prefs.enabled) return;
  const city = REMINDER_CITIES.find(c => c.id === prefs.city) || REMINDER_CITIES[0];
  const day = dateKey(new Date(), city.tz);
  const timings = await fetchTimings(city, day);
  if (!timings) return;
  const now = Date.now();
  const grace = 20 * 60 * 1000;
  const state = await reminderState();
  const events = [];
  REMINDER_PRAYERS.forEach(prayer => {
    if (!prefs.prayers || !prefs.prayers[prayer.k]) return;
    const hhmm = cleanTime(timings[prayer.k]);
    if (!hhmm) return;
    const lead = Number(prefs.leadMinutes || 0);
    const at = zonedEpoch(day, hhmm, city.tz) - lead * 60000;
    events.push({ id: `prayer:${prayer.k}:${day}:${lead}`, at, title: `سكينة قرآن · صلاة ${prayer.n}`, body: lead ? `متبقي ${ard(lead)} دقائق على صلاة ${prayer.n} في ${city.name}.` : `حان الآن وقت صلاة ${prayer.n} في ${city.name}.`, url: "/#prayer", tag: `sakina-prayer-${prayer.k}-${day}` });
  });
  const adhkar = prefs.adhkar || {};
  if (adhkar.morning && adhkar.morning.enabled) events.push({ id: `adhkar:morning:${day}`, at: zonedEpoch(day, adhkar.morning.time || "07:00", city.tz), title: "سكينة قرآن · أذكار الصباح", body: "حان وقت أذكار الصباح. ابدأ يومك بذكر الله.", url: "/#adhkar", tag: `sakina-adhkar-morning-${day}` });
  if (adhkar.evening && adhkar.evening.enabled) events.push({ id: `adhkar:evening:${day}`, at: zonedEpoch(day, adhkar.evening.time || "18:00", city.tz), title: "سكينة قرآن · أذكار المساء", body: "حان وقت أذكار المساء. افتح سكينة وأكمل أذكارك.", url: "/#adhkar", tag: `sakina-adhkar-evening-${day}` });
  for (const reminder of events) {
    if (now >= reminder.at && now - reminder.at <= grace) await showReminder(reminder, state);
  }
}

self.addEventListener("periodicsync", event => {
  if (event.tag === "sakina-reminders") event.waitUntil(checkRemindersNow());
});
self.addEventListener("sync", event => {
  if (event.tag === "sakina-reminders") event.waitUntil(checkRemindersNow());
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "REMINDER_PREFS") event.waitUntil(putJson(PREF_URL, data.prefs || {}));
  if (data.type === "CHECK_REMINDERS_NOW") event.waitUntil(checkRemindersNow());
  if (data.type === "SHOW_NOTIFICATION") {
    const p = data.payload || {};
    event.waitUntil(self.registration.showNotification(p.title || "سكينة قرآن", {
      body: p.body || "", icon: p.icon || "/icon-192.png", badge: p.badge || "/icon-192.png", tag: p.tag || "sakina-local", dir: "rtl", lang: "ar", data: { url: p.url || "/" }
    }));
  }
});

self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    list.forEach(client => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }));
  }));
});