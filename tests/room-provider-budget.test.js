'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {withSharedBudget,createBudgetStore,waitFor}=require('../lib/room-provider-budget');
const {advance}=require('../lib/room-semantic-engine');
function memory(){let row={revision:'initial',models:{}};return {load:async()=>structuredClone(row),swap:async(revision,next)=>{if(row.revision!==revision)return false;row=structuredClone(next);return true;},read:()=>structuredClone(row)};}
const item=n=>({itemCode:'budget:'+n,itemName:'収納ボックス'+n,itemCaption:'収納ボックスは折りたためます。'});
const draft=i=>({product:{what:i.itemName,acts_on:'収納物',acts_on_quote:i.itemCaption},sentences:[{text:i.itemName+'は折りたためます。',kinds:['spec'],quotes:[i.itemName,i.itemCaption]}]});
const productStore=()=>{const rows=new Map();return {loadProduct:async k=>structuredClone(rows.get(k.itemCode)),saveProduct:async r=>{rows.set(r.itemCode,{model:r.model,schema_version:r.schemaVersion,raw_ai_json:structuredClone(r.rawAiJson)});}};};
test('a request larger than an observed window cannot be admitted after reset or from legacy product progress',async()=>{
 for(const scope of ['shared','product']){
  const budget=memory();
  if(scope==='shared'){const r=await budget.load();await budget.swap(r.revision,{...r,models:{fixture:{tokenLimit:8000,remainingTokens:8000,tokenResetAt:1}}});}
  const state=scope==='product'?{headers:{'x-ratelimit-limit-tokens':'8000'}}:{};
  const provider=withSharedBudget({model:'fixture',requiredTokens:()=>8253},{store:budget,now:()=>10000});
  await assert.rejects(()=>provider.acquire('generate',item(1),state),e=>e.status===503);
  assert.equal(budget.read().lease,undefined);
 }
});
test('provider capacity survives later missing headers while fitting requests remain admissible',async()=>{
 const budget=memory(),clock={value:1000};
 const p=withSharedBudget({model:'fixture',requiredTokens:()=>7656},{store:budget,now:()=>clock.value});
 let permit=await p.acquire('generate',item(1),{});
 await permit.release({called:true,response:{usage:{prompt_tokens:10,completion_tokens:20},rateLimit:{'x-ratelimit-limit-tokens':'8000'}}});
 clock.value+=66000;permit=await p.acquire('generate',item(1),{});assert.equal(permit.waitMs,0);
 await permit.release({called:true,response:{usage:{prompt_tokens:10,completion_tokens:20},rateLimit:{}}});
 assert.equal(budget.read().models.fixture.tokenLimit,8000);
 clock.value+=66000;
 const tooLarge=withSharedBudget({model:'fixture',requiredTokens:()=>8253},{store:budget,now:()=>clock.value});
 await assert.rejects(()=>tooLarge.acquire('generate',item(1),{}),e=>e.status===503);
});
function setup({store=memory(),clock={value:1000},call}={}){
 const calls=[],quotas=[];const base={model:'fixture-budget',requiredTokens:()=>5000,call:async(stage,i,state)=>{calls.push([stage,i.itemCode]);return call?call(stage,i,state):{raw:draft(i),usage:{prompt_tokens:100,completion_tokens:20},rateLimit:{'x-ratelimit-remaining-tokens':'1200','x-ratelimit-reset-tokens':'60s','x-ratelimit-remaining-requests':'999','x-ratelimit-reset-requests':'1d'}};}};
 const provider=withSharedBudget(base,{store,now:()=>clock.value});
 return {store,clock,calls,provider,args:{store:productStore(),provider,now:()=>clock.value,consumeQuota:async s=>{quotas.push(s);return true;}},quotas};
}
test('remaining tokens survive completion of one product and gate another before quota or provider consumption',async()=>{
 const x=setup();
 const permit=await x.provider.acquire('generate',item(1),{});const response=await x.provider.call('generate',item(1),{});await permit.release({called:true,response});
 const next=await advance({...x.args,item:item(2)});
 assert.equal(next.pending,true);assert.ok(next.retryAfterMs>=60000);assert.equal(x.calls.length,1);assert.equal(x.quotas.length,0);
 x.clock.value+=62000;await advance({...x.args,item:item(2)});assert.equal(x.calls.length,2);assert.equal(x.quotas.length,1);
});
test('two independent server instances cannot both reserve a provider call',async()=>{
 const store=memory(),clock={value:1000},a=setup({store,clock}),b=setup({store,clock});
 const permits=await Promise.all([a.provider.acquire('generate',item(1),{}),b.provider.acquire('generate',item(2),{})]);
 assert.equal(permits.filter(p=>p.waitMs===0).length,1);assert.equal(permits.filter(p=>p.waitMs>0).length,1);
});
test('an active call holds a shared lease across products, and quota rejection releases it without inventing usage',async()=>{
 const x=setup();await assert.rejects(()=>advance({...x.args,item:item(1),consumeQuota:async()=>false}),e=>e.status===429);
 assert.equal(x.store.read().lease,null);assert.deepEqual(x.store.read().models,{});assert.equal(x.calls.length,0);
 const a=await x.provider.acquire('generate',item(1),{});assert.equal(a.waitMs,0);
 const b=await x.provider.acquire('generate',item(2),{});assert.ok(b.waitMs>0);
 await a.release({called:false});
});
test('429 propagates once, publishes shared cooldown, and never schedules a retry',async()=>{
 const x=setup({call:async()=>{const e=new Error('fixture');e.status=429;e.retryAfterMs=180000;throw e;}});
 await assert.rejects(()=>advance({...x.args,item:item(1)}),e=>e.status===429);
 await assert.rejects(()=>advance({...x.args,item:item(2)}),e=>e.status===503);
 assert.equal(x.calls.length,1);assert.equal(x.quotas.length,1);
});
test('read-only and completed cached drafts do not acquire a lease or spend quota',async()=>{
 const x=setup();x.provider.acquire=async()=>{throw Error('must not acquire');};
 const status=await advance({...x.args,item:item(1),readOnly:true});assert.equal(status.pending,true);
 const {VERSION}=require('../lib/room-semantic-engine');
 x.args.store={loadProduct:async()=>({schema_version:VERSION,model:x.provider.model,raw_ai_json:{state:{stage:'done',calls:[],startedAt:0,quality:{status:'blocked'},draft:null}}})};
 const cached=await advance({...x.args,item:item(1)});assert.equal(cached.pending,false);assert.equal(x.quotas.length,0);assert.equal(x.calls.length,0);
});
test('expired observations and unknown headers with KNOWN usage retain pacing; models keep separate observations',async()=>{
 assert.equal(waitFor({remainingTokens:0,tokenResetAt:1000},5000,1001),0);
 const x=setup();const p=await x.provider.acquire('generate',item(1),{});await p.release({called:true,response:{usage:{prompt_tokens:100,completion_tokens:20},rateLimit:{}}});
 assert.equal((await x.provider.acquire('generate',item(2),{})).waitMs,65000);
 const y=setup();const p2=await y.provider.acquire('generate',item(1),{});
 await p2.release({called:true,response:{usage:{prompt_tokens:100,completion_tokens:20},rateLimit:{'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'60s','x-ratelimit-remaining-requests':'999'}}});
 const other=withSharedBudget({model:'other',requiredTokens:()=>100,call(){}},{store:y.store,now:()=>y.clock.value});
 assert.ok((await other.acquire('generate',item(2),{})).waitMs>0);
 y.clock.value+=2101;assert.equal((await other.acquire('generate',item(2),{})).waitMs,0);
});
test('coordination database outage fails closed before quota and provider calls',async()=>{
 const x=setup({store:{load:async()=>{throw Error('db unavailable');}}});
 await assert.rejects(()=>advance({...x.args,item:item(1)}),e=>e.status===503);assert.equal(x.calls.length,0);assert.equal(x.quotas.length,0);
});
test('database adapter stores no secret and performs a conditional revision update',async()=>{
 const requests=[];let row=null;
 const db=async(path,opts={})=>{requests.push({path,opts});if(opts.method==='POST'){row=JSON.parse(opts.body);return null;}if(opts.method==='PATCH')return [{cache_key:row.cache_key}];return row?[row]:[];};
 const s=createBudgetStore(db,'preview|synthetic-key');const r=await s.load();assert.ok(r.revision);await s.swap(r.revision,{revision:'next',models:{}});
 assert.ok(!JSON.stringify(requests).includes('synthetic-key'));
 const update=requests.find(r=>r.opts.method==='PATCH');assert.equal(new URLSearchParams(update.path.split('?')[1]).get('raw_ai_json->>revision'),'eq.'+r.revision);
 assert.equal(update.opts.headers.Prefer,'return=representation');
});

test('a denied lease never overwrites product progress from another in-flight server',async()=>{
 const x=setup();const permit=await x.provider.acquire('generate',item(1),{});let saved=0;
 const store={loadProduct:async()=>null,saveProduct:async()=>{saved++;}};
 const pending=await advance({...x.args,store,item:item(1)});
 assert.equal(pending.pending,true);assert.equal(saved,0);assert.equal(x.calls.length,0);
 await permit.release({called:false});
});

test('actual HTTP handler carries a shared wait across products with zero extra quota and zero invented usage',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const {createHandler}=require('../lib/room-copy-handler');const clock={value:1000},budget=memory(),store=productStore();let calls=0,quota=0;
  const source={itemName:'収納ボックス',itemCaption:'折りたたみ可能な収納ボックス。小物を収納できます。'};
  const raw={product:{what:'収納ボックス',acts_on:'小物',acts_on_quote:'小物を収納できます。'},sentences:[{text:'小物をまとめたいときに、折りたたみ可能な収納ボックス。',kinds:['scene','spec'],quotes:[source.itemCaption]}]};
  const provider={model:'fixture',requiredTokens:()=>5000,call:async()=>{calls++;return {raw,usage:{prompt_tokens:100,completion_tokens:20},rateLimit:{'x-ratelimit-remaining-tokens':'500','x-ratelimit-reset-tokens':'60s','x-ratelimit-remaining-requests':'999'}};}};
  const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'fixture@example.test'}}),provider,budgetStore:budget,store,now:()=>clock.value,localZeroCall:()=>null,consumeQuota:async()=>{quota++;return true;},logCost(){}});
  const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}});
  const first=res();await handler({method:'POST',body:{...source,itemCode:'first'}},first);assert.equal(first.code,202);
  const next=res();await handler({method:'POST',body:{...source,itemCode:'next'}},next);assert.equal(next.code,202);assert.ok(next.body.retryAfterMs>0);
  assert.equal(next.body.resourceUsage.calls,0);assert.equal(next.body.resourceUsage.inputTokens,0);assert.equal(next.body.quality.text,'');assert.equal(calls,1);assert.equal(quota,1);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('a crashed or stale lease expires without allowing its old owner to overwrite a new reservation',async()=>{
 const x=setup();const old=await x.provider.acquire('generate',item(1),{});
 x.clock.value+=120001;const next=await x.provider.acquire('generate',item(2),{});assert.equal(next.waitMs,0);
 const owner=x.store.read().lease.token;
 await assert.rejects(()=>old.release({called:true,response:{rateLimit:{}}}),e=>e.status===503);
 assert.equal(x.store.read().lease.token,owner);await next.release({called:false});assert.equal(x.store.read().lease,null);
});

