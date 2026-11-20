#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo="$PWD"
work=$(mktemp -d)
trap 'supabase stop --workdir "$work" --no-backup >/dev/null 2>&1 || true; rm -rf -- "$work"' EXIT
umask 077
mkdir "$work/journals"
supabase init --workdir "$work"
exclude='realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor'
supabase start --workdir "$work" -x "$exclude" > "$work/start.log" || {
  sed '/key\|postgres:\/\//Id' "$work/start.log" >&2
  exit 1
}
supabase status --workdir "$work" -o json > "$work/status.json"
cd "$repo"
URENAVI_TEST_SUPABASE_DIR="$work" URENAVI_TEST_SUPABASE_EXCLUDE="$exclude" \
  node --test --test-name-pattern='local Supabase' tests/rebuild/paired-comparison-runner.test.js
