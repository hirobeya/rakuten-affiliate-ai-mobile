'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');
function setup({runtime,accessStatus=200}={}){
 const ctx={AbortController,setTimeout,clearTimeout,Map,authGate:{style:{display:'flex'}},appRoot:{style:{display:'none'}},userMail:{},
  fetch:async path=>path.startsWith('/api/access')?{status:accessStatus,ok:accessStatus===200,json:async()=>({plan:'owner'})}:runtime(),
  authDeadline:(p,ms)=>{assert.equal(ms,5000);return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('synthetic timeout')),10))]);},
  document:{getElementById:()=>null},window:{initRoomOperations(){},initRoomOutcomes(){}},proRenderMigration(){},proRenderActivities(){},proUpdateDashboard(){},restoreSearchState(){},updateUpgradeUi(){},configureIntegratedPro:async()=>{},
  showLogin(){vm.runInContext('accessGeneration++',ctx);ctx.appRoot.style.display='none';}};
 vm.createContext(ctx);vm.runInContext("let accessGeneration=0,currentAppSession=null,currentAccessPlan='base',retainedAuthError='',debugExportAllowed=false,usePurchasePlan=false,aiGatesFullOutput=false;",ctx);
 for(const [start,end] of [['async function showApp(session)', 'function sessionTooOld('],['async function updateDebugExportAccess(){','function debugFallbackReason(']])vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))),ctx);
 return ctx;
}
const session={access_token:'synthetic-only',user:{email:'owner@example.invalid'}};
test('authorized screen opens after stalled runtime lookup; unknown runtime never enables output/export',async()=>{
 const c=setup({runtime:()=>new Promise(()=>{})});await c.showApp(session);
 assert.equal(c.appRoot.style.display,'block');assert.equal(c.authGate.style.display,'none');
 assert.equal(vm.runInContext('aiGatesFullOutput||debugExportAllowed||usePurchasePlan',c),false);
});
test('logout during runtime wait cannot reopen the old authenticated screen',async()=>{
 let finish;const c=setup({runtime:()=>new Promise(resolve=>{finish=resolve;})});const pending=c.showApp(session);
 while(!finish)await Promise.resolve();c.showLogin();finish({ok:true,json:async()=>({preview:true})});await pending;
 assert.equal(c.appRoot.style.display,'none');
});
test('access denial cannot read runtime settings or expose the application',async()=>{
 for(const status of [401,403]){let reads=0;const c=setup({accessStatus:status,runtime:()=>{reads++;throw Error('unexpected');}});await c.showApp(session);assert.equal(reads,0);assert.equal(c.appRoot.style.display,'none');}
});
