import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const CITIES = [
  { id: "dubai", city: "Dubai", name: "دبي", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "abudhabi", city: "Abu Dhabi", name: "أبوظبي", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "sharjah", city: "Sharjah", name: "الشارقة", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "alain", city: "Al Ain", name: "العين", country: "United Arab Emirates", method: 16, tz: "Asia/Dubai" },
  { id: "cairo", city: "Cairo", name: "القاهرة", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  { id: "alex", city: "Alexandria", name: "الإسكندرية", country: "Egypt", method: 5, tz: "Africa/Cairo" },
  { id: "makkah", city: "Makkah", name: "مكة المكرمة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "madinah", city: "Medina", name: "المدينة المنورة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "riyadh", city: "Riyadh", name: "الرياض", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
  { id: "jeddah", city: "Jeddah", name: "جدة", country: "Saudi Arabia", method: 4, tz: "Asia/Riyadh" },
];
const PRAYERS = [
  { k: "Fajr", n: "الفجر" }, { k: "Dhuhr", n: "الظهر" }, { k: "Asr", n: "العصر" }, { k: "Maghrib", n: "المغرب" }, { k: "Isha", n: "العشاء" },
];
const AR = "٠١٢٣٤٥٦٧٨٩";
const ard = (value: unknown) => String(value).replace(/\d/g, (d) => AR[Number(d)]);

function zoneParts(date: Date, timeZone: string) {
  const out: Record<string, number> = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).forEach((p) => { if (p.type !== "literal") out[p.type] = Number(p.value); });
  return out;
}
function dateKey(date: Date, timeZone: string) {
  const p = zoneParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function apiDate(day: string) { return day.split("-").reverse().join("-"); }
function cleanTime(value: unknown) {
  const m = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : null;
}
function zonedEpoch(day: string, hhmm: string, timeZone: string) {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const suppliedSecret = req.headers.get("x-sakina-cron-secret") || "";
  if (!cronSecret || suppliedSecret !== cronSecret) return new Response("unauthorized", { status: 401 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@sakinaquran.net";
  if (!supabaseUrl || !serviceRole || !vapidPublic || !vapidPrivate) return new Response("server_not_configured", { status: 500 });

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const nowMs = now.getTime();
  const dueGraceMs = 3 * 60 * 1000;
  const stats = { checked: 0, due: 0, sent: 0, failed: 0, disabled: 0 };
  const cityTimingCache = new Map<string, Record<string, string>>();

  async function timingsFor(city: typeof CITIES[number], day: string) {
    const key = `${city.id}:${day}`;
    if (cityTimingCache.has(key)) return cityTimingCache.get(key)!;

    const { data: cached } = await db.from("prayer_day_cache")
      .select("timings")
      .eq("city_id", city.id)
      .eq("prayer_date", day)
      .maybeSingle();
    if (cached?.timings) {
      cityTimingCache.set(key, cached.timings as Record<string, string>);
      return cached.timings as Record<string, string>;
    }

    const url = `https://api.aladhan.com/v1/timingsByCity/${apiDate(day)}?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}&method=${city.method}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`prayer_api_${response.status}`);
    const payload = await response.json();
    const timings = payload?.data?.timings as Record<string, string> | undefined;
    if (!timings) throw new Error("prayer_api_invalid");
    await db.from("prayer_day_cache").upsert({ city_id: city.id, prayer_date: day, timings, fetched_at: now.toISOString() }, { onConflict: "city_id,prayer_date" });
    cityTimingCache.set(key, timings);
    return timings;
  }

  async function reserveDelivery(subscriptionId: string, reminderKey: string, reminderDate: string) {
    const { data, error } = await db.from("push_delivery_log").insert({
      subscription_id: subscriptionId,
      reminder_key: reminderKey,
      reminder_date: reminderDate,
      status: "pending",
    }).select("id").single();
    if (!error) return data?.id as number;
    if ((error as any).code === "23505") return null;
    throw error;
  }

  async function finishDelivery(id: number, status: "sent" | "failed", httpStatus?: number, errorMessage?: string) {
    await db.from("push_delivery_log").update({
      status,
      http_status: httpStatus || null,
      error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    }).eq("id", id);
  }

  async function sendDue(sub: any, event: { key: string; date: string; at: number; title: string; body: string; url: string; tag: string }) {
    if (nowMs < event.at || nowMs - event.at >= dueGraceMs) return;
    stats.due++;
    const deliveryId = await reserveDelivery(sub.id, event.key, event.date);
    if (!deliveryId) return;
    try {
      const subscription = { endpoint: sub.endpoint, expirationTime: sub.expiration_time ? new Date(sub.expiration_time).getTime() : null, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      const payload = JSON.stringify({ title: event.title, body: event.body, url: event.url, tag: event.tag, timestamp: event.at });
      const result = await webpush.sendNotification(subscription as any, payload, { TTL: 300, urgency: "high" });
      await finishDelivery(deliveryId, "sent", result?.statusCode || 201);
      stats.sent++;
    } catch (error: any) {
      const status = Number(error?.statusCode || 0) || undefined;
      await finishDelivery(deliveryId, "failed", status, error?.message || String(error));
      stats.failed++;
      if (status === 404 || status === 410) {
        await db.from("push_subscriptions").update({ enabled: false }).eq("id", sub.id);
        stats.disabled++;
      }
    }
  }

  let from = 0;
  const pageSize = 500;
  while (true) {
    const { data: subscriptions, error } = await db.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,expiration_time,preferences,timezone,locale")
      .eq("enabled", true)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!subscriptions?.length) break;

    for (const sub of subscriptions) {
      stats.checked++;
      const prefs: any = sub.preferences || {};
      if (prefs.enabled === false) continue;
      const city = CITIES.find((c) => c.id === prefs.city) || CITIES[0];
      const day = dateKey(now, city.tz);
      let timings: Record<string, string>;
      try { timings = await timingsFor(city, day); }
      catch (error) { console.error("timings failed", city.id, error); continue; }

      const lead = Math.max(0, Math.min(60, Number(prefs.leadMinutes || 0)));
      for (const prayer of PRAYERS) {
        if (!prefs?.prayers?.[prayer.k]) continue;
        const hhmm = cleanTime(timings[prayer.k]);
        if (!hhmm) continue;
        const at = zonedEpoch(day, hhmm, city.tz) - lead * 60000;
        await sendDue(sub, {
          key: `prayer:${prayer.k}:${lead}`,
          date: day,
          at,
          title: `سكينة قرآن · صلاة ${prayer.n}`,
          body: lead ? `متبقي ${ard(lead)} دقائق على صلاة ${prayer.n} في ${city.name}.` : `حان الآن وقت صلاة ${prayer.n} في ${city.name}.`,
          url: "/#prayer",
          tag: `sakina-prayer-${prayer.k}-${day}`,
        });
      }

      const morning = prefs?.adhkar?.morning;
      if (morning?.enabled && /^\d{2}:\d{2}$/.test(morning.time || "")) {
        await sendDue(sub, {
          key: `adhkar:morning:${morning.time}`,
          date: day,
          at: zonedEpoch(day, morning.time, city.tz),
          title: "سكينة قرآن · أذكار الصباح",
          body: "حان وقت أذكار الصباح. ابدأ يومك بذكر الله.",
          url: "/#adhkar",
          tag: `sakina-adhkar-morning-${day}`,
        });
      }
      const evening = prefs?.adhkar?.evening;
      if (evening?.enabled && /^\d{2}:\d{2}$/.test(evening.time || "")) {
        await sendDue(sub, {
          key: `adhkar:evening:${evening.time}`,
          date: day,
          at: zonedEpoch(day, evening.time, city.tz),
          title: "سكينة قرآن · أذكار المساء",
          body: "حان وقت أذكار المساء. افتح سكينة وأكمل أذكارك.",
          url: "/#adhkar",
          tag: `sakina-adhkar-evening-${day}`,
        });
      }
    }

    if (subscriptions.length < pageSize) break;
    from += pageSize;
  }

  return new Response(JSON.stringify({ ok: true, ...stats }), { status: 200, headers: { "Content-Type": "application/json" } });
});