test('a worker that read old product progress rechecks after reservation and does not regenerate completed work',async()=>{
 const x=setup();let reads=0;const {VERSION}=require('../lib/room-semantic-engine');
 const store={loadProduct:async()=>++reads===1?null:{schema_version:VERSION,model:x.provider.model,raw_ai_json:{state:{stage:'done',attempt:0,calls:[{stage:'generate'}],quality:{status:'blocked'},startedAt:0}}},saveProduct:async()=>{throw Error('must not overwrite completed progress');}};
 const done=await advance({...x.args,store,item:item(1)});assert.equal(done.pending,false);assert.equal(x.calls.length,0);assert.equal(x.quotas.length,0);assert.equal(x.store.read().lease,null);
});

test('a successful send followed by failed progress save blocks later sends even after lease and cooldown expiry',async()=>{
 const x=setup();x.args.store={loadProduct:async()=>null,saveProduct:async()=>{throw Error('save failed');}};
 await assert.rejects(()=>advance({...x.args,item:item(1)}),/save failed/);
 assert.equal(x.store.read().uncertain.reason,'progress_not_saved');
 x.clock.value+=86400000;
 await assert.rejects(()=>advance({...x.args,item:item(1)}),e=>e.status===503);
 await assert.rejects(()=>advance({...x.args,item:item(2)}),e=>e.status===503);
 assert.equal(x.calls.length,1);assert.equal(x.quotas.length,1);
});
test('unknown consumption and a crashed marked send cannot become zero consumption when time passes',async()=>{
 const x=setup();const p=await x.provider.acquire('generate',item(1),{});
 await p.release({called:true,response:{rateLimit:{}}});x.clock.value+=86400000;
 await assert.rejects(()=>x.provider.acquire('generate',item(2),{}),e=>e.status===503);
 const y=setup();const lease=await y.provider.acquire('generate',item(1),{});await lease.markSent();y.clock.value+=120001;
 await assert.rejects(()=>y.provider.acquire('generate',item(2),{}),e=>e.status===503);
});
test('the provider lease remains held until product progress has been saved',async()=>{
 const x=setup();const save=x.args.store.saveProduct;let observed=false;
 x.args.store.saveProduct=async row=>{observed=true;assert.equal(x.store.read().lease.sent,true);await save(row);};
 await advance({...x.args,item:item(1)});assert.equal(observed,true);assert.equal(x.store.read().lease,null);assert.equal(x.store.read().uncertain,undefined);
});
test('an unfinished stored execution at four sends cannot spend a fifth quota or provider call',async()=>{
 const x=setup();const {VERSION}=require('../lib/room-semantic-engine');
 x.args.store={loadProduct:async()=>({schema_version:VERSION,model:x.provider.model,raw_ai_json:{state:{stage:'generate',attempt:1,calls:Array.from({length:4},()=>({stage:'generate'})),startedAt:0}}}),saveProduct:async()=>{throw Error('must not save');}};
 await assert.rejects(()=>advance({...x.args,item:item(1)}),e=>e.status===429);assert.equal(x.calls.length,0);assert.equal(x.quotas.length,0);
});
