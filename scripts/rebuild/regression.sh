#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
NODE_BIN=$(command -v node)
# Node test workers and the existing local audit child inherit the network guard.
exec env -i PATH=/usr/bin:/bin HOME=/tmp LANG=C.UTF-8 NODE_OPTIONS="--require=$PWD/scripts/rebuild/regression-network-guard.cjs" "$NODE_BIN" --test tests/*.test.js
