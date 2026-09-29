'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
const bridge=fs.readFileSync(path.join(__dirname,'..','public','return-state.js'),'utf8');
const stable=fs.readFileSync(path.join(__dirname,'..','api','room-ai.js'),'utf8');
const v3=fs.readFileSync(path.join(__dirname,'..','api','room-ai-v3.js'),'utf8');

assert.match(app,/fetch\('\/api\/room-ai'/,'app calls one stable room-ai URL');
assert.match(app,/return-state\.js/,'app loads the return/copy host script');
assert.match(stable,/createHandler\(\{previewOnly:false,legacyResponse:true\}\)/,'stable endpoint uses sale-ready v3 with the existing UI contract');
assert.match(v3,/runtimeEnv==='preview'&&auth\.plan!=='owner'/,'Preview stays owner-only');
assert.match(v3,/runtimeEnv==='production'.*\['base','pro','owner'\]/,'Production stays paid-plan only');
assert.match(v3,/_v3Copy:copy/,'stable response carries the exact server-approved copy');
assert.match(v3,/legacyResponse&&!payload\.ok.*422.*sale_copy_quality_gate_failed/s,'failed sale quality is HTTP 422 and cannot fall back to legacy copy');
assert.match(bridge,/result\?\._v3Copy/,'ROOM renderer prefers the exact server-approved copy');
assert.doesNotMatch(bridge,/\/api\/room-ai-v3/,'browser no longer reroutes stable requests to a Preview-only endpoint');
assert.doesNotMatch(bridge,/__urenaviV3PreviewBridge/,'obsolete Preview fetch bridge is removed');

console.log('stable-sale-app-bridge.test.js: PASS');
