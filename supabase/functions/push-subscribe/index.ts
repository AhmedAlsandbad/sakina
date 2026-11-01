import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://sakinaquran.net",
  "https://www.sakinaquran.net",
]);

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://sakinaquran.net";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "server_not_configured" }, 500, origin);

  let payload: any;
  try { payload = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400, origin); }

  const sub = payload?.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.trim() : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh.trim() : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) {
    return json({ error: "invalid_subscription" }, 400, origin);
  }
  if (endpoint.length > 4096 || p256dh.length > 512 || auth.length > 512) {
    return json({ error: "subscription_too_large" }, 413, origin);
  }

  const preferences = payload?.preferences && typeof payload.preferences === "object" ? payload.preferences : {};
  const timezone = typeof payload?.timezone === "string" ? payload.timezone.slice(0, 100) : "UTC";
  const locale = typeof payload?.locale === "string" ? payload.locale.slice(0, 30) : "ar";
  const enabled = preferences?.enabled !== false;
  const expiration = typeof sub?.expirationTime === "number" && Number.isFinite(sub.expirationTime)
    ? new Date(sub.expirationTime).toISOString()
    : null;

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.from("push_subscriptions").upsert({
    endpoint,
    p256dh,
    auth,
    expiration_time: expiration,
    preferences,
    timezone,
    locale,
    enabled,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });

  if (error) {
    console.error("push subscription upsert failed", error);
    return json({ error: "storage_failed" }, 500, origin);
  }

  return json({ ok: true, enabled }, 200, origin);
});
