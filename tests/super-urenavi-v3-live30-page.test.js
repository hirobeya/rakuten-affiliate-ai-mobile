'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');
const js=fs.readFileSync(require.resolve('../public/v3-live-validation.js'),'utf8');
assert.match(js,/\/api\/room-ai-v3/);assert.match(js,/\/api\/search/);
assert.doesNotMatch(js,/v3-eval|setInterval/);
assert.match(js,/d\.ok===true&&d\.copyQuality\?\.copyReady===true/);
assert.match(js,/if\(r.status===429\)/);assert.match(js,/credentials:'include'/);
assert.match(js,/humanReview/);assert.match(js,/item:\{\.\.\.lastItem\}/);
console.log('authenticated explicit single-product evaluation: PASS');
