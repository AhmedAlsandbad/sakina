import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

const CITIES: Record<string, { name: string; city: string; country: string; method: number; tz: string }> = {
  dubai: { name: "دبي", city: "Dubai", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  abudhabi: { name: "أبوظبي", city: "Abu Dhabi", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  sharjah: { name: "الشارقة", city: "Sharjah", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  alain: { name: "العين", city: "Al Ain", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  cairo: { name: "القاهرة", city: "Cairo", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  alex: { name: "الإسكندرية", city: "Alexandria", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  makkah: { name: "مكة المكرمة", city: "Makkah", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  madinah: { name: "المدينة المنورة", city: "Medina", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  riyadh: { name: "الرياض", city: "Riyadh", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  jeddah: { name: "جدة", city: "Jeddah", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
};
const PRAYERS = [
  { k: "Fajr", n: "الفجر" }, { k: "Dhuhr", n: "الظهر" }, { k: "Asr", n: "العصر" }, { k: "Maghrib", n: "المغرب" }, { k: "Isha", n: "العشاء" },
];
const AR = "٠١٢٣٤٥٦٧٨٩";
const ard = (value: number | string) => String(value).replace(/\d/g, d => AR[Number(d)]);
const cleanTime = (value: unknown) => { const m = String(value || "").match(/(\d{1,2}):(\d{2})/); return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : null; };

function zoneParts(date: Date, timeZone: string) {
  const out: Record<string, number> = {};
  new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).forEach(p => { if (p.type !== "literal") out[p.type] = Number(p.value); });
  return out;
}
function dateKey(date: Date, timeZone: string) { const p = zoneParts(date, timeZone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; }
function apiDate(day: string) { return day.split("-").reverse().join("-"); }
function zonedEpoch(day: string, hhmm: string, timeZone: string) {
  const [y, mo, d] = day.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0); let guess = wall;
  for (let i = 0; i < 4; i++) { const p = zoneParts(new Date(guess), timeZone); const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0); const delta = wall - seen; guess += delta; if (Math.abs(delta) < 1000) break; }
  return guess;
}
async function timings(city: typeof CITIES[string], day: string, cache: Map<string, any>) {
  const key = `${city.city}:${day}`; if (cache.has(key)) return cache.get(key);
  const url = `https://api.aladhan.com/v1/timingsByCity/${apiDate(day)}?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&method=${city.method}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`aladhan_${res.status}`);
  const json = await res.json(); const t = json?.data?.timings; if (!t) throw new Error("aladhan_data"); cache.set(key, t); return t;
}
function dueEvents(row: any, city: typeof CITIES[string], day: string, t: any, now: number) {
  const prefs = row.preferences || {}; const events: any[] = []; const lead = [0,5,10,15].includes(Number(prefs.leadMinutes)) ? Number(prefs.leadMinutes) : 0;
  const lower = 0; const upper = 150000;
  for (const prayer of PRAYERS) {
    if (!prefs.prayers?.[prayer.k]) continue; const hm = cleanTime(t[prayer.k]); if (!hm) continue;
    const at = zonedEpoch(day, hm, city.tz) - lead * 60000; const delta = now - at;
    if (delta >= lower && delta < upper) events.push({ key: `prayer:${prayer.k}:${day}:${lead}`, title: `سكينة قرآن · صلاة ${prayer.n}`, body: lead ? `متبقي ${ard(lead)} دقائق على صلاة ${prayer.n} في ${city.name}.` : `حان الآن وقت صلاة ${prayer.n} في ${city.name}.`, url: "/#prayer", tag: `sakina-prayer-${prayer.k}-${day}`, timestamp: at });
  }
  const adhkar = prefs.adhkar || {};
  for (const [kind, title, body, fallback] of [
    ["morning", "سكينة قرآن · أذكار الصباح", "حان وقت أذكار الصباح. ابدأ يومك بذكر الله.", "07:00"],
    ["evening", "سكينة قرآن · أذكار المساء", "حان وقت أذكار المساء. افتح سكينة وأكمل أذكارك.", "18:00"],
  ] as const) {
    if (!adhkar[kind]?.enabled) continue; const hm = /^\d{2}:\d{2}$/.test(adhkar[kind]?.time || "") ? adhkar[kind].time : fallback;
    const at = zonedEpoch(day, hm, city.tz); const delta = now - at;
    if (delta >= lower && delta < upper) events.push({ key: `adhkar:${kind}:${day}`, title, body, url: "/#adhkar", tag: `sakina-adhkar-${kind}-${day}`, timestamp: at });
  }
  return events;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "server_config" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: cfg, error: cfgErr } = await db.from("push_server_config").select("vapid_public_key,vapid_private_key,vapid_subject,cron_secret").eq("id", "primary").maybeSingle();
  if (cfgErr || !cfg) return new Response(JSON.stringify({ error: "missing_config" }), { status: 503, headers: { "Content-Type": "application/json" } });
  const supplied = req.headers.get("x-cron-secret") || ""; if (!supplied || supplied !== cfg.cron_secret) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public_key, cfg.vapid_private_key);

  const { data: subs, error } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth,preferences,timezone,locale,failure_count").eq("enabled", true).limit(2000);
  if (error) return new Response(JSON.stringify({ error: "database_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  const now = Date.now(); const cache = new Map<string, any>(); let sent = 0, disabled = 0, failed = 0, due = 0;

  for (const sub of subs || []) {
    const city = CITIES[sub.preferences?.city] || CITIES.dubai; const day = dateKey(new Date(now), city.tz); let t: any;
    try { t = await timings(city, day, cache); } catch (e) { console.error("timings", city.city, String(e)); continue; }
    const events = dueEvents(sub, city, day, t, now); due += events.length;
    for (const event of events) {
      const { error: reserveErr } = await db.from("push_reminder_deliveries").insert({ subscription_id: sub.id, reminder_key: event.key, status: "reserved" });
      if (reserveErr) { if (reserveErr.code === "23505") continue; console.error("reserve", reserveErr.code, reserveErr.message); continue; }
      const payload = JSON.stringify({ title: event.title, body: event.body, url: event.url, tag: event.tag, timestamp: event.timestamp, icon: "/icon-192.png", badge: "/icon-192.png" });
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 300, urgency: "normal" });
        await db.from("push_reminder_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), error_text: null }).eq("subscription_id", sub.id).eq("reminder_key", event.key);
        await db.from("push_subscriptions").update({ failure_count: 0 }).eq("id", sub.id); sent++;
      } catch (e: any) {
        const status = Number(e?.statusCode || e?.status || 0); const message = String(e?.body || e?.message || e).slice(0, 500); failed++;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").update({ enabled: false, failure_count: Number(sub.failure_count || 0) + 1 }).eq("id", sub.id);
          await db.from("push_reminder_deliveries").update({ status: "failed", error_text: `gone:${status}` }).eq("subscription_id", sub.id).eq("reminder_key", event.key); disabled++;
        } else {
          await db.from("push_reminder_deliveries").delete().eq("subscription_id", sub.id).eq("reminder_key", event.key);
          await db.from("push_subscriptions").update({ failure_count: Number(sub.failure_count || 0) + 1 }).eq("id", sub.id);
          console.error("push send", status, message);
        }
      }
    }
  }
  await db.from("push_reminder_deliveries").delete().lt("created_at", new Date(Date.now() - 45 * 86400000).toISOString());
  return new Response(JSON.stringify({ ok: true, subscriptions: (subs || []).length, due, sent, failed, disabled }), { status: 200, headers: { "Content-Type": "application/json" } });
});