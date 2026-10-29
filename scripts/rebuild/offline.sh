#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
NODE_BIN=$(command -v node)
# Explicit allowlist: no Supabase/Groq/Stripe/auth secrets reach Node.
exec env -i PATH=/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 "$NODE_BIN" --require ./scripts/rebuild/offline-guard.cjs "$@"
