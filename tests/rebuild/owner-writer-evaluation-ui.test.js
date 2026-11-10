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

const vm=require('node:vm');
const authorization=s.match(/async function authorization\(\)\{[\s\S]*?\n \}/)[0];
for(const mode of ['bearer','device-cookie','sdk-unavailable'])test('owner evaluation delegates '+mode+' to existing server authorization',async()=>{
 let checked=0;
 const context={sb:{auth:{getSession:async()=>{if(mode==='sdk-unavailable')throw Error('sdk unavailable');return {data:{session:mode==='bearer'?{access_token:'synthetic-token'}:null}};}}},
 fetch:async(url,options)=>{checked++;assert.equal(url,'/api/access?action=app-status');assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,mode==='bearer'?'Bearer synthetic-token':undefined);return {ok:true,json:async()=>({plan:'owner'})};}};
 await vm.runInNewContext('('+authorization+')()',context);assert.equal(checked,1);
});
for(const reply of [{ok:false},{ok:true,plan:'paid'},{ok:true,plan:'free'},{ok:true}])test('device cookie path never substitutes for server owner verdict '+JSON.stringify(reply),async()=>{
 const context={sb:{auth:{getSession:async()=>({data:{session:null}})}},fetch:async()=>({ok:reply.ok,json:async()=>({plan:reply.plan})})};
 await assert.rejects(vm.runInNewContext('('+authorization+')()',context),/オーナー/);
});
