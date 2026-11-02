import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ALLOWED = new Set(["https://sakinaquran.net", "https://www.sakinaquran.net"]);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function cors(origin: string | null) {
  const allowed = origin && ALLOWED.has(origin) ? origin : "https://sakinaquran.net";
  return {
    ...jsonHeaders,
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function validPreferences(p: unknown) {
  if (!p || typeof p !== "object") return {};
  const x = p as Record<string, unknown>;
  return {
    version: 1,
    enabled: x.enabled !== false,
    city: typeof x.city === "string" ? x.city.slice(0, 32) : "dubai",
    leadMinutes: [0, 5, 10, 15].includes(Number(x.leadMinutes)) ? Number(x.leadMinutes) : 0,
    prayers: typeof x.prayers === "object" && x.prayers ? x.prayers : {},
    adhkar: typeof x.adhkar === "object" && x.adhkar ? x.adhkar : {},
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors(origin) });
  if (!origin || !ALLOWED.has(origin)) return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers: cors(origin) });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: cors(origin) }); }
  const s = body?.subscription;
  if (!s || typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://") || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") {
    return new Response(JSON.stringify({ error: "invalid_subscription" }), { status: 400, headers: cors(origin) });
  }
  if (s.endpoint.length > 2048 || s.keys.p256dh.length > 512 || s.keys.auth.length > 256) {
    return new Response(JSON.stringify({ error: "subscription_too_large" }), { status: 400, headers: cors(origin) });
  }

  const prefs = validPreferences(body?.preferences);
  const timezone = typeof body?.timezone === "string" ? body.timezone.slice(0, 64) : "Asia/Dubai";
  const locale = typeof body?.locale === "string" ? body.locale.slice(0, 24) : "ar";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: "server_config" }), { status: 500, headers: cors(origin) });
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const row = {
    endpoint: s.endpoint,
    p256dh: s.keys.p256dh,
    auth: s.keys.auth,
    expiration_time: Number.isFinite(Number(s.expirationTime)) ? Number(s.expirationTime) : null,
    preferences: prefs,
    timezone,
    locale,
    enabled: (prefs as any).enabled !== false,
    failure_count: 0,
    updated_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
  const { error } = await db.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  if (error) {
    console.error("push-subscribe db error", error.code, error.message);
    return new Response(JSON.stringify({ error: "database_error" }), { status: 500, headers: cors(origin) });
  }
  return new Response(JSON.stringify({ ok: true, enabled: row.enabled }), { status: 200, headers: cors(origin) });
});