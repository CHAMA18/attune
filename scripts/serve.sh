#!/usr/bin/env bash
# Attune — Caddy launcher
# Serves the app + Qloo proxy on :3000 per ./Caddyfile.
# Keys come from .env.local (gitignored) or the environment.
set -euo pipefail
cd "$(dirname "$0")/.."

# load .env.local (QLOO_API_KEY, optional LLM_*)
if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi
: "${QLOO_API_KEY:?QLOO_API_KEY missing — put it in .env.local}"

# prefer the vendored binary, fall back to a system caddy
CADDY="${CADDY_BIN:-caddy-bin/attune-srv}"
[ -x "$CADDY" ] || CADDY="$(command -v caddy || true)"
[ -n "$CADDY" ] || { echo "caddy not found — see https://caddyserver.com/docs/install"; exit 1; }

# Playbook agent sidecar (localhost:3789) — Caddy proxies /api/llm/playbook
# to it. Idempotent: skip if one is already answering on the port.
if ! (exec 3<>/dev/tcp/127.0.0.1/3789) 2>/dev/null; then
  ( setsid nohup node scripts/llm-sidecar.js >> llm-sidecar.log 2>&1 & )
  sleep 0.6
fi

exec "$CADDY" run --config Caddyfile --adapter caddyfile
