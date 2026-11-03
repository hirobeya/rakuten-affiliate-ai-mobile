'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../scripts/rebuild/real-search-preview/auth-callback-recovery');
const base='https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app/app.html';
const callback=base+'?code=synthetic-callback-code-12345';
const ownStore={getItem:()=>JSON.stringify('synthetic-verifier')};
function harness({storage=ownStore,result={data:{session:{access_token:'synthetic-session'}}},deadline=p=>p}={}){
 let calls=0,opened=0,status=[],observations=[];
 const c=api.create({storage,auth:{exchangeCodeForSession:async code=>{calls++;assert.equal(code,'synthetic-callback-code-12345');return typeof result==='function'?result():result;}},deadline,onSession:async()=>{opened++;},onStatus:m=>status.push(m),onObservation:o=>observations.push(o)});
 return {c,calls:()=>calls,opened:()=>opened,status,observations};
}
test('returned callback accepts exact app origin only; email verification links and duplicate/foreign parameters are refused',()=>{
 assert.equal(api.parse(callback).code,'synthetic-callback-code-12345');
 for(const url of ['https://upooxcugrplfmjnqpuxs.supabase.co/auth/v1/verify?token=synthetic-token&type=email',callback.replace('.vercel.app','.example.invalid'),callback.replace('/app.html','/'),callback+'&code=another-synthetic-code',callback+'#access_token=synthetic',callback+'&next=https://example.invalid',base+'?code=short',callback.replace('https://','https://someone@')])assert.throws(()=>api.parse(url),/invalid_callback/);
});
test('callback code alone or unavailable storage cannot reach a token exchange',async()=>{
 for(const storage of [{getItem:()=>null},{getItem(){throw Error('synthetic-storage-detail');}}]){
  const x=harness({storage});assert.equal(await x.c.complete(callback),false);assert.equal(x.calls(),0);assert.equal(x.opened(),0);assert.equal(x.c.locked(),false);
  assert.ok(!JSON.stringify(x.status).includes('synthetic-storage-detail'));
 }
 const x=harness();await x.c.complete(base);assert.equal(x.calls(),0);
});
test('manual returned-code exchange uses existing verifier-bound SDK method and reaches unchanged server authorization once',async()=>{
 const x=harness();assert.equal(await x.c.complete(callback),true);await x.c.complete(callback);assert.equal(x.calls(),1);assert.equal(x.opened(),1);assert.equal(x.c.snapshot().exchange,'session-present');
 assert.ok(!JSON.stringify(x.observations).includes('synthetic-'));assert.ok(!JSON.stringify(x.status).includes('synthetic-'));
});
test('pending, rejected, missing-session and timed-out exchanges never retry or disclose provider details',async()=>{
 let finish;const x=harness({result:()=>new Promise(r=>{finish=r;})});const first=x.c.complete(callback);await x.c.complete(callback);assert.equal(x.calls(),1);finish({error:{code:'bad_code_verifier',message:'synthetic-private-detail'}});await first;await x.c.complete(callback);assert.equal(x.calls(),1);assert.equal(x.opened(),0);
 for(const result of [{error:{status:429,message:'synthetic-private-detail'}},{data:{session:null}}]){
  const y=harness({result});await y.c.complete(callback);await y.c.complete(callback);assert.equal(y.calls(),1);assert.equal(y.opened(),0);assert.equal(y.c.locked(),true);assert.ok(!JSON.stringify(y.status).includes('synthetic-private'));
 }
 const y=harness({deadline:()=>Promise.reject(Error('synthetic-private-timeout'))});await y.c.complete(callback);await y.c.complete(callback);assert.equal(y.calls(),1);assert.equal(y.opened(),0);assert.equal(y.c.snapshot().exchange,'unknown');assert.ok(!JSON.stringify(y.status).includes('synthetic-private'));
});
test('different-browser page copies returned code only on click, removes URL credentials and handles copy refusal without auth',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map();let clipboardValue='',refuse=true,exchanges=0,cleaned='',messages=[];
 for(const id of ['previewCallbackRecovery','previewReturnedCallback','previewCompleteCallback','previewCallbackRelay','previewCopyCallback','previewCallbackObservation'])nodes.set(id,{hidden:true,value:'',textContent:'',disabled:false,addEventListener(event,fn){this[event]=fn;}});
 const w={location:{href:callback},localStorage:{getItem:()=>null},addEventListener(){}};
 const context={URL,window:w,document:{title:'Synthetic Preview',getElementById:id=>nodes.get(id)},history:{replaceState(_,__,url){cleaned=url;}},navigator:{clipboard:{async writeText(value){if(refuse)throw Error('synthetic-private-copy-error');clipboardValue=value;}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/rebuild/real-search-preview/auth-callback-recovery.js','utf8'),context);
 const c=context.window.UrenaviPreviewCallback.mount({auth:{getSession:async()=>({data:{session:null}}),exchangeCodeForSession:async()=>{exchanges++;}},storage:w.localStorage,deadline:p=>p,onSession(){throw Error('unexpected session');},onStatus:m=>messages.push(m)});
 await c.refresh();assert.equal(nodes.get('previewCallbackRelay').hidden,false);assert.equal(cleaned,'/app.html');assert.equal(clipboardValue,'');assert.equal(context.window.UrenaviPreviewCallback.sendBlocked(),true);
 await nodes.get('previewCopyCallback').click();assert.match(messages.at(-1),/コピーが許可されません/);assert.ok(!messages.join().includes('synthetic-private'));assert.equal(exchanges,0);
 refuse=false;await nodes.get('previewCopyCallback').click();assert.equal(clipboardValue,callback);assert.equal(exchanges,0);assert.ok(!nodes.get('previewCallbackObservation').textContent.includes('synthetic-callback'));
});
test('settled unsuccessful same-browser callback removes code URL without retrying exchange or sending mail',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),nodes=new Map();let cleaned='',exchanges=0,messages=[];
 for(const id of ['previewCallbackRecovery','previewReturnedCallback','previewCompleteCallback','previewCallbackRelay','previewCopyCallback','previewCallbackObservation'])nodes.set(id,{hidden:true,value:'',textContent:'',disabled:false,addEventListener(event,fn){this[event]=fn;}});
 const w={location:{href:callback},localStorage:ownStore,addEventListener(){}};
 const context={URL,window:w,document:{title:'Synthetic Preview',getElementById:id=>nodes.get(id)},history:{replaceState(_,__,url){cleaned=url;}},navigator:{clipboard:{writeText(){throw Error('unexpected copy');}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('scripts/rebuild/real-search-preview/auth-callback-recovery.js','utf8'),context);
 const c=context.window.UrenaviPreviewCallback.mount({auth:{getSession:async()=>({data:{session:null}}),exchangeCodeForSession:async()=>{exchanges++;}},storage:ownStore,deadline:p=>p,onSession(){throw Error('unexpected session');},onStatus:m=>messages.push(m)});
 await c.refresh();assert.equal(cleaned,'/app.html');assert.equal(exchanges,0);assert.equal(nodes.get('previewCallbackRelay').hidden,true);assert.equal(nodes.get('previewCallbackRecovery').hidden,true);assert.ok(messages.some(x=>x.includes('再送せず停止')));assert.ok(!messages.join().includes('synthetic-callback'));
});
