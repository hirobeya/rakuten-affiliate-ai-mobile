const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
const auth=html.slice(html.indexOf('let accessGeneration=0;'),html.indexOf('function sessionTooOld('));
function setup(fetch,visible=true){
  const state={authGate:{style:{display:visible?'none':'flex'}},appRoot:{style:{display:visible?'block':'none'}},userMail:{},status:{}};
  const context=vm.createContext({...state,fetch,AbortController,setTimeout,clearTimeout,document:{getElementById:()=>state.status},showLogin(message){state.appRoot.style.display='none';state.authGate.style.display='flex';state.message=message;}});
  vm.runInContext(auth,context);
  return {state,context,show:()=>vm.runInContext("showApp({access_token:'test',user:{email:'test@example.test'}})",context)};
}
test('return keeps search screen visible while access request is pending',async()=>{
  let resolve;const app=setup(()=>new Promise(r=>resolve=r));const pending=app.show();
  assert.equal(app.state.appRoot.style.display,'block');assert.equal(app.state.authGate.style.display,'none');
  resolve({ok:true,status:200});await pending;assert.equal(app.state.appRoot.style.display,'block');
});
test('network failure preserves displayed results and offers a retry message',async()=>{
  const app=setup(async()=>{throw Error('offline');});await app.show();
  assert.equal(app.state.appRoot.style.display,'block');assert.match(app.state.status.textContent,/通信/);
});
for(const status of [401,403]) test(`${status} hides protected screen`,async()=>{
  const app=setup(async()=>({ok:false,status}));await app.show();assert.equal(app.state.appRoot.style.display,'none');assert.equal(app.state.authGate.style.display,'flex');
});
test('cold load failure leaves a visible login screen',async()=>{
  const app=setup(async()=>{throw Error('offline');},false);await app.show();assert.equal(app.state.authGate.style.display,'flex');assert.match(app.state.message,/通信/);
});
test('stalled session retrieval has a deadline',async()=>{
  const app=setup(async()=>({ok:true,status:200}));
  await assert.rejects(vm.runInContext('authDeadline(new Promise(()=>{}),5)',app.context),/時間内/);
});
test('older access response cannot hide a newer successful screen',async()=>{
  let resolve;let count=0;const app=setup(()=>++count===1?new Promise(r=>resolve=r):Promise.resolve({ok:true,status:200}));
  const first=app.show();await app.show();resolve({ok:false,status:403});await first;assert.equal(app.state.appRoot.style.display,'block');
});
test('ROOM route goes to ROOM with encoded product name, independent of affiliate URL',()=>{
  const start=html.indexOf('function roomSearchUrl(');const end=html.indexOf('function roomAction(',start);const context=vm.createContext({URLSearchParams});
  vm.runInContext(html.slice(start,end),context);
  const url=new URL(context.roomSearchUrl({itemName:'【楽天ブックス限定特典+特典】ゼルダの伝説 時のオカリナ(特典アイテム未定)',affiliateUrl:'https://example.test/affiliate'}));
  assert.equal(url.origin,'https://room.rakuten.co.jp');assert.equal(url.pathname,'/search/item');assert.equal(url.searchParams.get('keyword'),'ゼルダの伝説 時のオカリナ');
  assert.equal(new URL(context.roomSearchUrl({itemName:'A&B #1 / C'})).searchParams.get('keyword'),'A&B #1 / C');
});
test('all inline scripts and access guard parse',()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync(path.join(__dirname,'../public/access-guard.js'),'utf8'));
});
