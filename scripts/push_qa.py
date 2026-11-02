#!/usr/bin/env python3
"""Prevent Sakina Web Push source from drifting away from the production cron contract."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

def read(path: str) -> str:
    p = ROOT / path
    if not p.exists():
        errors.append(f"missing: {path}")
        return ""
    return p.read_text(encoding="utf-8", errors="replace")

subscribe = read("supabase/functions/push-subscribe/index.ts")
dispatch = read("supabase/functions/push-dispatch/index.ts")
config = read("supabase/config.toml")
client = read("push-config.js")

checks = {
    "push-subscribe/index.ts": [
        'npm:@supabase/supabase-js@2.118.0',
        'https://sakinaquran.net',
        'https://www.sakinaquran.net',
        'origin_not_allowed',
        'push_subscriptions',
        'failure_count',
    ],
    "push-dispatch/index.ts": [
        'npm:@supabase/supabase-js@2.118.0',
        'npm:web-push@3.6.7',
        'push_server_config',
        'x-cron-secret',
        'push_subscriptions',
        'push_reminder_deliveries',
    ],
    "supabase/config.toml": [
        '[functions.push-subscribe]',
        '[functions.push-dispatch]',
        'verify_jwt = false',
    ],
    "push-config.js": [
        '/functions/v1/push-subscribe',
    ],
}

contents = {
    "push-subscribe/index.ts": subscribe,
    "push-dispatch/index.ts": dispatch,
    "supabase/config.toml": config,
    "push-config.js": client,
}

for label, needles in checks.items():
    for needle in needles:
        if needle not in contents[label]:
            errors.append(f"{label}: missing production contract token {needle!r}")

for forbidden in ('x-sakina-cron-secret', 'Deno.env.get("CRON_SECRET")', 'push_delivery_log'):
    if forbidden in dispatch:
        errors.append(f"push-dispatch/index.ts: stale deployment contract token {forbidden!r}")

if errors:
    print("Push QA failed:")
    for error in errors:
        print(" -", error)
    sys.exit(1)

print("Push QA passed: GitHub source matches the active production function/cron contract.")
