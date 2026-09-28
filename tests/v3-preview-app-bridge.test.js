'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
const bridge=fs.readFileSync(path.join(__dirname,'..','public','return-state.js'),'utf8');

assert.match(app,/fetch\('\/api\/room-ai'/,'legacy app still calls the stable room-ai URL');
assert.match(app,/return-state\.js/,'app loads the bridge host script');
assert.match(bridge,/resource==='\/api\/room-ai'/,'bridge intercepts the stable room-ai request');
assert.match(bridge,/baseFetch\('\/api\/room-ai-v3',options\)/,'bridge sends Preview generation through v3');
assert.match(bridge,/_v3Copy:copy/,'bridge keeps the v3 composed copy in the adapted response');
assert.match(bridge,/result\?\._v3Copy/,'ROOM copy renderer prefers the exact v3 composed copy');
assert.match(bridge,/status:422/,'v3 quality failure remains fail-closed instead of silently using weak copy');
assert.doesNotMatch(bridge,/fetch\('\/api\/room-ai-v3'[^\n]+catch[^\n]+\/api\/room-ai/,'bridge must not silently fall back to the legacy AI endpoint');

console.log('v3-preview-app-bridge.test.js: PASS');
