'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
test('automatic AI batch halts on first uncertain provider response',()=>{
 assert.match(html,/const halt=await requestAiRoom\(job\.item,job\.index,generation\)/);
 assert.match(html,/if\(halt\)\{[\s\S]*?queue\.length=0;\s*break;/);
});
test('all unsuccessful responses and network errors halt batch, success does not',()=>{
 assert.match(html,/if\(!r\.ok\)\{[\s\S]*?haltAutomatic=true;[\s\S]*?\}else aiRoomResults\.set\(index,\{state:'done',data:d\}\);/);
 assert.match(html,/catch\(e\)\{[\s\S]*?haltAutomatic=true;[\s\S]*?\}finally\{/);
 assert.match(html,/return haltAutomatic;\s*\}\s*function aiTargetDecision/);
});
test('browser deadline exceeds 8-second provider deadline to allow settlement',()=>{
 assert.match(html,/const controller=new AbortController\(\);const timer=setTimeout\(\(\)=>controller\.abort\(\),18000\)/);
});
