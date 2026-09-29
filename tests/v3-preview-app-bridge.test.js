'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.html'),'utf8');
const bridge=fs.readFileSync(path.join(__dirname,'..','public','return-state.js'),'utf8');
const stable=fs.readFileSync(path.join(__dirname,'..','api','room-ai.js'),'utf8');

assert.match(app,/fetch\('\/api\/room-ai'/,'app calls one stable room-ai URL');
assert.match(app,/return-state\.js/,'app loads the return/copy host script');
assert.match(stable,/room-post-generator-v1/,'stable endpoint uses the new single-pass generator');
assert.doesNotMatch(stable,/room-ai-v3/,'stable endpoint no longer delegates to v3');
assert.doesNotMatch(stable,/super-urenavi-router/,'stable endpoint no longer uses the legacy classifier router');
assert.doesNotMatch(stable,/needs_value|qualityGate|pass2|qualityRetry/,'old value gates are absent from sale runtime');
assert.match(stable,/raw\?\.understood!==true&&!first\.usedImage&&input\.imageUrl/,'only understood=false after text can trigger the image second call');
assert.match(stable,/_v3Copy:copy/,'stable response carries the final server-inspected copy');
assert.match(bridge,/aiTargetDecision=function\(\)\{return\{callAi:true/,'client does not use a local classification gate before sale generation');
assert.match(bridge,/aiPhase1Post=function\(item,result\)\{return String\(result\?\._v3Copy\|\|''\)\.trim\(\);\}/,'renderer uses only server final copy and has no legacy fallback');
assert.doesNotMatch(bridge,/legacyAiPhase1Post/,'legacy client copy fallback is removed');
assert.doesNotMatch(bridge,/\/api\/room-ai-v3/,'browser does not reroute to an alternate generation endpoint');

console.log('single-pass-sale-app-bridge.test.js: PASS');
