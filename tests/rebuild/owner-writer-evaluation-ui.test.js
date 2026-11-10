'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../../public/owner-writer-evaluation.html'),'utf8');
test('owner evaluation UI requires preview+owner and never auto-sends Groq requests',()=>{
 assert.match(s,/\/api\/runtime-env/);assert.match(s,/state\?\.plan!=='owner'/);
 assert.match(s,/\/api\/access\?action=app-status/);
 assert.match(s,/evaluationWriter:'editorial'/);assert.match(s,/evaluationRun:runKey\(\)/);
 assert.match(s,/\/api\/room-copy/);assert.match(s,/method:'POST'/);
 assert.match(s,/addEventListener\('click',\(\)=>request\(false\)\)/);
 assert.doesNotMatch(s,/setInterval|setTimeout|location\.reload|window\.open/);
 assert.match(s,/if\(response\.status===429/);
 assert.match(s,/textContent=ready/);
});
